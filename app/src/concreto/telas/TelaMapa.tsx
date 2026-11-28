// Mapa do pavimento: onde foi cada caminhão. Com um caminhão escolhido, a caneta desenha a
// área que ele encheu e o dedo (toque curto numa peça) inclui ou tira a peça. São seis canetas
// (canetas.ts, 26/11/2026: pilares, vigas, lajes e as combinações); cada área vale só nas peças da
// sua caneta, e as canetas com laje põem a laje do trecho no caminhão.
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
  corrigir,
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
import { AVISO_DO_CANTO, areaNoPonto, cantoPerto, ladosSeCruzam, moverCanto, problemaDoCanto, temCantosEditaveis } from '../desenho'
import { CANETAS, canetaComLaje, canetaDesconhecida, ehCaneta, lajePeloDesenho, NOME_DA_CANETA, separarPorParte } from '../canetas'
import { ehLajeDeTrecho, lajeDoTrecho, nomeDaLaje } from '../lajes'
import { recortar } from '../recorte'
import { guardarAcao, planoDoDesfazer, TEXTO_DO_DESFAZER, tirarUltima, type AcaoDoMapa, type PassoDoDesfazer } from '../desfazer'
import { unirAreas } from '../uniao'
import { mudancaDaLajeDoDesenho, mudancasDoDesenhoPorPlanta, pecaNoPonto, prepararPecas } from '../pecas'
import { ehFundacao, ORDEM_DO_TIPO } from '../tipos_peca'
import { carregarPlantas, idDaRef, revisaoDaRef, type PlantaPavimento } from '../planta'
import { comoEntrou } from '../relatorio'
import type { Contexto } from './ModuloConcreto'
import { corDoCaminhao, dataBR, numBR, plural, Selo } from './comum'
import { nomeDaConcretagem } from '../exemplo'
import { Icone } from '../../telas/icones'

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

