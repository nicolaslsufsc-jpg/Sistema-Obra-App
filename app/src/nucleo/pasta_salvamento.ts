// Pasta de salvamento automático (Chrome/Edge no PC): a pessoa escolhe uma pasta uma vez e,
// a cada registro, o app grava ali o arquivo .obra da obra aberta. Usa a File System Access API;
// onde ela não existe (celular, Firefox), só o "Salvar arquivo" da faixa funciona.
import type { BancoLocal } from './banco_local'
import type { ObraLocal, UsuarioLocal } from './conta'
import { diaLocal, empacotar, gerarSalvamento } from './salvamento'

const CHAVE_PASTA = 'pasta_salvamento'

// A API ainda não está nos tipos do TypeScript: só o que usamos aqui.
interface PastaHandle {
  name: string
  queryPermission(o: { mode: 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
  requestPermission(o: { mode: 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
  getFileHandle(nome: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>
}

export type EstadoPasta = { estado: 'nenhuma' } | { estado: 'ok' | 'pedir'; nome: string }

export function suportaPasta(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

async function pastaGuardada(banco: BancoLocal): Promise<PastaHandle | undefined> {
  try {
    return await banco.lerMeta<PastaHandle>(CHAVE_PASTA)
  } catch {
    return undefined
  }
}

export async function estadoPasta(banco: BancoLocal): Promise<EstadoPasta> {
  const pasta = await pastaGuardada(banco)
  if (!pasta) return { estado: 'nenhuma' }
  try {
    return { estado: (await pasta.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'pedir', nome: pasta.name }
  } catch {
    return { estado: 'pedir', nome: pasta.name }
  }
}

/** Abre o seletor de pastas do navegador. Cancelado: devolve o estado de antes. */
export async function escolherPasta(banco: BancoLocal): Promise<EstadoPasta> {
  try {
    const pasta = (await (window as unknown as { showDirectoryPicker(o: { mode: string }): Promise<PastaHandle> }).showDirectoryPicker({ mode: 'readwrite' })) as PastaHandle
    await banco.gravarMeta(CHAVE_PASTA, pasta)
  } catch {
    // cancelado ou recusado
  }
  return estadoPasta(banco)
}

/** Pede a permissão de novo (precisa de um toque da pessoa). */
export async function reativarPasta(banco: BancoLocal): Promise<EstadoPasta> {
  const pasta = await pastaGuardada(banco)
  if (pasta) {
    try {
      await pasta.requestPermission({ mode: 'readwrite' })
    } catch {
      // segue para o estado
    }
  }
  return estadoPasta(banco)
}

export function esquecerPasta(banco: BancoLocal): Promise<void> {
  return banco.apagarMeta(CHAVE_PASTA)
}

/** Grava (sobrescrevendo) um arquivo na pasta. false = sem pasta ou sem permissão. */
export async function gravarNaPasta(banco: BancoLocal, nome: string, blob: Blob): Promise<boolean> {
  const pasta = await pastaGuardada(banco)
  if (!pasta) return false
  try {
    if ((await pasta.queryPermission({ mode: 'readwrite' })) !== 'granted') return false
    const arquivo = await pasta.getFileHandle(nome, { create: true })
    const escrita = await arquivo.createWritable()
    await escrita.write(blob)
    await escrita.close()
    return true
  } catch {
    return false
  }
}

export function nomeNaPasta(obra: Pick<ObraLocal, 'codigo'>, dia?: Date): string {
  return dia ? `salvo-${obra.codigo}-${diaLocal(dia)}.obra` : `salvo-${obra.codigo}.obra`
}

/**
 * Liga o salvamento automático: cada registro novo na fila agenda, depois de `esperaMs` sem
 * outro registro, a gravação do .obra da obra aberta (`obter` diz qual é; null = nenhuma).
 * Devolve a função que desliga.
 */
export function ligarSalvamentoAutomatico(
  banco: BancoLocal,
  obter: () => { usuario: UsuarioLocal; obra: ObraLocal } | null,
  gravar: (nome: string, blob: Blob) => Promise<boolean> = (n, b) => gravarNaPasta(banco, n, b),
  esperaMs = 3000,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let ligado = true

  const salvar = async () => {
    const alvo = obter()
    if (!alvo || !ligado) return
    const blob = await empacotar(await gerarSalvamento(banco, alvo.usuario, alvo.obra))
    const agora = new Date()
    const ok1 = await gravar(nomeNaPasta(alvo.obra), blob)
    const ok2 = await gravar(nomeNaPasta(alvo.obra, agora), blob)
    if (ok1 || ok2) await banco.gravarMeta(`ultimo_salvamento:${alvo.obra.id}`, agora.toISOString())
  }

  const aoCriar = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      salvar().catch(() => undefined)
    }, esperaMs)
  }
  banco.fila.hook('creating', aoCriar)

  return () => {
    ligado = false
    clearTimeout(timer)
    banco.fila.hook('creating').unsubscribe(aoCriar)
  }
}
