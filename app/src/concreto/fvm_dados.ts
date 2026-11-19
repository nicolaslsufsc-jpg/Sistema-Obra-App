// FVM no aparelho: a lista de materiais controlados e os recebimentos (sem internet, entram no .obra).
//
// As tabelas ainda não têm migração no servidor (tabelas.ts): por isso não estão na lista do
// sincronizador do app, que as baixaria do servidor e daria erro. Aqui um sincronizador PRÓPRIO,
// só com elas, grava na mesma fila e no mesmo banco do aparelho (o .obra leva a fila inteira), mas
// ninguém chama baixar() nele. As telas só aparecem no app sem conta, que não envia nada.
// Limite conhecido: registro do FVM feito sem conta e depois enviado com login fica "com erro" na
// fila até a migração existir.
//
// Simplificação desta rodada (a proposta de 14/11 tinha tabelas filhas): os itens conferidos, os
// documentos e as fotos ficam dentro da linha do recebimento (json), com cópia do texto de cada
// item. A ficha fica fiel ao que foi conferido mesmo se a lista de materiais mudar depois.

import { recusaDoArquivo, tipoDoArquivo, nomeLimpo } from '../documentos/regras'
import { banco, cliente, sincronizador } from '../nucleo/servicos'
import { Sincronizador } from '../nucleo/sincronizacao'
import { TABELAS_FVM } from './tabelas'
import { camposDeCorrecao, vigentes, type Corrigivel, type Vigente } from './vigentes'
import {
  camposDoMaterial,
  compararListas,
  ordenarRecebimentos,
  type ConferenciaDoItem,
  type ItemDeCriterio,
  type MaterialControlado,
  type SituacaoRecebimento,
} from './fvm'

const COLUNAS_MATERIAL = ['codigo', 'nome', 'unidade', 'estrutural', 'exige_ensaio', 'via', 'itens', 'documentos', 'ordem'] as const
const COLUNAS_RECEBIMENTO = [
  'material_codigo', 'material_nome', 'unidade', 'data', 'fornecedor', 'nota_fiscal', 'lote', 'quantidade',
  'itens', 'documentos', 'fotos', 'situacao', 'motivo', 'observacao', 'liberado_por', 'liberado_em',
] as const

/** Só grava e lê no aparelho: nunca baixa (sem migração no servidor). Arquivos vão pelo do app. */
const noAparelho = new Sincronizador({ banco, cliente, tabelas: TABELAS_FVM })

export type MaterialNoAparelho = Vigente<Corrigivel> & MaterialControlado

export interface DocumentoRecebido {
  nome: string
  veio: boolean
}

export type Recebimento = Vigente<Corrigivel> & {
  material_codigo: string
  material_nome: string
  unidade: string
  data: string
  fornecedor: string
  nota_fiscal: string
  lote: string | null
  quantidade: number
  itens: ConferenciaDoItem[]
  documentos: DocumentoRecebido[]
  /** ids em `arquivos` */
  fotos: string[]
  situacao: SituacaoRecebimento
  motivo: string | null
  observacao: string | null
  /** quem tirou da situação "retido" (gestor ou admin) e quando */
  liberado_por: string | null
  liberado_em: string | null
}

export interface DadosFvm {
  materiais: MaterialNoAparelho[]
  /** retidos primeiro, depois do mais novo para o mais antigo */
  recebimentos: Recebimento[]
}

