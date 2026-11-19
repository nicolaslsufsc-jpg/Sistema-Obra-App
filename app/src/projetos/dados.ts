// Leitura e registro dos dados do módulo Projetos no aparelho (pelo núcleo: funciona sem internet).

import type { Linha } from '../nucleo/banco_local'
import type { PapelNaObra } from '../nucleo/conta'
import { sincronizador } from '../nucleo/servicos'
import { compararVigencia, dataLocal, escritorioPorDocumento, normalizar, revisaoNova, situacoes, vigentePorDocumento, type Situacao } from './regras'
import { TABELAS_PROJETOS } from './tabelas'

export { TABELAS_PROJETOS }

export interface Documento {
  id: string
  codigo: string
  disciplina_sigla: string
  disciplina: string
  numero: string
  nome_curto: string
  titulo: string
  pasta_autodoc: string | null
  link_pasta: string | null
  /** código e título sem acento, para a busca */
  busca: string
}

export interface Empresa {
  id: string
  nome: string
  contato: string | null
  ativa: boolean
}

export interface DadosProjetos {
  hoje: string
  documentos: Documento[]
  documentoPorId: Map<string, Documento>
  /** revisões de cada documento, da vigente para a mais antiga; obsoletas por último */
  revisoesDe: Map<string, Linha[]>
  revisaoPorId: Map<string, Linha>
  vigentes: Map<string, Linha>
  /** revisões vistas nos últimos 7 dias (não obsoletas), mais recentes primeiro */
  novas: Linha[]
  empresas: Empresa[]
  empresaPorId: Map<string, Empresa>
  eventos: Linha[]
  situacoes: Situacao[]
  situacoesDe: Map<string, Situacao[]>
  escritorio: Map<string, Linha>
}

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const textoOuNulo = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))

function agrupar<T>(itens: readonly T[], chave: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const i of itens) {
    const k = chave(i)
    const l = m.get(k)
    if (l) l.push(i)
    else m.set(k, [i])
  }
  return m
}

