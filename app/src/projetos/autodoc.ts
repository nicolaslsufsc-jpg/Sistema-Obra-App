// Última atualização do Autodoc (21/11/2026, pedido do Nicolas: "a única coisa que a pessoa vai fazer é
// executar o script").
//
// Um script no PC (fora do repositório, porque entra no Autodoc) exporta a lista de arquivos e a publica
// pelo pipeline/projetos/importar_lista.py: grava documentos, revisoes e uma linha em listas_autodoc
// (migração 20261103234000_projetos.sql). listas_autodoc não desce com a sincronização (projetos/tabelas.ts):
// o app lê só a última linha, direto do servidor, e guarda uma cópia no aparelho para quando estiver sem
// internet. Só leitura; só no app com conta (sem conta não há servidor).
import { banco, cliente } from '../nucleo/servicos'

export interface UltimaListaAutodoc {
  /** dia da lista (o dia em que o relatório foi tirado do Autodoc) */
  dataLista: string
  /** quando chegou ao servidor (ISO) */
  publicadaEm: string
  /** nome de quem rodou o script; sem nome, o e-mail ou "alguém da obra" */
  quem: string
  revisoesNovas: number
  documentosNovos: number
  /** primeira linha do relatório do dia ("Sem revisão nova. Verificado em ...") */
  resultado: string
}

/** O que o servidor devolveu na última consulta; `null` = a obra ainda não tem nenhuma lista. */
export interface EstadoAutodoc {
  ultima: UltimaListaAutodoc | null
  /** dia da lista anterior à última (para contar o que é novo desde a leitura anterior); null = só uma leitura */
  anterior?: string | null
  /** quando o aparelho perguntou ao servidor pela última vez (ISO) */
  conferidoEm: string
}

const chave = (obraId: string) => `projetos_autodoc:${obraId}`

/** A cópia guardada no aparelho (para abrir sem internet). */
export async function lerGuardado(obraId: string): Promise<EstadoAutodoc | null> {
  return (await banco.lerMeta<EstadoAutodoc>(chave(obraId))) ?? null
}

interface LinhaLista {
  data_lista: string
  criado_em_servidor: string
  usuario_id: string
  revisoes_novas: number | null
  documentos_novos: number | null
  resultado: string | null
}

/**
 * Pergunta ao servidor pela última lista publicada. Sem internet ou sem permissão, devolve a cópia
 * guardada (ou null): esta faixa é aviso, não pode atrapalhar o resto da tela.
 */
export async function atualizarDoServidor(obraId: string, agora = new Date()): Promise<EstadoAutodoc | null> {
  try {
    const { data, error } = await cliente
      .from('listas_autodoc')
      .select('data_lista, criado_em_servidor, usuario_id, revisoes_novas, documentos_novos, resultado')
      .eq('obra_id', obraId)
      .eq('apagado', false)
      .order('criado_em_servidor', { ascending: false })
      .limit(20)
    if (error || !data) return lerGuardado(obraId)
    const linhas = data as LinhaLista[]
    const linha = linhas[0]
    // a leitura anterior é a última de um dia antes (no mesmo dia o script pode rodar mais de uma vez)
    const anterior = linha ? (linhas.find((l) => l.data_lista < linha.data_lista)?.data_lista ?? null) : null
    let ultima: UltimaListaAutodoc | null = null
    if (linha) {
      let quem = 'alguém da obra'
      const perfil = await cliente.from('perfis').select('nome').eq('id', linha.usuario_id).maybeSingle()
      const nome = (perfil.data as { nome?: string | null } | null)?.nome
      if (nome) quem = nome
      ultima = {
        dataLista: linha.data_lista,
        publicadaEm: linha.criado_em_servidor,
        quem,
        revisoesNovas: linha.revisoes_novas ?? 0,
        documentosNovos: linha.documentos_novos ?? 0,
        resultado: linha.resultado ?? '',
      }
    }
    const estado: EstadoAutodoc = { ultima, anterior, conferidoEm: agora.toISOString() }
    await banco.gravarMeta(chave(obraId), estado)
    return estado
  } catch (e) {
    console.warn('Projetos: última atualização do Autodoc não lida do servidor', e)
    return lerGuardado(obraId)
  }
}

export const UM_DIA_MS = 24 * 60 * 60 * 1000

export interface FaixaAutodoc {
  tipo: 'ok' | 'atrasada' | 'nunca' | 'sem-dados'
  titulo: string
  detalhe: string
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')
function dataHora(iso: string): string {
  const d = new Date(iso)
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export const ATALHO = 'Atualizar projetos do Autodoc'

/** O texto da faixa. Mais de 1 dia sem publicar: pede para rodar o atalho no PC. Função pura. */
export function faixaAutodoc(estado: EstadoAutodoc | null, agora = new Date()): FaixaAutodoc {
  if (!estado) {
    return { tipo: 'sem-dados', titulo: 'Última atualização do Autodoc: ainda não consultada', detalhe: 'Abra com internet para ver quando o Autodoc foi puxado.' }
  }
  const u = estado.ultima
  if (!u) {
    return { tipo: 'nunca', titulo: 'O Autodoc ainda não foi puxado para esta obra', detalhe: `Rode o atalho "${ATALHO}" no PC.` }
  }
  // a primeira leitura da obra é a carga inicial: o que veio nela não é novidade (testador, 23/11/2026)
  const primeira = estado.anterior === null
  const novidades = primeira
    ? `Carga inicial: ${plural(u.documentosNovos, 'prancha', 'pranchas')}. Nada conta como revisão nova até a próxima atualização.`
    : u.revisoesNovas || u.documentosNovos
      ? [u.revisoesNovas ? plural(u.revisoesNovas, 'revisão nova', 'revisões novas') : '', u.documentosNovos ? plural(u.documentosNovos, 'documento novo', 'documentos novos') : '']
          .filter(Boolean)
          .join(' · ')
      : 'sem revisão nova'
  const titulo = `Última atualização do Autodoc: ${dataHora(u.publicadaEm)}, por ${u.quem}`
  if (agora.getTime() - new Date(u.publicadaEm).getTime() > UM_DIA_MS) {
    return { tipo: 'atrasada', titulo, detalhe: `Mais de 1 dia sem atualizar. Rode o atalho "${ATALHO}" no PC.` }
  }
  return { tipo: 'ok', titulo, detalhe: novidades }
}