export async function carregarFvm(obraId: string): Promise<DadosFvm> {
  const [mat, rec] = await Promise.all([noAparelho.linhas('materiais_controlados', obraId), noAparelho.linhas('recebimentos', obraId)])
  const materiais = vigentes(mat as Corrigivel[])
    .map(
      (m) =>
        ({
          ...m,
          estrutural: m.estrutural === true,
          exige_ensaio: m.exige_ensaio === true,
          via: (m.via as string | null) ?? null,
          itens: (m.itens as ItemDeCriterio[]) ?? [],
          documentos: (m.documentos as string[]) ?? [],
          ordem: Number(m.ordem ?? 0),
        }) as MaterialNoAparelho,
    )
    .sort((a, b) => a.ordem - b.ordem)
  const recebimentos = vigentes(rec as Corrigivel[]).map(
    (r) =>
      ({
        ...r,
        quantidade: Number(r.quantidade),
        itens: (r.itens as ConferenciaDoItem[]) ?? [],
        documentos: (r.documentos as DocumentoRecebido[]) ?? [],
        fotos: (r.fotos as string[]) ?? [],
      }) as Recebimento,
  )
  return { materiais, recebimentos: ordenarRecebimentos(recebimentos) }
}

/** Grava a lista importada: inclui o novo, corrige o que mudou, cancela o que saiu. Devolve o resumo. */
export async function importarLista(
  obraId: string,
  usuarioId: string,
  atuais: readonly MaterialNoAparelho[],
  novos: readonly MaterialControlado[],
): Promise<{ incluidos: number; corrigidos: number; cancelados: number }> {
  const d = compararListas(atuais, novos)
  for (const m of d.incluir) await noAparelho.registrar('materiais_controlados', obraId, usuarioId, camposDoMaterial(m))
  for (const { atual, novo } of d.corrigir) {
    await noAparelho.registrar('materiais_controlados', obraId, usuarioId, camposDeCorrecao(atual, COLUNAS_MATERIAL, camposDoMaterial(novo)))
  }
  for (const a of d.cancelar) {
    await noAparelho.registrar('materiais_controlados', obraId, usuarioId, camposDeCorrecao(a, COLUNAS_MATERIAL, { cancelado: true }))
  }
  return { incluidos: d.incluir.length, corrigidos: d.corrigir.length, cancelados: d.cancelar.length }
}

export type NovoRecebimento = Omit<Recebimento, keyof Vigente<Corrigivel> | 'liberado_por' | 'liberado_em'>

export function registrarRecebimento(obraId: string, usuarioId: string, r: NovoRecebimento) {
  return noAparelho.registrar('recebimentos', obraId, usuarioId, { ...r, liberado_por: null, liberado_em: null })
}

/** Tira do "retido" (liberar, liberar com ressalva ou devolver): linha nova que substitui a anterior. */
export function decidirRetido(
  obraId: string,
  usuarioId: string,
  atual: Recebimento,
  situacao: Exclude<SituacaoRecebimento, 'retido'>,
  motivo: string,
) {
  return noAparelho.registrar(
    'recebimentos',
    obraId,
    usuarioId,
    camposDeCorrecao(atual, COLUNAS_RECEBIMENTO, { situacao, motivo, liberado_por: usuarioId, liberado_em: new Date().toISOString() }),
  )
}

export function cancelarRecebimento(obraId: string, usuarioId: string, atual: Recebimento) {
  return noAparelho.registrar('recebimentos', obraId, usuarioId, camposDeCorrecao(atual, COLUNAS_RECEBIMENTO, { cancelado: true }))
}

export const ACEITAR_FOTO = 'image/jpeg,image/png,image/webp'

/** Recusa da foto escolhida (mesmas regras dos Documentos), ou null. Só imagem. */
export function recusaDaFoto(arquivo: { size: number; type: string; name: string }): string | null {
  const tipo = tipoDoArquivo(arquivo)
  if (!arquivo.type.startsWith('image/')) return 'A foto precisa ser uma imagem (JPG, PNG ou WebP).'
  return recusaDoArquivo(arquivo.size, tipo)
}

/** Guarda a foto no aparelho e na fila de envio; devolve o id em `arquivos`. */
export async function guardarFoto(obraId: string, usuarioId: string, arquivo: File): Promise<string> {
  const recusa = recusaDaFoto(arquivo)
  if (recusa) throw new Error(recusa)
  return (await sincronizador.registrarArquivo(obraId, usuarioId, 'concreto', arquivo, nomeLimpo(arquivo.name))).id
}
