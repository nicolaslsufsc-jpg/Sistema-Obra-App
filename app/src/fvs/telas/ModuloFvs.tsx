// Módulo FVS: navegação interna (o botão voltar do Android volta uma tela).
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Linha } from '../../nucleo/banco_local'
import type { PropsModulo } from '../../modulos'
import { usarSincronizacao } from '../../nucleo/usarSincronizacao'
import { atualizarNomes, avisoDaSincronizacao, carregar, refazerToquesDaObra, type DadosFvs } from '../dados'
import { DadosDaTela, dadosGuardados, preLeituraEmCurso } from '../leitura'
import { pacotesNoAparelho } from '../pacote'
import { sistemaDaObra, type SistemaOficial } from '../../integracoes/sistema_oficial'
import { lembrarTela, telaGuardada } from '../onde_estava'
import { TelaDuplicadas } from './TelaDuplicadas'
import { TelaInicio } from './TelaInicio'
import { TelaLancamento } from './TelaLancamento'
import { TelaLocais, TelaLocal } from './TelaLocais'
import { TelaPlanta } from './TelaPlanta'
import { TelaRegras } from './TelaRegras'
import { TelaEscoramento } from './TelaEscoramento'
import { TelaReprovacoes } from './TelaReprovacoes'
import '../fvs.css'
import type { AbaDosAmbientes } from '../opcoes_ambientes'

export type TelaFvs =
  | { nome: 'inicio' }
  /** níveis 2 e 3 do início (21/11/2026): as disciplinas do pavimento e as opções de uma disciplina */
  | { nome: 'pavimento'; pavimentoId: string }
  | { nome: 'disciplina'; pavimentoId: string; disciplina: string }
  | { nome: 'reprovacoes' }
  | { nome: 'lancamento' }
  | { nome: 'duplicadas' }
  | { nome: 'regras' }
  /** locais do sistema oficial que não são peça da planta (21/11/2026): a lista e um local */
  | { nome: 'locais' }
  | { nome: 'local'; localId: string }
  | { nome: 'escoramento' }
  /** pecaId, fichaCampoId e item: abre centrada na peça, com o painel nessa ficha e nesse item;
   *  servico e aba: planta de ambientes aberta pelo menu do pavimento (opcoes_ambientes.ts, campo `abre`);
   *  tipo: aba da forma aberta por uma opção da Estrutura (P, V, L, F, B) */
  | { nome: 'planta'; plantaId: string; pecaId?: string; fichaCampoId?: string | null; item?: number; servico?: string; aba?: AbaDosAmbientes; tipo?: string }

