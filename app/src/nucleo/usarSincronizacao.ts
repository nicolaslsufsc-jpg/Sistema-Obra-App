// Sincronização automática enquanto o app está aberto numa obra.
// - Nunca bloqueia a tela: roda por trás e só atualiza o estado.
// - Tenta ao abrir, quando a internet volta, quando o app volta para a frente
//   e a cada 5 min (a cada 1 min se tiver coisa esperando envio ou se a última falhou).
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { banco, conta, sincronizador } from './servicos'
import { mensagemParaTela } from './erros'
import type { EstadoSessao } from './conta'
import { ehModoLocal } from './local'

export interface EstadoSincronizacao {
  online: boolean
  sessao: EstadoSessao | 'verificando'
  /** Modo sem conta (local.ts): nada vai ao servidor; a fila fica no aparelho até "Salvar". */
  local: boolean
  sincronizando: boolean
  pendentes: number
  comErro: number
  /** Itens da fila de outra pessoa que usou este aparelho: só sobem quando ela entrar aqui (C5). */
  deOutros: number
  /** Hora (ISO) da última sincronização completa sem erro. */
  ultima?: string
  /** Por que a última tentativa não foi até o fim (vazio = foi). */
  problema?: string
  /** Muda sempre que chegam dados novos: as telas releem o banco local. */
  versaoDados: number
}

const CADA_5_MIN = 5 * 60_000
const CADA_1_MIN = 60_000

export function usarSincronizacao(usuarioId: string, obraId: string, aoPerderObra: () => void) {
  const [estado, setEstado] = useState<EstadoSincronizacao>({
    online: navigator.onLine,
    sessao: 'verificando',
    local: false,
    sincronizando: false,
    pendentes: 0,
    comErro: 0,
    deOutros: 0,
    versaoDados: 0,
  })
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const ativo = useRef(true)
  const rodando = useRef(false)
  /** Pedido feito enquanto um ciclo rodava: roda de novo logo que ele terminar. */
  const deNovo = useRef(false)
  const chaveUltima = `ultima_sincronizacao:${obraId}`

  const contar = useCallback(async () => {
    const [c, deOutros] = await Promise.all([sincronizador.contarFila(usuarioId), sincronizador.contarDeOutros(usuarioId)])
    if (ativo.current) setEstado((e) => ({ ...e, ...c, deOutros }))
    return c
  }, [usuarioId])

  const ciclo = useCallback(async () => {
    if (rodando.current) {
      deNovo.current = true
      return
    }
    rodando.current = true
    deNovo.current = false
    clearTimeout(timer.current)
    let proximo = CADA_5_MIN
    const mudar = (f: (e: EstadoSincronizacao) => EstadoSincronizacao) => {
      if (ativo.current) setEstado(f)
    }
    try {
      const online = navigator.onLine
      mudar((e) => ({ ...e, online }))
      if (await ehModoLocal(banco)) {
        // Sem conta: só conta a fila. Nada de servidor, nada de "problema".
        mudar((e) => ({ ...e, local: true, sessao: 'local', problema: undefined }))
        return
      }
      if (!online) {
        proximo = CADA_1_MIN
        return
      }
      mudar((e) => ({ ...e, sincronizando: true }))
      const sessao = await conta.estadoSessao(usuarioId)
      mudar((e) => ({ ...e, sessao }))
      if (sessao !== 'ok') {
        proximo = CADA_1_MIN
        if (sessao === 'offline') mudar((e) => ({ ...e, problema: 'sem conexão com o servidor' }))
        return
      }
      const obras = await conta.atualizarObras(usuarioId)
      if (Array.isArray(obras) && !obras.some((o) => o.id === obraId)) {
        aoPerderObra()
        return
      }
      const r = await sincronizador.sincronizar(obraId, usuarioId)
      const erro = r.envio.parouPor ?? r.baixa.erro
      if (!erro) {
        const agora = new Date().toISOString()
        await banco.gravarMeta(chaveUltima, agora)
        mudar((e) => ({ ...e, ultima: agora, problema: undefined }))
      } else {
        proximo = CADA_1_MIN
        mudar((e) => ({ ...e, problema: mensagemParaTela(erro) }))
      }
      if (r.baixa.recebidos > 0 || r.envio.enviados > 0) {
        mudar((e) => ({ ...e, versaoDados: e.versaoDados + 1 }))
      }
    } catch (e) {
      proximo = CADA_1_MIN
      mudar((x) => ({ ...x, problema: String(e) }))
    } finally {
      rodando.current = false
      const { pendentes } = await contar()
      mudar((e) => ({ ...e, sincronizando: false }))
      if (pendentes > 0) proximo = Math.min(proximo, CADA_1_MIN)
      if (deNovo.current) proximo = 0
      if (ativo.current) timer.current = setTimeout(ciclo, proximo)
    }
  }, [usuarioId, obraId, aoPerderObra, contar, chaveUltima])

  useEffect(() => {
    ativo.current = true
    banco.lerMeta<string>(chaveUltima).then((ultima) => {
      if (ativo.current) setEstado((e) => ({ ...e, ultima }))
    })
    contar()
    ciclo()
    const aoMudarRede = () => {
      setEstado((e) => ({ ...e, online: navigator.onLine }))
      if (navigator.onLine) ciclo()
    }
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') ciclo()
    }
    window.addEventListener('online', aoMudarRede)
    window.addEventListener('offline', aoMudarRede)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      ativo.current = false
      clearTimeout(timer.current)
      window.removeEventListener('online', aoMudarRede)
      window.removeEventListener('offline', aoMudarRede)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [ciclo, contar, chaveUltima])

  /** Dados mudaram fora da sincronização (ex.: restaurar um arquivo): as telas releem o banco. */
  const marcarDadosNovos = useCallback(() => {
    if (ativo.current) setEstado((e) => ({ ...e, versaoDados: e.versaoDados + 1 }))
  }, [])

  return { estado, sincronizarAgora: ciclo, recontar: contar, marcarDadosNovos }
}
