// FVM no aparelho: a lista de materiais controlados e os recebimentos (sem internet, entram no .obra).
//
// Desde 20/11 as tabelas têm migração (20261120120000_concreto_fvm.sql) e estão na lista do
// Concreto (tabelas.ts): gravam e baixam pelo sincronizador do app, com ou sem conta.
// No servidor, só gestor e admin mexem na lista e tiram um material do retido (decisões 2 e 5).
//
// Simplificação desta rodada (a proposta de 14/11 tinha tabelas filhas): os itens conferidos, os
// documentos e as fotos ficam dentro da linha do recebimento (json), com cópia do texto de cada
// item. A ficha fica fiel ao que foi conferido mesmo se a lista de materiais mudar depois.

import { recusaDoArquivo, tipoDoArquivo, nomeLimpo } from '../documentos/regras'
import { sincronizador } from '../nucleo/servicos'
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
  const [mat, rec] = await Promise.all([sincronizador.linhas('materiais_controlados', obraId), sincronizador.linhas('recebimentos', obraId)])
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
  for (const m of d.incluir) await sincronizador.registrar('materiais_controlados', obraId, usuarioId, camposDoMaterial(m))
  for (const { atual, novo } of d.corrigir) {
    await sincronizador.registrar('materiais_controlados', obraId, usuarioId, camposDeCorrecao(atual, COLUNAS_MATERIAL, camposDoMaterial(novo)))
  }
  for (const a of d.cancelar) {
    await sincronizador.registrar('materiais_controlados', obraId, usuarioId, camposDeCorrecao(a, COLUNAS_MATERIAL, { cancelado: true }))
  }
  return { incluidos: d.incluir.length, corrigidos: d.corrigir.length, cancelados: d.cancelar.length }
}

export type NovoRecebimento = Omit<Recebimento, keyof Vigente<Corrigivel> | 'liberado_por' | 'liberado_em'>

export function registrarRecebimento(obraId: string, usuarioId: string, r: NovoRecebimento) {
  return sincronizador.registrar('recebimentos', obraId, usuarioId, { ...r, liberado_por: null, liberado_em: null })
}

/** Tira do "retido" (liberar, liberar com ressalva ou devolver): linha nova que substitui a anterior. */
export function decidirRetido(
  obraId: string,
  usuarioId: string,
  atual: Recebimento,
  situacao: Exclude<SituacaoRecebimento, 'retido'>,
  motivo: string,
) {
  return sincronizador.registrar(
    'recebimentos',
    obraId,
    usuarioId,
    camposDeCorrecao(atual, COLUNAS_RECEBIMENTO, { situacao, motivo, liberado_por: usuarioId, liberado_em: new Date().toISOString() }),
  )
}

export function cancelarRecebimento(obraId: string, usuarioId: string, atual: Recebimento) {
  return sincronizador.registrar('recebimentos', obraId, usuarioId, camposDeCorrecao(atual, COLUNAS_RECEBIMENTO, { cancelado: true }))
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
