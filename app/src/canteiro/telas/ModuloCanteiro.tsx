// Mapa do canteiro: a pessoa escolhe uma figura na paleta e toca na folha para colocar; depois arrasta,
// gira, muda o tamanho, renomeia, duplica, muda a ordem ou apaga. Também desenha caminhos (com seta) e
// áreas coloridas, ponto a ponto. Fundo: a planta do pavimento que já está no aparelho ou a folha em
// branco com grade. Cada folha pode ter mais de um mapa. Tudo fica guardado no aparelho (../banco.ts).
// Uma tela só: o "voltar" do Android cai direto no menu (casca do app).
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { PropsModulo } from '../../modulos'
import { plantasDoPavimento } from '../../fvs/plantas'
import { baixarBlob } from '../../nucleo/baixar'
import { sincronizador } from '../../nucleo/servicos'
import { usarSincronizacao } from '../../nucleo/usarSincronizacao'
import { Cabecalho } from '../../telas/Cabecalho'
import {
  FOLHA_GERAL,
  FUNDO_GRADE,
  MAPA_PRINCIPAL,
  NOME_DE_MAPA_MAX,
  NOME_DO_PRINCIPAL,
  apagarMapa,
  guardarMapa,
  lerMapa,
  mapasDaFolha,
  renomearMapa,
  type MapaDaLista,
} from '../banco'
import { nomeDoArquivo, pdfDoMapa, pngDoMapa, svgDoItem, svgDosItens, type PedidoDeImagem } from '../exportar'
import { FIGURAS, figuraPorId, svgDaFigura } from '../figuras'
import { pedacosDoFundo, svgDaGrade, svgDasPecas, type PlantaDeFundo } from '../fundo'
import {
  ALTURA_EM_BRANCO,
  CORES,
  LARGURA,
  NOME_MAX,
  TRACADOS,
  ajustarVista,
  alturaDoItem,
  apagar,
  aplicar,
  arrastarVista,
  colorir,
  desfazer,
  doItem,
  duplicar,
  ehTracado,
  escalar,
  folhaDe,
  girar,
  girarPara,
  giroParaOPonto,
  hexDaCor,
  itemNoPonto,
  mover,
  moverPonto,
  novoHistorico,
  paraFrente,
  paraTras,
  podeDesfazer,
  posicionar,
  redimensionar,
  renomear,
  tamanhoParaOPonto,
  telaParaFolha,
  tracar,
  zoomNoPonto,
  type Folha,
  type Historico,
  type ItemCanteiro,
  type Ponto,
  type TipoTracado,
  type Vista,
} from '../logica'
import '../canteiro.css'

/** Plantas de um pavimento que já estão no aparelho. A bancada de testes troca esta fonte. */
export type FonteDePlantas = (obraId: string, pavimento: { id: string; nome: string }) => Promise<PlantaDeFundo[]>

const plantasDaFvs: FonteDePlantas = (obraId, pavimento) => plantasDoPavimento(obraId, pavimento.id, pavimento.nome)

interface FolhaDaLista {
  id: string
  nome: string
}

type Gesto =
  | { tipo: 'mover'; id: string; dx: number; dy: number; x0: number; y0: number; andou: boolean }
  | { tipo: 'girar'; id: string }
  | { tipo: 'tamanho'; id: string }
  | { tipo: 'ponto'; id: string; indice: number }
  | { tipo: 'fundo'; x0: number; y0: number; ux: number; uy: number; andou: boolean }
  | { tipo: 'pinca'; d0: number; cx: number; cy: number; vista0: Vista }

/** Folga do toque, em pixels da tela: o dedo (com luva) pega a figura pequena e as alças. */
const FOLGA_PX = 14
const ALCA_PX = 22
/** Distância da alça de girar até a borda de cima da figura, em pixels da tela. */
const HASTE_PX = 30
const COR_SELECAO = '#1565c0'

const ordem = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** Desenhos dos dois botões de traçado da paleta. */
const ICONE_DO_TRACADO: Record<TipoTracado, string> = {
  caminho:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><path d="M10 66 L38 30 L62 52 L82 20" fill="none" stroke="#e8772e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="14 9"/><path d="M92 8 L70 14 L86 30 Z" fill="#e8772e"/></svg>',
  area: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><path d="M14 20 L62 10 L90 40 L70 70 L20 62 Z" fill="#2f6fb5" fill-opacity="0.22" stroke="#2f6fb5" stroke-width="5" stroke-linejoin="round"/></svg>',
}

const icone = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <path d={d} />
  </svg>
)
const ICONES = {
  girarEsq: 'M4 5v5h5M4.6 10A8 8 0 1 1 5 16',
  girarDir: 'M20 5v5h-5M19.4 10A8 8 0 1 0 19 16',
  menor: 'M5 12h14',
  maior: 'M12 5v14M5 12h14',
  duplicar: 'M9 9h11v11H9zM5 15H4V4h11v1',
  frente: 'M12 19V6M6 11l6-6 6 6M5 21h14',
  tras: 'M12 5v13M6 13l6 6 6-6M5 3h14',
}

