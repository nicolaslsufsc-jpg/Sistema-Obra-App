// Mapa do pavimento: onde foi cada caminhão. Com um caminhão escolhido, a caneta desenha a
// área que ele encheu e o dedo (toque curto numa peça) inclui ou tira a peça. São duas canetas
// (07/11/2026): a dos pilares e a das vigas e da laje; cada área vale só nas peças da sua caneta,
// e a área de vigas e laje põe a laje do trecho no caminhão.
// Sem caminhão escolhido, o mapa das concretagens: cada concretagem com uma cor, nas peças e nas
// áreas desenhadas (é o "mapa de concretagem" do pavimento). Ou, na outra vista, a cor da situação
// dos CPs. O toque numa peça mostra quais caminhões foram nela.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { dataLocal, GRAVIDADE, piorSituacao, type SituacaoCP } from '../cps'
import type { ComponentChildren } from 'preact'
import {
  cancelar,
  carregar,
  concretagemDe,
  garantirLaje,
  idadesDoCaminhao,
  piorDoCaminhao,
  podeCriarLaje,
  podeRegistrar,
  registrar,
  registrarPecas,
  type AlvoDaArea,
  type Area,
  type Caminhao,
} from '../dados'
import { areaDe, caixaDe, prepararArea, simplificarParaGravar, type Ponto } from '../geometria'
import { instalarCaneta } from '../caneta'
import { ehLajeDeTrecho, lajeDoTrecho, nomeDaLaje } from '../lajes'
import { mudancaDaLajeDoDesenho, mudancasDoDesenhoPorPlanta, pecaNoPonto, prepararPecas } from '../pecas'
import { carregarPlantas, idDaRef, revisaoDaRef, type PlantaPavimento } from '../planta'
import { comoEntrou } from '../relatorio'
import type { Contexto } from './ModuloConcreto'
import { corDoCaminhao, dataBR, numBR, plural, Selo } from './comum'
import { nomeDaConcretagem } from '../exemplo'

const COR_SITUACAO: Record<'ruim' | 'info' | 'neutro' | 'bom', string> = {
  ruim: '#c62828',
  info: '#ef6c00',
  neutro: '#1565c0',
  bom: '#2e7d32',
}
function grupoDa(s: SituacaoCP): keyof typeof COR_SITUACAO {
  if (s === 'atrasado' || s === 'abaixo_fck') return 'ruim'
  if (s === 'aguardando' || s === 'rompe_hoje') return 'info'
  if (s === 'conforme') return 'bom'
  return 'neutro'
}

/** [x, y] da planta (y para baixo) → LatLng do Leaflet (CRS.Simple, y para cima). */
const ll = ([x, y]: Ponto): L.LatLngTuple => [-y, x]

/** Cor de cada concretagem no mapa (pela posição na lista do pavimento: a mais recente é a primeira). */
const corDaConcretagem = (i: number) => corDoCaminhao(i + 1)

const ROTULO_CANETA: Record<AlvoDaArea, string> = { pilares: 'pilares', vigas_laje: 'vigas e laje' }

function lerCaneta(chave: string): AlvoDaArea {
  try {
    return localStorage.getItem(chave) === 'vigas_laje' ? 'vigas_laje' : 'pilares'
  } catch {
    return 'pilares'
  }
}

interface Props {
  ctx: Contexto
  pavimentoId: string
  concretagemRaiz?: string
  caminhaoRaiz?: string
  plantaId?: string
  aviso: string
  /** botões do módulo no topo (ex.: Reportar problema), para não cobrir a planta */
  acoes?: ComponentChildren
}

