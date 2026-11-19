// Arquivo de salvamento (.obra): a fila de pendentes de uma pessoa numa obra (registros e
// fotos), para guardar fora do navegador e restaurar noutro aparelho. É exatamente o que a
// sincronização manda ao servidor; quando o servidor entrar, "Enviar" usa a mesma fila.
import type { BancoLocal, ItemFila, Linha } from './banco_local'
import type { ObraLocal, UsuarioLocal } from './conta'

export interface Salvamento {
  formato: 'sistema-obra-salvo'
  versao: 1
  gerado_em: string
  dispositivo_id: string
  usuario: UsuarioLocal
  obra: ObraLocal
  itens: Omit<ItemFila, 'seq'>[]
  conteudos: { id: string; base64: string }[]
  /**
   * As fichas (fichas_modelo) que os itens usam pelo ficha_id. Sem elas, o aparelho que já recebeu
   * uma revisão nova da ficha não acharia a revisão em que as peças foram marcadas, e elas apareceriam
   * vazias. Opcional: arquivo de antes de 08/11/2026 não traz, e app antigo ignora.
   */
  fichas?: Linha[]
}

const FORMATO = 'sistema-obra-salvo'
const TABELA_DE_FICHAS = 'fichas_modelo'
const ERRO_FORMATO = 'Este arquivo não é um salvamento do Sistema Obra'

/** Fila (pendentes e com erro) desta pessoa nesta obra, em ordem, com as fotos ainda no aparelho. */
export async function gerarSalvamento(banco: BancoLocal, usuario: UsuarioLocal, obra: ObraLocal): Promise<Salvamento> {
  const fila = await banco.fila.orderBy('seq').filter((i) => i.usuario_id === usuario.id && i.obra_id === obra.id).toArray()
  const itens = fila.map(({ seq: _seq, ...resto }) => resto)
  const conteudos: Salvamento['conteudos'] = []
  for (const item of fila) {
    if (!item.arquivo) continue
    const c = await banco.conteudos.get(item.id)
    if (c) conteudos.push({ id: c.id, base64: paraBase64(c.bytes) })
  }
  const fichas: Linha[] = []
  for (const id of new Set(fila.map((i) => i.linha.ficha_id).filter((x): x is string => typeof x === 'string'))) {
    const r = await banco.registros.get([TABELA_DE_FICHAS, id])
    if (r) fichas.push(r.linha)
  }
  return {
    formato: FORMATO,
    versao: 1,
    gerado_em: new Date().toISOString(),
    dispositivo_id: await banco.dispositivoId(),
    usuario,
    obra,
    itens,
    conteudos,
    fichas,
  }
}

/** JSON comprimido (gzip) quando o navegador sabe comprimir; senão JSON puro. */
export async function empacotar(s: Salvamento): Promise<Blob> {
  const json = new Blob([JSON.stringify(s)], { type: 'application/json' })
  if (typeof CompressionStream === 'undefined') return json
  const comprimido = json.stream().pipeThrough(new CompressionStream('gzip'))
  return new Blob([await new Response(comprimido).arrayBuffer()], { type: 'application/gzip' })
}

export async function desempacotar(blob: Blob): Promise<Salvamento> {
  const inicio = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  const gzip = inicio[0] === 0x1f && inicio[1] === 0x8b
  let texto: string
  try {
    texto = gzip ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text() : await blob.text()
  } catch {
    throw new Error(ERRO_FORMATO)
  }
  let s: unknown
  try {
    s = JSON.parse(texto)
  } catch {
    throw new Error(ERRO_FORMATO)
  }
  if (!ehSalvamento(s)) throw new Error(ERRO_FORMATO)
  return s
}

/** Quantos registros desta pessoa nesta obra ainda estão na fila (pendentes e com erro). */
export function contarFilaDaObra(banco: BancoLocal, usuario: UsuarioLocal, obra: ObraLocal): Promise<number> {
  return banco.fila.where('obra_id').equals(obra.id).filter((i) => i.usuario_id === usuario.id).count()
}

/**
 * Repõe a fila no aparelho, no usuário atual. Item cujo registro já existe aqui é "repetido".
 * Nada é apagado. A obra do arquivo entra na lista do aparelho e vira a atual.
 * As fichas que vêm junto entram como baixadas, só se o aparelho ainda não tem aquela (nunca por cima).
 */
export async function aplicarSalvamento(
  banco: BancoLocal,
  s: Salvamento,
  usuarioAtual: UsuarioLocal,
): Promise<{ novos: number; repetidos: number }> {
  const conteudoPorId = new Map(s.conteudos.map((c) => [c.id, c.base64]))
  let novos = 0
  let repetidos = 0
  await banco.transaction('rw', banco.registros, banco.fila, banco.conteudos, banco.meta, async () => {
    for (const f of s.fichas ?? []) {
      if (!ehFicha(f) || (await banco.registros.get([TABELA_DE_FICHAS, f.id]))) continue
      await banco.registros.put({ tabela: TABELA_DE_FICHAS, id: f.id, obra_id: f.obra_id, linha: f, pendente: 0 })
    }
    for (const item of s.itens) {
      if (await banco.registros.get([item.tabela, item.id])) {
        repetidos++
        continue
      }
      const linha = { ...item.linha, usuario_id: usuarioAtual.id }
      await banco.registros.put({ tabela: item.tabela, id: item.id, obra_id: item.obra_id, linha, pendente: 1 })
      const base64 = conteudoPorId.get(item.id)
      if (item.arquivo && base64 !== undefined) await banco.conteudos.put({ id: item.id, bytes: deBase64(base64) })
      await banco.fila.add({
        usuario_id: usuarioAtual.id,
        obra_id: item.obra_id,
        tabela: item.tabela,
        id: item.id,
        linha,
        arquivo: item.arquivo,
        arquivo_enviado: item.arquivo_enviado,
        estado: 'pendente',
        tentativas: 0,
        criado_em: item.criado_em,
      })
      novos++
    }
    const obras = (await banco.lerMeta<ObraLocal[]>('obras')) ?? []
    if (!obras.some((o) => o.id === s.obra.id)) await banco.gravarMeta('obras', [...obras, s.obra])
    // A obra aberta continua aberta; só vira atual se não havia nenhuma.
    if (!(await banco.lerMeta<string>('obra_atual'))) await banco.gravarMeta('obra_atual', s.obra.id)
  })
  return { novos, repetidos }
}

const d2 = (n: number) => String(n).padStart(2, '0')
/** AAAA-MM-DD no horário do aparelho. */
export const diaLocal = (d: Date) => `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`

export function nomeDoArquivo(obra: Pick<ObraLocal, 'codigo'>, agora: Date): string {
  return `salvo-${obra.codigo}-${diaLocal(agora)}_${d2(agora.getHours())}-${d2(agora.getMinutes())}.obra`
}

function ehSalvamento(s: unknown): s is Salvamento {
  if (!s || typeof s !== 'object') return false
  const o = s as Record<string, unknown>
  return o.formato === FORMATO && Array.isArray(o.itens) && Array.isArray(o.conteudos) && typeof o.obra === 'object' && !!o.obra
}

function ehFicha(f: unknown): f is Linha {
  if (!f || typeof f !== 'object') return false
  const o = f as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.obra_id === 'string' && typeof o.codigo === 'string' && Array.isArray(o.itens)
}

/** Base64 em fatias: foto grande não estoura a pilha do String.fromCharCode. */
function paraBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192))
  return btoa(bin)
}

function deBase64(texto: string): ArrayBuffer {
  const bin = atob(texto)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8.buffer
}