function lerCaneta(chave: string): AlvoDaArea {
  try {
    const v = localStorage.getItem(chave)
    return ehCaneta(v) ? v : 'pilares'
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
  // a laje de trecho, a estaca e o bloco não têm contorno: não entram na planta como peça desenhada
  const pecasDaPlanta = pecasCad.filter((p) => !ehLajeDeTrecho(p) && !ehFundacao(p.tipo))
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
  // jeito de desenhar (26/11): traço livre (como sempre) ou linhas retas, canto a canto
  const chaveRetas = `concreto:retas:${obra.id}`
  const [retas, setRetas] = useState<boolean>(() => {
    try {
      return localStorage.getItem(chaveRetas) === '1'
    } catch {
      return false
    }
  })
  const trocarRetas = (v: boolean) => {
    setRetas(v)
    trocarCantos([])
    try {
      localStorage.setItem(chaveRetas, v ? '1' : '0')
    } catch {
      /* só não lembra */
    }
  }
  // cantos da área em linhas retas ainda aberta, em coordenadas da planta (o dedo pode mover a
  // planta entre um toque e outro)
  const cantos = useRef<Ponto[]>([])
  const [nCantos, setNCantos] = useState(0)
  const trocarCantos = (l: Ponto[]) => {
    cantos.current = l
    setNCantos(l.length)
  }
  // borracha (26/11): com ela ligada, o toque numa área do caminhão apaga só aquela área
  const [borracha, setBorracha] = useState(false)
  const trocarBorracha = (v: boolean) => {
    setBorracha(v)
    if (v) trocarCantos([])
  }
  // sem caminhão escolhido: o mapa das concretagens (uma cor por concretagem) ou a situação dos laudos
  const [vista, setVista] = useState<'concretagens' | 'laudos'>('concretagens')
  const indiceConc = useMemo(() => new Map(concs.map((c, i) => [c.raiz, i])), [concs])
  // peças de cada planta, preparadas uma vez (cálculo das frações)
  const pecasPorPlanta = useMemo(() => new Map((plantas ?? []).map((p) => [p.id, prepararPecas(p.elementos)])), [plantas])
  // mesma planta: pelo trecho, pela linha de "plantas" que é dele ou pela cópia da mesma prancha
  // no pavimento (plantas_equivalentes.ts); não só pelo id exato
  const chaveDe = dados.chavePlanta ?? ((id: string) => id)
  const naPlanta = (a: Area, plantaId: string) => chaveDe(idDaRef(a.planta_ref)) === chaveDe(plantaId)
  /** Áreas do caminhão em cada planta (id da planta → áreas). */
  const areasPorPlanta = (camRaiz: string) => {
    const m = new Map<string, Area[]>()
    for (const a of dados.areasDe.get(camRaiz) ?? []) {
      const k = chaveDe(idDaRef(a.planta_ref))
      m.set(k, [...(m.get(k) ?? []), a])
    }
    return { get: (plantaId: string) => m.get(chaveDe(plantaId)) }
  }

  // caminhão escolhido: abre no trecho onde ele tem área (a mais recente), se não for o pedido
  useEffect(() => {
    if (!camSel || !plantas || plantas.length < 2) return
    const areas = [...(dados.areasDe.get(camSel) ?? [])].sort((a, b) => a.criado_em_dispositivo.localeCompare(b.criado_em_dispositivo))
    const ultima = areas.at(-1)
    if (!ultima || (planta && naPlanta(ultima, planta.id))) return
    const alvo = plantas.find((p) => naPlanta(ultima, p.id))
    if (alvo) setPlantaSel(alvo.id)
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
  // zoom da planta (meio em meio nível): o número do caminhão muda de lugar conforme o tamanho na tela
  const [zoomAgora, setZoomAgora] = useState(0)
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
  const atual = useRef({ camSel, pode, mouseDesenha, cor: '#1565c0', alvo: canetaAlvo, retas, borracha })
  atual.current = { camSel, pode, mouseDesenha, cor: camAtual ? corDoCaminhao(camAtual.sequencia) : '#1565c0', alvo: canetaAlvo, retas, borracha }
  const grupoCantos = useRef<L.LayerGroup | null>(null)
  const aoTraco = useRef<(pts: Array<[number, number]>, comp: number) => void>(() => {})
  const aoTocarPeca = useRef<(id: string) => void>(() => {})
  const aoClicarMapa = useRef<(x: number, y: number) => void>(() => {})

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
    // Enquanto a pessoa não moveu nem ampliou a planta, ela se reenquadra quando o tamanho da tela
    // muda (girar o tablet, abrir ou fechar o painel): antes, ao deitar o tablet, parte das peças
    // ficava fora da tela (26/11). Depois que ela mexe, o lugar escolhido fica.
    let mexeu = false
    let ajustando = false
    const enquadrar = () => {
      m.invalidateSize({ pan: false })
      const t = m.getSize()
      if ((!enquadrado || !mexeu) && t.x > 50 && t.y > 50) {
        ajustando = true
        m.fitBounds(alvo, { padding: [16, 16], animate: false })
        ajustando = false
        enquadrado = true
      }
    }
    m.on('dragstart', () => (mexeu = true))
    m.on('zoomstart', () => {
      if (!ajustando) mexeu = true
    })
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
    grupoCantos.current = L.layerGroup().addTo(m)
    // toque do dedo (ou clique do mouse que move) em qualquer lugar da planta: usado pela borracha
    m.on('click', (e: L.LeafletMouseEvent) => aoClicarMapa.current(e.latlng.lng, -e.latlng.lat))

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
      setZoomAgora(Math.round(z * 2) / 2)
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
    const escalaAgora = Math.pow(2, m.getZoom())
    const situacaoDoCam = new Map<string, SituacaoCP | null>()
    for (const { x, c } of caminhoesPav) situacaoDoCam.set(x.raiz, piorDoCaminhao(dados, x, c, hoje))
    for (const c of camsVisiveis) {
      const sel = c.raiz === camSel
      const situacao = situacaoDoCam.get(c.raiz)
      const cor = porConcretagem
        ? corDaConcretagem(indiceConc.get(c.concretagem_id) ?? 0)
        : !camSel && situacao
          ? COR_SITUACAO[grupoDa(situacao)]
          : corDoCaminhao(c.sequencia)
      // só as áreas desenhadas nesta planta (outro trecho tem outras coordenadas). As que se
      // encostam ou se sobrepõem viram um desenho só (uniao.ts, 26/11): um preenchimento e o
      // contorno de fora, mesmo com canetas diferentes. Cada área continua gravada como foi.
      const outroCam = !!camSel && !sel
      for (const grupo of unirAreas(areasPorPlanta(c.raiz).get(planta.id) ?? [])) {
        // Grupo com caneta de laje é a laje que o caminhão encheu (a forma não traz o contorno da
        // laje): fica cheio, como laje concretada (pedido do Nicolas, 22/11). Sem laje (pilares,
        // vigas) só contorna as peças: contínuo e quase sem preenchimento.
        L.polygon(
          grupo.aneis.map((r) => r.map(ll)),
          {
            renderer: desenho.current!,
            interactive: false,
            stroke: false,
            fillColor: cor,
            fillRule: 'nonzero',
            fillOpacity: grupo.laje ? (sel ? 0.4 : outroCam ? 0.15 : 0.35) : sel ? 0.18 : outroCam ? 0.06 : 0.2,
          },
        ).addTo(g)
        L.polyline(
          grupo.borda.map((l) => l.map(ll)),
          { renderer: desenho.current!, interactive: false, color: cor, weight: sel || !camSel ? 2.5 : 1.5, dashArray: outroCam ? '6 4' : undefined, lineJoin: 'round' },
        ).addTo(g)
        // O número do caminhão no desenho (26/11): sem ele, só a cor dizia de quem é a área. O
        // caminhão escolhido não precisa (está no painel). Área pequena na tela (em volta de um
        // pilar): o número fica logo acima dela, para não tampar a peça.
        if (sel) continue
        const pequena = Math.min(grupo.caixa.x1 - grupo.caixa.x0, grupo.caixa.y1 - grupo.caixa.y0) * escalaAgora < 56
        L.marker(ll(pequena ? [(grupo.caixa.x0 + grupo.caixa.x1) / 2, grupo.caixa.y0] : grupo.rotulo), {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: `cc-num-cam${outroCam ? ' fraco' : ''}`,
            html: `<span style="border-color:${cor};color:${cor}">${c.sequencia}</span>`,
            iconSize: [26, 26],
            iconAnchor: pequena ? [13, 30] : [13, 13],
          }),
        }).addTo(g)
      }
    }

    // cor de cada peça
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
  }, [dados, planta, camSel, concSel, pecaSel, vista, zoomAgora])

  // linhas retas: outro caminhão ou outra planta começa uma área nova
  useEffect(() => {
    trocarCantos([])
    setBorracha(false)
  }, [camSel, planta?.id])

  // linhas retas: os cantos já tocados, ligados por linha, e o primeiro maior (tocar nele fecha)
  useEffect(() => {
    const g = grupoCantos.current
    if (!g || !mapa.current) return
    g.clearLayers()
    const l = cantos.current
    const cor = camAtual ? corDoCaminhao(camAtual.sequencia) : '#1565c0'
    // com "Retas" ligado, os cantos das áreas de linhas retas já gravadas aparecem: arrastar move
    if (retas && !borracha && camAtual && pode && planta && l.length === 0) {
      for (const a of areasPorPlanta(camAtual.raiz).get(planta.id) ?? []) {
        if (!temCantosEditaveis(a.contorno)) continue
        for (const p of a.contorno)
          L.circleMarker(ll(p), { renderer: desenho.current!, interactive: false, radius: 6, color: cor, weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(g)
      }
    }
    if (l.length === 0) return
    L.polyline(l.map(ll), { renderer: desenho.current!, interactive: false, color: cor, weight: 3 }).addTo(g)
    l.forEach((p, i) =>
      L.circleMarker(ll(p), { renderer: desenho.current!, interactive: false, radius: i === 0 && l.length >= 3 ? 9 : 5, color: cor, weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(g),
    )
  }, [nCantos, planta, camSel, retas, borracha, dados])

  const fecharRetas = () => {
    const m = mapa.current
    const l = cantos.current
    if (!m || l.length < 3) return
    const escala = Math.pow(2, m.getZoom())
    // cruzada primeiro: a área de uma "gravata" dá quase zero e o aviso de pequena enganaria
    if (ladosSeCruzam(l)) {
      setMsg('Os lados da área se cruzam. Arraste um canto ou tire o último antes de fechar.')
      return
    }
    if (areaDe(l) * escala * escala < 400) {
      setMsg('Área pequena demais. Toque os cantos em volta das peças.')
      return
    }
    trocarCantos([])
    salvarArea([...l])
  }

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
    // cada caneta vale só nas suas peças (canetas.ts): pilar nas com pilares, laje nas com laje e o
    // resto nas com vigas. Área sem alvo (de antes das canetas) vale em todas; caneta desconhecida
    // (de versão mais nova) em nenhuma. Cada peça soma as áreas que valem nela.
    const tipoDe = (pl: PlantaPavimento, id: string) => d.pecaPorId.get(id)?.tipo ?? pl.elementos.find((e) => e.id === id)?.tipo ?? ''
    const porPlanta = (plantas ?? []).flatMap((pl) => {
      const pecas = pecasPorPlanta.get(pl.id) ?? []
      const daPlanta = areas.filter((a) => naPlanta(a, pl.id))
      // caneta desconhecida: não vale em peça nenhuma, mas a peça que ela cobre não sai (pecas.ts)
      const desconhecidas = daPlanta.filter((a) => canetaDesconhecida(a.alvo)).map((a) => prepararArea(a.contorno as Ponto[]))
      return separarPorParte(pecas, (id) => tipoDe(pl, id), daPlanta).map((g) => ({
        pecas: g.pecas,
        areas: g.areas.map((a) => prepararArea(a.contorno as Ponto[])),
        desconhecidas,
      }))
    })
    const mud = mudancasDoDesenhoPorPlanta(porPlanta, d.registrosPecasDe.get(camRaiz) ?? [])
    await registrarPecas(obra.id, usuario.id, camRaiz, mud, 'desenho')
    return mud
  }

  /**
   * Laje do trecho que vem com as canetas com laje (pecas.ts): fica no caminhão enquanto ele
   * tiver área de uma delas no trecho. Chamar depois de desenhar, desfazer ou apagar áreas.
   * Devolve 'entrou' ou 'saiu' quando o caminhão mudou (laje marcada no toque não muda).
   */
  const acertarLaje = async (camRaiz: string, pavId: string, trecho: string): Promise<'entrou' | 'saiu' | null> => {
    const d = await carregar(obra.id)
    const doTrecho = new Set((plantas ?? []).filter((pl) => pl.trecho === trecho).map((pl) => pl.id))
    const pelo = lajePeloDesenho((d.areasDe.get(camRaiz) ?? []).filter((a) => [...doTrecho].some((id) => naPlanta(a, id))).map((a) => a.alvo))
    // só área de caneta desconhecida no trecho: pode ser de laje, então a laje fica como está
    if (pelo === null) return null
    const temArea = pelo
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
    if (atual.current.borracha) {
      // toque curto: apaga a área tocada inteira; traço em volta de um pedaço: recorta só o pedaço
      if (comprimento < 12) {
        const p = m.containerPointToLatLng(pts[0])
        return apagarNoPonto(p.lng, -p.lat)
      }
      const traco = simplificarParaGravar(
        pts.map((q): Ponto => {
          const p = m.containerPointToLatLng(q)
          return [Math.round(p.lng * 10) / 10, Math.round(-p.lat * 10) / 10]
        }),
        1.5 / escala,
      )
      ultimaBorracha.current = Date.now()
      if (traco.length < 3 || areaDe(traco) * escala * escala < 400) return setMsg('Traço pequeno demais. Passe a borracha em volta do pedaço que quer tirar.')
      // o clique do mapa que chega quando a caneta solta não pode valer como toque de borracha
      ultimaBorracha.current = Date.now()
      return recortarComTraco(traco, 100 / (escala * escala))
    }
    if (atual.current.retas) {
      // linhas retas: cada toque da caneta (ou clique do mouse) é um canto. Tocar perto do
      // primeiro canto (ou no botão Fechar) fecha a área. O dedo continua movendo a planta.
      const q = pts[pts.length - 1]
      const p = m.containerPointToLatLng(q)
      const novo: Ponto = [Math.round(p.lng * 10) / 10, Math.round(-p.lat * 10) / 10]
      const lista = cantos.current
      if (comprimento >= 12) {
        // arrastar a partir de um canto move o canto: da área aberta ou, sem área aberta, de uma
        // área de linhas retas já gravada deste caminhão
        const ini = m.containerPointToLatLng(pts[0])
        const alcance = 22 / escala
        const i = cantoPerto(lista, ini.lng, -ini.lat, alcance)
        if (i >= 0) {
          const movida = moverCanto(lista, i, novo)
          if (ladosSeCruzam(movida, false) && !ladosSeCruzam(lista, false)) return setMsg(AVISO_DO_CANTO.cruza)
          return trocarCantos(movida)
        }
        if (lista.length === 0) {
          for (const a of areasPorPlanta(camAtual.raiz).get(planta.id) ?? []) {
            if (!temCantosEditaveis(a.contorno)) continue
            const k = cantoPerto(a.contorno, ini.lng, -ini.lat, alcance)
            if (k >= 0) return moverCantoGravado(a, k, novo)
          }
        }
      }
      if (lista.length >= 3) {
        const c0 = m.latLngToContainerPoint(ll(lista[0]))
        if (Math.hypot(c0.x - q[0], c0.y - q[1]) <= 22) return fecharRetas()
      }
      const ult = lista[lista.length - 1]
      if (ult && Math.hypot(ult[0] - novo[0], ult[1] - novo[1]) * escala < 4) return // toque repetido
      trocarCantos([...lista, novo])
      return
    }
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
    salvarArea(contorno)
  }

  const ultimaBorracha = useRef(0)
  /** Ações desta tela que o "Desfazer" volta (desfazer.ts). Só na memória: ao sair, zera. */
  const pilhaDesfazer = useRef<AcaoDoMapa[]>([])
  const guardar = (tipo: AcaoDoMapa['tipo'], caminhao: string, planta: string, passos: PassoDoDesfazer[]) => {
    pilhaDesfazer.current = guardarAcao(pilhaDesfazer.current, { tipo, caminhao, planta, passos })
  }
  const repor = (a: Area): PassoDoDesfazer => ({ tipo: 'repor', planta_ref: a.planta_ref, contorno: a.contorno.map(([x, y]): Ponto => [x, y]), alvo: a.alvo ?? null })
  const voltarContorno = (a: Area): PassoDoDesfazer => ({ tipo: 'voltar', raiz: a.raiz, contorno: a.contorno.map(([x, y]): Ponto => [x, y]) })
  /** Borracha: apaga a área do caminhão escolhido que está no ponto tocado (só ela). */
  const apagarNoPonto = (x: number, y: number) => {
    if (!planta || !camAtual || !pode) return
    // o mesmo toque pode chegar duas vezes (pela caneta e pelo clique do mapa): vale só o primeiro
    const agora = Date.now()
    if (agora - ultimaBorracha.current < 500) return
    ultimaBorracha.current = agora
    const cam = camAtual
    const plantaId = planta.id
    const pavId = pav?.id
    const trecho = planta.trecho
    enfileirar(async () => {
      const d = await carregar(obra.id)
      const alvo = areaNoPonto((d.areasDe.get(cam.raiz) ?? []).filter((a) => naPlanta(a, plantaId)), x, y)
      if (!alvo) return setMsg(`Toque dentro de uma área do caminhão ${cam.sequencia}.`)
      await cancelar('caminhao_areas', obra.id, usuario.id, alvo)
      guardar('apagar', cam.raiz, plantaId, [repor(alvo)])
      await recalcular(cam.raiz)
      const laje = pavId ? await acertarLaje(cam.raiz, pavId, trecho) : null
      await recarregar()
      setMsg(laje === 'saiu' ? `Área apagada. A ${nomeDaLaje(trecho)} também saiu.` : 'Área apagada.')
    })
  }
  aoClicarMapa.current = (x, y) => {
    if (atual.current.borracha) apagarNoPonto(x, y)
  }

  /**
   * Borracha de trecho: tira das áreas do caminhão o pedaço coberto pelo traço (recorte.ts). A
   * área que muda vira linha nova que substitui a anterior; se o traço parte a área em duas, o
   * segundo pedaço é uma área nova com a mesma caneta; área toda coberta é cancelada.
   */
  const recortarComTraco = (traco: Ponto[], areaMinima: number) => {
    if (!planta || !camAtual || !pode) return
    const cam = camAtual
    const plantaId = planta.id
    const pavId = pav?.id
    const trecho = planta.trecho
    enfileirar(async () => {
      const d = await carregar(obra.id)
      let mudaram = 0
      let furo = false
      let falhou = false
      const passos: PassoDoDesfazer[] = []
      for (const a of (d.areasDe.get(cam.raiz) ?? []).filter((x) => naPlanta(x, plantaId))) {
        const r = recortar(a.contorno, traco, areaMinima)
        if (r.tipo === 'furo') furo = true
        else if (r.tipo === 'falhou') falhou = true
        else if (r.tipo === 'some') {
          await cancelar('caminhao_areas', obra.id, usuario.id, a)
          passos.push(repor(a))
          mudaram++
        } else if (r.tipo === 'sobra') {
          await corrigir('caminhao_areas', obra.id, usuario.id, a, { contorno: r.contornos[0] })
          passos.push(voltarContorno(a))
          for (const extra of r.contornos.slice(1)) {
            const nova = await registrar('caminhao_areas', obra.id, usuario.id, { caminhao_id: cam.raiz, planta_ref: a.planta_ref, contorno: extra, alvo: a.alvo ?? null })
            passos.push({ tipo: 'tirar', raiz: nova.id })
          }
          mudaram++
        }
      }
      guardar('recorte', cam.raiz, plantaId, passos)
      if (mudaram === 0) {
        return setMsg(
          furo
            ? 'A borracha precisa cruzar a borda da área: o app não guarda furo no meio.'
            : falhou
              ? 'Não deu para recortar com este traço. Tente um traço mais simples, sem cruzar por cima dele mesmo.'
              : `O traço não pegou nenhuma área do caminhão ${cam.sequencia}.`,
        )
      }
      await recalcular(cam.raiz)
      const laje = pavId ? await acertarLaje(cam.raiz, pavId, trecho) : null
      await recarregar()
      const texto = mudaram === 1 ? 'Pedaço apagado.' : `Pedaço apagado em ${mudaram} áreas.`
      setMsg(laje === 'saiu' ? `${texto} A ${nomeDaLaje(trecho)} também saiu.` : texto)
    })
  }

  /** Move um canto de uma área já gravada (linha nova que substitui a anterior) e recalcula as peças. */
  const moverCantoGravado = (area: Area, i: number, novo: Ponto) => {
    if (!planta || !camAtual) return
    const cam = camAtual
    const pavId = pav?.id
    const trecho = planta.trecho
    const escala = Math.pow(2, mapa.current?.getZoom() ?? 0)
    const contorno = moverCanto(area.contorno, i, novo)
    // área cruzada, pequena ou achatada numa lasca: nada é gravado e o canto fica onde estava
    const problema = problemaDoCanto(area.contorno, contorno, escala)
    if (problema) return setMsg(AVISO_DO_CANTO[problema])
    const plantaId = planta.id
    enfileirar(async () => {
      const d = await carregar(obra.id)
      const vigente = (d.areasDe.get(cam.raiz) ?? []).find((a) => a.id === area.id)
      if (!vigente) return
      await corrigir('caminhao_areas', obra.id, usuario.id, vigente, { contorno })
      guardar('canto', cam.raiz, plantaId, [voltarContorno(vigente)])
      await recalcular(cam.raiz)
      if (pavId) await acertarLaje(cam.raiz, pavId, trecho)
      await recarregar()
      setMsg('Canto movido.')
    })
  }

  /** Grava a área desenhada (traço livre ou linhas retas) e recalcula as peças do caminhão. */
  const salvarArea = (contorno: Ponto[]) => {
    if (!planta || !camAtual) return
    // mostra já (antes de gravar), para a tela responder na hora
    L.polygon(contorno.map(ll), { renderer: desenho.current!, interactive: false, color: atual.current.cor, weight: 3, fillOpacity: 0.18 }).addTo(
      grupoAreas.current!,
    )
    const cam = camAtual
    const alvo = atual.current.alvo
    const pavId = pav?.id
    const trecho = planta.trecho
    const plantaId = planta.id
    enfileirar(async () => {
      const nova = await registrar('caminhao_areas', obra.id, usuario.id, { caminhao_id: cam.raiz, planta_ref: planta.ref, contorno, alvo })
      guardar('desenho', cam.raiz, plantaId, [{ tipo: 'tirar', raiz: nova.id }])
      const antes = (await carregar(obra.id)).pecasDe.get(cam.raiz)
      const mud = await recalcular(cam.raiz)
      // caneta com laje: a área desenhada é a parte da laje que o caminhão encheu, então a
      // laje do trecho entra no caminhão junto (a forma não traz o contorno dela)
      const lajeEntrou = canetaComLaje(alvo) && pavId ? (await acertarLaje(cam.raiz, pavId, trecho)) === 'entrou' : false
      await recarregar()
      // só as que entraram agora: peça que já estava (ou que foi tirada no toque) não conta
      const entraram = mud.filter((x) => {
        const e = antes?.get(x.elemento_id)
        return x.incluido && !e?.incluido && e?.origem !== 'manual'
      }).length
      const texto = entraram > 0 ? `${plural(entraram, 'peça entrou', 'peças entraram')} no caminhão ${cam.sequencia}.` : 'Área salva, sem peça nova dentro.'
      setMsg(lajeEntrou ? `${texto} A ${nomeDaLaje(trecho)} também entrou.` : texto)
    })
  }

  aoTocarPeca.current = (id) => {
    const nome = planta?.elementos.find((e) => e.id === id)?.nome ?? 'Peça'
    // borracha ligada: o toque apaga área (aoClicarMapa), não marca peça
    if (atual.current.borracha) return
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
      const areas = (d.areasDe.get(cam.raiz) ?? []).filter((a) => naPlanta(a, plantaId))
      // volta a última ação desta tela (desenho, borracha, recorte, canto ou "apagar áreas"): o
      // Desfazer não apaga mais "a área mais recente", que depois de um recorte era o que sobrou
      const ultima = tirarUltima(pilhaDesfazer.current, cam.raiz, plantaId)
      if (!ultima) {
        return setMsg(
          areas.length === 0
            ?'Este caminhão não tem área desenhada nesta planta.'
            : 'Nada para desfazer desde que a planta abriu. Para tirar uma área, use a Borracha.',
        )
      }
      pilhaDesfazer.current = ultima.resto
      const plano = planoDoDesfazer(ultima.acao, areas)
      for (const a of plano.tirar) await cancelar('caminhao_areas', obra.id, usuario.id, a)
      for (const v of plano.voltar) await corrigir('caminhao_areas', obra.id, usuario.id, v.area, { contorno: v.contorno })
      for (const r of plano.repor) await registrar('caminhao_areas', obra.id, usuario.id, { caminhao_id: cam.raiz, ...r })
      if (plano.tirar.length + plano.voltar.length + plano.repor.length === 0)
        return setMsg('Não deu para desfazer: a área já mudou (em outro aparelho, por exemplo).')
      await recalcular(cam.raiz)
      const laje = pavId ? await acertarLaje(cam.raiz, pavId, trecho) : null
      await recarregar()
      const texto = TEXTO_DO_DESFAZER[ultima.acao.tipo] + (plano.perdidos > 0 ? ' Parte dela já tinha mudado e ficou como estava.' : '')
      setMsg(laje ? `${texto} A ${nomeDaLaje(trecho)} também ${laje}.` : texto)
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
      const passos: PassoDoDesfazer[] = []
      for (const a of d.areasDe.get(cam.raiz) ?? []) {
        if (!naPlanta(a, plantaId)) continue
        await cancelar('caminhao_areas', obra.id, usuario.id, a)
        passos.push(repor(a))
      }
      guardar('tudo', cam.raiz, plantaId, passos)
      await recalcular(cam.raiz)
      const laje = pavId ? await acertarLaje(cam.raiz, pavId, trecho) : null
      await recarregar()
      setMsg(laje === 'saiu' ? `Áreas apagadas. A ${nomeDaLaje(trecho)} também saiu.` : 'Áreas apagadas.')
    })
  }

  // áreas em trecho que não está neste aparelho: não aparecem nem recalculam peça (avisa)
  const areasSemPlanta = camAtual && plantas ? (dados.areasDe.get(camAtual.raiz) ?? []).filter((a) => !plantas.some((p) => naPlanta(a, p.id))) : []

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
  const lajeDesenhadaNoCam = camAtual && planta ? (areasPorPlanta(camAtual.raiz).get(planta.id) ?? []).filter((a) => canetaComLaje(a.alvo)).length : 0
  const nomeDa = (id: string) => dados.pecaPorId.get(id)?.nome ?? planta?.elementos.find((e) => e.id === id)?.nome ?? '?'
  const ordemTipo = (id: string) => ORDEM_DO_TIPO[dados.pecaPorId.get(id)?.tipo ?? ''] ?? 9

  return (
    <div class={`cc-mapa-tela${painel ? ' com-painel' : ''}`}>
      <header class="cc-mapa-topo">
        <div class="cc-mapa-linha">
          <button type="button" class="cc-voltar" onClick={voltar} aria-label="Voltar" title="Voltar">
            <span aria-hidden="true">‹</span>
          </button>
          <div class="cc-titulo">
            <h1>{pav?.nome ?? 'Pavimento'}</h1>
            <p class="discreto">
              {camAtual && pode
                ? borracha
                  ? 'Borracha: toque apaga a área · traço em volta tira o pedaço'
                  : `Caneta marca ${NOME_DA_CANETA[canetaAlvo].toLowerCase()}${retas ? ' por linhas retas' : ''} · dedo move e marca peça`
                : 'Toque numa peça para ver os caminhões'}
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
          <div class="cc-chips cc-canetas">
            {/* celular: as seis não cabem em uma linha, então um seletor; tablet e PC: os botões */}
            <label class="cc-canetas-seletor">
              <span class="discreto">Caneta:</span>
              <select value={canetaAlvo} aria-label="Caneta" data-testid="caneta-seletor" onChange={(e) => ehCaneta(e.currentTarget.value) && trocarCaneta(e.currentTarget.value)}>
                {CANETAS.map((a) => (
                  <option key={a} value={a}>
                    {NOME_DA_CANETA[a]}
                  </option>
                ))}
              </select>
            </label>
            <div class="cc-canetas-botoes" role="group" aria-label="Caneta">
              <span class="discreto">Caneta:</span>
              {CANETAS.map((a) => (
                <button type="button" key={a} class={`cc-chip${canetaAlvo === a ? ' on' : ''}`} aria-pressed={canetaAlvo === a} data-testid={`caneta-${a}`} onClick={() => trocarCaneta(a)}>
                  {NOME_DA_CANETA[a]}
                </button>
              ))}
            </div>
            <button
              type="button"
              class={`cc-chip cc-retas-liga${retas && !borracha ? ' on' : ''}`}
              aria-pressed={retas && !borracha}
              data-testid="modo-retas"
              title="Desenhar a área por linhas retas, tocando os cantos" aria-label="Linhas retas"
              onClick={() => {
                // com a borracha ligada, o toque em "Retas" volta para as linhas retas
                trocarRetas(borracha ? true : !retas)
                setBorracha(false)
              }}
            >
              Retas
            </button>
            <button
              type="button"
              class={`cc-chip cc-retas-liga${borracha ? ' on' : ''}`}
              aria-pressed={borracha}
              data-testid="modo-borracha"
              title="Apagar uma área: toque nela"
              onClick={() => trocarBorracha(!borracha)}
            >
              Borracha
            </button>
          </div>
        )}
      </header>

      {planta && camAtual && pode && borracha && (
        <div class="cc-retas-ancora">
          <div class="cc-retas cc-borracha" role="group" aria-label="Borracha" data-testid="barra-borracha">
            <button type="button" class="principal" onClick={() => setBorracha(false)} data-testid="borracha-pronto">
              Pronto
            </button>
            <span class="discreto">Toque na área para apagar · contorne um pedaço para tirar só ele</span>
          </div>
        </div>
      )}

      {planta && camAtual && pode && retas && !borracha && (
        // no alto da planta, fora do .cc-mapa pelo mesmo motivo dos botões de zoom (a caneta não desenha em cima)
        <div class="cc-retas-ancora">
          <div class="cc-retas" role="group" aria-label="Linhas retas" data-testid="barra-retas">
          <span class="discreto">{nCantos === 0 ? 'Toque os cantos da área · arraste um canto para mover' : plural(nCantos, 'canto', 'cantos')}</span>
          <button type="button" onClick={() => trocarCantos(cantos.current.slice(0, -1))} disabled={nCantos === 0} data-testid="retas-tirar">
            Tirar canto
          </button>
          <button type="button" class="principal" onClick={fecharRetas} disabled={nCantos < 3} data-testid="retas-fechar">
            Fechar área
          </button>
          </div>
        </div>
      )}

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
            {painel ? 'Esconder painel' : 'Mostrar painel'} <Icone id={painel ? 'abrir' : 'recolher'} />
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
                  {plural(areasSemPlanta.length, 'área está', 'áreas estão')} num trecho que não está neste aparelho. Baixe o trecho na
                  tela inicial da FVS para ver no mapa.
                </p>
              )}
              {areasRevisaoAntiga.length > 0 && (
                <p class="aviso" data-testid="aviso-revisao">
                  {plural(areasRevisaoAntiga.length, 'área foi desenhada', 'áreas foram desenhadas')} na revisão{' '}
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
              {lajeDesenhadaNoCam > 0 && (
                <p class="cc-laje-desenhada" data-testid="laje-desenhada">
                  <i style={{ background: corDoCaminhao(camAtual.sequencia) }} /> Laje concretada: {plural(lajeDesenhadaNoCam, 'área desenhada', 'áreas desenhadas')} nesta planta
                </p>
              )}
              <h3>{pecasDoCam.length === 0 ? 'Sem peças' : plural(pecasDoCam.length, 'peça', 'peças')}</h3>
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
                  ? 'Sem concretagens neste pavimento'
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
              {concs.length > 0 && (
                <p class="discreto" data-testid="legenda-laje">
                  Área cheia: laje concretada (desenhada no caminhão). Contorno forte: pilar ou viga.
                </p>
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
          <Icone id={ligada ? 'feito' : 'mais'} />
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
        <p class="discreto">Sem caminhões nesta peça</p>
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