export function ModuloCanteiro({ usuario, obra, aoSair, aoPerderObra, fontePlantas = plantasDaFvs }: PropsModulo & { fontePlantas?: FonteDePlantas }) {
  const { estado } = usarSincronizacao(usuario.id, obra.id, aoPerderObra)

  const [folhas, setFolhas] = useState<FolhaDaLista[]>([{ id: FOLHA_GERAL, nome: 'Canteiro geral' }])
  const [folhaId, setFolhaId] = useState<string>(() => (history.state?.canteiro?.folha as string | undefined) ?? FOLHA_GERAL)
  const [mapaId, setMapaId] = useState<string>(() => (history.state?.canteiro?.mapa as string | undefined) ?? MAPA_PRINCIPAL)
  const [mapas, setMapas] = useState<MapaDaLista[]>([{ id: MAPA_PRINCIPAL, nome: NOME_DO_PRINCIPAL, figuras: 0 }])
  const [plantas, setPlantas] = useState<PlantaDeFundo[]>([])
  const [fundoId, setFundoId] = useState<string>(FUNDO_GRADE)
  const [hist, setHistDaTela] = useState<Historico>(() => novoHistorico())
  // o histórico também fica numa referência, atualizada na hora: dois toques seguidos no mesmo botão
  // (girar, girar) partem sempre do passo anterior, mesmo antes de a tela redesenhar
  const histAtual = useRef(hist)
  const setHist = (h: Historico) => {
    histAtual.current = h
    setHistDaTela(h)
  }
  /** "<folha>|<mapa>" do mapa já lido (antes disso nada é desenhado nem gravado) */
  const [lida, setLida] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<readonly ItemCanteiro[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  /** figura da paleta esperando o toque na folha */
  const [armada, setArmada] = useState<string | null>(null)
  /** caminho ou área sendo desenhado, ponto a ponto */
  const [traco, setTraco] = useState<{ tipo: TipoTracado; pontos: Ponto[] } | null>(null)
  const [corDoTraco, setCorDoTraco] = useState<string>(CORES[0].id)
  const [vista, setVista] = useState<Vista | null>(null)
  const [area, setArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [ajuda, setAjuda] = useState(false)
  const [painelDeMapas, setPainelDeMapas] = useState(false)
  const [nomeDoMapaDigitado, setNomeDoMapaDigitado] = useState('')
  const [confirmarApagar, setConfirmarApagar] = useState(false)
  const [aviso, setAviso] = useState('')
  const [exportando, setExportando] = useState<'png' | 'pdf' | null>(null)

  const caixa = useRef<HTMLDivElement>(null)
  const palco = useRef<SVGSVGElement>(null)
  const gesto = useRef<Gesto | null>(null)
  const ponteiros = useRef(new Map<number, { x: number; y: number }>())
  const gravacao = useRef<Promise<void>>(Promise.resolve())

  // ---------------- folhas (canteiro geral + pavimentos da obra) ----------------
  useEffect(() => {
    let vivo = true
    sincronizador
      .linhas('pavimentos', obra.id)
      .then((linhas) => {
        if (!vivo) return
        const pavs = linhas
          .map((l) => ({ id: l.id, nome: String(l.nome ?? ''), ordem: Number(l.ordem ?? 0) }))
          .sort((a, b) => a.ordem - b.ordem || ordem.compare(a.nome, b.nome))
        setFolhas([{ id: FOLHA_GERAL, nome: 'Canteiro geral' }, ...pavs.map(({ id, nome }) => ({ id, nome }))])
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [obra.id, estado.versaoDados])

  const folhaAtual = folhas.find((f) => f.id === folhaId)
  const nomeDaFolha = folhaAtual?.nome ?? 'Canteiro geral'
  const mapaAtual = mapas.find((m) => m.id === mapaId)
  const nomeDoMapa = mapaAtual?.nome ?? NOME_DO_PRINCIPAL

  // ---------------- mapa e plantas da folha escolhida ----------------
  const chaveLida = `${folhaId}|${mapaId}`
  useEffect(() => {
    let vivo = true
    setLida(null)
    setSel(null)
    setArmada(null)
    setTraco(null)
    setRascunho(null)
    setConfirmarApagar(false)
    gesto.current = null
    const pav = folhaId === FOLHA_GERAL ? null : { id: folhaId, nome: nomeDaFolha }
    Promise.all([
      lerMapa(obra.id, folhaId, mapaId),
      pav ? fontePlantas(obra.id, pav).catch(() => [] as PlantaDeFundo[]) : Promise.resolve([] as PlantaDeFundo[]),
      mapasDaFolha(obra.id, folhaId),
    ])
      .then(([mapa, pls, lista]) => {
        if (!vivo) return
        setPlantas(pls)
        setMapas(lista)
        setHist(novoHistorico(mapa.itens))
        // fundo ainda não escolhido neste mapa: sugere a primeira planta do pavimento
        setFundoId(mapa.fundo ?? pls[0]?.id ?? FUNDO_GRADE)
        setLida(`${folhaId}|${mapaId}`)
      })
      .catch(() => {
        if (!vivo) return
        setPlantas([])
        setHist(novoHistorico())
        setFundoId(FUNDO_GRADE)
        setLida(`${folhaId}|${mapaId}`)
        setAviso('Não consegui ler o mapa guardado neste aparelho.')
      })
    return () => {
      vivo = false
    }
    // nomeDaFolha fica de fora: o nome chegar depois não pode reler o mapa por cima do que foi feito
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id, folhaId, mapaId, fontePlantas])

  const pronta = lida === chaveLida
  const planta = plantas.find((p) => p.id === fundoId)
  const folha: Folha = useMemo(() => (planta ? folhaDe(planta.largura, planta.altura) : { largura: LARGURA, altura: ALTURA_EM_BRANCO }), [planta])
  const itens = rascunho ?? hist.atual
  const selecionado = sel ? itens.find((i) => i.id === sel) : undefined

  // ---------------- gravar no aparelho ----------------
  const gravar = useCallback(
    (lista: readonly ItemCanteiro[], fundo: string) => {
      gravacao.current = gravacao.current
        .then(() => guardarMapa(obra.id, folhaId, mapaId, { fundo, itens: lista }))
        .catch(() => setAviso('Não consegui guardar neste aparelho. Confira o espaço livre.'))
    },
    [obra.id, folhaId, mapaId],
  )

  /** Um passo: entra no "desfazer" e é guardado na hora. */
  const passo = (mudar: (itens: readonly ItemCanteiro[]) => readonly ItemCanteiro[]) => {
    const antes = histAtual.current
    const novo = aplicar(antes, mudar(antes.atual))
    if (novo === antes) return
    setHist(novo)
    gravar(novo.atual, fundoId)
    setAviso('')
  }

  const voltarPasso = () => {
    const antes = histAtual.current
    const novo = desfazer(antes)
    if (novo === antes) return
    setHist(novo)
    setRascunho(null)
    if (sel && !novo.atual.some((i) => i.id === sel)) setSel(null)
    gravar(novo.atual, fundoId)
  }

  const lembrar = (folhaNova: string, mapaNovo: string) => history.replaceState({ ...(history.state ?? {}), tela: 'canteiro', canteiro: { folha: folhaNova, mapa: mapaNovo } }, '')

  const trocarFolha = (id: string) => {
    lembrar(id, MAPA_PRINCIPAL)
    setMapaId(MAPA_PRINCIPAL)
    setFolhaId(id)
    setPainelDeMapas(false)
  }

  const trocarMapa = (id: string) => {
    lembrar(folhaId, id)
    setMapaId(id)
  }

  const trocarFundo = (id: string) => {
    setFundoId(id)
    gravar(histAtual.current.atual, id)
  }

  // ---------------- mapas da folha (fases) ----------------
  const relerMapas = () => mapasDaFolha(obra.id, folhaId).then(setMapas)

  /** Nome livre para um mapa novo: "Mapa 2", "Mapa 3"... */
  const proximoNome = () => {
    const usados = new Set(mapas.map((m) => m.nome))
    let k = mapas.length + 1
    while (usados.has(`Mapa ${k}`)) k++
    return `Mapa ${k}`
  }

  /** Cria um mapa na mesma folha: vazio ou com as figuras do mapa atual (para a fase seguinte da obra). */
  const novoMapa = async (comCopia: boolean) => {
    const id = crypto.randomUUID()
    const nome = comCopia ? `${nomeDoMapa} (cópia)`.slice(0, NOME_DE_MAPA_MAX) : proximoNome()
    try {
      await gravacao.current
      await guardarMapa(obra.id, folhaId, id, { nome, fundo: fundoId, itens: comCopia ? histAtual.current.atual : [] })
      await relerMapas()
      setNomeDoMapaDigitado(nome)
      trocarMapa(id)
    } catch {
      setAviso('Não consegui guardar neste aparelho. Confira o espaço livre.')
    }
  }

  const salvarNomeDoMapa = async () => {
    try {
      await gravacao.current
      // garante que o mapa existe (o principal nunca usado ainda não tem registro)
      await guardarMapa(obra.id, folhaId, mapaId, { fundo: fundoId, itens: histAtual.current.atual })
      await renomearMapa(obra.id, folhaId, mapaId, nomeDoMapaDigitado)
      await relerMapas()
    } catch {
      setAviso('Não consegui guardar neste aparelho. Confira o espaço livre.')
    }
  }

  const apagarEsteMapa = async () => {
    try {
      await gravacao.current
      await apagarMapa(obra.id, folhaId, mapaId)
      setConfirmarApagar(false)
      if (mapaId === MAPA_PRINCIPAL) {
        // o principal não some: fica vazio
        setHist(novoHistorico())
        setSel(null)
        setNomeDoMapaDigitado(NOME_DO_PRINCIPAL)
        await relerMapas()
      } else {
        setNomeDoMapaDigitado(mapas.find((m) => m.id === MAPA_PRINCIPAL)?.nome ?? NOME_DO_PRINCIPAL)
        trocarMapa(MAPA_PRINCIPAL)
      }
    } catch {
      setAviso('Não consegui apagar neste aparelho.')
    }
  }

  const abrirPainelDeMapas = () => {
    setNomeDoMapaDigitado(nomeDoMapa)
    setConfirmarApagar(false)
    setPainelDeMapas(!painelDeMapas)
  }

  // ---------------- tamanho da área do desenho e vista ----------------
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => setArea({ w: el.clientWidth, h: el.clientHeight })
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const temArea = area.w > 0 && area.h > 0
  // a folha inteira na tela ao abrir e ao trocar de folha, de mapa ou de fundo (girar o aparelho mantém o zoom)
  useEffect(() => {
    if (temArea) setVista(ajustarVista(folha, area.w, area.h))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temArea, folha.altura, folhaId, mapaId, fundoId])

  const limitesDeZoom = (): [number, number] => {
    const k = ajustarVista(folha, area.w || 1, area.h || 1).k
    return [k * 0.5, k * 14]
  }

  const zoom = (fator: number, px = area.w / 2, py = area.h / 2) => {
    const [min, max] = limitesDeZoom()
    setVista((v) => (v ? zoomNoPonto(v, fator, px, py, min, max) : v))
  }

  /** + e − da tela: com uma figura escolhida, o zoom é em volta dela (senão ela saía da tela). */
  const zoomDoBotao = (fator: number) => {
    if (!vista || !selecionado) return zoom(fator)
    const px = (selecionado.x - vista.x) * vista.k
    const py = (selecionado.y - vista.y) * vista.k
    // figura fora da tela: o zoom a traz para o meio
    if (px < 0 || py < 0 || px > area.w || py > area.h) {
      const [min, max] = limitesDeZoom()
      const k = Math.min(max, Math.max(min, vista.k * fator))
      return setVista({ k, x: selecionado.x - area.w / 2 / k, y: selecionado.y - area.h / 2 / k })
    }
    zoom(fator, px, py)
  }

  // ---------------- traçado (caminho e área) ----------------
  const armar = (id: string) => {
    setSel(null)
    setAviso('')
    if (id in TRACADOS) {
      setArmada(null)
      setTraco(traco?.tipo === id ? null : { tipo: id as TipoTracado, pontos: [] })
    } else {
      setTraco(null)
      setArmada(armada === id ? null : id)
    }
  }

  const concluirTraco = () => {
    if (!traco || traco.pontos.length < TRACADOS[traco.tipo].minimo) return
    const id = crypto.randomUUID()
    passo((l) => tracar(l, traco.tipo, traco.pontos, folha, id, corDoTraco))
    setTraco(null)
    setSel(id)
  }

  /** Cor seguinte da lista (no traçado escolhido ou no que está sendo desenhado). */
  const proximaCor = (atual: string | undefined) => CORES[(CORES.findIndex((c) => c.id === atual) + 1) % CORES.length].id

  // ---------------- toque, caneta e mouse ----------------
  const naCaixa = (e: PointerEvent | WheelEvent): [number, number] => {
    const r = palco.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  const alcas = (i: ItemCanteiro, k: number) => ({
    girar: doItem(i, 0, -(alturaDoItem(i) / 2 + HASTE_PX / k)),
    tamanho: doItem(i, i.tamanho / 2, alturaDoItem(i) / 2),
  })

  const aoApertar = (e: PointerEvent) => {
    if (!vista || !pronta || (e.pointerType === 'mouse' && e.button !== 0)) return
    // botão lateral da caneta não desenha
    if (e.pointerType === 'pen' && e.button !== 0) return
    palco.current?.setPointerCapture(e.pointerId)
    const [px, py] = naCaixa(e)
    ponteiros.current.set(e.pointerId, { x: px, y: py })

    if (ponteiros.current.size === 2) {
      // dois dedos: pinça (o que estava no meio, sem ter virado passo, é descartado)
      const [a, b] = [...ponteiros.current.values()]
      setRascunho(null)
      gesto.current = { tipo: 'pinca', d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vista0: vista }
      return
    }
    if (ponteiros.current.size > 2) return

    const [fx, fy] = telaParaFolha(vista, px, py)
    if (!armada && !traco) {
      if (selecionado) {
        const distancia = (p: readonly [number, number]) => Math.hypot(p[0] - fx, p[1] - fy)
        const perto = (p: readonly [number, number]) => distancia(p) <= ALCA_PX / vista.k
        const pontos = selecionado.pontos
        if (pontos) {
          // traçado: cada ponto é uma alça (a mais perto do dedo)
          let melhor = -1
          pontos.forEach((p, n) => {
            if (perto(p) && (melhor < 0 || distancia(p) < distancia(pontos[melhor]))) melhor = n
          })
          if (melhor >= 0) {
            gesto.current = { tipo: 'ponto', id: selecionado.id, indice: melhor }
            return
          }
        } else {
          const a = alcas(selecionado, vista.k)
          if (perto(a.girar)) {
            gesto.current = { tipo: 'girar', id: selecionado.id }
            return
          }
          if (perto(a.tamanho)) {
            gesto.current = { tipo: 'tamanho', id: selecionado.id }
            return
          }
        }
      }
      const item = itemNoPonto(itens, fx, fy, FOLGA_PX / vista.k)
      if (item) {
        setSel(item.id)
        gesto.current = { tipo: 'mover', id: item.id, dx: item.x - fx, dy: item.y - fy, x0: px, y0: py, andou: false }
        return
      }
    }
    gesto.current = { tipo: 'fundo', x0: px, y0: py, ux: px, uy: py, andou: false }
  }

  const aoMover = (e: PointerEvent) => {
    const g = gesto.current
    if (!g || !vista || !ponteiros.current.has(e.pointerId)) return
    const [px, py] = naCaixa(e)
    ponteiros.current.set(e.pointerId, { x: px, y: py })
    const [fx, fy] = telaParaFolha(vista, px, py)
    switch (g.tipo) {
      case 'pinca': {
        if (ponteiros.current.size < 2) return
        const [a, b] = [...ponteiros.current.values()]
        const cx = (a.x + b.x) / 2
        const cy = (a.y + b.y) / 2
        const [min, max] = limitesDeZoom()
        setVista(zoomNoPonto(arrastarVista(g.vista0, cx - g.cx, cy - g.cy), Math.hypot(a.x - b.x, a.y - b.y) / g.d0, cx, cy, min, max))
        return
      }
      case 'mover':
        if (!g.andou && Math.hypot(px - g.x0, py - g.y0) < 5) return
        g.andou = true
        setRascunho(mover(hist.atual, g.id, fx + g.dx, fy + g.dy, folha))
        return
      case 'girar': {
        const i = hist.atual.find((x) => x.id === g.id)
        if (i) setRascunho(girarPara(hist.atual, g.id, giroParaOPonto(i, fx, fy)))
        return
      }
      case 'tamanho': {
        const i = hist.atual.find((x) => x.id === g.id)
        if (i) setRascunho(redimensionar(hist.atual, g.id, tamanhoParaOPonto(i, fx, fy)))
        return
      }
      case 'ponto':
        setRascunho(moverPonto(hist.atual, g.id, g.indice, fx, fy, folha))
        return
      case 'fundo':
        if (!g.andou && Math.hypot(px - g.x0, py - g.y0) < 6) return
        g.andou = true
        setVista(arrastarVista(vista, px - g.ux, py - g.uy))
        g.ux = px
        g.uy = py
        return
    }
  }

  const aoSoltar = (e: PointerEvent) => {
    if (!ponteiros.current.has(e.pointerId)) return
    ponteiros.current.delete(e.pointerId)
    const g = gesto.current
    if (!g) return
    if (g.tipo === 'pinca') {
      // só termina quando os dois dedos saem (o dedo que sobra não arrasta nada)
      if (ponteiros.current.size === 0) gesto.current = null
      return
    }
    gesto.current = null
    if (g.tipo === 'fundo') {
      if (g.andou || !vista) return
      const [fx, fy] = telaParaFolha(vista, g.x0, g.y0)
      const fora = fx < 0 || fy < 0 || fx > folha.largura || fy > folha.altura
      if (traco) {
        // cada toque na folha é mais um ponto do caminho ou da área
        if (!fora) setTraco({ tipo: traco.tipo, pontos: [...traco.pontos, [Math.round(fx), Math.round(fy)]] })
      } else if (armada) {
        // toque fora da folha não coloca nada
        if (fora) return
        const id = crypto.randomUUID()
        passo((l) => posicionar(l, armada, fx, fy, folha, id))
        setSel(id)
        setArmada(null)
      } else setSel(null)
      return
    }
    if (rascunho) {
      passo(() => rascunho)
      setRascunho(null)
    }
  }

  const aoCancelar = (e: PointerEvent) => {
    ponteiros.current.delete(e.pointerId)
    if (ponteiros.current.size === 0) gesto.current = null
    setRascunho(null)
  }

  const aoRolar = (e: WheelEvent) => {
    e.preventDefault()
    const [px, py] = naCaixa(e)
    zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, px, py)
  }

  const duplicarEscolhido = () => {
    if (!sel) return
    const id = crypto.randomUUID()
    passo((l) => duplicar(l, sel, id, folha))
    setSel(id)
  }

  // teclado do PC: Delete apaga, Ctrl+Z desfaz, Ctrl+D duplica, Enter conclui o traçado, Esc solta
  const teclas = useRef<(e: KeyboardEvent) => void>(() => {})
  teclas.current = (e) => {
    const alvo = e.target as HTMLElement | null
    if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'SELECT' || alvo.tagName === 'TEXTAREA')) return
    const comCtrl = e.ctrlKey || e.metaKey
    if (comCtrl && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      voltarPasso()
    } else if (comCtrl && e.key.toLowerCase() === 'd' && sel) {
      e.preventDefault()
      duplicarEscolhido()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      e.preventDefault()
      passo((l) => apagar(l, sel))
      setSel(null)
    } else if (e.key === 'Enter' && traco) {
      e.preventDefault()
      concluirTraco()
    } else if (e.key === 'Escape') {
      setArmada(null)
      setTraco(null)
      setAjuda(false)
    }
  }
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => teclas.current(e)
    window.addEventListener('keydown', ouvir)
    return () => window.removeEventListener('keydown', ouvir)
  }, [])

  // ---------------- exportar ----------------
  const exportar = async (formato: 'png' | 'pdf') => {
    if (exportando) return
    setExportando(formato)
    setAviso('')
    try {
      const hoje = new Date()
      // o nome do mapa só entra quando a folha tem mais de um ou ele foi renomeado
      const comMapa = mapas.length > 1 || nomeDoMapa !== NOME_DO_PRINCIPAL
      const pedido: PedidoDeImagem = {
        folha,
        itens: hist.atual,
        planta,
        titulo: `Mapa do canteiro · ${obra.nome}`,
        subtitulo: [nomeDaFolha, comMapa ? nomeDoMapa : '', hoje.toLocaleDateString('pt-BR')].filter(Boolean).join(' · '),
      }
      const blob = formato === 'pdf' ? await pdfDoMapa(pedido) : await pngDoMapa(pedido)
      const nome = nomeDoArquivo(obra.codigo, comMapa ? `${nomeDaFolha} ${nomeDoMapa}` : nomeDaFolha, hoje, formato)
      baixarBlob(nome, blob)
      setSel(null)
      setAviso(`Arquivo salvo: ${nome}`)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não consegui montar o arquivo.')
    } finally {
      setExportando(null)
    }
  }

  // ---------------- desenho ----------------
  const pedacos = useMemo(() => (planta ? pedacosDoFundo(planta, Math.max(1600, area.w * 2)) : []), [planta, area.w])
  const fundoSvg = useMemo(() => (planta ? (planta.fundo ? '' : svgDasPecas(planta)) : svgDaGrade(folha)), [planta, folha])
  const k = vista?.k ?? 1
  // nome com pelo menos 11 px na tela (arredondado em passos, para não redesenhar a cada milímetro de pinça)
  const letraMin = Math.round((11 / k) * 2) / 2
  const itensSvg = useMemo(() => svgDosItens(itens, letraMin), [itens, letraMin])
  const alca = selecionado && !selecionado.pontos && vista ? alcas(selecionado, k) : null
  const figuraArmada = armada ? figuraPorId(armada) : undefined
  // prévia do traçado: com dois pontos ou mais já aparece como vai ficar
  const tracoSvg = useMemo(() => {
    if (!traco || traco.pontos.length < 2) return ''
    return svgDoItem({ id: 'previa', tipo: traco.tipo, x: 0, y: 0, giro: 0, tamanho: 0, nome: '', pontos: traco.pontos, cor: corDoTraco })
  }, [traco, corDoTraco])
  const faltam = traco ? Math.max(0, TRACADOS[traco.tipo].minimo - traco.pontos.length) : 0
  const selTracado = !!selecionado && ehTracado(selecionado)

  const botao = (rotulo: string, testid: string, d: string, acao: () => void) => (
    <button type="button" aria-label={rotulo} title={rotulo} data-testid={testid} onClick={acao}>
      {icone(d)}
    </button>
  )

  return (
    <div class="ct-tela" data-testid="canteiro">
      <div class="ct-topo">
        <Cabecalho titulo="Mapa do canteiro" sub={obra.nome} aoVoltar={aoSair} paraMenu classe="ct-cab">
          <button type="button" class="ct-ajuda-botao" aria-label="Ajuda" aria-expanded={ajuda} onClick={() => setAjuda(!ajuda)}>
            ?
          </button>
        </Cabecalho>
        {ajuda && (
          <p class="ct-ajuda" data-testid="canteiro-ajuda">
            Toque numa figura e depois na folha. Arraste para mover. Na figura escolhida, a bolinha de cima gira e o quadrado do canto muda o tamanho. Caminho e Área: toque nos pontos e depois em Concluir. Dois dedos: zoom. O mapa
            fica só neste aparelho.
          </p>
        )}
        <div class="ct-barra">
          <select aria-label="Folha" data-testid="canteiro-folha" value={folhaId} onChange={(e) => trocarFolha((e.target as HTMLSelectElement).value)}>
            {folhas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
            {!folhaAtual && <option value={folhaId}>{nomeDaFolha}</option>}
          </select>
          <select aria-label="Mapa" data-testid="canteiro-mapa" value={mapaId} onChange={(e) => trocarMapa((e.target as HTMLSelectElement).value)}>
            {mapas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
            {!mapaAtual && <option value={mapaId}>{nomeDoMapa}</option>}
          </select>
          {plantas.length > 0 && (
            <select aria-label="Fundo" data-testid="canteiro-fundo" value={planta ? fundoId : FUNDO_GRADE} onChange={(e) => trocarFundo((e.target as HTMLSelectElement).value)}>
              <option value={FUNDO_GRADE}>Folha em branco</option>
              {plantas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </select>
          )}
        </div>
        <div class="ct-barra ct-barra-botoes">
          <button type="button" data-testid="canteiro-desfazer" disabled={!podeDesfazer(hist)} onClick={voltarPasso}>
            Desfazer
          </button>
          <button type="button" data-testid="canteiro-mapas" aria-expanded={painelDeMapas} disabled={!pronta} onClick={abrirPainelDeMapas}>
            Mapas
          </button>
          <span class="ct-folga" />
          <button type="button" class="principal" data-testid="canteiro-exportar" disabled={!pronta || !!exportando} onClick={() => exportar('png')}>
            {exportando === 'png' ? 'Montando…' : 'PNG'}
          </button>
          <button type="button" class="principal" data-testid="canteiro-pdf" disabled={!pronta || !!exportando} onClick={() => exportar('pdf')}>
            {exportando === 'pdf' ? 'Montando…' : 'PDF A4'}
          </button>
        </div>
        {painelDeMapas && pronta && (
          <div class="ct-mapas" data-testid="canteiro-painel-mapas">
            <div class="ct-mapas-linha">
              <input
                class="ct-nome"
                aria-label="Nome do mapa"
                data-testid="canteiro-nome-mapa"
                maxLength={NOME_DE_MAPA_MAX}
                value={nomeDoMapaDigitado}
                onInput={(e) => setNomeDoMapaDigitado((e.target as HTMLInputElement).value)}
              />
              <button type="button" data-testid="canteiro-salvar-nome-mapa" disabled={!nomeDoMapaDigitado.trim() || nomeDoMapaDigitado.trim() === nomeDoMapa} onClick={salvarNomeDoMapa}>
                Salvar nome
              </button>
            </div>
            <div class="ct-mapas-linha">
              <button type="button" data-testid="canteiro-novo-mapa" onClick={() => novoMapa(false)}>
                Novo mapa
              </button>
              <button type="button" data-testid="canteiro-copiar-mapa" onClick={() => novoMapa(true)}>
                Copiar este mapa
              </button>
              {confirmarApagar ? (
                <button type="button" class="ct-apagar" data-testid="canteiro-confirmar-apagar-mapa" onClick={apagarEsteMapa}>
                  Confirmar: apagar
                </button>
              ) : (
                <button type="button" class="ct-apagar" data-testid="canteiro-apagar-mapa" onClick={() => setConfirmarApagar(true)}>
                  Apagar este mapa
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div class={`ct-palco${armada || traco ? ' ct-armada' : ''}`} ref={caixa}>
        {vista && pronta && (
          <svg
            ref={palco}
            class="ct-desenho"
            data-testid="canteiro-palco"
            data-vx={vista.x}
            data-vy={vista.y}
            data-vk={vista.k}
            data-figuras={itens.length}
            width={area.w}
            height={area.h}
            viewBox={`${vista.x} ${vista.y} ${area.w / k} ${area.h / k}`}
            onPointerDown={aoApertar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={aoCancelar}
            onWheel={aoRolar}
            onContextMenu={(e) => e.preventDefault()}
          >
            <defs>
              <clipPath id="ct-corte">
                <rect x="0" y="0" width={folha.largura} height={folha.altura} />
              </clipPath>
            </defs>
            <rect x="0" y="0" width={folha.largura} height={folha.altura} fill="#ffffff" stroke="#8a8a8a" stroke-width={1 / k} />
            <g clip-path="url(#ct-corte)">
              {pedacos.map((q) => (
                <image key={`${q.x}|${q.y}`} href={q.href} x={q.x} y={q.y} width={q.lado} height={q.lado} preserveAspectRatio="none" />
              ))}
              <g dangerouslySetInnerHTML={{ __html: fundoSvg }} />
            </g>
            <g data-testid="canteiro-itens" dangerouslySetInnerHTML={{ __html: itensSvg }} />
            {traco && (
              <g data-testid="canteiro-previa" pointer-events="none">
                <g dangerouslySetInnerHTML={{ __html: tracoSvg }} />
                {traco.pontos.map(([x, y], n) => (
                  <circle key={n} cx={x} cy={y} r={6 / k} fill="#ffffff" stroke={hexDaCor(corDoTraco)} stroke-width={2.5 / k} />
                ))}
              </g>
            )}
            {selecionado?.pontos && (
              <g data-testid="canteiro-selecao" pointer-events="none">
                {selecionado.pontos.map(([x, y], n) => (
                  <circle key={n} data-testid={`canteiro-ponto-${n}`} cx={x} cy={y} r={9 / k} fill="#ffffff" stroke={COR_SELECAO} stroke-width={2.5 / k} />
                ))}
              </g>
            )}
            {selecionado && alca && (
              <g data-testid="canteiro-selecao" pointer-events="none">
                <g transform={`translate(${selecionado.x} ${selecionado.y}) rotate(${selecionado.giro})`}>
                  <rect
                    x={-selecionado.tamanho / 2}
                    y={-alturaDoItem(selecionado) / 2}
                    width={selecionado.tamanho}
                    height={alturaDoItem(selecionado)}
                    fill="none"
                    stroke={COR_SELECAO}
                    stroke-width={1.5 / k}
                    stroke-dasharray={`${5 / k} ${4 / k}`}
                  />
                  <line x1="0" y1={-alturaDoItem(selecionado) / 2} x2="0" y2={-(alturaDoItem(selecionado) / 2 + HASTE_PX / k)} stroke={COR_SELECAO} stroke-width={1.5 / k} />
                </g>
                <circle data-testid="canteiro-alca-girar" cx={alca.girar[0]} cy={alca.girar[1]} r={10 / k} fill="#ffffff" stroke={COR_SELECAO} stroke-width={2.5 / k} />
                <rect
                  data-testid="canteiro-alca-tamanho"
                  x={alca.tamanho[0] - 9 / k}
                  y={alca.tamanho[1] - 9 / k}
                  width={18 / k}
                  height={18 / k}
                  fill={COR_SELECAO}
                  stroke="#ffffff"
                  stroke-width={2 / k}
                />
              </g>
            )}
          </svg>
        )}
        {!pronta && <p class="ct-carregando">Carregando…</p>}
        <div class="ct-zoom">
          <button type="button" aria-label="Aproximar" data-testid="canteiro-mais-zoom" onClick={() => zoomDoBotao(1.4)}>
            +
          </button>
          <button type="button" aria-label="Afastar" onClick={() => zoomDoBotao(1 / 1.4)}>
            −
          </button>
          <button type="button" aria-label="Ver a folha inteira" data-testid="canteiro-inteira" onClick={() => temArea && setVista(ajustarVista(folha, area.w, area.h))}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div class="ct-pe">
        <div class="ct-linha" data-testid="canteiro-linha">
          {traco ? (
            <>
              <span class="ct-dica ct-linha-nome" role="status">
                {TRACADOS[traco.tipo].nome}: {faltam > 0 ? `toque na folha (${faltam === 1 ? 'falta 1 ponto' : `faltam ${faltam} pontos`})` : `${traco.pontos.length} pontos. Toque em mais ou conclua.`}
              </span>
              <div class="ct-acoes">
                <button type="button" class="ct-cor" aria-label={`Cor: ${CORES.find((c) => c.id === corDoTraco)?.nome}`} data-testid="canteiro-cor" onClick={() => setCorDoTraco(proximaCor(corDoTraco))}>
                  <span style={{ background: hexDaCor(corDoTraco) }} />
                </button>
                <button type="button" class="ct-texto" data-testid="canteiro-voltar-ponto" disabled={traco.pontos.length === 0} onClick={() => setTraco({ tipo: traco.tipo, pontos: traco.pontos.slice(0, -1) })}>
                  Voltar ponto
                </button>
                <button type="button" class="ct-texto principal" data-testid="canteiro-concluir" disabled={faltam > 0} onClick={concluirTraco}>
                  Concluir
                </button>
                <button type="button" class="ct-texto" data-testid="canteiro-cancelar" onClick={() => setTraco(null)}>
                  Cancelar
                </button>
              </div>
            </>
          ) : selecionado ? (
            <>
              <div class="ct-linha-nome">
                <input
                  key={selecionado.id}
                  class="ct-nome"
                  aria-label="Nome da figura"
                  data-testid="canteiro-nome"
                  maxLength={NOME_MAX}
                  value={selecionado.nome}
                  enterkeyhint="done"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  onChange={(e) => passo((l) => renomear(l, selecionado.id, (e.target as HTMLInputElement).value))}
                />
                <button
                  type="button"
                  class="ct-texto ct-apagar"
                  data-testid="canteiro-apagar"
                  onClick={() => {
                    passo((l) => apagar(l, selecionado.id))
                    setSel(null)
                  }}
                >
                  Apagar
                </button>
              </div>
              <div class="ct-acoes">
                {selTracado ? (
                  <button
                    type="button"
                    class="ct-cor"
                    aria-label={`Cor: ${CORES.find((c) => c.id === selecionado.cor)?.nome}`}
                    data-testid="canteiro-cor"
                    onClick={() => passo((l) => colorir(l, selecionado.id, proximaCor(selecionado.cor)))}
                  >
                    <span style={{ background: hexDaCor(selecionado.cor) }} />
                  </button>
                ) : (
                  <>
                    {botao('Girar para a esquerda', 'canteiro-girar-esq', ICONES.girarEsq, () => passo((l) => girar(l, selecionado.id, -15)))}
                    {botao('Girar para a direita', 'canteiro-girar-dir', ICONES.girarDir, () => passo((l) => girar(l, selecionado.id, 15)))}
                    {botao('Diminuir', 'canteiro-menor', ICONES.menor, () => passo((l) => escalar(l, selecionado.id, 1 / 1.2)))}
                    {botao('Aumentar', 'canteiro-maior', ICONES.maior, () => passo((l) => escalar(l, selecionado.id, 1.2)))}
                  </>
                )}
                {botao('Duplicar', 'canteiro-duplicar', ICONES.duplicar, duplicarEscolhido)}
                {botao('Trazer para a frente', 'canteiro-frente', ICONES.frente, () => passo((l) => paraFrente(l, selecionado.id)))}
                {botao('Mandar para trás', 'canteiro-tras', ICONES.tras, () => passo((l) => paraTras(l, selecionado.id)))}
              </div>
            </>
          ) : (
            <span class="ct-dica" role="status">
              {aviso || (figuraArmada ? `Toque na folha: ${figuraArmada.nome}` : `${itens.length} ${itens.length === 1 ? 'figura' : 'figuras'}`)}
            </span>
          )}
        </div>
        <div class="ct-paleta" data-testid="canteiro-paleta" role="toolbar" aria-label="Figuras">
          {(Object.keys(TRACADOS) as TipoTracado[]).map((t) => (
            <button type="button" key={t} class="ct-fig" data-testid={`fig-${t}`} aria-pressed={traco?.tipo === t} title={TRACADOS[t].nome} onClick={() => armar(t)}>
              <span class="ct-fig-desenho" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONE_DO_TRACADO[t] }} />
              <span class="ct-fig-nome">{TRACADOS[t].nome}</span>
            </button>
          ))}
          {FIGURAS.map((f) => (
            <button type="button" key={f.id} class="ct-fig" data-testid={`fig-${f.id}`} aria-pressed={armada === f.id} title={f.nome} onClick={() => armar(f.id)}>
              <span class="ct-fig-desenho" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svgDaFigura(f) }} />
              <span class="ct-fig-nome">{f.nome}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