/** Com a planta aberta e conta, a sincronização roda a cada minuto (o núcleo já usa 1 min quando há fila). */
const MINUTO_NA_PLANTA = 60_000

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
  const { estado, sincronizarAgora } = usarSincronizacao(usuario.id, obra.id, aoPerderObra)
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
  // aberta de novo na mesma página: mostra o que já tinha lido e relê por trás (leitura.ts)
  const chaveDosDados = `${obra.id}|${usuario.id}`
  const [dados, setDados] = useState<DadosFvs | null>(() => dadosGuardados(chaveDosDados))
  const leitor = useMemo(
    () => new DadosDaTela(async () => ({ ...(await carregar(obra.id)), usuarioId: usuario.id }), setDados, chaveDosDados),
    [chaveDosDados],
  )
  // as plantas do aparelho: a lista é lida junto com as marcações, não depois da tela inicial
  useEffect(() => {
    pacotesNoAparelho().catch(() => {})
  }, [])
  const recarregar = useCallback(() => leitor.recarregar(), [leitor])
  const registrados = useCallback((linhas: readonly Linha[]) => leitor.registrados(linhas), [leitor])

  // toques que a página não terminou de gravar (recarregou no meio): refeitos uma vez, ao abrir
  const [refeitos, setRefeitos] = useState(0)
  const refez = useRef(false)
  // aberta de novo sem nada mudar no aparelho: não relê (a primeira vez do efeito abaixo)
  const [guardadoVale] = useState(() => leitor.guardadoVale())
  const primeiraLeitura = useRef(true)
  useEffect(() => {
    leitor.aberta(true)
    return () => leitor.aberta(false)
  }, [leitor])
  useEffect(() => {
    const primeira = primeiraLeitura.current
    primeiraLeitura.current = false
    const ler = async (): Promise<DadosFvs> => {
      if (primeira && guardadoVale) return leitor.dados()!
      // o menu já começou a ler por trás (pre_leitura.ts): espera por ela em vez de ler de novo
      const antecipada = primeira ? preLeituraEmCurso(chaveDosDados) : null
      if (antecipada) {
        await antecipada
        const g = leitor.usarGuardado()
        if (g) return g
      }
      return recarregar()
    }
    ler().then(async (d) => {
      if (refez.current) return
      refez.current = true
      const n = await refazerToquesDaObra(obra.id, d, registrados)
      if (n) setRefeitos(n)
    })
  }, [recarregar, estado.versaoDados])

  // Planta aberta com conta: busca o que outro aparelho marcou a cada minuto, e não só a cada 5 min (o
  // ritmo do núcleo sem nada esperando envio). Teste com cabo (20/11): com o painel do P1 aberto no
  // celular, o C marcado no tablet não apareceu em 2 min. Quando chega registro novo, o núcleo muda
  // `versaoDados` e a tela relê o aparelho (efeito acima): a planta e o painel aberto se atualizam.
  const naPlanta = tela.nome === 'planta'
  const sincronizar = useRef(sincronizarAgora)
  sincronizar.current = sincronizarAgora
  useEffect(() => {
    if (!naPlanta || estado.local || !estado.online) return
    const relogio = window.setInterval(() => {
      if (document.visibilityState === 'visible') sincronizar.current()
    }, MINUTO_NA_PLANTA)
    return () => window.clearInterval(relogio)
  }, [naPlanta, estado.local, estado.online])

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
        key={`${tela.plantaId}|${tela.pecaId ?? ''}|${tela.fichaCampoId ?? ''}|${tela.item ?? ''}|${tela.servico ?? ''}|${tela.aba ?? ''}|${tela.tipo ?? ''}`}
        ctx={ctx}
        plantaId={plantaDaTela}
        pecaInicial={tela.pecaId}
        fichaCampoInicial={tela.fichaCampoId ?? undefined}
        itemInicial={tela.item}
        servicoInicial={tela.servico}
        abaInicial={tela.aba}
        tipoInicial={tela.tipo}
        aviso={aviso}
      />
    )
  }
  if (tela.nome === 'reprovacoes') return <TelaReprovacoes ctx={ctx} aviso={aviso} />
  if (tela.nome === 'lancamento' && ctx.sistema) return <TelaLancamento ctx={ctx} sistema={ctx.sistema} aviso={aviso} />
  if (tela.nome === 'regras') return <TelaRegras ctx={ctx} />
  if (tela.nome === 'locais') return <TelaLocais ctx={ctx} aviso={aviso} />
  if (tela.nome === 'local') return <TelaLocal key={tela.localId} ctx={ctx} localId={tela.localId} aviso={aviso} />
  if (tela.nome === 'escoramento') return <TelaEscoramento ctx={ctx} aviso={aviso} />
  if (tela.nome === 'duplicadas' && ctx.sistema) return <TelaDuplicadas ctx={ctx} sistema={ctx.sistema} aviso={aviso} />
  // os três níveis do início são a mesma tela (o download em andamento continua ao trocar de nível)
  const nivel = tela.nome === 'pavimento' ? { pavimentoId: tela.pavimentoId } : tela.nome === 'disciplina' ? { pavimentoId: tela.pavimentoId, disciplina: tela.disciplina } : undefined
  return <TelaInicio ctx={ctx} aviso={aviso} nivel={nivel} />
}