/** Lê tudo do módulo na obra (o que já foi baixado + o que foi registrado aqui). */
export async function carregar(obraId: string, hoje = dataLocal(new Date())): Promise<DadosProjetos> {
  const [docs, revs, emps, escr, dist] = await Promise.all([
    sincronizador.linhas('documentos', obraId),
    sincronizador.linhas('revisoes', obraId),
    sincronizador.linhas('empresas', obraId),
    sincronizador.linhas('escritorio_eventos', obraId),
    sincronizador.linhas('distribuicao_eventos', obraId),
  ])
  const documentos: Documento[] = docs
    .map((d) => ({
      id: d.id,
      codigo: texto(d.codigo),
      disciplina_sigla: texto(d.disciplina_sigla),
      disciplina: texto(d.disciplina) || texto(d.disciplina_sigla),
      numero: texto(d.numero),
      nome_curto: texto(d.nome_curto),
      titulo: texto(d.titulo),
      pasta_autodoc: textoOuNulo(d.pasta_autodoc),
      link_pasta: textoOuNulo(d.link_pasta),
      busca: normalizar(`${texto(d.codigo)} ${texto(d.titulo)}`),
    }))
    .sort((a, b) => a.disciplina.localeCompare(b.disciplina, 'pt-BR') || a.codigo.localeCompare(b.codigo))
  const revisoesDe = agrupar(revs, (r) => String(r.documento_id))
  for (const lista of revisoesDe.values()) {
    lista.sort((a, b) => Number(!!a.obsoleta) - Number(!!b.obsoleta) || compararVigencia(a, b))
  }
  const vigentes = vigentePorDocumento(revs)
  const novas = revs.filter((r) => revisaoNova(r, hoje)).sort((a, b) => String(b.vista_em).localeCompare(String(a.vista_em)) || compararVigencia(a, b))
  const empresas: Empresa[] = emps
    .map((e) => ({ id: e.id, nome: texto(e.nome), contato: textoOuNulo(e.contato), ativa: e.ativa !== false }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const sit = situacoes(dist, vigentes)
  return {
    hoje,
    documentos,
    documentoPorId: new Map(documentos.map((d) => [d.id, d])),
    revisoesDe,
    revisaoPorId: new Map(revs.map((r) => [r.id, r])),
    vigentes,
    novas,
    empresas,
    empresaPorId: new Map(empresas.map((e) => [e.id, e])),
    eventos: dist,
    situacoes: sit,
    situacoesDe: agrupar(sit, (s) => s.documento_id),
    escritorio: escritorioPorDocumento(escr),
  }
}

export function podeRegistrar(papel: PapelNaObra): boolean {
  return papel !== 'leitura'
}

export function podeGerir(papel: PapelNaObra): boolean {
  return papel === 'admin' || papel === 'gestor'
}

/** A pasta do escritório está com a vigente? null = sem registro. */
export function escritorioAtualizado(d: DadosProjetos, documentoId: string): boolean | null {
  const e = d.escritorio.get(documentoId)
  if (!e) return null
  const v = d.vigentes.get(documentoId)
  return !!v && v.id === String(e.revisao_id)
}

// ---------------------------------------------------------------------
// Registro (sempre inclusão; nada é alterado nem apagado)
// ---------------------------------------------------------------------

async function guardarFoto(obraId: string, usuarioId: string, foto: File | null | undefined): Promise<string | null> {
  if (!foto) return null
  const linha = await sincronizador.registrarArquivo(obraId, usuarioId, 'projetos', foto, foto.name || 'foto.jpg')
  return linha.id
}

export interface NovaEntrega {
  empresa_id: string
  colaborador: string
  documento_id: string
  revisao_id: string
  data_evento: string
  observacao: string
}

export async function registrarEntrega(obraId: string, usuarioId: string, e: NovaEntrega, foto?: File | null): Promise<Linha> {
  const foto_id = await guardarFoto(obraId, usuarioId, foto)
  return sincronizador.registrar('distribuicao_eventos', obraId, usuarioId, {
    tipo: 'entrega',
    empresa_id: e.empresa_id,
    colaborador: e.colaborador.trim() || null,
    documento_id: e.documento_id,
    revisao_id: e.revisao_id,
    entrega_id: null,
    data_evento: e.data_evento,
    foto_id,
    observacao: e.observacao.trim() || null,
  })
}

export async function registrarDevolucao(
  obraId: string,
  usuarioId: string,
  entrega: Linha,
  dados: { data_evento: string; observacao: string },
  foto?: File | null,
): Promise<Linha> {
  const foto_id = await guardarFoto(obraId, usuarioId, foto)
  return sincronizador.registrar('distribuicao_eventos', obraId, usuarioId, {
    tipo: 'devolucao',
    empresa_id: entrega.empresa_id,
    colaborador: entrega.colaborador ?? null,
    documento_id: entrega.documento_id,
    revisao_id: entrega.revisao_id,
    entrega_id: entrega.id,
    data_evento: dados.data_evento,
    foto_id,
    observacao: dados.observacao.trim() || null,
  })
}

export function registrarEmpresa(obraId: string, usuarioId: string, e: { nome: string; contato: string }): Promise<Linha> {
  return sincronizador.registrar('empresas', obraId, usuarioId, { nome: e.nome.trim(), contato: e.contato.trim() || null, ativa: true })
}

export function registrarEscritorio(obraId: string, usuarioId: string, e: { documento_id: string; revisao_id: string; data_evento: string; observacao?: string }): Promise<Linha> {
  return sincronizador.registrar('escritorio_eventos', obraId, usuarioId, {
    documento_id: e.documento_id,
    revisao_id: e.revisao_id,
    data_evento: e.data_evento,
    observacao: e.observacao?.trim() || null,
  })
}
