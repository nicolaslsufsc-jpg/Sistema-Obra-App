// Documentos da empresa que vêm no pacote da obra (segunda rodada, 09/11/2026).
//
// O pipeline (pipeline/fvs/exportar_bancada.py --documentos PASTA) põe no .zip a pasta
// `documentos/`: um `indice.json` e os arquivos (PDF ou foto). Ao abrir o pacote, o app grava
// cada documento como registro BAIXADO (pendente 0), igual às fichas da FVS: não vai para a fila nem
// para o arquivo .obra, e um pacote novo troca os documentos do pacote anterior. O que alguém fizer
// no aparelho sobre eles (revisão nova, "em revisão") é linha nova pendente e fica.
//
// Formato de `documentos/indice.json` (o pipeline confere tudo antes de gravar):
// { "documentos": [ { "categoria", "codigo", "titulo", "revisao", "data_revisao" (AAAA-MM-DD),
//   "validade" (AAAA-MM-DD ou null), "responsavel", "situacao" ("vigente" | "em_revisao"),
//   "observacao" (ou null), "arquivo": { "caminho", "nome", "tipo", "tamanho", "sha256" } ou null } ] }
// Escopo: sempre "empresa" (Manual, procedimentos, PES, modelos); documento da obra é cadastrado nela.
import type { BancoLocal } from '../nucleo/banco_local'
import type { ObraLocal } from '../nucleo/conta'
import { USUARIO_DO_PACOTE, uuidDeterministico } from '../nucleo/pacote_obra'
import { sha256Hex } from '../fvs/pacote'
import { LIMITE_ARQUIVO, TABELA_DOCUMENTOS, TIPOS_ACEITOS, nomeLimpo } from './regras'

export const PASTA_DOCUMENTOS = 'documentos/'
const DISPOSITIVO = '00000000-0000-0000-0000-000000000000'
const chaveDoPacote = (obraId: string) => `documentos_pacote:${obraId}`

export interface ArquivoNoPacote {
  caminho: string
  nome: string
  tipo: string
  tamanho: number
  sha256: string
}

