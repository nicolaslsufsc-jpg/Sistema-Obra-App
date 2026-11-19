// Módulo FVS: navegação interna (o botão voltar do Android volta uma tela).
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Linha } from '../../nucleo/banco_local'
import type { PropsModulo } from '../../modulos'
import { usarSincronizacao } from '../../nucleo/usarSincronizacao'
import { atualizarNomes, avisoDaSincronizacao, carregar, refazerToquesDaObra, type DadosFvs } from '../dados'
import { DadosDaTela } from '../leitura'
import { sistemaDaObra, type SistemaOficial } from '../../integracoes/sistema_oficial'
import { lembrarTela, telaGuardada } from '../onde_estava'
import { TelaDuplicadas } from './TelaDuplicadas'
import { TelaInicio } from './TelaInicio'
import { TelaLancamento } from './TelaLancamento'
import { TelaPlanta } from './TelaPlanta'
import { TelaRegras } from './TelaRegras'
import { TelaReprovacoes } from './TelaReprovacoes'
import '../fvs.css'

export type TelaFvs =
  | { nome: 'inicio' }
  | { nome: 'reprovacoes' }
  | { nome: 'lancamento' }
  | { nome: 'duplicadas' }
  | { nome: 'regras' }
  /** pecaId, fichaCampoId e item: abre centrada na peça, com o painel nessa ficha e nesse item */
  | { nome: 'planta'; plantaId: string; pecaId?: string; fichaCampoId?: string | null; item?: number }

export interface ContextoFvs {
  props: PropsModulo
  dados: DadosFvs
  online: boolean
  /** Sem conta: nada vai a servidor (a fila fica no aparelho até salvar na pasta). */
  local: boolean
  ir: (t: TelaFvs) => void
  voltar: () => void
  /** Relê o banco do aparelho e devolve os dados novos. */
  recarregar: () => Promise<DadosFvs>
  /** Acrescenta registros recém-gravados sem reler o aparelho (o toque tem que responder na hora). */
  registrados: (linhas: readonly Linha[]) => DadosFvs
  /** Sistema oficial da obra (docs/modulos/integracoes.md); null = a tela não mostra nada dele. */
  sistema: SistemaOficial | null
}

export function ModuloFvs(props: PropsModulo) {
  const { usuario, obra, aoSair, aoPerderObra } = props
  const { estado } = usarSincronizacao(usuario.id, obra.id, aoPerderObra)
  const [tela, setTela] = useState<TelaFvs>(() => {
    const h = history.state
    if (h?.fvs) return h.fvs as TelaFvs
    // Chrome fechado com a FVS aberta: a casca voltou ao módulo (retomar) e a FVS volta ao ponto guardado,
    // com o início embaixo no histórico (o voltar do Android passa pelo início e depois pelo menu)
    const t = h?.retomar ? (telaGuardada(obra.id) as TelaFvs | undefined) : undefined
    if (t && t.nome !== 'inicio') {
      history.replaceState({ tela: 'fvs' }, '')
      history.pushState({ tela: 'fvs', fvs: t }, '')
      return t
    }
    lembrarTela(obra.id, { nome: 'inicio' })
    return { nome: 'inicio' }
  })
  const [dados, setDados] = useState<DadosFvs | null>(null)
  const leitor = useMemo(
    () => new DadosDaTela(async () => ({ ...(await carregar(obra.id)), usuarioId: usuario.id }), setDados),
    [obra.id, usuario.id],
  )
  const recarregar = useCallback(() => leitor.recarregar(), [leitor])
  const registrados = useCallback((linhas: readonly Linha[]) => leitor.registrados(linhas), [leitor])

  // toques que a página não terminou de gravar (recarregou no meio): refeitos uma vez, ao abrir
  const [refeitos, setRefeitos] = useState(0)
  const refez = useRef(false)
  useEffect(() => {
    recarregar().then(async (d) => {
      if (refez.current) return
      refez.current = true
      const n = await refazerToquesDaObra(obra.id, d, registrados)
      if (n) setRefeitos(n)
    })
  }, [recarregar, estado.versaoDados])

  // nomes de quem marcou: atualiza quando há login válido e mostra sem esperar por eles
  // (sem conta, ou antes de a sincronização conferir a sessão, não há o que pedir ao servidor)
  useEffect(() => {
    if (!estado.online || estado.sessao !== 'ok') return
    let vivo = true
    atualizarNomes().then((mudou) => {
      if (mudou && vivo) recarregar()
    })
    return () => {
      vivo = false
    }
  }, [estado.online, estado.sessao, recarregar])

  useEffect(() => {
    const aoVoltar = (e: PopStateEvent) => {
      if (e.state?.tela !== 'fvs') return
      const t = (e.state.fvs as TelaFvs) ?? { nome: 'inicio' }
      lembrarTela(obra.id, t)
      setTela(t)
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  const ir = (t: TelaFvs) => {
    history.pushState({ tela: 'fvs', fvs: t }, '')
    lembrarTela(obra.id, t)
    setTela(t)
  }
  const voltar = () => {
    if (history.state?.tela === 'fvs' && history.state?.fvs) history.back()
    else aoSair()
  }

  if (!dados) return <main class="tela">Carregando…</main>
  const ctx: ContextoFvs = { props, dados, online: estado.online, local: estado.local, ir, voltar, recarregar, registrados, sistema: sistemaDaObra(obra) }
  const aviso = [
    refeitos ? `${refeitos === 1 ? '1 marcação feita' : `${refeitos} marcações feitas`} antes de a página recarregar ${refeitos === 1 ? 'foi gravada' : 'foram gravadas'} agora.` : '',
    avisoDaSincronizacao(estado),
  ]
    .filter(Boolean)
    .join(' ')

  // revisão nova chegou com a planta aberta: a pessoa continua onde está, e a tela avisa
  const plantaDaTela = tela.nome === 'planta' ? (dados.vigenteDe.get(tela.plantaId) ?? tela.plantaId) : ''
  if (tela.nome === 'planta' && dados.plantaPorId.has(plantaDaTela)) {
    return (
      <TelaPlanta
        key={`${tela.plantaId}|${tela.pecaId ?? ''}|${tela.fichaCampoId ?? ''}|${tela.item ?? ''}`}
        ctx={ctx}
        plantaId={plantaDaTela}
        pecaInicial={tela.pecaId}
        fichaCampoInicial={tela.fichaCampoId ?? undefined}
        itemInicial={tela.item}
        aviso={aviso}
      />
    )
  }
  if (tela.nome === 'reprovacoes') return <TelaReprovacoes ctx={ctx} aviso={aviso} />
  if (tela.nome === 'lancamento' && ctx.sistema) return <TelaLancamento ctx={ctx} sistema={ctx.sistema} aviso={aviso} />
  if (tela.nome === 'regras') return <TelaRegras ctx={ctx} />
  if (tela.nome === 'duplicadas' && ctx.sistema) return <TelaDuplicadas ctx={ctx} sistema={ctx.sistema} aviso={aviso} />
  return <TelaInicio ctx={ctx} aviso={aviso} />
}