export function TelaMapa({ ctx, pavimentoId, concretagemRaiz, caminhaoRaiz, plantaId, aviso, acoes }: Props) {
  const { dados, obra, usuario, ir, trocar, voltar, recarregar } = ctx
  const pav = dados.pavimentos.find((p) => p.id === pavimentoId)
  const pecasCad = dados.pecasDoPavimento.get(pavimentoId) ?? []
  // a laje de trecho não tem contorno: não entra na planta (de teste) como peça desenhada
  const pecasDaPlanta = pecasCad.filter((p) => !ehLajeDeTrecho(p))
  // as plantas só mudam se mudarem as peças do pavimento
  const chavePecas = pecasDaPlanta.map((p) => p.id + p.nome).join()
  const [plantas, setPlantas] = useState<PlantaPavimento[] | null>(null)
  useEffect(() => {
    let vivo = true
    if (!pav) {
      setPlantas([])
      return
    }
    carregarPlantas({ obraId: obra.id, obraCodigo: obra.codigo, pavimento: pav, pecas: pecasDaPlanta }).then((l) => {
      if (vivo) setPlantas(l)
    })
    return () => {
      vivo = false
    }
  }, [obra.id, obra.codigo, pav?.id, chavePecas])
  const [plantaSel, setPlantaSel] = useState<string | null>(plantaId ?? null)
  const planta = plantas?.find((p) => p.id === plantaSel) ?? plantas?.[0] ?? null
  const concs = dados.concretagens.filter((c) => c.pavimento_id === pavimentoId)
  // sem concretagem pedida, abre no mapa de todas as concretagens do pavimento
  const [concSel, setConcSel] = useState<string>(concretagemRaiz ?? '')
  const [camSel, setCamSel] = useState<string | null>(caminhaoRaiz ?? null)
  // a caneta escolhida fica lembrada por obra (é só conveniência: sem localStorage, começa nos pilares)
  const chaveCaneta = `concreto:caneta:${obra.id}`
  const [canetaAlvo, setCanetaAlvo] = useState<AlvoDaArea>(() => lerCaneta(chaveCaneta))
  const trocarCaneta = (a: AlvoDaArea) => {
    setCanetaAlvo(a)
    try {
      localStorage.setItem(chaveCaneta, a)
    } catch {
      /* só não lembra */
    }
  }
  // sem caminhão escolhido: o mapa das concretagens (uma cor por concretagem) ou a situação dos laudos
  const [vista, setVista] = useState<'concretagens' | 'laudos'>('concretagens')
  const indiceConc = useMemo(() => new Map(concs.map((c, i) => [c.raiz, i])), [concs])
  // peças de cada planta, preparadas uma vez (cálculo das frações)
  const pecasPorPlanta = useMemo(() => new Map((plantas ?? []).map((p) => [p.id, prepararPecas(p.elementos)])), [plantas])
  /** Áreas do caminhão em cada planta (id da planta → áreas). */
  const areasPorPlanta = (camRaiz: string) => {
    const m = new Map<string, Area[]>()
    for (const a of dados.areasDe.get(camRaiz) ?? []) {
      const id = idDaRef(a.planta_ref)
      m.set(id, [...(m.get(id) ?? []), a])
    }
    return m
  }

  // caminhão escolhido: abre no trecho onde ele tem área (a mais recente), se não for o pedido
  useEffect(() => {
    if (!camSel || !plantas || plantas.length < 2) return
    const areas = [...(dados.areasDe.get(camSel) ?? [])].sort((a, b) => a.criado_em_dispositivo.localeCompare(b.criado_em_dispositivo))
    const ultima = areas.at(-1)
    if (!ultima || idDaRef(ultima.planta_ref) === planta?.id) return
    if (plantas.some((p) => p.id === idDaRef(ultima.planta_ref))) setPlantaSel(idDaRef(ultima.planta_ref))
  }, [camSel, plantas])
  const [pecaSel, setPecaSel] = useState<string | null>(null)
  const [painel, setPainel] = useState(true)
  const [msg, setMsg] = useState('')
  // PC: o mouse desenha ou move a planta (a caneta sempre desenha; o dedo sempre move)
  const [mouseDesenha, setMouseDesenha] = useState(true)
  const temMouse = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches, [])
  const pode = podeRegistrar(obra.papel)
  const podeCriar = podeCriarLaje(obra.papel)
  const hoje = dataLocal(new Date())
  // laje do trecho aberto (lajes.ts): uma peça por trecho, sem contorno, marcada no toque
  const lajeAtual = planta ? lajeDoTrecho(pecasCad, planta.trecho) : undefined
  const nomeLaje = planta ? nomeDaLaje(planta.trecho) : ''

  const caminhoesConc = concSel ? (dados.caminhoesDe.get(concSel) ?? []) : []
  const camAtual = camSel ? dados.caminhoes.find((c) => c.raiz === camSel) : undefined
  // caminhões do pavimento (todas as concretagens), para o modo "ver"
  const caminhoesPav = concs.flatMap((c) => (dados.caminhoesDe.get(c.raiz) ?? []).map((x) => ({ x, c })))

  // guarda o caminhão na URL do histórico (voltar do Android mantém a escolha)
  useEffect(() => {
    trocar({
      nome: 'mapa',
      pavimentoId,
      concretagemRaiz: concSel || undefined,
      caminhaoRaiz: camSel ?? undefined,
      plantaId: planta?.id,
    })
  }, [concSel, camSel, planta?.id])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 3500)
    return () => clearTimeout(t)
  }, [msg])

  // ------------------------------------------------------------------
  // Leaflet (montado uma vez por planta)
  // ------------------------------------------------------------------
  const caixaMapa = useRef<HTMLDivElement>(null)
  const tinta = useRef<HTMLCanvasElement>(null)
  const mapa = useRef<L.Map | null>(null)
  // zoom pedido pelos botões + e − que ainda não terminou (dois toques rápidos = dois níveis)
  const zoomPendente = useRef<number | null>(null)
  const pendenteDesde = useRef(0)
  const [noLimite, setNoLimite] = useState({ mais: false, menos: false })
  const zoomPeloBotao = (passo: number) => {
    const m = mapa.current
    if (!m) return
    const base = zoomPendente.current ?? m.getZoom()
    const alvo = Math.min(m.getMaxZoom(), Math.max(m.getMinZoom(), base + passo))
    setNoLimite({ mais: alvo >= m.getMaxZoom(), menos: alvo <= m.getMinZoom() })
    if (alvo === base) return
    // sem fim de zoom em 1 s (a caneta parou a animação, por exemplo), não espera mais
    const animando = zoomPendente.current !== null && Date.now() - pendenteDesde.current < 1000
    zoomPendente.current = alvo
    if (!animando) {
      pendenteDesde.current = Date.now()
      m.setZoom(alvo)
    }
  }
  const camadasPeca = useRef(new Map<string, L.Polygon[]>())
  const grupoAreas = useRef<L.LayerGroup | null>(null)
  // Uma camada de desenho (canvas) só, para peças e áreas: com duas, a de cima (áreas)
  // ficava com os toques e o dedo deixava de marcar peça depois da primeira área.
  const desenho = useRef<L.Canvas | null>(null)
  const grupoRotulos = useRef<L.LayerGroup | null>(null)
  // estado lido pelos ouvintes do mapa sem remontar o mapa
  const atual = useRef({ camSel, pode, mouseDesenha, cor: '#1565c0', alvo: canetaAlvo })
  atual.current = { camSel, pode, mouseDesenha, cor: camAtual ? corDoCaminhao(camAtual.sequencia) : '#1565c0', alvo: canetaAlvo }
  const aoTraco = useRef<(pts: Array<[number, number]>, comp: number) => void>(() => {})
  const aoTocarPeca = useRef<(id: string) => void>(() => {})

  useEffect(() => {
    if (!planta || !caixaMapa.current || !tinta.current) return
    const m = L.map(caixaMapa.current, {
      crs: L.CRS.Simple,
      minZoom: -5,
      maxZoom: 4,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      zoomControl: false,
      boxZoom: false,
      doubleClickZoom: false,
      keyboard: false,
      preferCanvas: true,
    })
    mapa.current = m
    // testes e bancada (npm run dev): o mapa fica acessível no elemento, para medir e tocar peças
    if (import.meta.env.DEV) Object.assign(caixaMapa.current, { __mapa: m })
    const limites = L.latLngBounds([-planta.altura, 0], [0, planta.largura])
    m.setMaxBounds(limites.pad(0.4))
    // enquadra a planta quando o mapa já tem tamanho na tela (no primeiro quadro pode ser 0)
    // Abre nas peças, não na prancha inteira: notas e detalhes em volta deixariam a estrutura
    // pequena para desenhar (dá para arrastar até eles se precisar).
    const pontos = planta.elementos.flatMap((e) => e.polys.flat())
    const caixaPecas = pontos.length > 0 ? caixaDe(pontos) : null
    const alvo = caixaPecas ? L.latLngBounds(ll([caixaPecas.x0, caixaPecas.y1]), ll([caixaPecas.x1, caixaPecas.y0])) : limites
    let enquadrado = false
    const enquadrar = () => {
      m.invalidateSize({ pan: false })
      const t = m.getSize()
      if (!enquadrado && t.x > 50 && t.y > 50) {
        m.fitBounds(alvo, { padding: [16, 16], animate: false })
        enquadrado = true
      }
    }
    enquadrar()
    if (!enquadrado) m.setView(limites.getCenter(), -2, { animate: false })
    const rend = L.canvas({ tolerance: 6, padding: 0.3 })
    desenho.current = rend
    montarFundo(m, planta, limites)

    const camadas = new Map<string, L.Polygon[]>()
    // o nome escrito na planta também é tocável (como no HTML da FVS). Fica por baixo dos
    // contornos: onde os dois se cruzam, vale o contorno
    for (const e of planta.elementos) {
      const [x0, y0, x1, y1] = e.rotulo
      L.rectangle(L.latLngBounds(ll([x0, y1]), ll([x1, y0])).pad(0.15), { renderer: rend, stroke: false, fillColor: '#000', fillOpacity: 0 })
        .on('click', () => aoTocarPeca.current(e.id))
        .addTo(m)
    }
    for (const e of planta.elementos) {
      const polys = e.polys.length
        ? e.polys
        : [[[e.rotulo[0], e.rotulo[1]], [e.rotulo[2], e.rotulo[1]], [e.rotulo[2], e.rotulo[3]], [e.rotulo[0], e.rotulo[3]]] as Ponto[]]
      const ls = polys.map((p) =>
        L.polygon(p.map(ll), { renderer: rend, weight: 1.5, color: '#5b6470', fillColor: '#5b6470', fillOpacity: 0.06 }).addTo(m),
      )
      for (const l of ls) l.on('click', () => aoTocarPeca.current(e.id))
      camadas.set(e.id, ls)
    }
    camadasPeca.current = camadas
    grupoAreas.current = L.layerGroup().addTo(m)

    // nomes das peças: só na planta de teste (a planta da FVS já tem os nomes no desenho)
    if (!planta.fundo) {
      const rotulos = L.layerGroup()
      for (const e of planta.elementos) {
        const [x0, y0, x1, y1] = e.rotulo
        L.marker(ll([(x0 + x1) / 2, (y0 + y1) / 2]), {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: 'cc-rotulo', html: e.nome, iconSize: [60, 18], iconAnchor: [30, 9] }),
        }).addTo(rotulos)
      }
      grupoRotulos.current = rotulos
      // nome legível: só quando as peças estão a uns 80 px uma da outra na tela
      const mostrar = () => {
        if (m.getZoom() >= -2) rotulos.addTo(m)
        else rotulos.remove()
      }
      m.on('zoomend', mostrar)
      mostrar()
    }

    // + e −: no fim de cada zoom confere os limites (botão desligado no limite) e aplica o
    // toque que chegou no meio da animação (o Leaflet ignora zoom pedido durante outro)
    const aoFimDoZoom = () => {
      const z = m.getZoom()
      if (zoomPendente.current !== null && zoomPendente.current !== z) {
        pendenteDesde.current = Date.now()
        m.setZoom(zoomPendente.current)
        return
      }
      zoomPendente.current = null
      setNoLimite({ mais: z >= m.getMaxZoom(), menos: z <= m.getMinZoom() })
    }
    m.on('zoomend', aoFimDoZoom)
    aoFimDoZoom()

    const tirar = instalarCaneta(caixaMapa.current, tinta.current, {
      ativo: () => !!atual.current.camSel && atual.current.pode,
      cor: () => atual.current.cor,
      mouseDesenha: () => atual.current.mouseDesenha,
      aoComecar: () => m.stop(),
      aoTerminar: (pts, comp) => aoTraco.current(pts, comp),
    })
    const ro = new ResizeObserver(enquadrar)
    ro.observe(caixaMapa.current)
    return () => {
      tirar()
      ro.disconnect()
      m.remove()
      mapa.current = null
    }
  }, [planta])

  // ------------------------------------------------------------------
  // Pintura: áreas e peças (quando mudam os dados ou a escolha)
  // ------------------------------------------------------------------
  useEffect(() => {
    const m = mapa.current
    if (!m || !planta) return
    const g = grupoAreas.current!
    g.clearLayers()
    const camsVisiveis = camSel ? caminhoesConc : concSel ? caminhoesConc : caminhoesPav.map((p) => p.x)
    // mapa das concretagens: a área fica com a cor da concretagem, cheia, como um "carimbo"
    const porConcretagem = !camSel && vista === 'concretagens'
    for (const c of camsVisiveis) {
      const sel = c.raiz === camSel
      const cor = porConcretagem ? corDaConcretagem(indiceConc.get(c.concretagem_id) ?? 0) : corDoCaminhao(c.sequencia)
      // só as áreas desenhadas nesta planta (outro trecho tem outras coordenadas)
      for (const a of areasPorPlanta(c.raiz).get(planta.id) ?? []) {
        // a área de vigas e laje é tracejada; a dos pilares, contínua
        const traco = a.alvo === 'vigas_laje' ? '9 5' : undefined
        L.polygon(a.contorno.map((p) => ll(p as Ponto)), {
          renderer: desenho.current!,
          interactive: false,
          color: cor,
          weight: sel || porConcretagem ? 2.5 : 1.5,
          dashArray: sel || porConcretagem ? traco : '6 4',
          fillOpacity: sel ? 0.18 : porConcretagem ? 0.2 : 0.06,
        }).addTo(g)
      }
    }

    // cor de cada peça
    const situacaoDoCam = new Map<string, SituacaoCP | null>()
    for (const { x, c } of caminhoesPav) situacaoDoCam.set(x.raiz, piorDoCaminhao(dados, x, c, hoje))
    for (const [id, ls] of camadasPeca.current) {
      let cor = '#5b6470'
      let fill = 0.06
      let peso = 1.5
      let tracejado: string | undefined
      if (camSel) {
        const e = dados.pecasDe.get(camSel)?.get(id)
        if (e?.incluido) {
          cor = corDoCaminhao(camAtual?.sequencia ?? 1)
          fill = e.parcial ? 0.3 : 0.6
          peso = 2.5
          tracejado = e.parcial ? '5 4' : undefined
        } else {
          // peça de outro caminhão da mesma concretagem: cor fraca do outro
          const outro = caminhoesConc.find((x) => x.raiz !== camSel && dados.pecasDe.get(x.raiz)?.get(id)?.incluido)
          if (outro) {
            cor = corDoCaminhao(outro.sequencia)
            fill = 0.18
          }
        }
      } else if (porConcretagem) {
        // a cor da concretagem mais recente que passou pela peça
        let indice = Infinity
        for (const { x, c } of caminhoesPav) {
          if (concSel && c.raiz !== concSel) continue
          if (dados.pecasDe.get(x.raiz)?.get(id)?.incluido) indice = Math.min(indice, indiceConc.get(c.raiz) ?? Infinity)
        }
        if (indice !== Infinity) {
          cor = corDaConcretagem(indice)
          fill = 0.55
          peso = 2
        }
      } else {
        const situacoes: SituacaoCP[] = []
        for (const { x, c } of caminhoesPav) {
          if (concSel && c.raiz !== concSel) continue
          if (dados.pecasDe.get(x.raiz)?.get(id)?.incluido) {
            const s = situacaoDoCam.get(x.raiz)
            if (s) situacoes.push(s)
          }
        }
        const pior = piorSituacao(situacoes)
        if (pior) {
          cor = COR_SITUACAO[grupoDa(pior)]
          fill = 0.5
          peso = 2
        }
      }
      if (id === pecaSel) {
        peso = 4
        cor = '#111'
      }
      for (const l of ls) l.setStyle({ color: cor, fillColor: cor, fillOpacity: fill, weight: peso, dashArray: tracejado })
    }
  }, [dados, planta, camSel, concSel, pecaSel, vista])

  // ------------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------------
  // Gravações uma depois da outra, cada uma lendo o banco do aparelho na hora: dois traços
  // seguidos nunca calculam as peças com a lista de áreas antiga.
  const fila = useRef<Promise<unknown>>(Promise.resolve())
  const enfileirar = (tarefa: () => Promise<void>) => {
    fila.current = fila.current.then(tarefa).catch((e) => setMsg(`Não foi possível salvar: ${e instanceof Error ? e.message : e}`))
  }

  /**
   * Recalcula as peças do caminhão com as áreas que estão no aparelho agora, planta por
   * planta (cada área só conta nas peças do trecho dela).
   */
  const recalcular = async (camRaiz: string) => {
    const d = await carregar(obra.id)
    const areas = d.areasDe.get(camRaiz) ?? []
    // cada caneta vale só nas suas peças: a dos pilares nos pilares, a das vigas e laje no resto.
    // Área sem alvo (de antes das duas canetas) vale em todas. A peça fica com a maior fração.
    const tipoDe = (pl: PlantaPavimento, id: string) => d.pecaPorId.get(id)?.tipo ?? pl.elementos.find((e) => e.id === id)?.tipo ?? ''
    const porPlanta = (plantas ?? []).flatMap((pl) => {
      const pecas = pecasPorPlanta.get(pl.id) ?? []
      const daPlanta = areas.filter((a) => idDaRef(a.planta_ref) === pl.id)
      const preparadas = (alvo: AlvoDaArea | null) => daPlanta.filter((a) => (a.alvo ?? null) === alvo).map((a) => prepararArea(a.contorno as Ponto[]))
      return [
        { pecas, areas: preparadas(null) },
        { pecas: pecas.filter((p) => tipoDe(pl, p.id) === 'P'), areas: preparadas('pilares') },
        { pecas: pecas.filter((p) => tipoDe(pl, p.id) !== 'P'), areas: preparadas('vigas_laje') },
      ]
    })
    const mud = mudancasDoDesenhoPorPlanta(porPlanta, d.registrosPecasDe.get(camRaiz) ?? [])
    await registrarPecas(obra.id, usuario.id, camRaiz, mud, 'desenho')
    return mud
  }

  /**
   * Laje do trecho que vem com a caneta das vigas e laje (pecas.ts): fica no caminhão enquanto ele
   * tiver área dessa caneta no trecho. Chamar depois de desenhar, desfazer ou apagar áreas.
   * Devolve 'entrou' ou 'saiu' quando o caminhão mudou (laje marcada no toque não muda).
   */
  const acertarLaje = async (camRaiz: string, pavId: string, trecho: string): Promise<'entrou' | 'saiu' | null> => {
    const d = await carregar(obra.id)
    const doTrecho = new Set((plantas ?? []).filter((pl) => pl.trecho === trecho).map((pl) => pl.id))
    const temArea = (d.areasDe.get(camRaiz) ?? []).some((a) => a.alvo === 'vigas_laje' && doTrecho.has(idDaRef(a.planta_ref)))
    const pecasPav = d.pecasDoPavimento.get(pavId) ?? []
    let lajeId = lajeDoTrecho(pecasPav, trecho)?.id
    if (!lajeId && temArea && podeCriar) lajeId = await garantirLaje(obra.id, usuario.id, pavId, trecho, pecasPav)
    if (!lajeId) return null
    const m = mudancaDaLajeDoDesenho(temArea, lajeId, d.registrosPecasDe.get(camRaiz) ?? [])
    if (!m) return null
    const estado = d.pecasDe.get(camRaiz)?.get(lajeId)
    await registrarPecas(obra.id, usuario.id, camRaiz, [m], 'desenho')
    // o toque na laje vale mais que a área: se ela foi marcada no toque, o caminhão não muda
    if (estado?.origem === 'manual') return null
    return m.incluido ? 'entrou' : 'saiu'
  }

  aoTraco.current = (pts, comprimento) => {
    const m = mapa.current
    if (!m || !planta || !camAtual) return
    const escala = Math.pow(2, m.getZoom()) // px de tela por px da planta
    if (comprimento < 12) {
      // toque curto com a caneta = toque na peça (com folga de 8 px: viga é fina na tela)
      const p = m.containerPointToLatLng(pts[0])
      const peca = pecaNoPonto(planta.elementos, p.lng, -p.lat, 8 / escala)
      if (peca) aoTocarPeca.current(peca.id)
      return
    }
    const planta_pts: Ponto[] = pts.map((q) => {
      const p = m.containerPointToLatLng(q)
      return [Math.round(p.lng * 10) / 10, Math.round(-p.lat * 10) / 10]
    })
    const contorno = simplificarParaGravar(planta_pts, 1.5 / escala)
    if (contorno.length < 3 || areaDe(contorno) * escala * escala < 400) {
      setMsg('Traço pequeno demais para ser uma área. Desenhe em volta das peças.')
      return
    }
    // mostra já (antes de gravar), para a tela responder na hora
    L.polygon(contorno.map(ll), { renderer: desenho.current!, interactive: false, color: atual.current.cor, weight: 3, fillOpacity: 0.18 }).addTo(
      grupoAreas.current!,
    )
    const cam = camAtual
    const alvo = atual.current.alvo
    const pavId = pav?.id
    const trecho = planta.trecho
    enfileirar(async () => {
      await registrar('caminhao_areas', obra.id, usuario.id, { caminhao_id: cam.raiz, planta_ref: planta.ref, contorno, alvo })
      const antes = (await carregar(obra.id)).pecasDe.get(cam.raiz)
      const mud = await recalcular(cam.raiz)
      // caneta das vigas e laje: a área desenhada é a parte da laje que o caminhão encheu, então a
      // laje do trecho entra no caminhão junto (a forma não traz o contorno dela)
      const lajeEntrou = alvo === 'vigas_laje' && pavId ? (await acertarLaje(cam.raiz, pavId, trecho)) === 'entrou' : false
      await recarregar()
      // só as que entraram agora: peça que já estava (ou que foi tirada no toque) não conta
      const entraram = mud.filter((x) => {
        const e = antes?.get(x.elemento_id)
        return x.incluido && !e?.incluido && e?.origem !== 'manual'
      }).length
      const texto = entraram > 0 ? `${plural(entraram, 'peça entrou', 'peças entraram')} no caminhão ${cam.sequencia}.` : 'Área salva. Nenhuma peça nova dentro dela.'
      setMsg(lajeEntrou ? `${texto} A ${nomeDaLaje(trecho)} também entrou.` : texto)
    })
  }

  aoTocarPeca.current = (id) => {
    const nome = planta?.elementos.find((e) => e.id === id)?.nome ?? 'Peça'
    if (camAtual && pode) {
      const cam = camAtual
      enfileirar(async () => {
        const d = await carregar(obra.id)
        const agora = d.pecasDe.get(cam.raiz)?.get(id)?.incluido ?? false
        await registrarPecas(obra.id, usuario.id, cam.raiz, [{ elemento_id: id, incluido: !agora, fracao: 0 }], 'manual')
        await recarregar()
        setMsg(agora ? `${nome} saiu do caminhão ${cam.sequencia}.` : `${nome} entrou no caminhão ${cam.sequencia}.`)
      })
    } else {
      setPecaSel((s) => (s === id ? null : id))
      setPainel(true)
    }
  }

  // Laje do trecho: a forma não traz o contorno, então ela entra no caminhão pelo toque no botão.
  // No primeiro toque a pessoa cria a laje (gestor ou admin). Sem caminhão escolhido, o toque
  // mostra os caminhões dela, como o toque numa peça.
  const tocarLaje = () => {
    if (!planta || !pav) return
    if (!camAtual) {
      if (lajeAtual) aoTocarPeca.current(lajeAtual.id)
      return
    }
    if (!pode || (!lajeAtual && !podeCriar)) return
    const cam = camAtual
    const pavId = pav.id
    const trecho = planta.trecho
    enfileirar(async () => {
      const d = await carregar(obra.id)
      const id = await garantirLaje(obra.id, usuario.id, pavId, trecho, d.pecasDoPavimento.get(pavId) ?? [])
      const agora = d.pecasDe.get(cam.raiz)?.get(id)?.incluido ?? false
      await registrarPecas(obra.id, usuario.id, cam.raiz, [{ elemento_id: id, incluido: !agora, fracao: 0 }], 'manual')
      await recarregar()
      const nome = nomeDaLaje(trecho)
      setMsg(agora ? `${nome} saiu do caminhão ${cam.sequencia}.` : `${nome} entrou no caminhão ${cam.sequencia}.`)
    })
  }

  // Desfazer e apagar valem só para a planta aberta (área de outro trecho não está na tela).
  const desfazer = () => {
    if (!camAtual || !planta) return
    const cam = camAtual
    const plantaId = planta.id
    const pavId = pav?.id
    const trecho = planta.trecho
    enfileirar(async () => {
      const d = await carregar(obra.id)
      const areas = (d.areasDe.get(cam.raiz) ?? [])
        .filter((a) => idDaRef(a.planta_ref) === plantaId)
        .sort((a, b) => a.criado_em_dispositivo.localeCompare(b.criado_em_dispositivo))
      const ultima = areas.at(-1)
      if (!ultima) return setMsg('Este caminhão não tem área desenhada nesta planta.')
      await cancelar('caminhao_areas', obra.id, usuario.id, ultima)
      await recalcular(cam.raiz)
      const laje = pavId ? await acertarLaje(cam.raiz, pavId, trecho) : null
      await recarregar()
      setMsg(laje === 'saiu' ? `Última área apagada. A ${nomeDaLaje(trecho)} também saiu.` : 'Última área apagada.')
    })
  }

  const apagarTodas = () => {
    if (!camAtual || !planta) return
    const cam = camAtual
    const plantaId = planta.id
    const n = (areasPorPlanta(cam.raiz).get(plantaId) ?? []).length
    if (n === 0) return
    if (!confirm(`Apagar ${n === 1 ? 'a área' : `as ${n} áreas`} do caminhão ${cam.sequencia} nesta planta? As peças marcadas no toque continuam.`)) return
    const pavId = pav?.id
    const trecho = planta.trecho
    enfileirar(async () => {
      const d = await carregar(obra.id)
      for (const a of d.areasDe.get(cam.raiz) ?? []) {
        if (idDaRef(a.planta_ref) === plantaId) await cancelar('caminhao_areas', obra.id, usuario.id, a)
      }
      await recalcular(cam.raiz)
      const laje = pavId ? await acertarLaje(cam.raiz, pavId, trecho) : null
      await recarregar()
      setMsg(laje === 'saiu' ? `Áreas apagadas. A ${nomeDaLaje(trecho)} também saiu.` : 'Áreas apagadas.')
    })
  }

  // áreas em trecho que não está neste aparelho: não aparecem nem recalculam peça (avisa)
  const areasSemPlanta = camAtual && plantas ? (dados.areasDe.get(camAtual.raiz) ?? []).filter((a) => !plantas.some((p) => p.id === idDaRef(a.planta_ref))) : []

  // áreas desenhadas numa revisão anterior desta planta: avisa (a peça pode ter mudado)
  const areasRevisaoAntiga =
    camAtual && planta
      ? (areasPorPlanta(camAtual.raiz).get(planta.id) ?? []).filter((a) => {
          const r = revisaoDaRef(a.planta_ref)
          return r !== '' && r !== planta.revisao
        })
      : []

  // ------------------------------------------------------------------
  // Tela
  // ------------------------------------------------------------------
  const concAtual = concs.find((c) => c.raiz === concSel)
  const pecasDoCam = camAtual
    ? [...(dados.pecasDe.get(camAtual.raiz)?.values() ?? [])].filter((e) => e.incluido)
    : []
  const nomeDa = (id: string) => dados.pecaPorId.get(id)?.nome ?? planta?.elementos.find((e) => e.id === id)?.nome ?? '?'
  const ordemTipo = (id: string) => ({ P: 0, V: 1, L: 2 })[dados.pecaPorId.get(id)?.tipo ?? ''] ?? 3

  return (
    <div class={`cc-mapa-tela${painel ? ' com-painel' : ''}`}>
      <header class="cc-mapa-topo">
        <div class="cc-mapa-linha">
          <button type="button" class="cc-voltar" onClick={voltar}>
            ‹ Voltar
          </button>
          <div class="cc-titulo">
            <h1>{pav?.nome ?? 'Pavimento'}</h1>
            <p class="discreto">
              {camAtual && pode ? `Caneta marca ${ROTULO_CANETA[canetaAlvo]} · dedo move e marca peça` : 'Toque numa peça para ver os caminhões'}
              {aviso && <span data-testid="aviso-sync"> · {aviso}</span>}
            </p>
          </div>
          {camAtual && pode && temMouse && (
            <button type="button" class={mouseDesenha ? 'principal' : ''} onClick={() => setMouseDesenha(!mouseDesenha)} aria-pressed={mouseDesenha}>
              {mouseDesenha ? 'Mouse: desenhar' : 'Mouse: mover'}
            </button>
          )}
          {camAtual && pode && (
            <button type="button" onClick={desfazer} data-testid="desfazer">
              Desfazer
            </button>
          )}
          {acoes}
        </div>
        <div class="cc-chips" role="toolbar" aria-label="Caminhões">
          <select
            value={concSel}
            aria-label="Concretagem"
            onChange={(e) => {
              setConcSel(e.currentTarget.value)
              setCamSel(null)
            }}
          >
            <option value="">Todas as concretagens</option>
            {concs.map((c) => (
              <option key={c.raiz} value={c.raiz}>
                {dataBR(c.data)} · {nomeDaConcretagem(c)}
              </option>
            ))}
          </select>
          {plantas && plantas.length > 1 && planta && (
            <select
              value={planta.id}
              aria-label="Trecho (planta)"
              data-testid="trecho"
              onChange={(e) => {
                setPlantaSel(e.currentTarget.value)
                setPecaSel(null)
              }}
            >
              {plantas.map((p) => {
                const n = camAtual ? (areasPorPlanta(camAtual.raiz).get(p.id) ?? []).length : 0
                return (
                  <option key={p.id} value={p.id}>
                    {p.trecho}
                    {n > 0 ? ` · ${plural(n, 'área', 'áreas')}` : ''}
                  </option>
                )
              })}
            </select>
          )}
          {concSel && (
            <button type="button" class={`cc-chip${camSel === null ? ' on' : ''}`} onClick={() => setCamSel(null)}>
              Ver
            </button>
          )}
          {caminhoesConc.map((c) => (
            <button
              type="button"
              key={c.raiz}
              class={`cc-chip${c.raiz === camSel ? ' on' : ''}`}
              onClick={() => {
                setCamSel(c.raiz === camSel ? null : c.raiz)
                setPecaSel(null)
              }}
              data-testid={`chip-${c.sequencia}`}
              title={c.nota_fiscal ? `Caminhão ${c.sequencia} · NF ${c.nota_fiscal}` : `Caminhão ${c.sequencia}`}
            >
              <span class="cc-bolinha" style={{ background: corDoCaminhao(c.sequencia) }}>
                {c.sequencia}
              </span>
              {c.nota_fiscal ? <span class="cc-chip-nf">NF {c.nota_fiscal}</span> : ''}
            </button>
          ))}
          {concSel && pode && (
            <button type="button" class="cc-chip" onClick={() => ir({ nome: 'novo-caminhao', concretagemRaiz: concSel })}>
              + Caminhão
            </button>
          )}
        </div>
        {camAtual && pode && (
          <div class="cc-chips cc-canetas" role="group" aria-label="Caneta">
            <span class="discreto">Caneta:</span>
            {(['pilares', 'vigas_laje'] as const).map((a) => (
              <button type="button" key={a} class={`cc-chip${canetaAlvo === a ? ' on' : ''}`} aria-pressed={canetaAlvo === a} data-testid={`caneta-${a}`} onClick={() => trocarCaneta(a)}>
                {a === 'pilares' ? 'Pilares' : 'Vigas e laje'}
              </button>
            ))}
          </div>
        )}
      </header>

      {planta ? (
        <div class="cc-mapa" ref={caixaMapa} data-testid="mapa">
          <canvas ref={tinta} class="cc-tinta" />
          {msg && (
            <p class="cc-toast" role="status" data-testid="toast">
              {msg}
            </p>
          )}
        </div>
      ) : plantas === null ? (
        <p class="tela discreto">Carregando a planta…</p>
      ) : (
        <SemPlanta ctx={ctx} pavimentoId={pavimentoId} camAtual={camAtual} />
      )}

      {planta && (
        // Fora do .cc-mapa de propósito: lá dentro a caneta pega o toque (fase de captura) e
        // desenharia em cima do botão. Uma mão segura o tablet, a outra a caneta: sem pinça.
        <div class="cc-zoom" role="group" aria-label="Ampliar a planta">
          <button type="button" data-testid="zoom-mais" aria-label="Ampliar" disabled={noLimite.mais} onClick={() => zoomPeloBotao(1)}>
            +
          </button>
          <button type="button" data-testid="zoom-menos" aria-label="Reduzir" disabled={noLimite.menos} onClick={() => zoomPeloBotao(-1)}>
            −
          </button>
        </div>
      )}

      {planta && (
        <aside class={`cc-painel${painel ? ' aberto' : ''}`} data-testid="painel">
          <button type="button" class="cc-alca" onClick={() => setPainel(!painel)} aria-expanded={painel}>
            {painel ? 'Esconder painel ▾' : 'Mostrar painel ▴'}
          </button>
          {painel && camAtual && concAtual && (
            <div class="cc-painel-corpo">
              <h2 class="sem-topo">
                <span class="cc-bolinha" style={{ background: corDoCaminhao(camAtual.sequencia) }}>
                  {camAtual.sequencia}
                </span>{' '}
                Caminhão {camAtual.sequencia} · NF {camAtual.nota_fiscal || '—'}
              </h2>
              <p class="discreto">
                {camAtual.volume_m3 !== null ? `${numBR(camAtual.volume_m3, 2)} m³ · ` : ''}
                {plural((areasPorPlanta(camAtual.raiz).get(planta.id) ?? []).length, 'área nesta planta', 'áreas nesta planta')}
              </p>
              {areasSemPlanta.length > 0 && (
                <p class="aviso" data-testid="aviso-sem-planta">
                  ⚠ {plural(areasSemPlanta.length, 'área está', 'áreas estão')} num trecho que não está neste aparelho. Baixe o trecho na
                  tela inicial da FVS para ver no mapa.
                </p>
              )}
              {areasRevisaoAntiga.length > 0 && (
                <p class="aviso" data-testid="aviso-revisao">
                  ⚠ {plural(areasRevisaoAntiga.length, 'área foi desenhada', 'áreas foram desenhadas')} na revisão{' '}
                  {[...new Set(areasRevisaoAntiga.map((a) => revisaoDaRef(a.planta_ref)))].join(', ')} desta planta. A planta
                  agora é a {planta.revisao}: confira se as peças continuam as mesmas.
                </p>
              )}
              <div class="cc-selos">
                {idadesDoCaminhao(dados, camAtual, concAtual, hoje).map((i) => (
                  <Selo key={i.idade} situacao={i.situacao} texto={`${i.idade}d: ${i.exemplar !== undefined ? `${numBR(i.exemplar)} MPa` : dataBR(i.dataPrevista)}`} />
                ))}
              </div>
              {pode && (
                <BotaoLaje
                  nome={nomeLaje}
                  ligada={!!lajeAtual && !!dados.pecasDe.get(camAtual.raiz)?.get(lajeAtual.id)?.incluido}
                  marca
                  cor={corDoCaminhao(camAtual.sequencia)}
                  desligado={!lajeAtual && !podeCriar}
                  aoTocar={tocarLaje}
                />
              )}
              {pode && !lajeAtual && !podeCriar && (
                <p class="discreto">A laje deste trecho ainda não foi criada. Só gestor ou administrador cria a laje; depois disso ela pode ser marcada aqui.</p>
              )}
              <h3>{pecasDoCam.length === 0 ? 'Nenhuma peça ainda' : plural(pecasDoCam.length, 'peça', 'peças')}</h3>
              {pecasDoCam.length === 0 && pode && <p class="discreto">Desenhe com a caneta em volta da área que o caminhão encheu.</p>}
              <ul class="cc-pecas-compacto" data-testid="pecas-caminhao">
                {pecasDoCam
                  .sort(
                    (a, b) =>
                      ordemTipo(a.elemento_id) - ordemTipo(b.elemento_id) ||
                      nomeDa(a.elemento_id).localeCompare(nomeDa(b.elemento_id), 'pt-BR', { numeric: true }),
                  )
                  .map((e) => (
                    <li key={e.elemento_id} class={e.parcial ? 'parcial' : ''}>
                      {nomeDa(e.elemento_id)}
                      <span class="discreto"> {comoEntrou(e)}</span>
                    </li>
                  ))}
              </ul>
              <div class="acoes-linha">
                <button type="button" onClick={() => ir({ nome: 'caminhao', raiz: camAtual.raiz })}>
                  Ver caminhão e CPs
                </button>
                {pode && (areasPorPlanta(camAtual.raiz).get(planta.id) ?? []).length > 0 && (
                  <button type="button" class="perigo" onClick={apagarTodas}>
                    Apagar áreas
                  </button>
                )}
              </div>
            </div>
          )}
          {painel && !camAtual && pecaSel && (
            <PainelPeca ctx={ctx} id={pecaSel} nome={nomeDa(pecaSel)} caminhoes={caminhoesPav} hoje={hoje}>
              {lajeAtual && <BotaoLaje nome={nomeLaje} ligada={pecaSel === lajeAtual.id} aoTocar={tocarLaje} />}
            </PainelPeca>
          )}
          {painel && !camAtual && !pecaSel && (
            <div class="cc-painel-corpo">
              {lajeAtual && <BotaoLaje nome={nomeLaje} ligada={false} aoTocar={tocarLaje} />}
              <p>
                {concs.length === 0
                  ? 'Nenhuma concretagem neste pavimento ainda. Volte e crie uma para desenhar.'
                  : concSel
                    ? 'Escolha um caminhão acima para desenhar onde ele foi, ou toque numa peça para ver os caminhões dela.'
                    : 'Toque numa peça para ver os caminhões dela, ou escolha uma concretagem acima para desenhar.'}
              </p>
              {concs.length > 0 && (
                <div class="cc-chips" role="group" aria-label="O que o mapa mostra">
                  <button type="button" class={`cc-chip${vista === 'concretagens' ? ' on' : ''}`} aria-pressed={vista === 'concretagens'} data-testid="vista-concretagens" onClick={() => setVista('concretagens')}>
                    Mapa de concretagens
                  </button>
                  <button type="button" class={`cc-chip${vista === 'laudos' ? ' on' : ''}`} aria-pressed={vista === 'laudos'} data-testid="vista-laudos" onClick={() => setVista('laudos')}>
                    Laudos (CPs)
                  </button>
                </div>
              )}
              {vista === 'concretagens' && concs.length > 0 ? (
                <ul class="cc-legenda cc-legenda-conc" data-testid="legenda-concretagens">
                  {concs.map((c, i) => {
                    const cams = dados.caminhoesDe.get(c.raiz) ?? []
                    const volume = cams.reduce((s, x) => s + (x.volume_m3 ?? 0), 0)
                    const pecas = new Set<string>()
                    for (const x of cams) for (const [id, e] of dados.pecasDe.get(x.raiz) ?? []) if (e.incluido) pecas.add(id)
                    return (
                      <li key={c.raiz} class={c.raiz === concSel ? 'on' : ''}>
                        <button type="button" class="cc-linha" onClick={() => setConcSel(c.raiz === concSel ? '' : c.raiz)}>
                          <i style={{ background: corDaConcretagem(i) }} />
                          <span>
                            <strong>
                              {dataBR(c.data)} · {nomeDaConcretagem(c)}
                            </strong>
                            <span class="discreto">
                              {plural(cams.length, 'caminhão', 'caminhões')} · {numBR(volume)} m³ · {plural(pecas.size, 'peça', 'peças')}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <ul class="cc-legenda">
                  <li>
                    <i style={{ background: COR_SITUACAO.ruim }} /> laudo atrasado ou abaixo do fck
                  </li>
                  <li>
                    <i style={{ background: COR_SITUACAO.info }} /> rompendo / aguardando laudo
                  </li>
                  <li>
                    <i style={{ background: COR_SITUACAO.neutro }} /> CPs ainda não romperam
                  </li>
                  <li>
                    <i style={{ background: COR_SITUACAO.bom }} /> 28 dias OK
                  </li>
                </ul>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  )
}

/**
 * Laje do trecho aberto: a forma não traz o contorno, então ela é marcada por este botão.
 * `marca` mostra + / ✓ (caminhão escolhido); sem ela, o botão só escolhe a laje para ver.
 */
function BotaoLaje({
  nome,
  ligada,
  marca = false,
  cor,
  desligado = false,
  aoTocar,
}: {
  nome: string
  ligada: boolean
  marca?: boolean
  cor?: string
  desligado?: boolean
  aoTocar: () => void
}) {
  return (
    <button type="button" class={`cc-laje${ligada ? ' on' : ''}`} aria-pressed={ligada} disabled={desligado} onClick={aoTocar} data-testid="laje">
      {marca && (
        <span class="cc-laje-marca" aria-hidden="true" style={ligada && cor ? { background: cor, borderColor: cor } : undefined}>
          {ligada ? '✓' : '+'}
        </span>
      )}
      {nome}
    </button>
  )
}

function PainelPeca({
  ctx,
  id,
  nome,
  caminhoes,
  hoje,
  children,
}: {
  ctx: Contexto
  id: string
  nome: string
  caminhoes: Array<{ x: Caminhao; c: { raiz: string; data: string; local_descricao: string } }>
  hoje: string
  children?: ComponentChildren
}) {
  const { dados, ir } = ctx
  const lista = caminhoes
    .filter(({ x }) => dados.pecasDe.get(x.raiz)?.get(id)?.incluido)
    .map(({ x }) => {
      const conc = concretagemDe(dados, x)!
      return { x, conc, pior: piorDoCaminhao(dados, x, conc, hoje), e: dados.pecasDe.get(x.raiz)!.get(id)! }
    })
    .sort((a, b) => (a.pior && b.pior ? GRAVIDADE[a.pior] - GRAVIDADE[b.pior] : 0))
  return (
    <div class="cc-painel-corpo" data-testid="painel-peca">
      {children}
      <h2 class="sem-topo">{nome}</h2>
      {lista.length === 0 ? (
        <p class="discreto">Nenhum caminhão registrado nesta peça.</p>
      ) : (
        <ul class="lista">
          {lista.map(({ x, conc, pior, e }) => (
            <li key={x.raiz}>
              <button type="button" class="cc-linha" onClick={() => ir({ nome: 'caminhao', raiz: x.raiz })}>
                <span class="cc-bolinha" style={{ background: corDoCaminhao(x.sequencia) }}>
                  {x.sequencia}
                </span>
                <span>
                  <strong>NF {x.nota_fiscal || '—'}</strong>
                  <span class="discreto">
                    {dataBR(conc.data)} · {comoEntrou(e)}
                    {e.parcial ? ' · parcial' : ''}
                  </span>
                </span>
                {pior && <Selo situacao={pior} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Sem planta: escolha das peças por lista (se houver peças cadastradas). */
function SemPlanta({ ctx, pavimentoId, camAtual }: { ctx: Contexto; pavimentoId: string; camAtual?: Caminhao }) {
  const { dados, obra, usuario, recarregar } = ctx
  const pecas = [...(dados.pecasDoPavimento.get(pavimentoId) ?? [])].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
  const pode = podeRegistrar(obra.papel)
  return (
    <div class="tela cc-sem-planta" data-testid="sem-planta">
      <p class="cartao">
        Este pavimento ainda não tem planta neste aparelho. As plantas são baixadas na tela inicial do módulo FVS, uma por trecho. Enquanto isso,{' '}
        {pecas.length > 0 ? 'marque as peças na lista.' : 'não há peças cadastradas neste pavimento para marcar.'}
      </p>
      {camAtual && pecas.length > 0 && (
        <ul class="cc-lista-pecas">
          {pecas.map((p) => {
            const incl = dados.pecasDe.get(camAtual.raiz)?.get(p.id)?.incluido ?? false
            return (
              <li key={p.id}>
                <label class="sem-margem">
                  <input
                    type="checkbox"
                    checked={incl}
                    disabled={!pode}
                    onChange={async () => {
                      await registrarPecas(obra.id, usuario.id, camAtual.raiz, [{ elemento_id: p.id, incluido: !incl, fracao: 0 }], 'manual')
                      await recarregar()
                    }}
                  />{' '}
                  {p.nome}
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {!camAtual && pecas.length > 0 && <p class="discreto">Escolha um caminhão acima.</p>}
    </div>
  )
}

function montarFundo(m: L.Map, planta: PlantaPavimento, limites: L.LatLngBounds) {
  const f = planta.fundo
  if (!f) return
  const Camada = L.GridLayer.extend({
    createTile(c: L.Coords) {
      const img = document.createElement('img')
      img.alt = ''
      const url = f.url(c.z, c.x, c.y)
      if (url) img.src = url
      return img
    },
  }) as unknown as new (o: L.GridLayerOptions) => L.GridLayer
  new Camada({
    tileSize: f.tile,
    minNativeZoom: Math.min(...f.niveis),
    maxNativeZoom: Math.max(...f.niveis),
    minZoom: -5,
    maxZoom: 4,
    bounds: limites,
    noWrap: true,
    keepBuffer: 4,
  }).addTo(m)
}