export interface DocumentoNoPacote {
  categoria: string
  codigo: string
  titulo: string
  revisao: string
  data_revisao: string
  validade?: string | null
  responsavel: string
  situacao?: 'vigente' | 'em_revisao'
  observacao?: string | null
  arquivo?: ArquivoNoPacote | null
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

function conferir(d: DocumentoNoPacote, i: number): string | null {
  const texto = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  if (!texto(d.codigo) || !texto(d.titulo) || !texto(d.revisao) || !texto(d.categoria) || !texto(d.responsavel)) return `documento ${i + 1} sem código, título, revisão, categoria ou responsável`
  if (!DATA.test(String(d.data_revisao))) return `${d.codigo}: data da revisão fora do formato AAAA-MM-DD`
  if (d.validade && !DATA.test(d.validade)) return `${d.codigo}: validade fora do formato AAAA-MM-DD`
  const a = d.arquivo
  if (a && !(TIPOS_ACEITOS as readonly string[]).includes(a.tipo)) return `${d.codigo}: só PDF ou foto (JPG, PNG, WEBP ou HEIC)`
  if (a && (!texto(a.caminho) || a.caminho.includes('..') || !/^[0-9a-f]{64}$/.test(a.sha256) || !(a.tamanho > 0) || a.tamanho > LIMITE_ARQUIVO)) return `${d.codigo}: arquivo inválido ou maior que o limite`
  return null
}

/**
 * Lê `documentos/indice.json` do pacote e grava os documentos da empresa. Devolve quantos entraram
 * (0 = o pacote não traz documentos ou são os mesmos de antes). Erro = pacote com problema: nada muda.
 */
export async function semearDocumentosDoPacote(banco: BancoLocal, obra: ObraLocal, ler: (caminho: string) => Promise<Blob | null>): Promise<number> {
  const blob = await ler(PASTA_DOCUMENTOS + 'indice.json')
  if (!blob) return 0
  const texto = await blob.text()
  let lista: DocumentoNoPacote[]
  try {
    const bruto = JSON.parse(texto) as { documentos?: unknown }
    if (!Array.isArray(bruto.documentos)) throw new Error()
    lista = bruto.documentos as DocumentoNoPacote[]
  } catch {
    throw new Error('A lista de documentos do pacote da obra está estragada. Gere o pacote de novo no PC.')
  }
  const assinatura = await sha256Hex(new TextEncoder().encode(texto).buffer as ArrayBuffer)
  if ((await banco.lerMeta<{ assinatura: string }>(chaveDoPacote(obra.id)))?.assinatura === assinatura) return 0

  const registros: Array<{ tabela: string; id: string; linha: Record<string, unknown> }> = []
  const conteudos: Array<{ id: string; bytes: ArrayBuffer }> = []
  const uid = (chave: string) => uuidDeterministico(`${obra.id}:pacote-doc:${chave}`)
  for (const [i, d] of lista.entries()) {
    const problema = conferir(d, i)
    if (problema) throw new Error(`Documento do pacote com problema (${problema}). Gere o pacote de novo no PC.`)
    const codigo = d.codigo.trim().toUpperCase()
    const chave = `${codigo}:${d.revisao.trim()}`
    const criado = new Date(`${d.data_revisao}T10:00:00-03:00`).toISOString()
    const comuns = { obra_id: obra.id, usuario_id: USUARIO_DO_PACOTE, dispositivo_id: DISPOSITIVO, criado_em_dispositivo: criado, apagado: false, do_pacote: true }
    let arquivoId: string | null = null
    if (d.arquivo) {
      const a = d.arquivo
      const b = await ler(PASTA_DOCUMENTOS + a.caminho)
      const bytes = b ? await b.arrayBuffer() : null
      if (!bytes || bytes.byteLength !== a.tamanho || (await sha256Hex(bytes)) !== a.sha256) throw new Error(`O arquivo de ${codigo} no pacote da obra está estragado ou faltando. Gere o pacote de novo no PC.`)
      arquivoId = await uid(`arquivo:${a.sha256}`)
      conteudos.push({ id: arquivoId, bytes })
      registros.push({
        tabela: 'arquivos',
        id: arquivoId,
        linha: { id: arquivoId, ...comuns, caminho: `${obra.id}/documentos/${arquivoId}`, nome_original: nomeLimpo(a.nome), hash: a.sha256, tamanho: a.tamanho, tipo: a.tipo || 'application/octet-stream' },
      })
    }
    const id = await uid(`doc:${chave}`)
    registros.push({
      tabela: TABELA_DOCUMENTOS,
      id,
      linha: {
        id,
        ...comuns,
        escopo: 'empresa',
        categoria: d.categoria.trim(),
        codigo,
        titulo: d.titulo.trim(),
        revisao: d.revisao.trim(),
        data_revisao: d.data_revisao,
        validade: d.validade || null,
        responsavel: d.responsavel.trim(),
        situacao: d.situacao === 'em_revisao' ? 'em_revisao' : 'vigente',
        arquivo_id: arquivoId,
        observacao: d.observacao?.trim() || null,
        substitui_id: null,
        cancelado: false,
      },
    })
  }

  await banco.transaction('rw', banco.registros, banco.conteudos, banco.meta, async () => {
    // tira o que o pacote anterior trouxe (só o baixado: o que foi feito aqui fica)
    const antigos = await banco.registros
      .where('[tabela+obra_id]')
      .anyOf([TABELA_DOCUMENTOS, obra.id], ['arquivos', obra.id])
      .filter((r) => r.pendente === 0 && (r.linha as { do_pacote?: boolean }).do_pacote === true)
      .toArray()
    const novos = new Set(registros.map((r) => `${r.tabela}:${r.id}`))
    for (const r of antigos) {
      if (novos.has(`${r.tabela}:${r.id}`)) continue
      await banco.registros.delete([r.tabela, r.id])
      if (r.tabela === 'arquivos') await banco.conteudos.delete(r.id)
    }
    for (const r of registros) await banco.registros.put({ tabela: r.tabela, id: r.id, obra_id: obra.id, linha: r.linha as never, pendente: 0 })
    for (const c of conteudos) await banco.conteudos.put(c)
    await banco.gravarMeta(chaveDoPacote(obra.id), { assinatura, quando: new Date().toISOString() })
  })
  return lista.length
}
