// Planta de um trecho: toca no local (pilar, viga ou ambiente) e marca a ficha (PVS) no painel.
// A mesma tela serve para a planta de forma (estrutura) e para a planta de ambientes (alvenaria,
// reboco, pintura...): o que muda é o tipo dos locais que vêm no pacote.
// Celular em pé: painel embaixo. Tablet deitado: painel ao lado. Tudo funciona sem internet
// (planta no aparelho, marcações na fila do núcleo).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { lembrarPainel } from '../onde_estava'
import L from 'leaflet'
import { opcoesDeToque } from '../toque'
import { passoDoToque } from '../ciclo_do_toque'
import { canvasDaPlanta, toqueSoNoMapa } from '../toque_canvas'
import 'leaflet/dist/leaflet.css'
import {
  areaComoElemento,
  centroDoContorno,
  fichaInicialDaCaixa,
  fichasDaCaixa,
  problemaDoContorno,
  proximoNomeDeArea,
  type AreaDeLaje,
  type Ponto,
  type TravaDaArea,
} from '../areas'
import { anexarFoto, ligarEntrePecas, localDoRegistro, type PecaParaLigar, avisoHoraNaFrente, travasDaAreaNaObra, baixarPlanta, criarArea, desfazerLote, desmarcarR, ehDeAmbientes, ehDeArmadura, ehDeFuracao, ehDeVedacao, horaNaFrente, marcarLote, mudarArea, observar, podeRegistrar, quemMarcou, reduzirFoto, textoDoErroDeGravacao, marcarPelosFuros, tocarItem, urlDaFoto, voltarItem, ligarDepoisDe, prazoDoItemNaPeca, prazosDoLote, type Contexto } from '../dados'
import { observacaoDoPrazo, perguntaDoLote, perguntaDoPrazo, seloDoPrazo } from '../prazos'
import { ehDaLigacao, maisLigados, pecasNasAreas, temLigacaoEntrePecas, textoDasLigacoes } from '../ligacoes'
import { ehDoConcreto } from '../rastreio'
import { dia, mb, quando } from '../formato'
import { casaComodo, textoDoComodo } from '../busca'
import {
  avisoDoCEletrico,
  ehFuroDeLaje,
  fichaDoFuroSemArea,
  furoConferivel,
  situacaoDoFuroPeloUltimo,
  furoDeLajeEscondido,
  furoDeOutraPlanta,
  furosConferiveisPorArea,
  juntarNumerosPerto,
  multiploDoQuadrado,
  furosDeLajeNasAreas,
  furosNoToque,
  instalacoesDoFuro,
  itemDaInstalacao,
  itemDoFuroDeLaje,
  observacaoDosFuros,
  resultadoDaInstalacao,
  situacaoDoNumeroDaArea,
  textoDoNumeroDaArea,
  ZOOM_DOS_FUROS_DE_LAJE,
  type Instalacao,
} from '../furos_laje'
import { abrirPacoteOuAnterior, dataCurta, filhosDoManifest, NOME_DA_DISCIPLINA, paiDe, rotuloDoFilho, NOME_DA_PARTE, partesDoManifest, pecasNoAparelho, textoDoErroDeDownload, tiposDasPartes, type ElementoPacote, type PacoteAberto } from '../pacote'
import { filtrosDoTrecho } from '../reprovacoes'
import {
  barraNaArea,
  barrasDaArea,
  barraTocada,
  camadasDoPacote,
  itemDasBarras,
  NOME_DA_CAMADA,
  nomeDaBarra,
  observacaoDaBarra,
  observacaoDasErradas,
  resultadoPelasBarras,
  resumoDasBarras,
  situacaoDaBarra,
  type CamadaDeBarras,
} from '../barras'
import {
  daFichaAberta,
  etapasDa,
  itensDasEsquadrias,
  resumoDasEsquadrias,
  fichaDaPeca,
  fichaNaPeca,
  situacaoDaParteNoLocal,
  fichaSoNoApp,
  fichasPara,
  historico,
  maisNovo,
  ordenarFichasAbertas,
  percentualConforme,
  reprovacoesDoItem,
  ROTULO_SITUACAO,
  rotuloRodada,
  situacaoDaFichaAberta,
  itemDosFuros,
  resultadoPelosFuros,
  situacaoDaPeca,
  situacaoDoFuro,
  situacaoDoLocal,
  resumoDosFuros,
  NOME_DO_RESULTADO,
  SO_NO_APP,
  ultimosPorItem,
  type EventoFvs,
  type ItemFicha,
  type Ficha,
  type FichaCampo,
  type Situacao,
  type Resultado,
} from '../situacao'
import { guardarItem, itemGuardado, itemNaPeca, itensParaEscolher, nomeDoItem, proximoDoToque, registroDoItem, resultadoDoItem, resumoDoItem, textoDoResultado, type ItemEscolhido, type ModoDoToque } from '../porItem'
import type { Linha } from '../../nucleo/banco_local'
import { AvisoHora } from './AvisoHora'
import { pecasDoMesmoDesenho } from '../mesmo_desenho'
import { fichaDosPontos, nomeDoPonto, pontoTocado } from '../pontos'
import { anotarToque, esquecerToque, type Toque } from '../toques'
import './escolha.css'
import type { ContextoFvs } from './ModuloFvs'
import { filtrarListaAoAbrir } from './TelaReprovacoes'
import { recortesDoAmbiente } from '../projetos_ambiente'
import { usarCamadas } from './usarCamadas'
import type { AbaDosAmbientes } from '../opcoes_ambientes'
import { fichaValeNoLocal } from '../comodos'
import { esquadriasPorUnidade, pontosPorMetroDasEsquadrias, posicoesDasEsquadrias, zoomDasEsquadrias } from '../esquadrias_longe'

const COR: Record<Situacao, [string, number]> = {
  nada: ['#6b7075', 0.12],
  andamento: ['#c27800', 0.45],
  concretagem: ['#1565c0', 0.5],
  liberado: ['#21751a', 0.5],
  reprovado: ['#b3261e', 0.58],
}
/** Contorno da peça com ficha duplicada no sistema oficial (a cor de dentro é a situação). */
const COR_DUPLICADA = '#6a1b9a'
/** "Por item": a peça com o item em NA (não se aplica), diferente do OK. */
const COR_NA = '#00838f'
/** Tipos de local em que o "Por item" funciona (pilar desde a fatia 1; viga e ambiente desde a fatia 2). */
const TIPOS_POR_ITEM = ['P', 'V', 'A', 'M']
/** Área de laje cobre muita planta: a cor fica mais leve que a das peças, para o desenho continuar legível. */
const OPACIDADE_MAX_AREA = 0.35
const COR_TRACADO = '#1565c0'
/** O nome do "trecho" da planta que tem o pavimento inteiro (pipeline/fvs/folha_unica.py). */
const TRECHO_FOLHA_UNICA = 'Planta inteira'
// sempre a mesma lista vazia: é pela identidade da lista que a tela sabe que nada mudou na peça
const SEM_EVENTOS: EventoFvs[] = []
const SEM_FICHAS: FichaCampo[] = []
/** Tocar perto assim do primeiro canto (em pixels de tela) fecha o polígono. */
const FECHAR_PX = 18
const NOME_TIPO: Record<string, string> = { P: 'Pilar', V: 'Viga', L: 'Laje', A: 'Ambiente', F: 'Furo', E: 'Esquadria', M: 'Parede' }
const PLURAL_TIPO: Record<string, string> = { P: 'Pilares', V: 'Vigas', L: 'Lajes', A: 'Ambientes', E: 'Esquadrias', F: 'Furos', B: 'Barras', M: 'Paredes', I: 'Pontos' }
const ORDEM_TIPOS = ['P', 'V', 'L', 'A', 'E', 'M', 'F', 'B', 'I']
/** Furo e esquadria: um toque cada, dentro do pai (viga, ambiente), pelo item da ficha do pai. */
const ehFilho = (t: string | undefined) => t === 'F' || t === 'E'
/** A aba Esquadrias usa a ficha dos ambientes (o serviço escolhido no topo). */
const tipoDaFicha = (t: string) => (t === 'E' ? 'A' : t)
/** Barra de laje: cor de cada situação (sem conferir em azul, para não sumir no cinza da planta). */
const COR_BARRA: Record<'nada' | 'liberado' | 'reprovado', string> = { nada: '#1565c0', liberado: '#21751a', reprovado: '#b3261e' }
/** Margem do toque na barra (px na tela) e a diferença mínima entre as duas mais perto para escolher uma. */
const TOQUE_BARRA_PX = 40
const FOLGA_BARRA_PX = 4
/** Furo na planta: raio da bolinha (20 px de diâmetro, 21/11: "aumentar tamanho dos furos") e do alvo do dedo (44 px), em px de tela. */
const RAIO_FURO_PX = 10
/** As instalações da laje, na ordem dos itens da ficha (item 4, 19/11). */
const INSTALACOES: readonly Instalacao[] = ['esgoto', 'agua', 'eletrica']
const ALVO_FURO_PX = 22
/** Limites de um desenho da planta: polígono ou a bolinha do furo. */
const limitesDaCamada = (l: L.Path): L.LatLngBounds =>
  l instanceof L.CircleMarker ? L.latLngBounds(l.getLatLng(), l.getLatLng()) : (l as L.Polygon).getBounds()
/** Nome do ambiente por cima da planta: só aparece quando cabe no cômodo (tamanho na tela, em px). */
const ROTULO_PX = { largura: 40, altura: 14 }
/** Apartamento com mais ambientes que isto (a área comum) não mostra os atalhos no painel. */
const MAX_ATALHOS = 40
const semAcento = (t: string) => t.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase()

const ll = ([x, y]: [number, number]): L.LatLngTuple => [-y, x]
const caixa = (r: readonly number[]) => L.latLngBounds([-r[1], r[0]], [-r[3], r[2]])

/**
 * Enquadra as peças e, se sobra altura (celular em pé), encosta o desenho embaixo do topo. Centrado, a
 * faixa vazia de mapa em cima, escura como o topo, parecia parte do cabeçalho: o desenho só começava
 * em ~440 de 812 px (testador com a obra piloto, 20/11). A sobra vai para baixo, onde abre o painel.
 */
function enquadrarNoTopo(m: L.Map, b: L.LatLngBounds, limites: L.LatLngBounds) {
  // o limite do mapa, menor que a tela, puxaria o desenho de volta para o meio: solta e depois inclui a vista
  m.setMaxBounds(null as unknown as L.LatLngBounds)
  m.fitBounds(b, { animate: false })
  const z = m.getZoom()
  const alto = m.project(b.getSouthEast(), z).y - m.project(b.getNorthWest(), z).y
  const sobra = m.getSize().y - alto
  if (sobra <= 2) {
    m.setMaxBounds(limites)
    return
  }
  m.panBy([0, sobra / 2], { animate: false })
  // o limite volta com o lado de baixo só até onde precisa: com menos zoom que este (tela maior que o
  // limite), o Leaflet centraliza no meio do limite, e o meio fica onde o desenho continua no alto
  const vista = m.getBounds()
  const norte = limites.getNorth()
  const sul = Math.min(limites.getSouth(), 2 * vista.getNorth() - (vista.getNorth() - vista.getSouth()) - norte)
  m.setMaxBounds(L.latLngBounds([sul, limites.getWest()], [norte, limites.getEast()]))
}

interface Props {
  ctx: ContextoFvs
  plantaId: string
  /** abre centrada nesta peça, com o painel aberto (vindo da lista de reprovações) */
  pecaInicial?: string
  fichaCampoInicial?: string
  itemInicial?: number
  /** planta de ambientes aberta pelo menu do pavimento (opcoes_ambientes.ts): o serviço (código da ficha) */
  servicoInicial?: string
  /** e a aba: "ambientes" ou "esquadrias" */
  abaInicial?: AbaDosAmbientes
  /** aba da forma aberta por uma opção da Estrutura no início (P, V, L, F, B; 21/11/2026) */
  tipoInicial?: string
  aviso: string
}

export function TelaPlanta({ ctx, plantaId, pecaInicial, fichaCampoInicial, itemInicial, servicoInicial, abaInicial, tipoInicial, aviso }: Props) {
  const { dados, props, online, ir, voltar, recarregar, registrados, sistema } = ctx
  const { usuario, obra } = props
  const planta = dados.plantaPorId.get(plantaId)!
  const irmas = dados.plantasDe.get(planta.pavimento_id) ?? [planta]
  const pavimento = dados.pavimentos.find((p) => p.id === planta.pavimento_id)
  const pode = podeRegistrar(obra.papel)

  const [pacote, setPacote] = useState<PacoteAberto | null | undefined>(undefined)
  /** Muda quando um pacote acaba de chegar: abre de novo. */
  const [pacoteChegou, setPacoteChegou] = useState(0)
  /** Percentual do download desta planta, feito daqui mesmo. */
  const [baixando, setBaixando] = useState<number | null>(null)
  const [erroBaixar, setErroBaixar] = useState('')
  // o registro guarda a revisão que estava na tela, que pode ser a anterior (ver revisoes.ts)
  // a barra de laje grava em barra_id (não está em elementos), e a área em area_id
  const c: Contexto = {
    obraId: obra.id,
    usuarioId: usuario.id,
    plantaId: pacote?.manifest.planta_id ?? plantaId,
    areas: dados.areaPorId,
    // barra_id = local de sobreposição do pacote: barra de laje ou ponto de instalação (7_instalacoes.md)
    barras: { has: (id: string) => !!pacote?.manifest.barras?.[id] || !!pacote?.manifest.pontos?.[id] },
  }
  const [tipoEscolhido, setTipo] = useState(abaInicial === 'esquadrias' ? 'E' : abaInicial === 'ambientes' ? 'A' : (tipoInicial ?? 'P'))
  /** Polígono sendo desenhado: área nova ou contorno novo de uma área (areaId). */
  const [desenho, setDesenho] = useState<{ pontos: Ponto[]; areaId?: string } | null>(null)
  /** A caixa que liga o polígono desenhado a uma ficha. */
  const [caixaNova, setCaixaNova] = useState<{ contorno: Ponto[]; nome: string; fichaId: string; codigo: string } | null>(null)
  const [etapa, setEtapa] = useState('')
  const { sel, abrirPainel, fecharPainel, zoom, abrirZoom, fecharZoom, abrirSobre, fecharSobre, sair } = usarCamadas(pecaInicial)
  // a peça do painel fica guardada: reabrir o Chrome volta nela (onde_estava.ts)
  useEffect(() => lembrarPainel(obra.id, sel), [obra.id, sel])
  const [codigoFicha, setCodigoFicha] = useState<Record<string, string>>((): Record<string, string> => (servicoInicial ? { A: servicoInicial } : {}))
  /** Aba Esquadrias: o item de vão ou esquadria da ficha do serviço que as esquadrias marcam. */
  const [itemDaEsquadria, setItemDaEsquadria] = useState<{ n: number; titulo: string } | null>(null)
  const [pincel, setPincel] = useState<{ etapa: string; resultado: 'C' | 'NA' } | null>(null)
  const [msg, setMsg] = useState<{ texto: string; desfazer?: () => void } | null>(null)
  const relogioDoAviso = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(relogioDoAviso.current), [])
  const ultimaDoPincel = useRef<string | null>(null)
  /** Modo "Por item" (18/11): um item da ficha, marcado peça a peça na planta (no tipo em que foi escolhido). */
  const [porItem, setPorItem] = useState<(ItemEscolhido & { tipo: string }) | null>(null)
  /** O que o toque marca no "Por item": OK (tocando de novo, NC) ou NA. */
  const [modoItem, setModoItem] = useState<ModoDoToque>('C')
  /** Pilar com o item OK que a pessoa tocou de novo: espera a observação e o Confirmar para gravar o NC. */
  const [ncDoItem, setNcDoItem] = useState<{ id: string; texto: string } | null>(null)
  const [verLegenda, setVerLegenda] = useState(false)

  // Fila de gravação: toques seguidos são gravados um depois do outro, sem bloquear os botões
  // e sem perder toque. Cada passo lê os registros mais novos (o toque anterior já conta).
  const fila = useRef<Promise<unknown>>(Promise.resolve())
  const atuais = useRef(dados)
  atuais.current = dados
  const executar = (passo: (eventosDe: (id: string) => EventoFvs[]) => Promise<Linha | Linha[] | void>) => {
    fila.current = fila.current
      .then(() => passo((id) => atuais.current.eventosDe.get(id) ?? []))
      .then(async (gravado) => {
        // registro novo entra direto nos dados da tela; só o que não devolve registro (foto) relê o aparelho
        if (gravado) atuais.current = registrados(Array.isArray(gravado) ? gravado : [gravado])
        else atuais.current = await recarregar()
      })
      .catch(async (e) => {
        console.error('FVS: gravação falhou', e)
        avisar(textoDoErroDeGravacao(e))
        // lote que parou no meio: a tela mostra o que ficou gravado de verdade
        atuais.current = await recarregar().catch(() => atuais.current)
      })
    return fila.current
  }

  useEffect(() => {
    let vivo = true
    abrirPacoteOuAnterior(plantaId, (dados.anterioresDe.get(plantaId) ?? []).map((a) => a.id)).then((p) => {
      if (!vivo) return p?.fechar()
      // revisão nova cadastrada com esta planta aberta: continua no mesmo pacote, sem mexer na tela
      setPacote((atual) => {
        if (atual && p && atual.manifest.planta_id === p.manifest.planta_id) {
          p.fechar()
          return atual
        }
        return p
      })
    })
    return () => {
      vivo = false
    }
  }, [plantaId, pacoteChegou])
  useEffect(() => () => pacote?.fechar(), [pacote])

  const tamanhoDaPlanta = (planta.manifest?.tamanho ?? 0) + (planta.pacote?.tamanho ?? 0)
  /** Baixa daqui mesmo a planta vigente deste trecho e passa a mostrar ela. */
  const baixarEsta = async () => {
    setErroBaixar('')
    setBaixando(0)
    try {
      let ultimo = 0
      await baixarPlanta(planta, { obraId: obra.id, usuarioId: usuario.id }, (f) => {
        const pct = Math.floor(f * 100)
        if (pct !== ultimo) {
          ultimo = pct
          setBaixando(pct)
        }
      })
      setPacoteChegou((n) => n + 1)
    } catch (e) {
      setErroBaixar(textoDoErroDeDownload(e))
    } finally {
      setBaixando(null)
    }
  }

  const manifest = pacote?.manifest
  // áreas de laje desenhadas nesta planta (as coordenadas só valem no trecho em que foram desenhadas)
  const areasDoPavimento = dados.areasDe.get(planta.pavimento_id)
  // planta de armadura de laje (uma por direção, 20/11/2026): tem as coordenadas da forma do pavimento, então
  // as áreas de laje desenhadas na forma valem aqui (para o item de armadura de cada área)
  const deArmadura = ehDeArmadura(planta)
  // planta de furos de laje de uma camada (21/11/2026): também nas coordenadas da forma, com as áreas dela
  const deFuracao = ehDeFuracao(planta)
  const setorDasAreas =
    deArmadura || deFuracao
      ? (() => {
          const doPav = (dados.plantasDe.get(planta.pavimento_id) ?? []).filter((p) => !ehDeAmbientes(p) && !ehDeArmadura(p) && !ehDeFuracao(p) && !ehDeVedacao(p))
          // a forma (estrutura) antes das plantas de instalações, que também têm o fundo dela
          return (doPav.find((p) => p.disciplina === 'estrutura') ?? doPav[0])?.setor_id ?? planta.setor_id
        })()
      : planta.setor_id
  const areasDaPlanta = useMemo(() => (areasDoPavimento ?? []).filter((a) => a.setor_id === setorDasAreas), [areasDoPavimento, setorDasAreas])
  const chaveDasAreas = areasDaPlanta.map((a) => a.versao).join()
  const elementosDasAreas = useMemo(() => new Map(areasDaPlanta.map((a) => [a.id, areaComoElemento(a, manifest?.escala)])), [chaveDasAreas, manifest?.escala])
  /** Peça do pacote ou área de laje. */
  const elementoDe = (id: string): ElementoPacote | undefined => manifest?.elementos[id] ?? elementosDasAreas.get(id)
  const elementos = useMemo(() => [...Object.entries(manifest?.elementos ?? {}), ...elementosDasAreas], [manifest, elementosDasAreas])
  /** Peças que dividem o desenho com outra (P101 e P101a): o toque no desenho pergunta qual. */
  const mesmoDesenho = useMemo(() => pecasDoMesmoDesenho(Object.entries(manifest?.elementos ?? {})), [manifest])
  const [mesmoDesenhoAberto, setMesmoDesenhoAberto] = useState<string[] | null>(null)
  /** Toque que caiu no alvo de dois ou mais furos: a pessoa escolhe qual (20/11). */
  const [qualFuro, setQualFuro] = useState<string[] | null>(null)
  /** O mapa está perto o bastante para os furos de laje aparecerem (zoom ≥ ZOOM_DOS_FUROS_DE_LAJE). */
  const [furosPerto, setFurosPerto] = useState(false)
  /** O mapa está perto o bastante para as bolinhas das esquadrias (esquadrias_longe.ts). */
  const [esquadriasPerto, setEsquadriasPerto] = useState(false)
  /** Zoom (em meios) para o tamanho do quadrado dos furos de viga longe e para juntar números que se tocam. */
  const [zoomDosNumeros, setZoomDosNumeros] = useState(0)
  // tipos de local que esta planta tem (forma: pilares, vigas e as lajes desenhadas; arquitetura: ambientes)
  // planta de instalações (hidro, sanitário; 20/11/2026): só os pontos da disciplina, sem áreas nem peças
  const deInstalacoes = !!manifest?.disciplina
  const pontos = manifest?.pontos
  // a modulação (paredes) não tem área de laje
  const aceitaAreas = !!manifest && !ehDeAmbientes(planta) && !ehDeVedacao(planta) && !deArmadura && !deFuracao && !deInstalacoes && (pode || areasDaPlanta.length > 0)
  /** Furo de laje de outra planta (forma com os furos de laje separados, ou outra camada): fica escondido aqui. */
  const deOutraPlanta = (e: ElementoPacote | undefined) => furoDeOutraPlanta(e, manifest)
  // barras de laje das pranchas de armação (plano A, 18/11): aba Barras, uma camada de cada vez
  const barras = manifest?.barras
  // na planta de armadura, só a direção dela; na forma com a armadura em plantas próprias, nenhuma (sem aba Barras)
  const camadasDasBarras = useMemo(() => {
    const todas = camadasDoPacote(barras)
    if (manifest?.camada) return todas.filter((k) => k === manifest.camada)
    return manifest?.camadas_separadas ? [] : todas
  }, [barras, manifest])
  const [camadaEscolhida, setCamada] = useState<CamadaDeBarras | null>(null)
  const camada: CamadaDeBarras | undefined = camadaEscolhida && camadasDasBarras.includes(camadaEscolhida) ? camadaEscolhida : camadasDasBarras[0]
  /** Barra marcada como errada esperando a observação e o Confirmar (sem confirmar, não grava NC). */
  const [ncDaBarra, setNcDaBarra] = useState<{ id: string; texto: string; embaixo?: boolean } | null>(null)
  /**
   * Situação já pedida de cada barra ou ponto tocado, até a gravação entrar nos dados: com toques rápidos,
   * o 2º toque chega antes do 1º estar gravado e veria a situação velha (21/11).
   */
  const previsto = useRef(new Map<string, { s: Situacao }>())
  const tipos = useMemo(
    () =>
      deArmadura
        ? (['B'] as const).filter(() => camadasDasBarras.length > 0)
        : deInstalacoes
          ? ['I']
          : deFuracao
            ? ['F']
            : ORDEM_TIPOS.filter((t) => (t === 'L' && aceitaAreas) || (t === 'B' && camadasDasBarras.length > 0) || elementos.some(([, e]) => e.tipo === t && !deOutraPlanta(e))),
    [elementos, aceitaAreas, camadasDasBarras, deArmadura, deFuracao, deInstalacoes],
  )
  const tipo = tipos.includes(tipoEscolhido) ? tipoEscolhido : (tipos[0] ?? 'P')
  // o modo "Por item" só vale na aba em que o item foi escolhido e fora do desenho de área
  const porItemAtivo = porItem && porItem.tipo === tipo && TIPOS_POR_ITEM.includes(tipo) && !desenho ? porItem : null
  // trocou de aba: o modo desliga (volta só tocando de novo em "Por item")
  useEffect(() => {
    if (porItem && porItem.tipo !== tipo) setPorItem(null)
  }, [tipo])

  // folha única tem a obra inteira do pavimento (até 850 peças): cada desenho da tela pergunta a
  // ficha e a situação de todas, e o toque tem que responder em 0,1 s. Só calcula uma vez por desenho.
  const fichaDoTipo = new Map<string, Ficha | undefined>()
  const fichaDe = (t: string): Ficha | undefined => {
    if (fichaDoTipo.has(t)) return fichaDoTipo.get(t)
    const fs = fichasPara(t, dados.fichas)
    const f = fs.find((x) => x.codigo === codigoFicha[t]) ?? fs[0]
    fichaDoTipo.set(t, f)
    return f
  }
  // ficha × tipo de cômodo (pacote, `sem_fichas`): com o serviço escolhido, o cômodo em que ele não vale fica
  // apagado, sem marcação e fora da contagem (piso cerâmico no quarto, drywall na sacada...)
  const codigoDoServico = fichaDe('A')?.codigo
  const foraDoServico = (e: ElementoPacote) => !fichaValeNoLocal(e, codigoDoServico)
  const fichasTipo = fichasPara(tipoDaFicha(tipo), dados.fichas)
  const fichaTipo = fichaDe(tipoDaFicha(tipo))
  // aba Esquadrias: os itens de esquadria do serviço escolhido e o que as esquadrias marcam agora
  const itensDeEsquadria = itensDasEsquadrias(fichaDe('A'))
  const itemEsq = itensDeEsquadria.find((i) => itemDaEsquadria && i.n === itemDaEsquadria.n && i.titulo === itemDaEsquadria.titulo) ?? itensDeEsquadria[0]
  const etapas = fichaTipo ? etapasDa(fichaTipo) : []
  // etapa escolhida numa ficha pode não existir na outra (trocou de serviço ou de pilar para viga)
  const etapaAtiva = etapas.includes(etapa) ? etapa : ''
  const eventosDe = (id: string): EventoFvs[] => dados.eventosDe.get(id) ?? SEM_EVENTOS
  const fichaPorId = (id: string) => dados.fichaPorId.get(id)
  const abertasDe = (id: string): FichaCampo[] => dados.fichasCampoDe.get(id) ?? SEM_FICHAS
  /** A ficha desta peça: a vigente ou, se ela já foi marcada numa revisão anterior, essa. A área de laje tem a sua. */
  /** consolo e capitel que o pilar tem nesta planta (o pacote diz) */
  const partesDe = (id: string) => tiposDasPartes(manifest?.elementos[id])
  const fichaDoLocal = (id: string, t: string) => {
    const area = dados.areaPorId.get(id)
    return area ? fichaPorId(area.ficha_id) : fichaNaPeca(fichaDaPeca(fichaDe(t), eventosDe(id), fichaPorId), partesDe(id))
  }
  /** Situação do consolo ou capitel do pilar, só pelos itens da parte (undefined: a ficha não tem). */
  const situacaoDaParte = (id: string, parte: string) => situacaoDaParteNoLocal(fichaDoLocal(id, 'P'), abertasDe(id), fichaPorId, eventosDe(id), parte)
  const partesDaPlanta = useMemo(() => (manifest ? partesDoManifest(manifest) : []), [manifest])
  /** Consolo e capitel pendentes dentro da área de laje: ela fica vermelha (decisão do Nicolas, 17/11). */
  const travasDe = (id: string) => {
    const area = dados.areaPorId.get(id)
    return area && partesDaPlanta.length ? travasDaAreaNaObra(dados, area, partesDaPlanta, situacaoDaParte) : []
  }
  // O toque muda os registros de uma peça só: as outras continuam com a mesma lista e não recalculam.
  const situacaoGuardada = useRef(new Map<string, { eventos: EventoFvs[]; abertas: FichaCampo[]; ficha: Ficha | undefined; etapa: string | undefined; s: Situacao }>())
  /**
   * Furos de laje desta planta, cada um com a área de laje em que cai (item 4, decisão do Nicolas de
   * 19/11): a área é desenhada no app, então a ligação é calculada aqui e refeita quando uma área muda.
   */
  const furosDeLaje = useMemo(() => furosDeLajeNasAreas(manifest?.elementos, areasDaPlanta), [manifest, chaveDasAreas])
  /**
   * Pilares e vigas de cada área de laje, para a ligação entre peças (regras com `entre: 'area'`,
   * 20/11): a peça é da área que contém o centro dela. Sem regra dessas na obra, a conta nem é feita.
   */
  const ligaPecas = temLigacaoEntrePecas(dados.regras)
  const pecasPorArea = useMemo(() => (ligaPecas ? pecasNasAreas(manifest?.elementos, areasDaPlanta) : new Map<string, string[]>()), [ligaPecas, manifest, chaveDasAreas])
  /**
   * As peças de dentro da área como a ligação grava nelas, com os registros mais novos: a ficha de
   * cada uma (a aberta em uso, se houver) sem o item que os furos ou as esquadrias marcam sozinhos.
   * Peça com duas fichas abertas fica de fora: quem decide em qual marcar é a pessoa, pelo painel.
   */
  const pecasParaLigar = (areaId: string): PecaParaLigar[] =>
    (pecasPorArea.get(areaId) ?? []).flatMap((id) => {
      const e = manifest?.elementos[id]
      const abertas = atuais.current.fichasCampoDe.get(id) ?? SEM_FICHAS
      if (!e || abertas.length > 1) return []
      const aberta = abertas[0]
      const evs = atuais.current.eventosDe.get(id) ?? SEM_EVENTOS
      const ficha = aberta ? fichaNaPeca(aberta.ficha_id ? fichaPorId(aberta.ficha_id) : undefined, partesDe(id)) : fichaNaPeca(fichaDaPeca(fichaDe(e.tipo), evs, fichaPorId), partesDe(id))
      if (!ficha) return []
      const semFilhos = filhosPorPai.has(id) ? { ...ficha, itens: ficha.itens.filter((i) => !i.furos && !i.esquadrias) } : ficha
      return [{ id, nome: e.nome, fichas: [semFilhos], eventos: daFichaAberta(evs, aberta?.id ?? null), fichaCampoId: aberta?.id ?? null }]
    })
  /**
   * As ligações depois de um ou mais C num local: os itens ligados do próprio local e, na área de
   * laje, os das peças de dentro dela (os itens que a própria área ganhou pela ligação também puxam).
   */
  const ligar = async (cx: Contexto, id: string, ficha: Ficha, itens: readonly number[], eventos: readonly EventoFvs[]): Promise<Linha[]> => {
    const daqui = await ligarDepoisDe(cx, dados.regras, id, ficha, itens, eventos)
    if (!ligaPecas || !elementosDasAreas.has(id)) return daqui
    const nasPecas = await ligarEntrePecas(cx, dados.regras, elementoDe(id)?.nome ?? 'Laje', ficha, [...itens, ...daqui.map((l) => Number(l.item))], pecasParaLigar(id))
    return [...daqui, ...nasPecas]
  }
  /** Longe (zoom < ZOOM_DOS_FUROS_DE_LAJE): um número por área (laje + viga) ou por quadrado de 6 m (viga fora de área). */
  const numerosDasAreas = useMemo(() => {
    const escala = manifest?.escala ?? 50
    // só os furos desta planta (a forma com os de laje separados conta só os de viga; a planta de uma camada, os dela)
    const daqui = manifest && (manifest.furos_laje || manifest.furos_laje_separados)
      ? Object.fromEntries(Object.entries(manifest.elementos).filter(([, e]) => !deOutraPlanta(e)))
      : manifest?.elementos
    const grupos = furosConferiveisPorArea(daqui, furosDeLaje, areasDaPlanta, escala, multiploDoQuadrado(zoomDosNumeros, escala))
    // número de 44 px de altura e até ~100 px de largura ("110 furos"), convertido para pontos da folha
    const pt = 1 / 2 ** zoomDosNumeros
    return juntarNumerosPerto(grupos, 104 * pt, 48 * pt)
  }, [manifest, furosDeLaje, chaveDasAreas, zoomDosNumeros])
  /** Onde cada esquadria é desenhada: as que caem juntas se afastam (esquadrias_longe.ts). */
  const ptPorMEsq = useMemo(() => pontosPorMetroDasEsquadrias(manifest?.elementos, manifest?.escala), [manifest])
  const posicoesEsq = useMemo(() => posicoesDasEsquadrias(manifest?.elementos, ptPorMEsq), [manifest, ptPorMEsq])
  /**
   * Longe, na aba Esquadrias: um número por apartamento ("12 esquadrias"), juntando os que se tocam. O número
   * fica na esquadria do grupo mais perto do meio dele (o meio de grupos juntos podia cair fora da planta,
   * em cima dos detalhes: testador no S23, 20/11).
   */
  const numerosDasEsquadrias = useMemo(() => {
    const pt = 1 / 2 ** zoomDosNumeros
    return juntarNumerosPerto(esquadriasPorUnidade(manifest?.elementos), 150 * pt, 48 * pt).map((g) => {
      let melhor: [number, number] | null = null
      for (const id of g.ids) {
        const q = posicoesEsq.get(id)
        if (q && (!melhor || Math.hypot(q[0] - g.centro[0], q[1] - g.centro[1]) < Math.hypot(melhor[0] - g.centro[0], melhor[1] - g.centro[1]))) melhor = q
      }
      return melhor ? { ...g, centro: melhor, perto: melhor } : g
    })
  }, [manifest, zoomDosNumeros, posicoesEsq])
  /** Os números de longe da aba atual (Furos ou Esquadrias), ou nenhum se a planta está perto. */
  const numerosDeLonge = tipo === 'F' && !furosPerto ? numerosDasAreas : tipo === 'E' && !esquadriasPerto ? numerosDasEsquadrias : []
  /** Furos de laje de cada área (id da área → ids dos furos, na ordem do nome). */
  const furosPorArea = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const [f, a] of furosDeLaje) if (a) m.set(a.id, [...(m.get(a.id) ?? []), f])
    return m
  }, [furosDeLaje])
  /** Os furos da área com a instalação `inst`, e a situação de cada um (no item do tema dele na ficha da área). */
  const furosDaInstalacao = (areaId: string, ficha: Ficha, inst: Instalacao, evs: (id: string) => EventoFvs[] = eventosDe) =>
    (furosPorArea.get(areaId) ?? []).flatMap((id) => {
      const e = manifest?.elementos[id]
      if (!e || !instalacoesDoFuro(e).includes(inst)) return []
      const it = itemDoFuroDeLaje(e, ficha)
      // pelo registro mais novo: o furo marcado antes da área existir (noutra ficha de laje) conta aqui também
      return it ? [{ id, nome: e.nome, sit: situacaoDoFuroPeloUltimo(daFichaAberta(evs(id), null)) }] : []
    })
  /** As situações dos furos de cada instalação da área (só as que a ficha da área tem item). */
  const instalacoesDaArea = (areaId: string): Partial<Record<Instalacao, Situacao[]>> => {
    const area = dados.areaPorId.get(areaId)
    const ficha = area ? fichaPorId(area.ficha_id) : undefined
    const saida: Partial<Record<Instalacao, Situacao[]>> = {}
    if (!ficha || !furosPorArea.has(areaId)) return saida
    for (const inst of INSTALACOES) if (itemDaInstalacao(ficha, inst)) saida[inst] = furosDaInstalacao(areaId, ficha, inst).map((f) => f.sit)
    return saida
  }
  /** Por que o furo não marca nada (fica só para ver). */
  const furoSemItem = (id: string): string => {
    const e = manifest?.elementos[id]
    if (e?.tipo === 'E') return `${fichaDe('A')?.titulo ?? 'A ficha'} não tem item de esquadria: a esquadria fica só para ver.`
    if (!e || !ehFuroDeLaje(e)) return 'A ficha de viga não tem item de furação: o furo fica só para ver.'
    if (!instalacoesDoFuro(e).length) return `${e.nome} não é de esgoto, água nem elétrica: fica só para ver.`
    if (!furosDeLaje.get(id)) return 'Nenhuma ficha de laje tem o item desta instalação: o furo fica só para ver.'
    return 'A ficha da área não tem o item desta instalação: o furo fica só para ver.'
  }
  /** Filhos de cada local desta planta: furos da viga, esquadrias do ambiente (id do pai → ids). */
  const filhosPorPai = useMemo(() => (manifest ? filhosDoManifest(manifest) : new Map<string, string[]>()), [manifest])
  /** Os filhos do local com a situação de cada um (para o painel e a cor do pai). */
  const filhosDe = (paiId: string) =>
    (filhosPorPai.get(paiId) ?? []).flatMap((f) => {
      const e = manifest?.elementos[f]
      return e ? [{ id: f, nome: e.nome, rotulo: rotuloDoFilho(e.nome, manifest?.elementos[paiId]?.nome), sit: situacao(f, e) }] : []
    })
  /**
   * O item de furação da ficha da viga do furo, que os furos marcam (undefined: a ficha de viga não tem;
   * o furo fica só para ver). A ficha é a da viga: a mesma que o painel da viga mostra.
   */
  const furacaoDe = (furoId: string): { vigaId: string; ficha: Ficha; item: number; laje?: boolean } | undefined => {
    const el = manifest?.elementos[furoId]
    if (ehFuroDeLaje(el)) {
      // furo de laje: o "dono" é a área em que ele cai; o item é o da instalação dele na ficha da área
      const area = furosDeLaje.get(furoId)
      if (!area) {
        // fora de área (21/11): o registro fica no furo, na ficha de laje que tem o item da instalação dele
        const sem = el ? fichaDoFuroSemArea(el, fichasPara('L', dados.fichas), fichaDe('L')) : undefined
        return sem ? { vigaId: '', ficha: sem.ficha, item: sem.item, laje: true } : undefined
      }
      const ficha = fichaPorId(area.ficha_id)
      const it = el && ficha ? itemDoFuroDeLaje(el, ficha) : undefined
      return ficha && it ? { vigaId: area.id, ficha, item: it.item, laje: true } : undefined
    }
    const vigaId = el?.viga
    const ficha = vigaId ? fichaDoLocal(vigaId, 'V') : undefined
    const item = itemDosFuros(ficha)?.n
    return vigaId && ficha && item !== undefined ? { vigaId, ficha, item } : undefined
  }
  /**
   * O item que a esquadria marca: o escolhido na aba Esquadrias, na ficha do ambiente dela (a do serviço
   * escolhido no topo, ou a revisão em que o ambiente já foi marcado). Undefined: a ficha não tem item de esquadria.
   */
  const esquadriaDe = (esqId: string, n?: number): { vigaId: string; ficha: Ficha; item: number } | undefined => {
    const ambId = manifest?.elementos[esqId]?.ambiente
    const ficha = ambId ? fichaDoLocal(ambId, 'A') : undefined
    const its = itensDasEsquadrias(ficha)
    const quer = n !== undefined ? (itensDeEsquadria.find((i) => i.n === n) ?? its.find((i) => i.n === n)) : itemEsq
    const it = (quer && (its.find((i) => i.titulo === quer.titulo) ?? its.find((i) => i.n === quer.n))) ?? its[0]
    return ambId && ficha && it ? { vigaId: ambId, ficha, item: it.n } : undefined
  }
  /** Furo ou esquadria: o pai (vigaId é o id do pai), a ficha dele e o item que o filho marca. */
  const alvoDoFilho = (id: string) => (manifest?.elementos[id]?.tipo === 'E' ? esquadriaDe(id) : furacaoDe(id))
  /** O furo vira o item de furação da viga: OK, errado ou pendente pelo registro dele nesse item. */
  const situacao = (id: string, e: ElementoPacote): Situacao => {
    if (!ehFilho(e.tipo)) return situacaoSo(id, e)
    const f = alvoDoFilho(id)
    if (f && ehFuroDeLaje(e)) return situacaoDoFuroPeloUltimo(eventosDe(id))
    return f ? situacaoDoFuro(f.ficha.id, f.item, eventosDe(id)) : 'nada'
  }
  const situacaoSo = (id: string, e: ElementoPacote): Situacao => {
    // a trava depende dos registros dos pilares, e não só dos da área: fica fora da memória abaixo
    if (e.tipo === 'L' && travasDe(id).length) return 'reprovado'
    const eventos = eventosDe(id)
    const abertas = abertasDe(id)
    const et = e.tipo === tipo ? etapaAtiva || undefined : undefined
    const ficha = fichaDoLocal(id, e.tipo)
    const g = situacaoGuardada.current.get(id)
    if (g && g.eventos === eventos && g.abertas === abertas && g.ficha === ficha && g.etapa === et) return g.s
    const s = situacaoDoLocal(ficha, abertas, fichaPorId, eventos, et, partesDe(id))
    situacaoGuardada.current.set(id, { eventos, abertas, ficha, etapa: et, s })
    return s
  }

  // ------------------------------------------------------------------ modo "Por item" (18/11)
  /** Os itens da ficha da aba (pilar, viga ou o serviço escolhido nos ambientes), sem os automáticos. */
  const itensDoTipo = TIPOS_POR_ITEM.includes(tipo) ? itensParaEscolher(fichaTipo) : []
  /** Onde o item fica guardado no aparelho: por tipo e, nos ambientes, por serviço. */
  const ondeGuardar = (t: string) => (t === 'A' ? `A:${fichaDe('A')?.codigo ?? ''}` : t)
  /**
   * Onde o item escolhido é marcado nesta peça: a ficha dela (a aberta, se houver uma; a da revisão em que
   * ela já foi marcada; ou a vigente) e o item nela. Peça com duas fichas, sem o item ou sem a parte: o aviso.
   */
  const alvoDoItem = (id: string, esc: ItemEscolhido): { ficha: Ficha; item: ItemFicha; cx: Contexto } | { aviso: string } => {
    const e = elementoDe(id)
    const t = e?.tipo ?? tipo
    const nome = e?.nome ?? 'A peça'
    // nos ambientes cada serviço tem a sua ficha aberta: só conta a do serviço escolhido no topo
    const codigo = fichaDe(t)?.codigo
    const abertas = t === 'A' ? abertasDe(id).filter((fc) => (fc.ficha_id ? dados.fichaPorId.get(fc.ficha_id)?.codigo : fc.ficha_codigo) === codigo) : abertasDe(id)
    if (abertas.length > 1) return { aviso: `${nome} tem ${abertas.length} fichas ${sistema ? `no ${sistema.nome}` : 'abertas'}. Saia do "Por item" e escolha a ficha no painel.` }
    const aberta = abertas[0]
    const ficha = aberta ? fichaNaPeca(aberta.ficha_id ? dados.fichaPorId.get(aberta.ficha_id) : undefined, partesDe(id)) : fichaDoLocal(id, t)
    const r = itemNaPeca(ficha, esc)
    if ('falta' in r) {
      if (r.falta === 'parte') return { aviso: `${nome} não tem ${(NOME_DA_PARTE[r.parte ?? ''] ?? r.parte ?? '').toLowerCase()} nesta planta.` }
      if (r.falta === 'ficha') return { aviso: `Não há ficha para ${nome}.` }
      return { aviso: `${nome} está noutra revisão da ficha, sem o item ${nomeDoItem(esc)}. Abra a peça fora do "Por item".` }
    }
    return { ficha: ficha!, item: r.item, cx: { ...c, fichaCampoId: aberta?.id ?? null } }
  }
  /** O item escolhido neste pilar: o resultado, ou 'fora' (não se marca aqui). */
  const resultadoPorItem = (id: string, esc: ItemEscolhido): Resultado | null | 'fora' => {
    const a = alvoDoItem(id, esc)
    if ('aviso' in a) return 'fora'
    return resultadoDoItem(a.ficha, daFichaAberta(eventosDe(id), a.cx.fichaCampoId ?? null), a.item.n)
  }
  const escolherItem = (it: ItemFicha) => {
    const esc = { n: it.n, titulo: it.titulo }
    setPorItem({ ...esc, tipo })
    guardarItem(obra.id, ondeGuardar(tipo), esc)
  }
  /** O item guardado deste tipo (ou o primeiro da ficha). */
  const itemDeVolta = () => {
    const g = itemGuardado(obra.id, ondeGuardar(tipo))
    return itensDoTipo.find((i) => g && i.n === g.n && i.titulo === g.titulo) ?? itensDoTipo[0]
  }
  const entrarPorItem = () => {
    const it = itemDeVolta()
    if (!it) return avisar('A ficha não tem item para marcar por aqui.')
    setPincel(null)
    fecharPainel()
    setModoItem('C')
    escolherItem(it)
  }
  // nos ambientes, trocar o serviço no topo troca a ficha: o item passa ao guardado da ficha nova (ou ao primeiro)
  const codigoDaFichaDoTipo = fichaTipo?.codigo
  useEffect(() => {
    if (!porItemAtivo || tipo !== 'A') return
    if (itensDoTipo.some((i) => i.n === porItemAtivo.n && i.titulo === porItemAtivo.titulo)) return
    const it = itemDeVolta()
    if (it) escolherItem(it)
    else setPorItem(null)
  }, [codigoDaFichaDoTipo])

  function avisar(texto: string, desfazer?: () => void) {
    setMsg({ texto, desfazer })
    window.clearTimeout(relogioDoAviso.current)
    // com o botão de desfazer, dá tempo de ler e de tocar; 8 s ficava tempo demais sobre a planta (obra de demonstração, 13/11)
    relogioDoAviso.current = window.setTimeout(() => setMsg(null), desfazer ? 5000 : 4000)
  }

  /** Aviso de marcação em lote, com "Desfazer": um toque errado no pincel marca a ficha inteira. */
  function avisarLote(texto: string, gravados: readonly Linha[]) {
    if (!gravados.length) return avisar(texto)
    avisar(texto, () => {
      setMsg(null)
      executar(async (evs) => {
        const desfeitos = await desfazerLote(c, gravados, evs)
        avisar(desfeitos.length ? `Desfeito: ${desfeitos.length} ${desfeitos.length === 1 ? 'item' : 'itens'}` : 'Nada a desfazer: os itens já mudaram.')
        return desfeitos
      })
    })
  }

  // ------------------------------------------------------------------ mapa
  const divMapa = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  /** O mapa está no voo da busca (flyToBounds): ver o efeito do painel, que espera o voo acabar. */
  const voando = useRef(false)
  const camadas = useRef(new Map<string, L.Path[]>())
  const grupos = useRef<Map<string, L.LayerGroup> | null>(null)
  const tocarRef = useRef<(id: string) => void>(() => {})
  /** Toque na bolinha do furo: se o alvo de outro furo também pega o ponto, pergunta qual (20/11). */
  const tocarNoFuroRef = useRef<(id: string, pos: L.LatLng) => void>(() => {})
  /** Número de furos de cada área (longe): id da área → marcador e texto. */
  const numerosDeFuros = useRef(new Map<string, { marcador: L.Marker; texto: HTMLElement }>())
  /** Toque no desenho (e não no nome): se o desenho é de mais de uma peça, a pessoa escolhe qual. */
  const tocarDesenhoRef = useRef<(id: string) => void>(() => {})
  const tocarMapaRef = useRef<(pos: L.LatLng) => void>(() => {})
  /** Toque no consolo ou capitel (fora do pilar): abre o pilar com a seção da parte aberta. */
  const tocarParteRef = useRef<(id: string, parte: string) => void>(() => {})
  /** Consolo e capitel desenhados: id do pilar → [tipo da parte, contornos] */
  const camadasDasPartes = useRef(new Map<string, Array<[string, L.Path[]]>>())
  // a seção da parte que o painel abre (tocou no consolo, e não no pilar)
  const [parteAberta, setParteAberta] = useState<string | null>(null)
  // um renderizador só: duas camadas de canvas fariam a de cima engolir o toque na de baixo
  const rendRef = useRef<L.Canvas | null>(null)
  const caixas = useRef(new Map<string, { marcador: L.Marker; texto: HTMLElement }>())
  /** Desenho de cada barra de laje e o grupo de cada camada (só aparece na aba Barras). */
  const camadasDeBarra = useRef(new Map<string, L.Polyline>())
  /** Desenho de cada ponto de instalação e o grupo deles (só aparece na aba Pontos). */
  const marcasDePonto = useRef(new Map<string, L.CircleMarker | L.Polyline>())
  const grupoDosPontos = useRef<L.LayerGroup | null>(null)
  const gruposDasBarras = useRef(new Map<string, L.LayerGroup>())
  /** Alvo invisível de cada furo (44 px): só recebe o toque na aba Furos. */
  const alvosDosFuros = useRef(new Map<string, L.CircleMarker>())
  /** O último estilo de cada polígono: mudar o estilo redesenha a planta, e o toque muda só uma peça. */
  const estilos = useRef(new WeakMap<L.Path, string>())

  useEffect(() => {
    if (!manifest || !pacote || !divMapa.current || mapa.current) return
    const m = L.map(divMapa.current, {
      crs: L.CRS.Simple,
      // folha grande (6.500 pontos) em 375 px precisa de menos que -4 para caber inteira
      minZoom: -6,
      maxZoom: 3,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      zoomControl: false,
      preferCanvas: true,
    })
    const limites = L.latLngBounds([-manifest.altura, 0], [0, manifest.largura])
    const limitesDoMapa = limites.pad(0.15)
    m.setMaxBounds(limitesDoMapa)
    const Tiles = L.GridLayer.extend({
      createTile(coords: L.Coords) {
        const u = pacote.tile(coords.z, coords.x, coords.y)
        // pedaço em branco não vem no pacote (na folha em L, é quase metade). Sem endereço, o navegador
        // desenha uma borda em volta da imagem: um retângulo cinza no meio da planta
        if (!u) return document.createElement('div')
        const img = document.createElement('img')
        img.alt = ''
        img.src = u
        return img
      },
    })
    new (Tiles as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({
      tileSize: manifest.tile,
      minNativeZoom: Math.min(...manifest.niveis),
      maxNativeZoom: Math.max(...manifest.niveis),
      minZoom: -6,
      maxZoom: 3,
      bounds: limites,
      noWrap: true,
      keepBuffer: 4,
    }).addTo(m)
    // abre enquadrando as peças (sem as margens da folha, carimbo e notas): a planta fica maior
    const enquadro = (() => {
      const lista = Object.values(manifest.elementos)
      if (!lista.length) return limites
      const b = caixa(lista[0].rotulo)
      for (const e of lista) {
        b.extend(caixa(e.rotulo))
        for (const p of e.polys) for (const pt of p) b.extend(ll(pt))
      }
      return b.pad(0.03)
    })()
    enquadrarNoTopo(m, enquadro, limitesDoMapa)
    // vindo da lista de reprovações: a peça no meio da tela, com folga em volta para situar
    const pecaAlvo = pecaInicial ? elementoDe(pecaInicial) : undefined
    const irAoAlvo = () => {
      if (!pecaAlvo) return
      const b = caixa(pecaAlvo.rotulo)
      for (const p of pecaAlvo.polys) for (const pt of p) b.extend(ll(pt))
      m.fitBounds(b.pad(1.2), { maxZoom: 0.5, animate: false })
    }
    const rend = canvasDaPlanta({ tolerance: 7, padding: 0.3 })
    rendRef.current = rend
    m.on('click', (ev: L.LeafletMouseEvent) => tocarMapaRef.current(ev.latlng))
    const porTipo = new Map<string, L.LayerGroup>()
    const nomes: Array<{ marcador: L.Marker; zoomMinimo: number }> = []
    for (const [id, e] of Object.entries(manifest.elementos)) {
      let g = porTipo.get(e.tipo)
      if (!g) {
        g = L.layerGroup()
        porTipo.set(e.tipo, g)
      }
      if (e.tipo === 'A') {
        // o número do ambiente não está impresso na prancha de arquitetura: o app escreve por cima
        const texto = document.createElement('span')
        texto.textContent = e.nome
        const centro = caixa(e.rotulo).getCenter()
        const marcador = L.marker(centro, { icon: L.divIcon({ className: 'fv-rot', html: texto, iconSize: [0, 0] }), interactive: false, keyboard: false })
        // cômodo grande ganha o número antes; banheiro e shaft só com mais zoom (1 ponto = 2^zoom px)
        const xs = e.polys.flat().map((pt) => pt[0])
        const ys = e.polys.flat().map((pt) => pt[1])
        const larg = xs.length ? Math.max(...xs) - Math.min(...xs) : 1
        const alt = ys.length ? Math.max(...ys) - Math.min(...ys) : 1
        nomes.push({ marcador, zoomMinimo: Math.log2(Math.max(ROTULO_PX.largura / Math.max(larg, 1), ROTULO_PX.altura / Math.max(alt, 1))) })
      }
      if (ehFilho(e.tipo)) {
        // furo e esquadria: bolinha do mesmo tamanho na tela em qualquer zoom, com alvo de 44 px para o dedo;
        // esquadrias que caem juntas, cada uma um pouco afastada (posicoesDasEsquadrias)
        const afastada = e.tipo === 'E' ? posicoesEsq.get(id) : undefined
        const centro = afastada ? L.latLng(ll(afastada)) : caixa(e.rotulo).getCenter()
        const marca = L.circleMarker(centro, { renderer: rend, radius: RAIO_FURO_PX, weight: 2 })
        const alvo = L.circleMarker(centro, { renderer: rend, radius: ALVO_FURO_PX, stroke: false, fillOpacity: 0, fillColor: '#000' })
        marca.addTo(g)
        alvo.addTo(g)
        marca.on('click', (ev: L.LeafletMouseEvent) => tocarNoFuroRef.current(id, ev.latlng))
        alvo.on('click', (ev: L.LeafletMouseEvent) => tocarNoFuroRef.current(id, ev.latlng))
        camadas.current.set(id, [marca])
        alvosDosFuros.current.set(id, alvo)
        if (e.tipo === 'E') {
          // o código da esquadria (PM80, JA120B) ao lado da bolinha, só quando a largura dela cabe na tela
          const texto = document.createElement('span')
          texto.textContent = e.esquadria?.codigo ?? e.secao
          const marcador = L.marker(centro, { icon: L.divIcon({ className: 'fv-rot fv-rot-esq', html: texto, iconSize: [0, 0] }), interactive: false, keyboard: false })
          const larg = Math.max(e.rotulo[2] - e.rotulo[0], 1)
          nomes.push({ marcador, zoomMinimo: Math.log2(ROTULO_PX.largura / larg) })
        }
        continue
      }
      // alvo invisível em volta do nome: a peça sem contorno também é tocável
      const toque = opcoesDeToque(e.tipo) // viga com margem maior; laje e ambiente de fundo (toque.ts)
      const alvo = L.rectangle(caixa(e.rotulo).pad(0.15), { renderer: rend, stroke: false, fillOpacity: 0, fillColor: '#000', ...toque })
      const formas: L.Path[] = (e.polys.length ? e.polys : [null]).map((p) =>
        p ? L.polygon(p.map(ll), { renderer: rend, weight: 2, ...toque }) : L.rectangle(caixa(e.rotulo), { renderer: rend, weight: 2, dashArray: '4 3', ...toque }),
      )
      // o nome vai direto à peça; o desenho pode ser de mais de uma (P101 e P101a)
      alvo.addTo(g)
      alvo.on('click', () => tocarRef.current(id))
      for (const f of formas) {
        f.addTo(g)
        f.on('click', () => tocarDesenhoRef.current(id))
      }
      camadas.current.set(id, formas)
      // consolo e capitel: tracejados em volta do pilar, no grupo dos pilares
      const doPilar: Array<[string, L.Path[]]> = []
      for (const pt of e.partes ?? []) {
        const desenhos = pt.polys.map((poly) => L.polygon(poly.map(ll), { renderer: rend, weight: 1.5, dashArray: '6 4', ...opcoesDeToque(pt.tipo) }))
        for (const f of desenhos) {
          f.addTo(g)
          f.on('click', () => tocarParteRef.current(id, pt.tipo))
        }
        doPilar.push([pt.tipo, desenhos])
      }
      if (doPilar.length) camadasDasPartes.current.set(id, doPilar)
    }
    for (const t of [...ORDEM_TIPOS].reverse()) porTipo.get(t)?.addTo(m)
    grupos.current = porTipo
    // barras: só desenho, sem toque próprio (o toque vai ao mapa e escolhe a barra mais perto)
    for (const [id, b] of Object.entries(manifest.barras ?? {})) {
      let g = gruposDasBarras.current.get(b.camada)
      if (!g) {
        g = L.layerGroup()
        gruposDasBarras.current.set(b.camada, g)
      }
      const linha = L.polyline(b.linha.map(ll), { renderer: rend, color: COR_BARRA.nada, weight: 2.5, opacity: 0.95, interactive: false })
      linha.addTo(g)
      camadasDeBarra.current.set(id, linha)
    }
    // pontos de instalação: só desenho, como as barras (o toque vai ao mapa e escolhe o ponto mais perto)
    if (manifest.pontos && Object.keys(manifest.pontos).length) {
      const g = L.layerGroup()
      for (const [id, pt] of Object.entries(manifest.pontos)) {
        // eletroduto: linha, como a barra; o resto: círculo
        const marca =
          pt.linha && pt.linha.length >= 2
            ? L.polyline(pt.linha.map(ll), { renderer: rend, color: COR_BARRA.nada, weight: 3, opacity: 0.95, interactive: false })
            : L.circleMarker(ll(pt.ponto), { renderer: rend, radius: 7, color: COR_BARRA.nada, weight: 2.5, fillOpacity: 0.35, interactive: false })
        marca.addTo(g)
        marcasDePonto.current.set(id, marca)
      }
      grupoDosPontos.current = g
    }
    const mostrarNomes = () => {
      const z = m.getZoom()
      for (const { marcador, zoomMinimo } of nomes) {
        if (z < zoomMinimo) marcador.remove()
        else if (!m.hasLayer(marcador)) marcador.addTo(m)
      }
    }
    m.on('zoomend', mostrarNomes)
    // furos de laje: só de perto (longe, o alvo de 44 px cobre metros de obra e o toque pega o furo errado)
    const zEsq = zoomDasEsquadrias(pontosPorMetroDasEsquadrias(manifest.elementos, manifest.escala))
    const verFurosPerto = () => {
      setFurosPerto(m.getZoom() >= ZOOM_DOS_FUROS_DE_LAJE)
      setEsquadriasPerto(m.getZoom() >= zEsq)
      setZoomDosNumeros(Math.floor(m.getZoom() * 2) / 2)
    }
    m.on('zoomend', verFurosPerto)
    mapa.current = m
    if (import.meta.env.DEV) (window as unknown as { __fvMapa: L.Map }).__fvMapa = m
    // o zoom inicial só vale depois que a área do mapa tem tamanho na tela
    const quadro = requestAnimationFrame(() => {
      m.invalidateSize()
      enquadrarNoTopo(m, enquadro, limitesDoMapa)
      irAoAlvo()
      mostrarNomes()
      verFurosPerto()
    })
    // Tela mudou de tamanho (girou o aparelho, por exemplo): enquanto a pessoa não mexeu na
    // planta, ela continua enquadrada inteira; depois disso, fica onde a pessoa deixou.
    let mexeu = !!pecaAlvo
    const marcarMexeu = () => {
      mexeu = true
    }
    const area = m.getContainer()
    area.addEventListener('pointerdown', marcarMexeu)
    area.addEventListener('wheel', marcarMexeu, { passive: true })
    const aoRedimensionar = () => {
      m.invalidateSize()
      if (!mexeu) enquadrarNoTopo(m, enquadro, limitesDoMapa)
    }
    window.addEventListener('resize', aoRedimensionar)
    return () => {
      cancelAnimationFrame(quadro)
      area.removeEventListener('pointerdown', marcarMexeu)
      area.removeEventListener('wheel', marcarMexeu)
      window.removeEventListener('resize', aoRedimensionar)
      // o fim da animação de zoom vem num relógio do Leaflet, 250 ms depois: saindo antes, ele acharia o mapa já removido
      ;(m as unknown as { _animatingZoom: boolean })._animatingZoom = false
      m.remove()
      mapa.current = null
      rendRef.current = null
      camadas.current.clear()
      camadasDasPartes.current.clear()
      alvosDosFuros.current.clear()
      caixas.current.clear()
      camadasDeBarra.current.clear()
      gruposDasBarras.current.clear()
      marcasDePonto.current.clear()
      grupoDosPontos.current = null
    }
  }, [manifest, pacote])

  // áreas de laje: polígono na cor da situação e uma caixa com o nome, tocável em qualquer aba
  useEffect(() => {
    const m = mapa.current
    const rend = rendRef.current
    if (!m || !rend || !grupos.current) return
    let g = grupos.current.get('L')
    if (!g) {
      g = L.layerGroup().addTo(m)
      grupos.current.set('L', g)
    }
    const doGrupo = g
    const marcadores: L.Marker[] = []
    const ids = areasDaPlanta.map((a) => a.id)
    for (const a of areasDaPlanta) {
      const forma = L.polygon(a.contorno.map(ll), { renderer: rend, weight: 2, ...opcoesDeToque('L') }).addTo(doGrupo)
      forma.on('click', () => tocarRef.current(a.id))
      camadas.current.set(a.id, [forma])
      const texto = document.createElement('span')
      texto.textContent = a.nome
      texto.setAttribute('data-testid', 'fvs-caixa-area')
      const marcador = L.marker(ll(centroDoContorno(a.contorno)), { icon: L.divIcon({ className: 'fv-caixa', html: texto, iconSize: [0, 0] }), keyboard: false }).addTo(m)
      marcador.on('click', () => tocarRef.current(a.id))
      marcadores.push(marcador)
      caixas.current.set(a.id, { marcador, texto })
    }
    return () => {
      doGrupo.clearLayers()
      for (const k of marcadores) k.remove()
      for (const id of ids) {
        camadas.current.delete(id)
        caixas.current.delete(id)
      }
    }
  }, [chaveDasAreas, manifest, pacote])

  // vindo da lista: a planta abre no tipo da peça (viga, por exemplo)
  useEffect(() => {
    const t = pecaInicial ? elementoDe(pecaInicial)?.tipo : undefined
    if (t) setTipo(t)
  }, [manifest, pecaInicial])

  // celular: a fila de abas pode não caber (Furos, Barras); a aba escolhida rola para a vista
  const filaDeAbas = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fila = filaDeAbas.current
    const on = fila?.querySelector<HTMLElement>('button.on')
    if (!fila || !on || fila.scrollWidth <= fila.clientWidth) return
    const f = fila.getBoundingClientRect()
    const b = on.getBoundingClientRect()
    if (b.left < f.left || b.right > f.right) fila.scrollLeft += b.left - f.left - (f.width - b.width) / 2
  }, [tipo, tipos.length])
  // ... e a borda do lado em que a fila continua esmaece (fvs.css: mais-esq, mais-dir), para quem está
  // no celular saber que há mais abas (revisão da frente 06, 20/11: "Pilares" aparecia como "ares")
  useEffect(() => {
    const fila = filaDeAbas.current
    if (!fila) return
    const marcar = () => {
      fila.classList.toggle('mais-esq', fila.scrollLeft > 1)
      fila.classList.toggle('mais-dir', fila.scrollLeft + fila.clientWidth < fila.scrollWidth - 1)
    }
    marcar()
    fila.addEventListener('scroll', marcar, { passive: true })
    // a largura da fila muda com a tela e com o topo (com ou sem serviço, trecho)
    const tamanho = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(marcar)
    tamanho?.observe(fila)
    return () => {
      fila.removeEventListener('scroll', marcar)
      tamanho?.disconnect()
    }
  }, [tipo, tipos.length])

  // peça do tipo escolhido fica por cima (recebe o toque primeiro)
  useEffect(() => {
    const cima = grupos.current?.get(tipo)
    const m = mapa.current
    if (!cima || !m) return
    cima.remove()
    cima.addTo(m)
  }, [tipo, manifest, chaveDasAreas])

  // furos longe (aba Furos, zoom < ZOOM_DOS_FUROS_DE_LAJE): um número por área de laje ("23 furos", laje e
  // viga dentro dela) ou por quadrado de 6 m (furo de viga fora de área); o toque aproxima até os furos dele. Texto e cor ficam em dia no efeito das cores.
  useEffect(() => {
    const m = mapa.current
    if (!m || !numerosDeLonge.length) return
    const mapaDoEfeito = m
    const criados: L.Marker[] = []
    const textos: HTMLElement[] = []
    // esquadrias: aproxima até o zoom em que as bolinhas delas aparecem
    const zPerto = tipo === 'E' ? zoomDasEsquadrias(ptPorMEsq) : ZOOM_DOS_FUROS_DE_LAJE
    for (const g of numerosDeLonge) {
      const texto = document.createElement('span')
      texto.setAttribute('data-testid', tipo === 'E' ? 'fvs-numero-esquadrias' : 'fvs-numero-furos')
      const marcador = L.marker(ll(g.centro), {
        icon: L.divIcon({ className: tipo === 'E' ? 'fv-caixa fv-num-furos fv-num-esq' : 'fv-caixa fv-num-furos', html: texto, iconSize: [0, 0] }),
        keyboard: false,
        // por cima da caixa com o nome da área (que fica no centro dela e seguraria o toque)
        zIndexOffset: 1000,
      }).addTo(m)
      marcador.on('click', () => {
        const [x0, y0, x1, y1] = g.caixa
        const b = L.latLngBounds(ll([x0, y0]), ll([x1, y1])).pad(0.1)
        // aproxima até caberem os furos da área, e no mínimo até o zoom em que eles aparecem; se não
        // cabem todos, para no furo mais perto do centro deles (o centro pode cair num vão sem furo)
        const zCabe = mapaDoEfeito.getBoundsZoom(b)
        const z = Math.min(Math.max(zCabe, zPerto), mapaDoEfeito.getMaxZoom())
        mapaDoEfeito.flyTo(zCabe >= zPerto ? b.getCenter() : ll(g.perto), z, { duration: 0.5 })
      })
      criados.push(marcador)
      textos.push(texto)
      numerosDeFuros.current.set(g.chave, { marcador, texto })
    }
    // número com o ponto dentro da tela fica inteiro na tela (testador no S23, 20/11: "28 esquadrias" saía
    // 5 px à direita); o que tem o ponto fora da tela fica onde está
    const prender = () => {
      const tela = mapaDoEfeito.getContainer().getBoundingClientRect()
      const folga = 4
      criados.forEach((marcador, i) => {
        const texto = textos[i]
        texto.style.marginLeft = ''
        texto.style.marginTop = ''
        const pt = mapaDoEfeito.latLngToContainerPoint(marcador.getLatLng())
        if (pt.x < 0 || pt.y < 0 || pt.x > tela.width || pt.y > tela.height) return
        const r = texto.getBoundingClientRect()
        const dx = r.left < tela.left + folga ? tela.left + folga - r.left : r.right > tela.right - folga ? tela.right - folga - r.right : 0
        const dy = r.top < tela.top + folga ? tela.top + folga - r.top : r.bottom > tela.bottom - folga ? tela.bottom - folga - r.bottom : 0
        if (dx) texto.style.marginLeft = `${Math.round(dx)}px`
        if (dy) texto.style.marginTop = `${Math.round(dy)}px`
      })
    }
    const quadroDoPrender = requestAnimationFrame(prender)
    mapaDoEfeito.on('moveend zoomend resize', prender)
    return () => {
      cancelAnimationFrame(quadroDoPrender)
      mapaDoEfeito.off('moveend zoomend resize', prender)
      for (const k of criados) k.remove()
      numerosDeFuros.current.clear()
    }
  }, [tipo, numerosDeLonge, manifest, pacote])

  // barras: só a camada escolhida, só na aba Barras, por cima de tudo
  useEffect(() => {
    const m = mapa.current
    if (!m) return
    // a barra passa por cima de viga e pilar: na aba Barras o toque vai todo para o mapa (tocarBarra)
    toqueSoNoMapa(rendRef.current, tipo === 'B' || tipo === 'I')
    for (const [cam, g] of gruposDasBarras.current) {
      if (tipo === 'B' && cam === camada) {
        if (!m.hasLayer(g)) g.addTo(m)
      } else g.remove()
    }
    const gp = grupoDosPontos.current
    if (gp) {
      if (tipo === 'I') {
        if (!m.hasLayer(gp)) gp.addTo(m)
      } else gp.remove()
    }
  }, [tipo, camada, manifest, pacote])

  // cores (situação da peça na ficha, só a etapa escolhida, se houver)
  useEffect(() => {
    if (!manifest) return
    for (const [id, e] of elementos) {
      // "Por item": a peça fica na cor daquele item (OK verde, NA verde-azulado, errado vermelho, sem conferir
      // cinza); a peça em que o item não se marca fica apagada
      const doItem = porItemAtivo && e.tipo === porItemAtivo.tipo && !e.so_detalhe && !foraDoServico(e) ? resultadoPorItem(id, porItemAtivo) : undefined
      const s = doItem === undefined ? situacao(id, e) : doItem === 'C' || doItem === 'NA' ? 'liberado' : doItem === 'NC' ? 'reprovado' : 'nada'
      const [cor, f] = doItem === 'NA' ? [COR_NA, 0.45] : COR[s]
      const ativo = e.tipo === tipo && doItem !== 'fora'
      const ehArea = elementosDasAreas.has(id)
      // ambientes cobrem o pavimento inteiro, parede com parede: o ainda pendente fica com traço
      // fino e quase sem cor, para a prancha continuar legível; o que já tem marcação se destaca
      const pendenteLeve = e.tipo === 'A' && s === 'nada'
      const duplicada = abertasDe(id).length > 1
      // parede da modulação pendente (20/11): cinza claro e mais grossa, para aparecer em cima da parede preta da prancha
      const paredePendente = e.tipo === 'M' && s === 'nada' && doItem !== 'NA'
      const color = sel === id ? '#111' : duplicada ? COR_DUPLICADA : paredePendente ? '#b8bec4' : cor
      // arranque (só detalhe) e cômodo em que o serviço não vale: tracejado e quase sem cor, para não parecer peça a marcar
      const soDetalhe = !!e.so_detalhe || foraDoServico(e)
      const fillOpacity = soDetalhe ? 0.02 : ehArea ? (ativo ? Math.min(f, OPACIDADE_MAX_AREA) : Math.min(f, OPACIDADE_MAX_AREA) * 0.5) : pendenteLeve ? 0.05 : ativo ? f : f * 0.25
      const opacity = ehArea ? (ativo ? 1 : 0.6) : !ativo ? 0.3 : soDetalhe && sel !== id ? 0.6 : pendenteLeve && sel !== id ? 0.6 : 1
      const weight = sel === id ? 4 : duplicada ? 3 : e.tipo === 'A' ? 1.25 : e.tipo === 'M' ? 3 : 2
      const dashArray = soDetalhe ? '5 4' : undefined
      if (ehFilho(e.tipo)) {
        // furo (ou esquadria) pendente: miolo branco (fica visível em cima da viga); fora da aba dele, apagado e sem toque
        const fill = s === 'nada' ? '#ffffff' : cor
        // escondido (20/11): furo fora da aba Furos (não cobre pilar e viga); furo de laje de Geral,
        // Climatização ou Incêndio (o dado fica no pacote); qualquer furo com a planta longe (no lugar, o
        // número da área ou do quadrado). O furo selecionado (pela busca, por exemplo) aparece sempre.
        // Esquadria (20/11, testador em 375 px): só na aba Esquadrias e só de perto (longe, o número do apartamento).
        const escondido =
          sel !== id &&
          (e.tipo === 'F' ? tipo !== 'F' || furoDeLajeEscondido(e) || deOutraPlanta(e) || !furosPerto : e.tipo === 'E' && (tipo !== 'E' || !esquadriasPerto))
        // furo de laje sem ficha que o marque: apagado (o toque diz por quê); fora de área ele marca (21/11)
        const vivo = ativo && !(ehFuroDeLaje(e) && !furacaoDe(id))
        const fo = escondido ? 0 : vivo ? 0.95 : 0.25
        const op = escondido ? 0 : vivo ? 1 : 0.35
        const w = sel === id ? 4 : 2
        const tocavel = ativo && !escondido
        const chaveFuro = `${color}|${fill}|${fo}|${op}|${w}`
        for (const l of camadas.current.get(id) ?? []) {
          ;(l.options as { interactive?: boolean }).interactive = tocavel
          if (estilos.current.get(l) === chaveFuro) continue
          estilos.current.set(l, chaveFuro)
          l.setStyle({ color: sel === id ? '#111' : cor, fillColor: fill, fillOpacity: fo, opacity: op, weight: w })
        }
        const alvo = alvosDosFuros.current.get(id)
        if (alvo) (alvo.options as { interactive?: boolean }).interactive = tocavel
        continue
      }
      const chave = `${color}|${cor}|${fillOpacity}|${opacity}|${weight}|${dashArray}`
      for (const l of camadas.current.get(id) ?? []) {
        // fora da aba Lajes, a área grande não pode roubar o toque de quem está marcando pilar e viga
        if (ehArea) (l.options as { interactive?: boolean }).interactive = ativo
        if (estilos.current.get(l) === chave) continue
        estilos.current.set(l, chave)
        l.setStyle({ color, fillColor: cor, fillOpacity, opacity, weight, ...(dashArray ? { dashArray } : {}) })
      }
      const caixa = caixas.current.get(id)
      if (caixa) caixa.texto.className = `s-${s}${sel === id ? ' on' : ''}`
    }
    // consolo e capitel na cor dos itens deles (cinza se a ficha do pilar não tem itens da parte)
    const pilaresAtivos = tipo === 'P'
    for (const [id, partes] of camadasDasPartes.current) {
      for (const [parte, desenhos] of partes) {
        const [cor, f] = COR[situacaoDaParte(id, parte) ?? 'nada']
        const escolhida = sel === id && parteAberta === parte
        const color = escolhida ? '#111' : cor
        const fillOpacity = pilaresAtivos ? Math.min(f, 0.25) : 0.04
        const opacity = pilaresAtivos ? 0.9 : 0.3
        const weight = escolhida ? 3 : 1.5
        const chave = `${color}|${cor}|${fillOpacity}|${opacity}|${weight}`
        for (const l of desenhos) {
          if (estilos.current.get(l) === chave) continue
          estilos.current.set(l, chave)
          l.setStyle({ color, fillColor: cor, fillOpacity, opacity, weight })
        }
      }
    }
    // número de furos de cada área (longe): "5 de 23 furos OK", na cor do conjunto
    for (const g of numerosDeLonge) {
      const n = numerosDeFuros.current.get(g.chave)
      if (!n) continue
      const sits = g.ids.map((id) => {
        const e = manifest.elementos[id]
        return e ? situacao(id, e) : 'nada'
      })
      const texto = tipo === 'E' ? textoDoNumeroDaArea(sits, 'esquadria', 'esquadrias') : textoDoNumeroDaArea(sits)
      if (n.texto.textContent !== texto) n.texto.textContent = texto
      n.texto.className = `s-${situacaoDoNumeroDaArea(sits)}`
    }
    if (tipo === 'B') {
      for (const [id, l] of camadasDeBarra.current) {
        // com a caixa do NC aberta, a barra já fica vermelha (2º toque); o NC só grava no Confirmar
        const s = ncDaBarra?.id === id ? 'reprovado' : situacaoDaBarra(eventosDe(id))
        const cor = COR_BARRA[s === 'liberado' || s === 'reprovado' ? s : 'nada']
        const w = s === 'reprovado' ? 4 : 2.5
        const chave = `${cor}|${w}`
        if (estilos.current.get(l) === chave) continue
        estilos.current.set(l, chave)
        l.setStyle({ color: cor, weight: w })
      }
    }
    if (tipo === 'I') {
      for (const [id, l] of marcasDePonto.current) {
        const s = ncDaBarra?.id === id ? 'reprovado' : situacaoDaBarra(eventosDe(id))
        const cor = COR_BARRA[s === 'liberado' || s === 'reprovado' ? s : 'nada']
        const linha = !(l instanceof L.CircleMarker)
        const w = linha ? (s === 'reprovado' ? 5 : 3) : 2.5
        const chave = `${cor}|${w}`
        if (estilos.current.get(l) === chave) continue
        estilos.current.set(l, chave)
        l.setStyle({ color: cor, fillColor: cor, weight: w })
      }
    }
  })

  // o polígono sendo desenhado: traço, preenchimento e cantos (o primeiro maior: tocar nele fecha)
  useEffect(() => {
    const m = mapa.current
    const rend = rendRef.current
    if (!m || !rend || !desenho) return
    const g = L.layerGroup().addTo(m)
    const pts = desenho.pontos.map(ll)
    if (pts.length >= 3) L.polygon(pts, { renderer: rend, stroke: false, fillColor: COR_TRACADO, fillOpacity: 0.18, interactive: false }).addTo(g)
    if (pts.length >= 2) L.polyline(pts, { renderer: rend, color: COR_TRACADO, weight: 3, interactive: false }).addTo(g)
    pts.forEach((p, i) => L.circleMarker(p, { renderer: rend, radius: i === 0 ? 9 : 6, color: '#fff', weight: 2, fillColor: i === 0 ? '#c27800' : COR_TRACADO, fillOpacity: 1, interactive: false }).addTo(g))
    return () => {
      g.remove()
    }
  }, [desenho])

  // desenhando, dois toques rápidos são dois cantos, e não zoom; nas abas Barras e Pontos, dois toques
  // rápidos são o 2º passo do ciclo (vermelho), e não zoom (21/11)
  const semZoomNoDuplo = !!desenho || tipo === 'B' || tipo === 'I'
  useEffect(() => {
    const m = mapa.current
    if (!m || !semZoomNoDuplo) return
    m.doubleClickZoom.disable()
    return () => {
      m.doubleClickZoom.enable()
    }
  }, [semZoomNoDuplo])

  /** Começa o desenho de uma área. O voltar do aparelho cancela, sem sair da planta. */
  const comecarDesenho = (areaId?: string) => {
    setPincel(null)
    setPorItem(null)
    setCaixaNova(null)
    fecharPainel()
    abrirSobre(() => {
      setDesenho(null)
      setCaixaNova(null)
    })
    setDesenho({ pontos: [], areaId })
  }

  const cancelarDesenho = () => {
    const volta = desenho?.areaId
    setDesenho(null)
    fecharSobre()
    if (volta) abrirPainel(volta)
  }

  // terminou o desenho de um contorno novo: grava; área nova abre a caixa da ficha
  const concluirDesenho = (pontos: Ponto[]) => {
    const problema = problemaDoContorno(pontos)
    if (problema) return avisar(problema)
    const areaId = desenho?.areaId
    setDesenho(null)
    const area = areaId ? dados.areaPorId.get(areaId) : undefined
    if (area) {
      fecharSobre()
      executar(async () => {
        await mudarArea(c, area, { contorno: pontos })
        avisar(`Contorno de ${area.nome} atualizado.`)
      }).then(() => abrirPainel(area.id))
      return
    }
    const opcoes = fichasDaCaixa(dados.fichas)
    const todas = [...dados.areaPorId.values()]
    const inicial = fichaInicialDaCaixa(opcoes, todas, fichaPorId)
    setCaixaNova({ contorno: pontos, nome: proximoNomeDeArea(areasDoPavimento ?? []), fichaId: inicial?.id ?? '', codigo: '' })
  }

  const criarDaCaixa = () => {
    if (!caixaNova) return
    const nova = caixaNova
    if (!nova.nome.trim() || !nova.fichaId) return
    setCaixaNova(null)
    fecharSobre()
    let criada = ''
    executar(async () => {
      const linha = await criarArea(c, { pavimentoId: planta.pavimento_id, setorId: planta.setor_id, nome: nova.nome, fichaId: nova.fichaId, codigoFicha: nova.codigo, contorno: nova.contorno })
      criada = linha.id
    }).then(() => {
      setTipo('L')
      if (criada) abrirPainel(criada)
    })
  }

  const apagarArea = (area: AreaDeLaje) => {
    if (!confirm(`Apagar ${area.nome} da planta?\n\nO que já foi marcado fica guardado no histórico.`)) return
    fecharPainel()
    executar(async () => {
      await mudarArea(c, area, { cancelada: true })
      avisar(`${area.nome} apagada.`)
    })
  }

  tocarMapaRef.current = (pos) => {
    const m = mapa.current
    if (!desenho && tipo === 'B' && m) return tocarBarra(pos, m)
    if (!desenho && tipo === 'I' && m) return tocarPonto(pos, m)
    if (!desenho || !m) return
    const { pontos } = desenho
    if (pontos.length >= 3 && m.latLngToContainerPoint(ll(pontos[0])).distanceTo(m.latLngToContainerPoint(pos)) <= FECHAR_PX) return concluirDesenho(pontos)
    setDesenho({ ...desenho, pontos: [...pontos, [Math.round(pos.lng * 100) / 100, Math.round(-pos.lat * 100) / 100]] })
  }

  useEffect(() => {
    // painel abriu, fechou ou mudou de peça: o mapa muda de tamanho e a peça continua à vista
    // Durante o voo da busca, espera ele acabar: o panInside no meio do voo pega o zoom quebrado
    // (-1,63), o Leaflet arredonda (-1,75) e agenda uma animação de zoom num quadro seguinte. Por uns
    // 250 ms, todo enquadro (o toque da pessoa, "ver folha", o teste) era engolido ou desfeito por ela
    // (testes instáveis do P6/P6a e do pincel na duplicada, 09 a 12/11). O voo já termina com a peça
    // no meio, e o invalidateSize a mantém no meio quando o painel muda o tamanho do mapa.
    let m: L.Map | null = null
    const ajustar = () => {
      if (!m) return
      m.invalidateSize()
      const forma = sel ? camadas.current.get(sel)?.[0] : undefined
      // furo ou esquadria (bolinha pequena): no meio da faixa que sobra, para o aviso do toque ("FL2: errado"),
      // no pé dela no celular, não cobrir; assim o 3º toque (sem conferir, painel aberto) chega a ela (21/11)
      const filho = sel ? ehFilho(manifest?.elementos[sel]?.tipo ?? '') : false
      if (forma && filho) m.panTo(limitesDaCamada(forma).getCenter(), { animate: false })
      else if (forma) m.panInside(limitesDaCamada(forma).getCenter(), { padding: [30, 30] })
    }
    const t = window.setTimeout(() => {
      m = mapa.current
      if (!m) return
      if (voando.current) m.once('moveend', ajustar)
      else ajustar()
    }, 60)
    return () => {
      window.clearTimeout(t)
      m?.off('moveend', ajustar)
    }
  }, [sel])

  // ------------------------------------------------------------------ toque na peça
  tocarRef.current = (id: string) => {
    // desenhando, o toque é um canto: quem recebe é o mapa (tocarMapaRef)
    if (desenho) return
    const e = elementoDe(id)
    if (!e) return
    if (tipo === 'I') return  // aba Pontos: o toque é do ponto (mapa)
    // aba Barras: o toque é da barra (mapa); só a caixa da área de laje abre o painel dela, sem trocar de aba
    if (tipo === 'B') {
      if (!dados.areaPorId.has(id)) return
      setParteAberta(null)
      return abrirPainel(id)
    }
    // cômodo em que o serviço escolhido não vale (tabela ficha × tipo de cômodo): o pincel e o "Por item" não
    // marcam nada; o toque comum abre o painel, que diz por quê
    const semServico = foraDoServico(e) && e.tipo === tipo
    if (semServico && (pincel || porItemAtivo) && pode) {
      return avisar(`${fichaDe('A')?.codigo ?? 'Esta ficha'} não vale ${e.comodo ? `em ${e.comodo}` : 'neste cômodo'} (${e.nome}).`)
    }
    if (porItemAtivo && pode) {
      if (e.tipo !== porItemAtivo.tipo) return avisar(`No "Por item", toque ${porItemAtivo.tipo === 'P' ? 'nos pilares' : porItemAtivo.tipo === 'V' ? 'nas vigas' : porItemAtivo.tipo === 'M' ? 'nas paredes' : 'nos ambientes'}. Para abrir ${e.nome}, toque em Sair.`)
      return tocarPorItem(id, e, porItemAtivo)
    }
    if (e.tipo !== tipo) setTipo(e.tipo)
    if (ehFilho(e.tipo) && pode && !pincel && abertasDe(id).length === 0) return tocarFuro(id, e)
    if (pincel && pode) {
      const abertas = abertasDe(id)
      // duas fichas na mesma peça: quem decide em qual marcar é a pessoa, pelo painel
      if (abertas.length > 1) return avisar(`${e.nome} tem ${abertas.length} fichas ${sistema ? `no ${sistema.nome}` : 'abertas'}. Toque sem o pincel e escolha a ficha.`)
      const aberta = abertas[0]
      const daPeca = aberta ? fichaNaPeca(aberta.ficha_id ? dados.fichaPorId.get(aberta.ficha_id) : undefined, partesDe(id)) : fichaDoLocal(id, e.tipo)
      if (!daPeca) return avisar(`Não há ficha para ${NOME_TIPO[e.tipo] ?? e.tipo}.`)
      // viga com furos (ambiente com esquadrias): o item de furação (de esquadria) fica com eles, o pincel não marca
      const semFuros = filhosPorPai.has(id) ? { ...daPeca, itens: daPeca.itens.filter((i) => !i.furos && !i.esquadrias) } : daPeca
      // área de laje com barras: o item de armadura fica com as barras
      const semBarras = barrasDaLaje(id).length ? { ...semFuros, itens: semFuros.itens.filter((i) => !i.barras) } : semFuros
      // área com furos de laje: esgoto e água ficam com os furos; a elétrica pergunta se há furo errado ou sem conferir
      const inst = instalacoesDaArea(id)
      const avisoEl = pincel.resultado === 'C' && inst.eletrica?.length ? avisoDoCEletrico(inst.eletrica) : null
      const semEletrica = !!avisoEl && !confirm(`${e.nome}: ${avisoEl}`)
      const ficha = {
        ...semBarras,
        itens: semBarras.itens.filter((i) => !(i.instalacao && (i.instalacao === 'eletrica' ? semEletrica : inst[i.instalacao]?.length))),
      }
      const { etapa: et, resultado } = pincel
      const cDoPincel = { ...c, fichaCampoId: aberta?.id ?? null }
      // itens dentro do prazo das regras da obra: uma pergunta só; Cancelar marca só os outros (19/11)
      const noPrazo = resultado === 'C' ? prazosDoLote(dados, [{ id, ficha, eventos: daFichaAberta(eventosDe(id), cDoPincel.fichaCampoId) }], et || null) : new Map<string, string>()
      const comPrazo = noPrazo.size > 0 && confirm(`${e.nome}: ${perguntaDoLote(noPrazo.size)}`)
      const fichaDoPincel = comPrazo || !noPrazo.size ? ficha : { ...ficha, itens: ficha.itens.filter((i) => !noPrazo.has(`${id}#${i.n}`)) }
      const toque: Toque = { tipo: 'lote', id: crypto.randomUUID(), obraId: c.obraId, usuarioId: c.usuarioId, plantaId: c.plantaId, fichaCampoId: cDoPincel.fichaCampoId, pecas: [{ id, fichaId: ficha.id, fichaCampoId: cDoPincel.fichaCampoId }], etapa: et || null, resultado }
      anotarToque(toque)
      executar(async (evs) => {
        const evsDaPeca = daFichaAberta(evs(id), cDoPincel.fichaCampoId)
        const gravados = await marcarLote(cDoPincel, [{ id, ficha: fichaDoPincel, eventos: evsDaPeca }], et || null, resultado, toque.id, noPrazo).finally(() => esquecerToque(toque.obraId, toque.id))
        const ligados = resultado === 'C' ? await ligar(cDoPincel, id, daPeca, gravados.map((g) => Number(g.item)), [...evsDaPeca, ...(gravados as unknown as EventoFvs[])]) : []
        const n = gravados.length
        // segundo toque na mesma peça (toque duplo): não tira o "Desfazer" da tela
        if (n || ultimaDoPincel.current !== id) {
          avisarLote(n ? `${e.nome}: ${n} ${n === 1 ? 'item' : 'itens'} ${resultado}${et ? ` em ${et.toLowerCase()}` : ''}${maisLigados(ligados)}` : `${e.nome}: nada a marcar (já estava preenchido)`, [...gravados, ...ligados])
        }
        ultimaDoPincel.current = id
        return [...gravados, ...ligados]
      })
      return
    }
    setParteAberta(null)
    abrirPainel(id)
  }

  /**
   * Toque na peça no modo "Por item". Com OK na barra: sem conferir ou NA → C; C → errado (só com observação
   * e Confirmar); errado → C na rodada seguinte (reinspeção; o NC fica nas reprovações). Com NA na barra:
   * sem conferir, C ou errado → NA (sobre o errado, reinspeção); NA → sem conferir. O aviso traz "Desfazer",
   * que volta ao que estava (é por ele que sai um NC posto por engano).
   */
  const tocarPorItem = (id: string, _e: ElementoPacote, esc: ItemEscolhido) => {
    const a = alvoDoItem(id, esc)
    if ('aviso' in a) return avisar(a.aviso)
    const atual = resultadoDoItem(a.ficha, daFichaAberta(eventosDe(id), a.cx.fichaCampoId ?? null), a.item.n)
    const passo = proximoDoToque(atual, modoItem)
    if (passo === 'pedir-nc') {
      setNcDoItem({ id, texto: '' })
      abrirSobre(() => setNcDoItem(null))
      return
    }
    gravarPorItem(id, esc, passo === 'limpar' ? null : passo, null, atual)
  }

  /**
   * Grava o item na peça (C, NA, NC com a observação, ou null: tira o NA; C ou NA sobre NC é a reinspeção).
   * O toque vai para o diário (toques.ts) na hora; na fila, se o item mudou desde o toque (toque duplo,
   * outro aparelho), não grava.
   */
  const gravarPorItem = (id: string, esc: ItemEscolhido, resultado: 'C' | 'NC' | 'NA' | null, obs: string | null, esperado: Resultado | null) => {
    const a = alvoDoItem(id, esc)
    const nome = elementoDe(id)?.nome ?? id
    if ('aviso' in a) return avisar(a.aviso)
    const { ficha, item, cx } = a
    const fichaCampoId = cx.fichaCampoId ?? null
    // C dentro do prazo das regras da obra: só avisa (pergunta) e grava "Marcado antes do prazo"
    if (resultado === 'C' && esperado !== 'C') {
      const prazo = prazoDoItemNaPeca(dados, ficha, daFichaAberta(eventosDe(id), fichaCampoId), item.n)
      if (prazo) {
        if (!confirm(perguntaDoPrazo(prazo, nome))) return
        obs = observacaoDoPrazo(prazo)
      }
    }
    const base = { id: crypto.randomUUID(), obraId: cx.obraId, usuarioId: cx.usuarioId, plantaId: cx.plantaId, fichaCampoId, pecaId: id, fichaId: ficha.id, item: item.n }
    const toque: Toque = resultado ? { ...base, tipo: 'item', resultado, observacao: obs } : { ...base, tipo: 'desmarcar' }
    anotarToque(toque)
    executar(async (evs) => {
      const eventos = daFichaAberta(evs(id), fichaCampoId)
      const anterior = registroDoItem(ficha, eventos, item.n)
      if ((anterior?.resultado ?? null) !== esperado) {
        esquecerToque(toque.obraId, toque.id)
        avisar(`${nome} · ${item.titulo}: já estava ${textoDoResultado(anterior?.resultado ?? null)}.`)
        return []
      }
      // tirar o NA é desmarcar (mesma rodada); NC nunca é desmarcado por aqui
      const gravado = await (resultado ? tocarItem(cx, id, ficha, item.n, resultado, eventos, toque.id, obs) : desmarcarR(cx, id, ficha, item.n, eventos, toque.id)).finally(() =>
        esquecerToque(toque.obraId, toque.id),
      )
      // ligação entre fichas: o C marca os itens ligados da peça (o "Desfazer" volta os dois)
      const ligados = gravado.resultado === 'C' ? await ligar(cx, id, ficha, [item.n], [...eventos, gravado as unknown as EventoFvs]) : []
      // os ligados do próprio local contam para "ficha completa"; os das peças de dentro da área, não
      const depois = [...eventos, gravado as unknown as EventoFvs, ...(ligados.filter((l) => localDoRegistro(l) === id) as unknown as EventoFvs[])]
      // o toque que fecha a ficha inteira da peça avisa
      const fechou = situacaoDaPeca(ficha, eventos) !== 'liberado' && situacaoDaPeca(ficha, depois) === 'liberado'
      const reinspecao = esperado === 'NC' ? ` (reinspeção ${rotuloRodada(Number(gravado.rodada))})` : ''
      avisar(`${nome} · ${item.titulo}: ${textoDoResultado(resultado)}${reinspecao}${maisLigados(ligados)}${fechou ? ' · ficha completa' : ''}`, () => {
        setMsg(null)
        executar(async (evs2) => {
          const desfeitos = ligados.length ? await desfazerLote(cx, ligados, evs2) : []
          const volta = await voltarItem(cx, gravado, anterior, daFichaAberta(evs2(id), fichaCampoId))
          avisar(volta ? `Desfeito: ${nome} · ${item.titulo}` : 'Nada a desfazer: o item já mudou.')
          return volta ? [...desfeitos, volta] : desfeitos
        })
      })
      return [gravado, ...ligados]
    })
  }

  const confirmarNcDoItem = () => {
    if (!ncDoItem || !ncDoItem.texto.trim() || !porItem) return
    const { id, texto } = ncDoItem
    setNcDoItem(null)
    fecharSobre()
    gravarPorItem(id, porItem, 'NC', texto.trim(), 'C')
  }

  /**
   * Toque no furo: o ciclo da barra e do ponto (passoDoToque, 21/11): 1 toque OK; 2 toques errado (abre o
   * painel para "O que fazer?" e a foto); 3 toques sem conferir, também com o painel do NC aberto (fecha).
   * O aviso traz "Desfazer", que volta ao que estava.
   */
  const tocarFuro = (id: string, e: ElementoPacote) => {
    const f = alvoDoFilho(id)
    // esquadria sem item na ficha: só o aviso, sem painel por cima da planta (testador no S23, 20/11)
    if (!f && e.tipo === 'E') return avisar(furoSemItem(id))
    if (!f) {
      setParteAberta(null)
      abrirPainel(id)
      return avisar(furoSemItem(id))
    }
    const { ficha, item } = f
    // o painel deste furo aberto (o NC dele): o próximo toque tira a verificação e fecha o painel
    const painelDoFuro = sel === id
    executar(async (evs) => {
      const eventos = daFichaAberta(evs(id), null)
      const anterior = ultimosPorItem(eventos.filter((x) => x.ficha_id === ficha.id)).get(item)
      const r = anterior?.resultado ?? null
      const passo = passoDoToque(r === 'C' ? 'liberado' : r === 'NC' ? 'reprovado' : 'nada', painelDoFuro && r === 'NC')
      if (passo === 'tirar' && painelDoFuro) fecharPainel()
      const gravado =
        passo === 'tirar' ? await desmarcarR(c, id, ficha, item, eventos) : await tocarItem(c, id, ficha, item, passo === 'abrir_nc' ? 'NC' : r === 'NA' ? 'NA' : 'C', eventos)
      const novo = gravado.resultado as string | null
      avisar(`${e.nome}: ${novo === 'C' ? 'OK' : novo === 'NC' ? 'errado' : 'sem conferir'}`, () => {
        setMsg(null)
        executar(async (evs2) => {
          const volta = await voltarItem(c, gravado, anterior, daFichaAberta(evs2(id), null))
          avisar(volta ? `Desfeito: ${e.nome}` : `Nada a desfazer: ${e.tipo === 'E' ? 'a esquadria' : 'o furo'} já mudou.`)
          return volta
        })
        acertarDono(f)
      })
      // errado: o painel abre para escrever o que fazer e tirar a foto
      if (novo === 'NC') {
        setParteAberta(null)
        abrirPainel(id)
      }
      return gravado
    })
    acertarDono(f)
  }

  /** Depois do toque num furo: leva o resultado ao item da viga ou, no furo de laje, aos itens da área. */
  const acertarDono = (f: { vigaId: string; item: number; laje?: boolean }) => (f.laje ? f.vigaId && acertarArea(f.vigaId) : acertarViga(f.vigaId, f.item))

  /**
   * Leva os furos de laje aos itens de instalação da área (furos_laje.ts): esgoto e água pelos furos
   * (todos OK C, algum errado NC com os furos na observação, senão pendente); a elétrica só fica NC pelos
   * furos errados (o C é da pessoa). Só grava o que mudou.
   */
  const acertarArea = (areaId: string) =>
    executar(async (evs) => {
      const area = dados.areaPorId.get(areaId)
      const ficha = area ? fichaPorId(area.ficha_id) : undefined
      if (!ficha) return
      const daArea = daFichaAberta(evs(areaId), null)
      const atuais = ultimosPorItem(daArea.filter((x) => x.ficha_id === ficha.id))
      const gravados: Linha[] = []
      for (const inst of INSTALACOES) {
        const item = itemDaInstalacao(ficha, inst)?.n
        if (item === undefined) continue
        const lista = furosDaInstalacao(areaId, ficha, inst, evs)
        const atual = atuais.get(item)
        const resultado = resultadoDaInstalacao(inst, lista.map((x) => x.sit), atual ?? null)
        if (resultado === undefined) continue
        const obs = resultado === 'NC' ? observacaoDosFuros(lista.filter((x) => x.sit === 'reprovado').map((x) => x.nome)) : null
        if ((atual?.resultado ?? null) === resultado && (resultado !== 'NC' || (atual?.observacao ?? null) === obs)) continue
        gravados.push(await marcarPelosFuros(c, areaId, ficha, item, resultado, obs, daArea))
      }
      return gravados
    })
  // área desenhada, mudada ou apagada: a ligação furo → área muda, e os itens das áreas são recalculados
  const primeiraLeituraDasAreas = useRef(true)
  useEffect(() => {
    if (primeiraLeituraDasAreas.current) {
      primeiraLeituraDasAreas.current = false
      return
    }
    if (!pode) return
    for (const a of areasDaPlanta) if (furosPorArea.has(a.id)) acertarArea(a.id)
  }, [furosPorArea])

  /**
   * Leva os furos ao item de furação da viga (as esquadrias ao item escolhido do ambiente): algum errado
   * NC (a observação diz quais), todos OK C, senão pendente. Só grava se o item mudou; roda depois de cada
   * mudança feita num filho. n: o item da ficha (esquadria), para o "Desfazer" acertar o mesmo item.
   */
  const acertarViga = (vigaId: string, n?: number) =>
    executar(async (evs) => {
      const furos = filhosPorPai.get(vigaId) ?? []
      const ehEsq = manifest?.elementos[furos[0]]?.tipo === 'E'
      const f = !furos.length ? undefined : ehEsq ? esquadriaDe(furos[0], n) : furacaoDe(furos[0])
      if (!f) return
      const sits = furos.map((id) => situacaoDoFuro(f.ficha.id, f.item, daFichaAberta(evs(id), null)))
      const resultado = resultadoPelosFuros(sits)
      const daViga = daFichaAberta(evs(vigaId), null)
      const atual = ultimosPorItem(daViga.filter((x) => x.ficha_id === f.ficha.id)).get(f.item)
      const errados = furos.filter((_, i) => sits[i] === 'reprovado').map((id) => manifest?.elementos[id]?.nome ?? id)
      const obs = errados.length ? `${ehEsq ? (errados.length > 1 ? 'Esquadrias erradas' : 'Esquadria errada') : 'Furo errado'}: ${errados.join(', ')}` : null
      if ((atual?.resultado ?? null) === resultado && (resultado !== 'NC' || atual?.observacao === obs)) return
      return marcarPelosFuros(c, vigaId, f.ficha, f.item, resultado, obs, daViga)
    })

  // ------------------------------------------------------------------ barras de laje
  /** Ids das barras (de todas as camadas) que tocam a área de laje; vazio se não é área ou não há barras. */
  const barrasDaLaje = (areaId: string): string[] => {
    const area = dados.areaPorId.get(areaId)
    return area && barras ? barrasDaArea(barras, area.contorno) : []
  }
  /**
   * A ficha e o item de armadura em que a barra grava: o da ficha da área de laje onde ela está; sem
   * área, o da primeira ficha de laje que tem o item. Nenhuma ficha com o item: a barra fica só para ver.
   */
  const armaduraDaBarra = (barraId: string): { ficha: Ficha; item: number } | undefined => {
    const b = barras?.[barraId]
    if (!b) return undefined
    for (const a of areasDaPlanta) {
      if (!barraNaArea(b.linha, a.contorno)) continue
      const f = fichaPorId(a.ficha_id)
      const it = itemDasBarras(f)
      if (f && it) return { ficha: f, item: it.n }
    }
    const f = fichasPara('L', dados.fichas).find((x) => itemDasBarras(x))
    return f ? { ficha: f, item: itemDasBarras(f)!.n } : undefined
  }

  /**
   * Leva as barras ao item de armadura de cada área de laje que a barra toca (barra que cruza duas
   * lajes conta nas duas): todas OK C, alguma errada NC com a observação de quais, senão pendente.
   * Só grava se o item mudou.
   */
  const acertarLajes = (barraIds: readonly string[]) =>
    executar(async (evs) => {
      if (!barras) return
      const gravados: Linha[] = []
      const linhas = barraIds.map((id) => barras[id]?.linha).filter((l): l is Array<[number, number]> => !!l)
      for (const a of areasDaPlanta) {
        if (!linhas.some((l) => barraNaArea(l, a.contorno))) continue
        const ficha = fichaPorId(a.ficha_id)
        const item = itemDasBarras(ficha)?.n
        if (!ficha || item === undefined) continue
        const ids = barrasDaArea(barras, a.contorno)
        const sits = ids.map((id) => situacaoDaBarra(evs(id)))
        const resultado = resultadoPelasBarras(sits)
        const erradas = ids.filter((_, i) => sits[i] === 'reprovado').map((id) => ({ barra: barras[id], obs: observacaoDaBarra(evs(id)) }))
        const obs = resultado === 'NC' ? observacaoDasErradas(erradas) : null
        const daArea = daFichaAberta(evs(a.id), null)
        const atual = ultimosPorItem(daArea.filter((x) => x.ficha_id === ficha.id)).get(item)
        if ((atual?.resultado ?? null) === resultado && (resultado !== 'NC' || (atual?.observacao ?? null) === obs)) continue
        gravados.push(await marcarPelosFuros(c, a.id, ficha, item, resultado, obs, daArea))
      }
      return gravados
    })

  /** Guarda a situação pedida até a gravação entrar (toques rápidos); a gravação pronta manda de novo. */
  const prever = (id: string, resultado: 'C' | 'NC' | null, feito: Promise<unknown>) => {
    const ent = { s: (resultado === 'C' ? 'liberado' : resultado === 'NC' ? 'reprovado' : 'nada') as Situacao }
    previsto.current.set(id, ent)
    feito.finally(() => {
      if (previsto.current.get(id) === ent) previsto.current.delete(id)
    })
  }
  /** Situação da barra ou do ponto para o próximo toque: a pedida (ainda gravando) ou a gravada. */
  const situacaoParaToque = (id: string): Situacao => previsto.current.get(id)?.s ?? situacaoDaBarra(atuais.current.eventosDe.get(id) ?? [])

  /**
   * O ciclo do toque, igual na barra e no ponto (21/11): 1 toque OK, 2 toques errada (abre a caixa do NC e
   * já mostra vermelho), 3 toques tira a verificação, também com a caixa do NC ainda aberta.
   */
  const cicloDoToque = (id: string, gravar: (id: string, resultado: 'C' | 'NC' | null, obs: string | null) => void, pos: L.LatLng) => {
    const aberto = ncDaBarra?.id === id
    if (ncDaBarra && !aberto) {
      // caixa do NC de outra barra aberta e sem Confirmar: fecha (a outra fica como estava) e segue o toque
      setNcDaBarra(null)
      fecharSobre()
    }
    const passo = passoDoToque(situacaoParaToque(id), aberto)
    if (passo === 'ok') return gravar(id, 'C', null)
    if (passo === 'abrir_nc') {
      // a caixa do NC abre do lado oposto ao toque (toque na metade de cima: caixa embaixo), para não cobrir a
      // barra ou o ponto: o 3º toque no mesmo lugar, rápido ou lento, chega a ele (e não à caixa)
      const m = mapa.current
      const embaixo = !!m && m.latLngToContainerPoint(pos).y < m.getSize().y / 2
      setNcDaBarra({ id, texto: '', embaixo })
      abrirSobre(() => setNcDaBarra(null))
      return
    }
    if (aberto) {
      setNcDaBarra(null)
      fecharSobre()
    }
    gravar(id, null, null)
  }

  /** Grava a situação nova da barra (C OK, NC errada com observação, null sem conferir) e acerta as lajes. */
  const gravarBarra = (barraId: string, resultado: 'C' | 'NC' | null, obs: string | null) => {
    const b = barras?.[barraId]
    const arm = armaduraDaBarra(barraId)
    if (!b || !arm) return
    const feito = executar(async (evs) => {
      const eventos = daFichaAberta(evs(barraId), null)
      let anterior: EventoFvs | undefined
      for (const e of eventos) if (!anterior || maisNovo(e, anterior)) anterior = e
      const gravado = await marcarPelosFuros(c, barraId, arm.ficha, arm.item, resultado, obs, eventos)
      const texto = resultado === 'C' ? 'OK' : resultado === 'NC' ? 'errada' : 'sem conferir'
      avisar(`${nomeDaBarra(b)}: ${texto}`, () => {
        setMsg(null)
        previsto.current.delete(barraId)
        executar(async (evs2) => {
          const volta = await voltarItem(c, gravado, anterior && anterior.ficha_id === gravado.ficha_id ? anterior : undefined, daFichaAberta(evs2(barraId), null))
          avisar(volta ? `Desfeito: ${nomeDaBarra(b)}` : 'Nada a desfazer: a barra já mudou.')
          return volta
        })
        acertarLajes([barraId])
      })
      return gravado
    })
    prever(barraId, resultado, feito)
    acertarLajes([barraId])
  }

  /** Toque na aba Barras: a barra mais perto da camada escolhida, com margem larga para o dedo. */
  const tocarBarra = (pos: L.LatLng, m: L.Map) => {
    if (!barras || !camada) return
    const escala = 2 ** m.getZoom() // CRS.Simple: 1 ponto da folha = 2^zoom px
    const r = barraTocada([pos.lng, -pos.lat], barras, camada, TOQUE_BARRA_PX / escala, FOLGA_BARRA_PX / escala)
    if (!r) return avisar(`Nenhuma barra da camada ${NOME_DA_CAMADA[camada].toLowerCase()} aqui.`)
    if ('ambiguo' in r) return avisar('Duas barras juntas aqui: aproxime a planta e toque de novo.')
    const b = barras[r.id]
    const s = situacaoDaBarra(eventosDe(r.id))
    if (!pode) return avisar(`${b.texto ?? nomeDaBarra(b)}: ${s === 'liberado' ? 'OK' : s === 'reprovado' ? 'errada' : 'sem conferir'}`)
    if (!armaduraDaBarra(r.id)) return avisar('A ficha de laje não tem item de armadura marcado pelas barras: as barras ficam só para ver.')
    cicloDoToque(r.id, gravarBarra, pos)
  }

  // ------------------------------------------------------------------ pontos de instalação
  /** A ficha de ambiente com o item dos pontos desta disciplina (opção B: a ficha fica no ambiente). */
  const fichaDoPonto = () => (manifest?.disciplina ? fichaDosPontos(fichasPara('A', dados.fichas), manifest.disciplina) : undefined)

  /** Grava a situação nova do ponto (C OK, NC errado com observação, null sem conferir), em barra_id. */
  const gravarPonto = (pontoId: string, resultado: 'C' | 'NC' | null, obs: string | null) => {
    const pt = pontos?.[pontoId]
    const fp = fichaDoPonto()
    if (!pt || !fp) return
    const feito = executar(async (evs) => {
      const eventos = daFichaAberta(evs(pontoId), null)
      let anterior: EventoFvs | undefined
      for (const e of eventos) if (!anterior || maisNovo(e, anterior)) anterior = e
      const gravado = await marcarPelosFuros(c, pontoId, fp.ficha, fp.item, resultado, obs, eventos)
      const texto = resultado === 'C' ? 'OK' : resultado === 'NC' ? 'errado' : 'sem conferir'
      avisar(`${nomeDoPonto(pt)}: ${texto}`, () => {
        setMsg(null)
        previsto.current.delete(pontoId)
        executar(async (evs2) => {
          const volta = await voltarItem(c, gravado, anterior && anterior.ficha_id === gravado.ficha_id ? anterior : undefined, daFichaAberta(evs2(pontoId), null))
          avisar(volta ? `Desfeito: ${nomeDoPonto(pt)}` : 'Nada a desfazer: o ponto já mudou.')
          return volta
        })
      })
      return gravado
    })
    prever(pontoId, resultado, feito)
  }

  /** Toque na aba Pontos: o ponto mais perto, com margem larga para o dedo. Mesmo ciclo da barra. */
  const tocarPonto = (pos: L.LatLng, m: L.Map) => {
    if (!pontos) return
    const escala = 2 ** m.getZoom()
    const r = pontoTocado([pos.lng, -pos.lat], pontos, TOQUE_BARRA_PX / escala, FOLGA_BARRA_PX / escala)
    if (!r) return avisar('Nenhum ponto aqui.')
    if ('ambiguo' in r) return avisar('Dois pontos juntos aqui: aproxime a planta e toque de novo.')
    const pt = pontos[r.id]
    const s = situacaoDaBarra(eventosDe(r.id))
    if (!pode) return avisar(`${nomeDoPonto(pt)}: ${s === 'liberado' ? 'OK' : s === 'reprovado' ? 'errado' : 'sem conferir'}`)
    // sem item de ficha: planta de consulta (PPCI, SPDA sem ficha; 21/11/2026): o toque só mostra o que é o ponto
    if (!fichaDoPonto()) return avisar(`${nomeDoPonto(pt)} · só consulta`)
    cicloDoToque(r.id, gravarPonto, pos)
  }

  const confirmarNcDaBarra = () => {
    if (!ncDaBarra || !ncDaBarra.texto.trim()) return
    const { id, texto } = ncDaBarra
    setNcDaBarra(null)
    fecharSobre()
    if (pontos?.[id]) gravarPonto(id, 'NC', texto.trim())
    else gravarBarra(id, 'NC', texto.trim())
  }

  /** "Tudo OK nesta camada" no painel da laje: as barras sem conferir da camada, dentro da área. */
  const tudoOkNaCamada = (areaId: string) => {
    const area = dados.areaPorId.get(areaId)
    if (!barras || !camada || !area) return
    const cam = camada
    const ids = barrasDaArea(barras, area.contorno, cam)
    executar(async (evs) => {
      const gravados: Linha[] = []
      for (const id of ids) {
        if (situacaoDaBarra(evs(id)) !== 'nada') continue
        const arm = armaduraDaBarra(id)
        if (arm) gravados.push(await marcarPelosFuros(c, id, arm.ficha, arm.item, 'C', null, daFichaAberta(evs(id), null)))
      }
      const n = gravados.length
      const texto = n ? `${area.nome}: ${n} ${n === 1 ? 'barra OK' : 'barras OK'} (${NOME_DA_CAMADA[cam].toLowerCase()})` : `${area.nome}: nada a marcar nesta camada`
      if (!n) avisar(texto)
      else
        avisar(texto, () => {
          setMsg(null)
          executar(async (evs2) => {
            const desfeitos = await desfazerLote(c, gravados, evs2)
            avisar(desfeitos.length ? `Desfeito: ${desfeitos.length} ${desfeitos.length === 1 ? 'barra' : 'barras'}` : 'Nada a desfazer: as barras já mudaram.')
            return desfeitos
          })
          acertarLajes(ids)
        })
      return gravados
    })
    acertarLajes(ids)
  }

  tocarParteRef.current = (id: string, parte: string) => {
    if (desenho || tipo === 'B' || tipo === 'I') return
    // com o pincel, o toque na parte é o toque no pilar (o lote não marca os itens da parte); no "Por item" também
    if ((pincel || porItemAtivo) && pode) return tocarRef.current(id)
    const e = elementoDe(id)
    if (!e) return
    if (e.tipo !== tipo) setTipo(e.tipo)
    setParteAberta(parte)
    abrirPainel(id)
  }

  tocarDesenhoRef.current = (id: string) => {
    if (desenho || tipo === 'B' || tipo === 'I') return
    const ids = mesmoDesenho.get(id)
    if (!ids) return tocarRef.current(id)
    setMesmoDesenhoAberto(ids)
    // o voltar do aparelho fecha a escolha, sem sair da planta
    abrirSobre(() => setMesmoDesenhoAberto(null))
  }
  const escolherPeca = (id: string | null) => {
    setMesmoDesenhoAberto(null)
    fecharSobre()
    if (id) tocarRef.current(id)
  }

  tocarNoFuroRef.current = (id: string, pos: L.LatLng) => {
    const m = mapa.current
    if (desenho || !m) return tocarRef.current(id)
    // esquadria com a ficha sem item de esquadria: nada a escolher, vai direto ao aviso
    if (elementoDe(id)?.tipo === 'E' && !itemEsq) return tocarRef.current(id)
    // o canvas entrega o toque ao furo desenhado por cima; com dois alvos no ponto, a pessoa escolhe
    const toque = m.latLngToContainerPoint(pos)
    const pontos: Array<{ id: string; x: number; y: number }> = []
    for (const [fid, alvo] of alvosDosFuros.current) {
      if (!(alvo.options as { interactive?: boolean }).interactive) continue
      const p = m.latLngToContainerPoint(alvo.getLatLng())
      if (Math.abs(p.x - toque.x) <= ALVO_FURO_PX && Math.abs(p.y - toque.y) <= ALVO_FURO_PX) pontos.push({ id: fid, x: p.x, y: p.y })
    }
    const ids = furosNoToque(pontos, toque.x, toque.y, ALVO_FURO_PX)
    if (ids.length < 2) return tocarRef.current(id)
    setQualFuro(ids)
    // o voltar do aparelho fecha a escolha, sem sair da planta
    abrirSobre(() => setQualFuro(null))
  }
  const escolherFuro = (id: string | null) => {
    setQualFuro(null)
    fecharSobre()
    if (id) tocarRef.current(id)
  }

  const limitesDe =(id: string, e: ElementoPacote) =>
    (camadas.current.get(id) ?? []).reduce((acc, l) => acc.extend(limitesDaCamada(l)), caixa(e.rotulo))

  /** A peça não está nesta planta: pode estar em outro trecho do mesmo pavimento. */
  const procurarEmOutroTrecho = async (q: string, texto: string) => {
    const pecas = [...dados.pecaPorId.values()].filter((p) => p.pavimento_id === planta.pavimento_id && p.nome.toUpperCase() === q)
    if (!pecas.length) return avisar(`${texto} não está neste pavimento.`)
    const noAparelho = await pecasNoAparelho()
    for (const peca of pecas) {
      // pacote de revisão anterior também vale: é com ele que o trecho abre até a nova ser baixada
      const destino = noAparelho.get(peca.id)?.map((id) => dados.vigenteDe.get(id) ?? id).find((id) => irmas.some((p) => p.id === id))
      if (destino) return ir({ nome: 'planta', plantaId: destino, pecaId: peca.id })
    }
    avisar(`${texto} está em outro trecho deste pavimento, que ainda não foi baixado.`)
  }

  /** Voo da busca até a peça. O fim (ou a interrupção: arrastar, outro enquadro) sempre dá moveend. */
  const voar = (b: L.LatLngBounds, maxZoom: number) => {
    const m = mapa.current
    if (!m) return
    voando.current = true
    m.once('moveend', () => {
      voando.current = false
    })
    m.flyToBounds(b, { maxZoom, duration: 0.5 })
  }

  const buscar = (texto: string) => {
    const q = texto.trim().toUpperCase().replace(/\s+/g, '')
    if (!q) return
    // nome de área de laje tem espaço ("Laje 2")
    // ambiente com nome de cômodo: "Living - Apto 303" (da lista) ou "living 303"
    const achado = elementos.find(([, e]) => e.nome.toUpperCase().replace(/\s+/g, '') === q) ?? elementos.find(([, e]) => casaComodo(e, texto) === 2) ?? elementos.find(([, e]) => casaComodo(e, texto) === 1)
    if (!achado) {
      // "303" ou "Apto 303": leva ao apartamento inteiro
      const chave = semAcento(texto)
      const doGrupo = elementos.filter(([, e]) => e.grupo && (semAcento(e.grupo) === chave || semAcento(e.grupo) === `APTO${chave}`))
      if (!doGrupo.length) return procurarEmOutroTrecho(q, texto)
      const b = doGrupo.reduce((acc, [id, e]) => acc.extend(limitesDe(id, e)), limitesDe(doGrupo[0][0], doGrupo[0][1]))
      setTipo(doGrupo[0][1].tipo)
      fecharPainel()
      voar(b.pad(0.1), 1.5)
      return avisar(`${doGrupo[0][1].grupo}: ${doGrupo.length} ${doGrupo[0][1].tipo === 'M' ? 'paredes' : 'ambientes'}`)
    }
    const [id, e] = achado
    setTipo(e.tipo)
    abrirPainel(id)
    voar(limitesDe(id, e).pad(0.4), 0.5)
  }

  // ------------------------------------------------------------------ progresso
  // arranque (só detalhe) não tem ficha: não conta no "x/y liberados"; na aba Furos, só os furos
  // conferíveis (o de Geral, Climatização e Incêndio não marca nada, 20/11; o de laje fora de área marca, 21/11)
  const doTipo = useMemo(
    () =>
      elementos.filter(
        ([id, e]) => e.tipo === tipo && !e.so_detalhe && !foraDoServico(e) && (e.tipo !== 'F' || (furoConferivel(e, furosDeLaje.get(id)) && !deOutraPlanta(e))),
      ),
    [elementos, tipo, furosDeLaje, codigoDoServico],
  )
  let liberadas = 0
  let paraConcretar = 0
  let comR = 0
  for (const [id, e] of doTipo) {
    const s = situacao(id, e)
    if (s === 'liberado') liberadas++
    if (s === 'concretagem') paraConcretar++
    if (s === 'reprovado') comR++
  }
  // furo não é peça (conta dentro da viga, pelo item de furação): "OK", como no painel da viga, e não
  // "liberados", que no celular foi lido junto com o "x de y peças liberadas" do início (18/11)
  const palavraDoProgresso = ehFilho(tipo) ? 'OK' : tipo === 'L' ? 'liberadas' : 'liberados'
  // aba Barras: conta as barras da camada escolhida
  const resumoDaCamada =
    tipo === 'B' && barras && camada
      ? resumoDasBarras(Object.entries(barras).filter(([, b]) => b.camada === camada).map(([id]) => situacaoDaBarra(eventosDe(id))))
      : tipo === 'I' && pontos
        ? resumoDasBarras(Object.keys(pontos).map((id) => situacaoDaBarra(eventosDe(id))))
        : null
  // aviso da sincronização em poucas palavras, no canto do topo (não cobre planta nem painel)
  const quantos = /^(\d+) registro/.exec(aviso)?.[1]
  const avisoCurto = aviso.startsWith('Sem internet') ? 'sem internet' : quantos ? `${quantos} ${aviso.includes('recusado') ? 'recusados' : 'a enviar'}` : ''
  const temDuplicada = elementos.some(([id]) => abertasDe(id).length > 1)
  // a lista da busca não muda com o toque: refazer 800 opções a cada marcação pesa no celular
  const listaDaBusca = useMemo(
    () => (
      <datalist id="fv-lista">
        {[...new Set(elementos.map(([, e]) => e.grupo).filter((g): g is string => !!g))].map((g) => (
          <option value={g} key={`g:${g}`} />
        ))}
        {elementos.map(([id, e]) => (
          <option value={e.nome} key={id} />
        ))}
        {elementos.map(([id, e]) => {
          const t = textoDoComodo(e)
          return t ? <option value={t} key={`c:${id}`} /> : null
        })}
      </datalist>
    ),
    [elementos],
  )

  if (pacote === undefined) return <main class="tela">Abrindo a planta…</main>
  if (pacote === null) {
    return (
      <main class="tela fv-inicio" data-testid="fvs-fora-do-aparelho">
        <header class="fv-topo-inicio">
          <button type="button" class="fv-voltar" onClick={() => sair(voltar)} aria-label="Voltar">
            ‹ Voltar
          </button>
          <div>
            <h1>{pavimento?.nome}</h1>
            <p class="discreto">
              {planta.trecho} · {planta.prancha}
            </p>
          </div>
        </header>
        <p class="aviso">Esta planta ainda não está no aparelho.{!online && ' Precisa de internet uma vez para baixar.'}</p>
        {erroBaixar && (
          <p class="erro" role="alert">
            {erroBaixar}
          </p>
        )}
        <button type="button" class="fv-baixar" data-testid="fvs-baixar-agora" disabled={!online || baixando !== null} onClick={baixarEsta}>
          {baixando !== null ? `Baixando ${baixando}%` : `Baixar agora${tamanhoDaPlanta ? ` (${mb(tamanhoDaPlanta)})` : ''}`}
        </button>
      </main>
    )
  }

  const pecaSel = sel ? elementoDe(sel) : undefined
  /** No painel do furo, a ficha é só o item de furação da ficha da viga. */
  const fichaDoFuro = (id: string): Ficha | undefined => {
    const f = alvoDoFilho(id)
    return f ? { ...f.ficha, itens: f.ficha.itens.filter((i) => i.n === f.item) } : undefined
  }
  /** No painel do ambiente: "2 de 3 OK" das esquadrias dele num item de esquadria da ficha. */
  const resumoDoItemPelasEsquadrias = (ambId: string, n: number) => {
    const ficha = fichaDoLocal(ambId, 'A')
    const sits = (filhosPorPai.get(ambId) ?? []).map((f) => (ficha ? situacaoDoFuro(ficha.id, n, eventosDe(f)) : 'nada'))
    return resumoDasEsquadrias(sits).texto.replace('Esquadrias: ', '')
  }
  const areaSel = sel && elementosDasAreas.has(sel) ? dados.areaPorId.get(sel) : undefined
  // área de laje com barras: o resumo, e o "Tudo OK" da camada escolhida
  const idsDaLaje = areaSel ? barrasDaLaje(areaSel.id) : []
  const barrasDoPainel =
    idsDaLaje.length && barras
      ? (() => {
          const sits = idsDaLaje.map((id) => situacaoDaBarra(eventosDe(id)))
          const daCamada = camada ? idsDaLaje.filter((id) => barras[id].camada === camada) : []
          return {
            resumo: resumoDasBarras(sits).texto,
            camada: camada ? NOME_DA_CAMADA[camada] : '',
            semConferir: daCamada.filter((id) => situacaoDaBarra(eventosDe(id)) === 'nada').length,
            naCamada: daCamada.length,
            aoTudoOk: () => tudoOkNaCamada(areaSel!.id),
            // forma com a armadura em plantas próprias: a barra se confere lá (menu do pavimento)
            aoVer: tipos.includes('B')
              ? () => {
                  fecharPainel()
                  setTipo('B')
                }
              : undefined,
          }
        })()
      : undefined
  // os outros ambientes do mesmo apartamento, para pular de um para o outro pelo painel
  const irmaos =
    pecaSel?.grupo && sel
      ? elementos
          .filter(([, e]) => e.grupo === pecaSel.grupo)
          .sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
          .map(([id, e]) => ({ id, nome: e.nome, comodo: e.comodo, sit: situacao(id, e) }))
      : []
  const escolha = tipos.length > 1 ? 'tipos' : fichasTipo.length > 1 ? 'fichas' : 'nada'
  // planta de ambientes com esquadrias: as abas e, ao lado, o serviço (no celular, o topo ganha uma linha)
  const comServico = escolha === 'tipos' && tipos.includes('A') && fichasPara('A', dados.fichas).length > 1
  // pavimento com mais de um trecho: a caixa de escolha (44 px) deixa o topo mais alto (fvs.css)
  const comTrecho = irmas.length > 1 ? ' com-trecho' : ''
  // quatro abas ou mais (Furos, Barras): no celular e no tablet em pé elas ganham uma linha só delas (fvs.css)
  const muitasAbas = escolha === 'tipos' && tipos.length >= 4 && !comServico ? ' muitas-abas' : ''
  return (
    <div class={`fv-planta${comServico ? ' com-servico' : ''}${comTrecho}${muitasAbas}${pecaSel ? ' com-painel' : ''}${desenho ? ' desenhando' : ''}${porItemAtivo ? ' por-item' : ''}`}>
      <header class={`fv-topo${comServico ? ' com-servico' : ''}${comTrecho}${muitasAbas}${escolha === 'nada' ? ' sem-seg' : ''}${pode && itensDoTipo.length > 0 ? ' com-item' : ''}`}>
        <div class="fv-tit">
          <button type="button" class="fv-voltar" onClick={() => sair(voltar)} aria-label="Voltar">
            ‹
          </button>
          <div class="fv-nomes">
            <b>{pavimento?.nome}</b>
            {irmas.length > 1 ? (
              <select
                aria-label="Trecho"
                value={plantaId}
                onChange={(ev) => ir({ nome: 'planta', plantaId: (ev.target as HTMLSelectElement).value })}
              >
                {irmas.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.trecho}
                  </option>
                ))}
              </select>
            ) : (
              <span>{planta.trecho}</span>
            )}
          </div>
        </div>
        {escolha === 'tipos' && (
          <div class="fv-seg" role="group" aria-label="Tipo de peça" ref={filaDeAbas}>
            {tipos.map((t) => (
              <button type="button" key={t} class={tipo === t ? 'on' : ''} onClick={() => setTipo(t)}>
                {PLURAL_TIPO[t] ?? t}
              </button>
            ))}
          </div>
        )}
        {(escolha === 'fichas' || comServico) && (
          // planta de ambientes: a cor de cada ambiente é a situação dele na ficha (serviço) escolhida aqui;
          // com esquadrias, a planta tem abas (Ambientes, Esquadrias) e o serviço continua aqui, nas duas
          <select
            class="fv-servico"
            aria-label="Ficha"
            data-testid="fvs-servico"
            value={fichaTipo?.codigo}
            onChange={(ev) => setCodigoFicha({ ...codigoFicha, [tipoDaFicha(tipo)]: (ev.target as HTMLSelectElement).value })}
          >
            {fichasTipo.map((f) => (
              <option value={f.codigo} key={f.codigo}>
                {f.titulo}
              </option>
            ))}
          </select>
        )}
        {tipo === 'E' ? (
          // aba Esquadrias: o item de vão ou esquadria que o toque marca (alvenaria tem dois: vãos e vergas)
          itensDeEsquadria.length > 0 ? (
            <select
              class="fv-etapa fv-item-esq"
              aria-label="Item das esquadrias"
              data-testid="fvs-item-esquadria"
              value={itemEsq ? String(itemEsq.n) : ''}
              onChange={(ev) => {
                const it = itensDeEsquadria.find((i) => String(i.n) === (ev.target as HTMLSelectElement).value)
                if (it) setItemDaEsquadria({ n: it.n, titulo: it.titulo })
              }}
            >
              {itensDeEsquadria.map((i) => (
                <option value={String(i.n)} key={i.n}>
                  {i.n}. {i.titulo}
                </option>
              ))}
            </select>
          ) : (
            <span class="discreto fv-sem-item-esq" data-testid="fvs-sem-item-esquadria">
              Ficha sem item de esquadria
            </span>
          )
        ) : tipo === 'B' && camada ? (
          <select class="fv-etapa fv-camada" aria-label="Camada" data-testid="fvs-camada" value={camada} onChange={(ev) => setCamada((ev.target as HTMLSelectElement).value as CamadaDeBarras)}>
            {camadasDasBarras.map((k) => (
              <option value={k} key={k}>
                {NOME_DA_CAMADA[k]}
              </option>
            ))}
          </select>
        ) : (
        <select class="fv-etapa" aria-label="Etapa" value={etapaAtiva} onChange={(ev) => setEtapa((ev.target as HTMLSelectElement).value)}>
          {/* "Todas as etapas" saía cortado no celular ("Todas as eta…"; demonstração, 09/11) e "Etapa: todas" no GitHub, de fonte mais larga */}
          <option value="">Etapas</option>
          {etapas.map((e) => (
            <option value={e} key={e}>
              {e.charAt(0) + e.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        )}
        <input
          class="fv-busca"
          list="fv-lista"
          placeholder="Buscar"
          autocomplete="off"
          aria-label={tipo === 'A' ? 'Buscar ambiente ou apartamento' : 'Buscar peça'}
          onChange={(ev) => {
            const i = ev.target as HTMLInputElement
            buscar(i.value)
            i.value = ''
            i.blur()
          }}
        />
        {listaDaBusca}
        {tipo === 'I' && !fichaDoPonto() ? (
          // planta de consulta (PPCI, SPDA sem ficha; decisão do Nicolas, 21/11/2026: "não vai para ficha"): nada grava
          <span class="fv-prog" data-testid="fvs-progresso" title="Planta para olhar e conferir no local: nenhuma ficha tem o item destes pontos">
            Só consulta
          </span>
        ) : resumoDaCamada ? (
          <span class="fv-prog" data-testid="fvs-progresso" title={resumoDaCamada.texto}>
            {resumoDaCamada.ok}/{resumoDaCamada.total} OK
            {resumoDaCamada.erradas > 0 && ` · ${resumoDaCamada.erradas} errada${resumoDaCamada.erradas > 1 ? 's' : ''}`}
          </span>
        ) : tipo === 'E' && !itemEsq ? null : (
        // aba Esquadrias sem item de esquadria na ficha: sem conta (não há o que marcar; o topo já diz)
        <span class="fv-prog" data-testid="fvs-progresso" title={`${liberadas} de ${doTipo.length} ${(PLURAL_TIPO[tipo] ?? 'peças').toLowerCase()} ${palavraDoProgresso}`}>
          {/* "1/24 pilares" era lido como "pilar 1 de 24" (demonstração, 09/11): o tipo já está na aba */}
          {liberadas}/{doTipo.length} {palavraDoProgresso}
          {paraConcretar > 0 && (
            <span class="fv-txt-concretar" data-testid="fvs-para-concretar">
              <span class="fv-sep">{' · '}</span>
              {paraConcretar} p/ concretar
            </span>
          )}
          {comR > 0 && (
            <>
              {' · '}
              <button
                type="button"
                class="fv-link-r"
                data-testid="fvs-ver-reprovacoes"
                title="Ver as reprovações abertas deste trecho"
                onClick={() => {
                  // folha única: o pavimento inteiro está nesta planta, e o histórico fala em "Trecho 2"
                  filtrarListaAoAbrir(obra.id, filtrosDoTrecho(planta.pavimento_id, planta.trecho === TRECHO_FOLHA_UNICA ? '' : planta.trecho))
                  ir({ nome: 'reprovacoes' })
                }}
              >
                {comR} com NC
              </button>
            </>
          )}
          {avisoCurto && (
            <span class="fv-pend" title={aviso}>
              <br />
              {avisoCurto}
            </span>
          )}
        </span>
        )}
        {pode &&
          tipo !== 'B' &&
          tipo !== 'I' &&
          (tipo === 'L' && aceitaAreas ? (
            <button
              type="button"
              class={`fv-bpincel${desenho ? ' on' : ''}`}
              data-testid="fvs-nova-area"
              onClick={() => (desenho ? cancelarDesenho() : comecarDesenho())}
            >
              + Área
            </button>
          ) : (
            <>
              <button
                type="button"
                class={`fv-bpincel${pincel ? ' on' : ''}`}
                onClick={() => {
                  setPincel(pincel ? null : { etapa: etapaAtiva, resultado: 'C' })
                  setPorItem(null)
                  fecharPainel()
                }}
              >
                Pincel
              </button>
              {itensDoTipo.length > 0 && (
                <button
                  type="button"
                  class={`fv-bitem${porItemAtivo ? ' on' : ''}`}
                  data-testid="fvs-bt-por-item"
                  title="Escolher um item da ficha e marcar pilar a pilar"
                  onClick={() => (porItemAtivo ? setPorItem(null) : entrarPorItem())}
                >
                  Por item
                </button>
              )}
            </>
          ))}
      </header>

      {manifest!.planta_id !== plantaId && (
        <div class="fv-rev-antiga" role="status" data-testid="fvs-revisao-antiga">
          <span>{erroBaixar || `Planta na revisão ${manifest!.revisao}. Já saiu a ${planta.revisao}.`}</span>
          <button type="button" data-testid="fvs-baixar-revisao" disabled={!online || baixando !== null} onClick={baixarEsta}>
            {baixando !== null ? `Baixando ${baixando}%` : !online ? 'Baixe com internet' : `Baixar ${planta.revisao}${tamanhoDaPlanta ? ` (${mb(tamanhoDaPlanta)})` : ''}`}
          </button>
        </div>
      )}

      <button type="button" class="fv-bt-legenda" data-testid="fvs-bt-legenda" aria-expanded={verLegenda} onClick={() => setVerLegenda(!verLegenda)}>
        Legenda
      </button>

      <div class="fv-mapa" ref={divMapa}>
        {tipo === 'L' && aceitaAreas && areasDaPlanta.length === 0 && !desenho && !caixaNova && (
          <p class="fv-dica-area" data-testid="fvs-dica-area">
            {pode ? 'Nenhuma área de laje nesta planta. Toque em “+ Área” e marque os cantos da parte da laje.' : 'Nenhuma área de laje nesta planta.'}
          </p>
        )}
        <div class={`fv-legenda${verLegenda && !pecaSel ? ' aberta' : ''}`} data-testid="fvs-legenda">
          {(tipo === 'B' || tipo === 'I') &&
            (['nada', 'liberado', 'reprovado'] as const).map((s) => (
              <span key={`b:${s}`}>
                <i style={{ borderColor: COR_BARRA[s], background: COR_BARRA[s] }} />
                {tipo === 'I'
                  ? s === 'nada' ? 'Ponto sem conferir' : s === 'liberado' ? 'Ponto OK' : 'Ponto errado'
                  : s === 'nada' ? 'Barra sem conferir' : s === 'liberado' ? 'Barra OK' : 'Barra errada'}
              </span>
            ))}
          {porItemAtivo &&
            ([['nada', COR.nada[0], 'Item sem conferir'], ['C', COR.liberado[0], 'Item OK'], ['NA', COR_NA, 'Item NA'], ['NC', COR.reprovado[0], 'Item errado']] as const).map(([k, cor, texto]) => (
              <span key={`i:${k}`}>
                <i style={{ borderColor: cor, background: cor + '55' }} />
                {texto}
              </span>
            ))}
          {tipo !== 'B' && tipo !== 'I' && !porItemAtivo && (['nada', 'andamento', 'concretagem', 'liberado', 'reprovado'] as Situacao[]).filter((s) => s !== 'concretagem' || tipo !== 'A').map((s) => (
            <span key={s}>
              <i style={{ borderColor: COR[s][0], background: COR[s][0] + '55' }} />
              {ROTULO_SITUACAO[s]}
            </span>
          ))}
          {temDuplicada && (
            <span>
              <i style={{ borderColor: COR_DUPLICADA, borderWidth: '3px' }} />
              Ficha duplicada
            </span>
          )}
        </div>
      </div>

      {msg && (
        <p class={`fv-toast${msg.desfazer ? ' com-acao' : ''}`} role="status">
          <span title={msg.texto}>{msg.texto}</span>
          {msg.desfazer && (
            <button type="button" data-testid="fvs-desfazer" onClick={msg.desfazer}>
              Desfazer
            </button>
          )}
        </p>
      )}

      {pincel && (
        <div class="fv-barpincel" data-testid="fvs-pincel">
          <b>
            Pincel: toque {tipo === 'A' ? 'nos ambientes' : 'nas peças'} para marcar os itens ainda vazios
            {fichaTipo && tipo === 'A' ? ` de ${fichaTipo.titulo}` : ''}
          </b>
          <select
            aria-label="Etapa do pincel"
            value={etapas.includes(pincel.etapa) ? pincel.etapa : ''}
            onChange={(ev) => setPincel({ ...pincel, etapa: (ev.target as HTMLSelectElement).value })}
          >
            <option value="">Ficha inteira</option>
            {etapas.map((e) => (
              <option value={e} key={e}>
                {e.charAt(0) + e.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          {(['C', 'NA'] as const).map((r) => (
            <button type="button" key={r} title={NOME_DO_RESULTADO[r]} class={pincel.resultado === r ? 'on' : ''} onClick={() => setPincel({ ...pincel, resultado: r })}>
              {r}
            </button>
          ))}
          <button type="button" onClick={() => setPincel(null)}>
            Sair
          </button>
        </div>
      )}

      {porItemAtivo && (
        <div class="fv-barpincel fv-bar-item" data-testid="fvs-por-item">
          <select
            aria-label="Item da ficha"
            data-testid="fvs-por-item-escolha"
            value={String(porItemAtivo.n)}
            onChange={(ev) => {
              const it = itensDoTipo.find((i) => String(i.n) === (ev.target as HTMLSelectElement).value)
              if (it) escolherItem(it)
            }}
          >
            {/* o item guardado pode ter saído da ficha vigente: continua escolhido até trocar */}
            {!itensDoTipo.some((i) => i.n === porItemAtivo.n) && <option value={String(porItemAtivo.n)}>{nomeDoItem(porItemAtivo)}</option>}
            {etapasDa({ ...fichaTipo!, itens: itensDoTipo }).map((et) => (
              <optgroup key={et} label={et.charAt(0) + et.slice(1).toLowerCase()}>
                {itensDoTipo
                  .filter((i) => i.etapa === et)
                  .map((i) => (
                    <option key={i.n} value={String(i.n)}>
                      {nomeDoItem(i)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <span class="fv-conta-item" data-testid="fvs-por-item-conta">
            {
              resumoDoItem(
                doTipo.flatMap(([id, e]) => {
                  if (e.so_detalhe) return []
                  const r = resultadoPorItem(id, porItemAtivo)
                  return r === 'fora' ? [] : [r]
                }),
              ).texto
            }
          </span>
          <span class="fv-modo-item" role="group" aria-label="O toque marca">
            {(['C', 'NA'] as const).map((r) => (
              <button type="button" key={r} data-testid={`fvs-por-item-${r}`} title={r === 'C' ? 'O toque marca OK (e, de novo, errado)' : 'O toque marca NA (não se aplica)'} class={modoItem === r ? 'on' : ''} aria-pressed={modoItem === r} onClick={() => setModoItem(r)}>
                {r === 'C' ? 'OK' : 'NA'}
              </button>
            ))}
          </span>
          <button type="button" data-testid="fvs-por-item-sair" onClick={() => setPorItem(null)}>
            Sair
          </button>
        </div>
      )}

      {ncDoItem && porItem && (
        <form
          class="fv-caixa-form"
          data-testid="fvs-nc-item"
          onSubmit={(ev) => {
            ev.preventDefault()
            confirmarNcDoItem()
          }}
        >
          <b>
            {elementoDe(ncDoItem.id)?.nome}: {nomeDoItem(porItem)} errado
          </b>
          <p class="discreto">O NC só é gravado depois de Confirmar.</p>
          <label>
            O que está errado?
            <textarea
              data-testid="fvs-nc-item-texto"
              required
              maxLength={500}
              rows={3}
              value={ncDoItem.texto}
              onInput={(ev) => setNcDoItem({ ...ncDoItem, texto: (ev.target as HTMLTextAreaElement).value })}
            />
          </label>
          <div class="fv-caixa-acoes">
            <button type="submit" class="on" data-testid="fvs-nc-item-confirmar" disabled={!ncDoItem.texto.trim()}>
              Confirmar
            </button>
            <button
              type="button"
              data-testid="fvs-nc-item-cancelar"
              onClick={() => {
                setNcDoItem(null)
                fecharSobre()
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {desenho && (
        <div class="fv-barpincel" data-testid="fvs-desenho">
          <b>
            {desenho.areaId ? `Novo contorno de ${dados.areaPorId.get(desenho.areaId)?.nome ?? 'área'}` : 'Nova área de laje'}: toque nos cantos da área ({desenho.pontos.length}{' '}
            {desenho.pontos.length === 1 ? 'canto' : 'cantos'}). Arrastar move a planta.
          </b>
          <button type="button" data-testid="fvs-desfazer-ponto" disabled={!desenho.pontos.length} onClick={() => setDesenho({ ...desenho, pontos: desenho.pontos.slice(0, -1) })}>
            Desfazer ponto
          </button>
          <button type="button" class="on" data-testid="fvs-concluir-area" disabled={desenho.pontos.length < 3} onClick={() => concluirDesenho(desenho.pontos)}>
            Concluir
          </button>
          <button type="button" onClick={cancelarDesenho}>
            Cancelar
          </button>
        </div>
      )}

      {mesmoDesenhoAberto && (
        <div class="fv-escolha" role="dialog" aria-label="Escolha a peça" data-testid="fvs-escolha-peca">
          <b>Este desenho é de {mesmoDesenhoAberto.length} peças. Qual você quer abrir?</b>
          <div class="fv-escolha-pecas">
            {mesmoDesenhoAberto.map((id) => {
              const e = elementoDe(id)
              // a mesma cor e o mesmo nome da legenda: a pessoa escolhe sem adivinhar
              const s = e ? situacao(id, e) : 'nada'
              return (
                <button type="button" key={id} data-situacao={s} onClick={() => escolherPeca(id)}>
                  <i style={{ borderColor: COR[s][0], background: COR[s][0] + '55' }} />
                  <b>{e?.nome ?? id}</b>
                  <span>{ROTULO_SITUACAO[s]}</span>
                </button>
              )
            })}
          </div>
          <button type="button" class="fv-escolha-cancelar" onClick={() => escolherPeca(null)}>
            Cancelar
          </button>
        </div>
      )}

      {qualFuro && (
        <div class="fv-escolha" role="dialog" aria-label="Qual furo?" data-testid="fvs-escolha-furo">
          <b>
            {elementoDe(qualFuro[0])?.tipo === 'E' ? `Qual esquadria? O toque pegou ${qualFuro.length} esquadrias.` : `Qual furo? O toque pegou ${qualFuro.length} furos.`}
          </b>
          <div class="fv-escolha-pecas">
            {qualFuro.map((id) => {
              const e = elementoDe(id)
              const s = e ? situacao(id, e) : 'nada'
              return (
                <button type="button" key={id} data-situacao={s} onClick={() => escolherFuro(id)}>
                  <i style={{ borderColor: COR[s][0], background: COR[s][0] + '55' }} />
                  <b>{e?.nome ?? id}</b>
                  <span>{e?.secao ? `${e.secao} · ` : ''}{s === 'liberado' ? 'OK' : s === 'reprovado' ? 'errado' : 'sem conferir'}</span>
                </button>
              )
            })}
          </div>
          <button type="button" class="fv-escolha-cancelar" onClick={() => escolherFuro(null)}>
            Cancelar
          </button>
        </div>
      )}

      {ncDaBarra && pontos?.[ncDaBarra.id] && (
        <form
          class={ncDaBarra.embaixo ? 'fv-caixa-form fv-caixa-embaixo' : 'fv-caixa-form'}
          data-testid="fvs-nc-ponto"
          onSubmit={(ev) => {
            ev.preventDefault()
            confirmarNcDaBarra()
          }}
        >
          <b>Ponto errado: {nomeDoPonto(pontos[ncDaBarra.id])}</b>
          <p class="discreto">O NC só é gravado depois de Confirmar.</p>
          <label>
            O que está errado?
            <textarea
              data-testid="fvs-nc-ponto-texto"
              required
              // escrevendo, a caixa sobe: embaixo, o teclado do celular a cobriria
              onFocus={() => ncDaBarra.embaixo && setNcDaBarra({ ...ncDaBarra, embaixo: false })}
              maxLength={500}
              rows={3}
              value={ncDaBarra.texto}
              onInput={(ev) => setNcDaBarra({ ...ncDaBarra, texto: (ev.target as HTMLTextAreaElement).value })}
            />
          </label>
          <div class="fv-caixa-acoes">
            <button type="submit" class="on" data-testid="fvs-nc-ponto-confirmar" disabled={!ncDaBarra.texto.trim()}>
              Confirmar
            </button>
            <button
              type="button"
              data-testid="fvs-nc-ponto-cancelar"
              onClick={() => {
                setNcDaBarra(null)
                fecharSobre()
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {ncDaBarra && barras?.[ncDaBarra.id] && (
        <form
          class={ncDaBarra.embaixo ? 'fv-caixa-form fv-caixa-embaixo' : 'fv-caixa-form'}
          data-testid="fvs-nc-barra"
          onSubmit={(ev) => {
            ev.preventDefault()
            confirmarNcDaBarra()
          }}
        >
          <b>Barra errada: {barras[ncDaBarra.id].texto ?? nomeDaBarra(barras[ncDaBarra.id])}</b>
          <p class="discreto">{NOME_DA_CAMADA[barras[ncDaBarra.id].camada]}. O NC só é gravado depois de Confirmar.</p>
          <label>
            O que está errado?
            <textarea
              data-testid="fvs-nc-barra-texto"
              required
              // escrevendo, a caixa sobe: embaixo, o teclado do celular a cobriria
              onFocus={() => ncDaBarra.embaixo && setNcDaBarra({ ...ncDaBarra, embaixo: false })}
              maxLength={500}
              rows={3}
              value={ncDaBarra.texto}
              onInput={(ev) => setNcDaBarra({ ...ncDaBarra, texto: (ev.target as HTMLTextAreaElement).value })}
            />
          </label>
          <div class="fv-caixa-acoes">
            <button type="submit" class="on" data-testid="fvs-nc-barra-confirmar" disabled={!ncDaBarra.texto.trim()}>
              Confirmar
            </button>
            <button
              type="button"
              data-testid="fvs-nc-barra-cancelar"
              onClick={() => {
                setNcDaBarra(null)
                fecharSobre()
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {caixaNova && (
        <form
          class="fv-caixa-form"
          data-testid="fvs-caixa-nova"
          onSubmit={(ev) => {
            ev.preventDefault()
            criarDaCaixa()
          }}
        >
          <b>Nova área de laje</b>
          <label>
            Nome
            <input
              data-testid="fvs-caixa-nome"
              required
              maxLength={60}
              value={caixaNova.nome}
              onInput={(ev) => setCaixaNova({ ...caixaNova, nome: (ev.target as HTMLInputElement).value })}
            />
          </label>
          <label>
            Ficha
            <select data-testid="fvs-caixa-ficha" required value={caixaNova.fichaId} onChange={(ev) => setCaixaNova({ ...caixaNova, fichaId: (ev.target as HTMLSelectElement).value })}>
              {fichasDaCaixa(dados.fichas).map((f) => (
                <option value={f.id} key={f.id}>
                  {f.codigo} {f.titulo}
                </option>
              ))}
            </select>
          </label>
          {sistema && (
            <label>
              Código da ficha no {sistema.nome} (se já abriu)
              <input data-testid="fvs-caixa-codigo" maxLength={60} value={caixaNova.codigo} onInput={(ev) => setCaixaNova({ ...caixaNova, codigo: (ev.target as HTMLInputElement).value })} />
            </label>
          )}
          {!fichasDaCaixa(dados.fichas).length && <p class="aviso">Esta obra ainda não tem fichas cadastradas.</p>}
          <div class="fv-caixa-acoes">
            <button type="submit" class="on" data-testid="fvs-caixa-criar" disabled={!caixaNova.nome.trim() || !caixaNova.fichaId}>
              Criar área
            </button>
            <button
              type="button"
              onClick={() => {
                setDesenho({ pontos: caixaNova.contorno })
                setCaixaNova(null)
              }}
            >
              Voltar ao desenho
            </button>
            <button
              type="button"
              onClick={() => {
                setCaixaNova(null)
                fecharSobre()
              }}
            >
              Descartar
            </button>
          </div>
        </form>
      )}

      {pecaSel && sel && (
        <Painel
          key={`${sel}|${parteAberta ?? ''}`}
          id={sel}
          partes={partesDe(sel)}
          parteAberta={parteAberta}
          situacaoDaParte={(parte) => situacaoDaParte(sel, parte)}
          travas={areaSel ? travasDe(sel) : []}
          aoIrParte={(id, parte) => tocarParteRef.current(id, parte)}
          peca={pecaSel}
          ctx={ctx}
          c={c}
          pacote={pacote}
          ficha={ehFilho(pecaSel.tipo) ? fichaDoFuro(sel) : fichaDoLocal(sel, pecaSel.tipo)}
          foraDaFicha={pecaSel.tipo === 'A' && !fichaValeNoLocal(pecaSel, fichaDoLocal(sel, 'A')?.codigo)}
          // a área tem a ficha dela: escolhida na caixa, não muda depois
          fichas={areaSel ? (fichaPorId(areaSel.ficha_id) ? [fichaPorId(areaSel.ficha_id)!] : []) : ehFilho(pecaSel.tipo) ? [] : fichasPara(pecaSel.tipo, dados.fichas)}
          aoGravar={
            ehFilho(pecaSel.tipo) && paiDe(pecaSel)
              ? () => acertarViga(paiDe(pecaSel)!, alvoDoFilho(sel)?.item)
              : pecaSel.tipo === 'F' && furosDeLaje.get(sel)
                ? () => acertarArea(furosDeLaje.get(sel)!.id)
                : undefined
          }
          instalacoes={areaSel ? instalacoesDaArea(areaSel.id) : undefined}
          furoDeLaje={
            ehFuroDeLaje(pecaSel)
              ? { area: furosDeLaje.get(sel) ? { id: furosDeLaje.get(sel)!.id, nome: furosDeLaje.get(sel)!.nome } : undefined, aviso: furoSemItem(sel) }
              : undefined
          }
          area={areaSel}
          aoRedesenhar={areaSel ? () => comecarDesenho(areaSel.id) : undefined}
          aoApagarArea={areaSel ? () => apagarArea(areaSel) : undefined}
          abertas={abertasDe(sel)}
          abertaInicial={sel === pecaInicial ? (fichaCampoInicial ?? (itemInicial ? SO_NO_APP : undefined)) : undefined}
          itemInicial={sel === pecaInicial ? itemInicial : undefined}
          aoTrocarFicha={(cod) => setCodigoFicha({ ...codigoFicha, [pecaSel.tipo]: cod })}
          etapa={etapaAtiva}
          irmaos={irmaos.length <= MAX_ATALHOS ? irmaos : []}
          furos={pecaSel.tipo === 'V' || pecaSel.tipo === 'A' ? filhosDe(sel) : []}
          resumoDoFilhoNoItem={pecaSel.tipo === 'A' ? (n) => resumoDoItemPelasEsquadrias(sel, n) : undefined}
          itemDosFilhos={pecaSel.tipo === 'A' ? itemEsq?.titulo : undefined}
          barras={barrasDoPainel}
          viga={ehFilho(pecaSel.tipo) && paiDe(pecaSel) && manifest?.elementos[paiDe(pecaSel)!] ? { id: paiDe(pecaSel)!, nome: manifest.elementos[paiDe(pecaSel)!].nome } : undefined}
          aoIr={abrirPainel}
          aoIrComTipo={(id) => {
            const t = elementoDe(id)?.tipo
            if (t) setTipo(t)
            setParteAberta(null)
            abrirPainel(id)
          }}
          eventos={eventosDe(sel)}
          pode={pode}
          executar={executar}
          aoFechar={fecharPainel}
          aoZoom={abrirZoom}
          avisar={avisar}
          avisarLote={avisarLote}
          ligar={(cx, ficha, itens, evs) => ligar(cx, sel, ficha, itens, evs)}
          nomeDe={(id) => elementoDe(id)?.nome}
        />
      )}

      {zoom && (
        // o toque em qualquer lugar fecha, inclusive no botão
        <div class="fv-zoom" onClick={fecharZoom} role="dialog" aria-label="Detalhe ampliado">
          <button type="button" class="fv-zoom-fechar">
            Fechar
          </button>
          <img src={zoom} alt="" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------- painel da peça

interface PropsPainel {
  /** ambiente em que a ficha escolhida não vale (tabela ficha × tipo de cômodo): sem itens para marcar */
  foraDaFicha?: boolean
  id: string
  /** consolo e capitel do pilar nesta planta */
  partes: readonly string[]
  /** tocou no consolo ou no capitel: a seção dele vem aberta */
  parteAberta: string | null
  situacaoDaParte: (parte: string) => Situacao | undefined
  /** área de laje: consolo e capitel pendentes dentro dela */
  travas: readonly TravaDaArea[]
  aoIrParte: (id: string, parte: string) => void
  peca: ElementoPacote
  ctx: ContextoFvs
  c: Contexto
  pacote: PacoteAberto
  ficha: Ficha | undefined
  fichas: Ficha[]
  /** é uma área de laje desenhada: mostra a caixa dela no lugar do detalhe */
  area?: AreaDeLaje
  aoRedesenhar?: () => void
  aoApagarArea?: () => void
  /** fichas abertas desta peça no sistema oficial (mais de uma = duplicada) */
  abertas: FichaCampo[]
  /** vindo da lista de reprovações: a ficha e o item que o painel mostra primeiro */
  abertaInicial?: string
  itemInicial?: number
  aoTrocarFicha: (codigo: string) => void
  etapa: string
  /** ambientes do mesmo apartamento (vazio para pilar e viga) */
  irmaos: Array<{ id: string; nome: string; comodo?: string; sit: Situacao }>
  /** só viga (e ambiente): os furos dela (as esquadrias dele), com a situação de cada um */
  furos: Array<{ id: string; nome: string; rotulo: string; sit: Situacao }>
  /** só ambiente: "2 de 3 OK" das esquadrias num item de esquadria da ficha */
  resumoDoFilhoNoItem?: (n: number) => string
  /** só ambiente: o item de esquadria escolhido na aba Esquadrias (o que os botões mostram) */
  itemDosFilhos?: string
  /** só área de laje com barras do pacote: o item de armadura fica com elas */
  barras?: { resumo: string; camada: string; semConferir: number; naCamada: number; aoTudoOk: () => void; aoVer?: () => void }
  /** só furo (e esquadria): a viga em que ele fica (o ambiente em que ela fica) */
  viga?: { id: string; nome: string }
  /** só área de laje com furos de laje: a situação dos furos de cada instalação (item 4, 19/11) */
  instalacoes?: Partial<Record<Instalacao, Situacao[]>>
  /** só furo de laje: a área em que ele cai (sem área: fora de área de laje) e por que não marca, se não marcar */
  furoDeLaje?: { area?: { id: string; nome: string }; aviso: string }
  aoIr: (id: string) => void
  /** abre outra peça trocando a aba (da viga para o furo e de volta) */
  aoIrComTipo: (id: string) => void
  /** depois de gravar algo nesta peça (furo: levar o resultado ao item de furação da viga) */
  aoGravar?: () => void
  eventos: EventoFvs[]
  pode: boolean
  executar: (passo: (eventosDe: (id: string) => EventoFvs[]) => Promise<Linha | Linha[] | void>) => Promise<unknown>
  aoFechar: () => void
  aoZoom: (src: string) => void
  avisar: (t: string) => void
  avisarLote: (t: string, gravados: readonly Linha[]) => void
  /** as ligações depois de um C neste local (na área de laje, também nas peças de dentro dela) */
  ligar: (cx: Contexto, ficha: Ficha, itens: readonly number[], eventos: readonly EventoFvs[]) => Promise<Linha[]>
  nomeDe: (id: string) => string | undefined
}

function Painel(p: PropsPainel) {
  const { peca, pacote, ctx } = p
  const fichaPorId = (id: string) => ctx.dados.fichaPorId.get(id)
  // Peça com ficha aberta: o painel mostra uma de cada vez, começando pela que pede atenção.
  // Marcação feita só no app antes de a ficha do sistema oficial chegar aparece como mais uma.
  const temDoApp = p.abertas.length > 0 && !!p.ficha && p.eventos.some((e) => !e.ficha_campo_id)
  const todas = temDoApp ? [...p.abertas, fichaSoNoApp(p.ficha!)] : p.abertas
  // a ordem é decidida ao abrir o painel: não pode mudar sob o dedo enquanto a pessoa marca
  const [ordem] = useState(() => ordenarFichasAbertas(todas, fichaPorId, p.eventos).map((a) => a.id))
  const abertas = [...todas].sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id))
  const [idAberta, setIdAberta] = useState<string | null>(p.abertaInicial ?? abertas[0]?.id ?? null)
  const aberta = abertas.find((a) => a.id === idAberta) ?? abertas[0]
  const ficha = aberta ? fichaNaPeca(aberta.ficha_id ? fichaPorId(aberta.ficha_id) : undefined, p.partes) : p.ficha
  const vigente = p.fichas.find((f) => f.codigo === ficha?.codigo)
  const trilha = aberta && aberta.id !== SO_NO_APP ? aberta.id : null
  const eventos = daFichaAberta(p.eventos, trilha)
  const c: Contexto = { ...p.c, fichaCampoId: trilha }
  const det = peca.detalhe ? pacote.manifest.detalhes[peca.detalhe] : undefined
  const imgDet = peca.detalhe ? pacote.url(`d:${peca.detalhe}`) : undefined
  const imgAco = peca.detalhe && det?.aco ? pacote.url(`a:${peca.detalhe}`) : undefined
  // arranque do pilar de cima (pipeline/fvs/lances.py): só o detalhe, sem ficha
  const soDetalhe = !!peca.so_detalhe
  const corrigidoEm = dataCurta(peca.detalhe_corrigido_em)
  // ambiente: a modulação e os projetos da ficha escolhida (paginação de piso, impermeabilização...), um embaixo do outro
  const recortesA = recortesDoAmbiente(peca, pacote.manifest.detalhes, ficha?.codigo)
  // os outros cômodos do apartamento (o ambiente com recorte de modulação mostra os dois)
  const irmaosDoAmbiente =
    peca.tipo === 'A' && p.irmaos.length > 1 ? (
      <div class="fv-sec fv-irmaos" data-testid="fvs-irmaos">
        <h3>
          <span>
            {peca.grupo} · {p.irmaos.length} ambientes
          </span>
        </h3>
        <div class="fv-chips">
          {p.irmaos.map((i) => (
            <button
              type="button"
              key={i.id}
              class={`fv-chip s-${i.sit}${i.id === p.id ? ' on' : ''}`}
              aria-label={`${i.nome}${i.comodo ? ` ${i.comodo}` : ''}: ${ROTULO_SITUACAO[i.sit]}`}
              aria-current={i.id === p.id}
              onClick={() => p.aoIr(i.id)}
            >
              {i.nome.slice(i.nome.lastIndexOf('-') + 1)}
              {i.comodo && <span class="fv-chip-nm"> {i.comodo}</span>}
            </button>
          ))}
        </div>
      </div>
    ) : null
  const corpo = useRef<HTMLDivElement>(null)
  const daFicha = ficha ? eventos.filter((e) => e.ficha_id === ficha.id) : []
  const ult = ultimosPorItem(daFicha)
  const pct = ficha ? percentualConforme(ficha, eventos) : null
  const sit = p.travas.length ? 'reprovado' : ficha ? situacaoDaPeca(ficha, eventos) : 'nada'
  const furo = peca.tipo === 'F' ? peca.furo : undefined
  const esq = peca.tipo === 'E' ? peca.esquadria : undefined
  // item que os filhos marcam: o de furação na viga com furos, os de esquadria no ambiente com esquadrias
  const doFilho = (x: ItemFicha) => p.furos.length > 0 && (peca.tipo === 'A' ? !!x.esquadrias : !!x.furos)
  const resumoDosFilhos = peca.tipo === 'A' ? resumoDasEsquadrias(p.furos.map((f) => f.sit)) : resumoDosFuros(p.furos.map((f) => f.sit))

  // grava na fila da tela, com os registros mais novos desta peça
  const gravar = (op: (evs: EventoFvs[]) => Promise<Linha | Linha[] | void>) => {
    const feito = p.executar((eventosDe) => op(daFichaAberta(eventosDe(p.id), trilha)))
    if (p.aoGravar) p.aoGravar()
    return feito
  }

  const nomeDe = (e: EventoFvs) => quemMarcou(e, ctx.dados, ctx.props.usuario.id)

  // Vindo da lista de reprovações: leva o painel até o item. De novo quando as imagens do detalhe
  // carregam, porque elas empurram o item para baixo. Se a pessoa mexeu no painel, não rola mais.
  const mexeuNoPainel = useRef(false)
  const rolarAoItem = () => {
    if (mexeuNoPainel.current) return
    // tocou no consolo ou no capitel: o painel vai direto à seção dele
    const alvo = p.itemInicial ? `[data-item="${p.itemInicial}"]` : p.parteAberta ? `[data-testid="fvs-parte-${p.parteAberta}"]` : null
    if (alvo) corpo.current?.querySelector(alvo)?.scrollIntoView({ block: 'start' })
  }
  useEffect(() => {
    rolarAoItem()
    const t = window.setTimeout(rolarAoItem, 400)
    return () => window.clearTimeout(t)
  }, [])

  // Itens comuns primeiro; os de consolo e capitel em seções à parte, fechadas, a não ser que a pessoa
  // tenha tocado na parte (ou venha da lista para um item dela). Item de parte que o pilar não tem só
  // aparece se já foi marcado (não some o que alguém marcou).
  const partesDaFicha: string[] = []
  for (const it of ficha?.itens ?? []) {
    if (it.parte && !partesDaFicha.includes(it.parte) && (p.partes.includes(it.parte) || ult.get(it.n)?.resultado)) partesDaFicha.push(it.parte)
  }
  /** Item de esgoto ou água da área com furos de laje do tema: quem marca são os furos (item 4, 19/11). */
  const pelosFurosDeLaje = (x: ItemFicha) => !!x.instalacao && x.instalacao !== 'eletrica' && !!p.instalacoes?.[x.instalacao]?.length
  const furosEletricos = p.instalacoes?.eletrica ?? []
  const avisoEletrico = furosEletricos.length ? avisoDoCEletrico(furosEletricos) : null
  const montar = (itens: readonly ItemFicha[]) => {
  let etapaAtual: string | null = null
  const linhas = []
  if (ficha) {
    for (const it of itens) {
      if (it.etapa !== etapaAtual) {
        etapaAtual = it.etapa
        const et = it.etapa
        // o item das barras (e o dos furos) não entra no "Etapa C": quem marca é a planta
        const automatico = (x: ItemFicha) => (!!x.barras && !!p.barras) || doFilho(x) || pelosFurosDeLaje(x)
        const vazios = itens.filter((x) => x.etapa === et && !ult.get(x.n)?.resultado && !automatico(x)).length
        linhas.push(
          <h3 class={`fv-etapa-tit${p.etapa && p.etapa !== et ? ' apagada' : ''}`} key={`e:${et}`}>
            <span>{et || 'Itens'}</span>
            {p.pode && vazios > 0 && (
              <button
                type="button"
                onClick={() => {
                  const toque: Toque = { tipo: 'lote', id: crypto.randomUUID(), obraId: c.obraId, usuarioId: c.usuarioId, plantaId: c.plantaId, fichaCampoId: c.fichaCampoId ?? null, pecas: [{ id: p.id, fichaId: ficha.id, fichaCampoId: c.fichaCampoId ?? null }], etapa: et, resultado: 'C' }
                  anotarToque(toque)
                  // itens da etapa ainda dentro do prazo das regras da obra: uma pergunta só (decisão de 19/11)
                  const noPrazo = prazosDoLote(ctx.dados, [{ id: p.id, ficha, eventos }], et)
                  const comPrazo = noPrazo.size > 0 && confirm(perguntaDoLote(noPrazo.size))
                  // elétrica da laje vazia nesta etapa, com passagem errada ou sem conferir: pergunta (19/11)
                  const el = itens.find((x) => x.etapa === et && x.instalacao === 'eletrica' && !ult.get(x.n)?.resultado)
                  const semEletrica = !!el && !!avisoEletrico && !confirm(avisoEletrico)
                  gravar(async (evs) => {
                    const fichaDoLote = { ...ficha, itens: ficha.itens.filter((x) => !automatico(x) && !(semEletrica && x === el) && (comPrazo || !noPrazo.has(`${p.id}#${x.n}`))) }
                    const gravados = await marcarLote(c, [{ id: p.id, ficha: fichaDoLote, eventos: evs }], et, 'C', toque.id, noPrazo).finally(() => esquecerToque(toque.obraId, toque.id))
                    const ligados = await p.ligar(c, ficha, gravados.map((g) => Number(g.item)), [...evs, ...(gravados as unknown as EventoFvs[])])
                    const n = gravados.length
                    // toque duplo: o segundo não acha nada vazio e não pode tirar o "Desfazer" da tela
                    if (n) p.avisarLote(`${peca.nome}: ${n} ${n === 1 ? 'item' : 'itens'} C${et ? ` em ${et.toLowerCase()}` : ''}${maisLigados(ligados)}`, [...gravados, ...ligados])
                    return [...gravados, ...ligados]
                  })
                }}
                title="Marca C (conforme) nos itens ainda vazios desta etapa (fica registrado como lote)"
              >
                Etapa C ({vazios})
              </button>
            )}
          </h3>,
        )
      }
      const v = ult.get(it.n)
      const hist = historico(daFicha, it.n)
      const reprovado = v?.resultado === 'NC'
      const fotosDe = (evs: readonly EventoFvs[]) => evs.flatMap((e) => ctx.dados.fotosDe.get(e.id) ?? [])
      const reprovacoes = reprovacoesDoItem(hist)
      // o R que está valendo aparece aberto, logo abaixo; as outras rodadas ficam no histórico
      const passadas = reprovacoes.filter((x) => !reprovado || x.rodada !== v?.rodada)
      const fotos = reprovado ? fotosDe(reprovacoes.find((x) => x.rodada === v?.rodada)?.eventos ?? []) : []
      // viga com furos no modelo: o item de furação é dos furos (aba Furos), não da mão (decisão de 18/11)
      // ambiente com esquadrias: os itens de vão e esquadria são delas (aba Esquadrias), como os furos (19/11)
      const pelosFuros = doFilho(it)
      // área com barras no pacote: o item de armadura é das barras (aba Barras), não da mão (plano A, 18/11)
      const pelasBarras = !!it.barras && !!p.barras
      // área com furos de laje: esgoto e água são dos furos (aba Furos); a elétrica é da pessoa
      const furosDoTema = it.instalacao ? (p.instalacoes?.[it.instalacao] ?? []) : []
      const pelosFurosDaLaje = pelosFurosDeLaje(it)
      const eletricaComFuros = it.instalacao === 'eletrica' && furosDoTema.length > 0
      const automatico = pelosFuros || pelasBarras || pelosFurosDaLaje
      // prazo das regras da obra (escoramento, reescoramento): só aparece enquanto o item não está C
      const prazo = v?.resultado === 'C' ? null : prazoDoItemNaPeca(ctx.dados, ficha, eventos, it.n)
      linhas.push(
        <div class={`fv-item${p.etapa && p.etapa !== it.etapa ? ' apagada' : ''}${p.itemInicial === it.n ? ' destaque' : ''}`} key={it.n} data-item={it.n}>
          <div class="fv-num">{it.n}</div>
          <div class="fv-tx">
            <div class="fv-tt">{it.titulo}</div>
            {prazo && (
              <div class="fv-prazo" data-testid="fvs-prazo">
                Aguardando · {seloDoPrazo(prazo)}
              </div>
            )}
            {it.descricao && <div class="fv-ds">{it.descricao}</div>}
            {(it.dispositivo || it.tolerancia) && (
              <div class="fv-mt">
                {it.dispositivo && `Dispositivo: ${it.dispositivo}`}
                {it.dispositivo && it.tolerancia && ' · '}
                {it.tolerancia && `Tolerância: ${it.tolerancia}`}
              </div>
            )}
            {v?.resultado && (
              <div class={`fv-hr r-${v.resultado}`}>
                {ehDoConcreto(v) ? (
                  // calculado pelo caminhão do Concreto: só o dia (não tem hora nem quem marcou)
                  <>
                    {v.resultado} · {rotuloRodada(v.rodada)} · <span data-testid="fvs-obs-c">{v.observacao}</span>
                  </>
                ) : (
                  <>
                    {v.resultado} {quando(v.criado_em_dispositivo)} · {rotuloRodada(v.rodada)} · {nomeDe(v)}
                    {/* C com observação: veio da ligação (diz de onde) ou foi marcado antes do prazo */}
                    {v.resultado === 'C' && v.observacao ? <span data-testid="fvs-obs-c"> · {v.observacao}</span> : v.lote_id && ' · em lote'}
                  </>
                )}
              </div>
            )}
            {passadas.length > 0 && (
              <details class="fv-hist" data-testid="fvs-hist">
                <summary>Reprovado antes: {passadas.map((x) => `${rotuloRodada(x.rodada)} ${dia(x.evento.criado_em_dispositivo)}`).join(', ')}</summary>
                {passadas.map((x) => (
                  <div class="fv-hist-r" key={x.rodada}>
                    <div>
                      {rotuloRodada(x.rodada)}: NC {quando(x.evento.criado_em_dispositivo)} · {nomeDe(x.evento)}
                    </div>
                    {x.observacao && <div class="fv-hist-obs">{x.observacao}</div>}
                    <FotosDoItem ids={fotosDe(x.eventos)} ctx={ctx} aoZoom={p.aoZoom} />
                  </div>
                ))}
              </details>
            )}
            {reprovado && v && (
              <div class="fv-nc">
                <CampoNc
                  inicial={v.observacao ?? ''}
                  pode={p.pode}
                  salvar={(t) =>
                    gravar(async (evs) => {
                      // grava sobre o registro mais novo do item (pode ter mudado na fila)
                      const atual = ultimosPorItem(evs.filter((e) => e.ficha_id === ficha.id)).get(it.n)
                      if (atual?.resultado === 'NC' && (atual.observacao ?? '') !== t.trim()) return observar(c, atual, t)
                      return []
                    })
                  }
                />
                <FotosDoItem ids={fotos} ctx={ctx} aoZoom={p.aoZoom} />
                {p.pode && (
                  <div class="fv-nc-acoes">
                    <label class="fv-foto">
                      {fotos.length > 0 ? 'Outra foto' : 'Tirar foto'}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(ev) => {
                          const i = ev.target as HTMLInputElement
                          const arq = i.files?.[0]
                          i.value = ''
                          if (arq) gravar(async () => {
                            await anexarFoto(c, v.id, await reduzirFoto(arq))
                            p.avisar(p.ctx.local ? 'Foto guardada no aparelho.' : 'Foto guardada. Vai para o servidor quando houver internet.')
                          })
                        }}
                      />
                    </label>
                    {!automatico && <button type="button" class="fv-link" onClick={() => {
                        const id = crypto.randomUUID()
                        const toque: Toque = { tipo: 'desmarcar', id, obraId: c.obraId, usuarioId: c.usuarioId, plantaId: c.plantaId, fichaCampoId: c.fichaCampoId ?? null, pecaId: p.id, fichaId: ficha.id, item: it.n }
                        anotarToque(toque)
                        gravar((evs) => desmarcarR(c, p.id, ficha, it.n, evs, id).finally(() => esquecerToque(toque.obraId, toque.id)))
                      }}>
                      Desmarcar NC
                    </button>}
                  </div>
                )}
              </div>
            )}
            {v && horaNaFrente(v) && <AvisoHora testid="fvs-hora-na-frente" texto={avisoHoraNaFrente(nomeDe(v), v.criado_em_dispositivo)} />}
          </div>
          {p.pode && pelosFuros && peca.tipo !== 'A' && (
            <div class="fv-bt fv-pelos-furos" data-testid="fvs-item-pelos-furos">
              <span class="discreto">Marcado pelos furos ({resumoDosFuros(p.furos.map((f) => f.sit)).texto.replace('Furos: ', '')})</span>
            </div>
          )}
          {p.pode && pelosFuros && peca.tipo === 'A' && (
            <div class="fv-bt fv-pelos-furos" data-testid="fvs-item-pelas-esquadrias">
              <span class="discreto">Marcado pelas esquadrias ({p.resumoDoFilhoNoItem?.(it.n) ?? ''})</span>
            </div>
          )}
          {p.pode && pelosFurosDaLaje && (
            <div class="fv-bt fv-pelos-furos" data-testid="fvs-item-pelos-furos-laje">
              <span class="discreto">Marcado pelos furos ({resumoDosFuros(furosDoTema).texto.replace('Furos: ', '')})</span>
            </div>
          )}
          {eletricaComFuros && (
            <div class="fv-bt fv-pelos-furos" data-testid="fvs-item-eletrica-furos">
              <span class="discreto">Passagens no modelo: {resumoDosFuros(furosDoTema).texto.replace('Furos: ', '')}. Caixas e eletrodutos: confira à mão.</span>
            </div>
          )}
          {pelasBarras && (
            <div class="fv-bt fv-pelos-furos" data-testid="fvs-item-pelas-barras">
              <span class="discreto">Marcado pelas barras ({p.barras!.resumo.replace('Barras: ', '')})</span>
            </div>
          )}
          {p.pode && !automatico && (
            <div class="fv-bt">
              {reprovado && v && <div class="fv-reinsp">Para reinspecionar ({rotuloRodada(v.rodada + 1)}), toque C, NC ou NA:</div>}
              {(['C', 'NC', 'NA'] as const).map((r) => (
                <button
                  type="button"
                  key={r}
                  data-r={r}
                  title={NOME_DO_RESULTADO[r]}
                  class={v?.resultado === r && !reprovado ? 'on' : reprovado && r === 'NC' ? 'on' : ''}
                  aria-pressed={v?.resultado === r}
                  onClick={() => {
                    // C dentro do prazo das regras da obra: só avisa (pergunta) e grava "Marcado antes do prazo"
                    const viraC = r === 'C' && v?.resultado !== 'C'
                    if (viraC && prazo && !confirm(perguntaDoPrazo(prazo, peca.nome))) return
                    // C da elétrica com passagem errada ou sem conferir: só avisa e pergunta (19/11)
                    if (viraC && eletricaComFuros && avisoEletrico && !confirm(avisoEletrico)) return
                    const obs = viraC && prazo ? observacaoDoPrazo(prazo) : null
                    // o diário anota já, no toque; a gravação vem na fila (toques anteriores primeiro)
                    const id = crypto.randomUUID()
                    const toque: Toque = { tipo: 'item', id, obraId: c.obraId, usuarioId: c.usuarioId, plantaId: c.plantaId, fichaCampoId: c.fichaCampoId ?? null, pecaId: p.id, fichaId: ficha.id, item: it.n, resultado: r, ...(obs ? { observacao: obs } : {}) }
                    anotarToque(toque)
                    gravar(async (evs) => {
                      const gravado = await tocarItem(c, p.id, ficha, it.n, r, evs, id, obs).finally(() => esquecerToque(toque.obraId, toque.id))
                      if (gravado.resultado !== 'C') return gravado
                      // ligação entre fichas: o C marca os itens ligados da peça; o aviso traz "Desfazer" deles
                      const ligados = await p.ligar(c, ficha, [it.n], [...evs, gravado as unknown as EventoFvs])
                      if (ligados.length) p.avisarLote(textoDasLigacoes(peca.nome, ficha, p.id, ligados, p.nomeDe), ligados)
                      return [gravado, ...ligados]
                    })
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>,
      )
    }
  }
  return linhas
  }
  const linhas = montar(ficha?.itens.filter((it) => !it.parte) ?? [])
  const secoesDasPartes = partesDaFicha.map((parte) => {
    const itens = (ficha?.itens ?? []).filter((it) => it.parte === parte && (p.partes.includes(parte) || ult.get(it.n)?.resultado))
    const sp = p.situacaoDaParte(parte) ?? 'nada'
    const desenho = peca.partes?.find((pt) => pt.tipo === parte)
    const chaveDet = desenho?.detalhe
    const img = chaveDet ? pacote.url(`d:${chaveDet}`) : undefined
    const detParte = chaveDet ? pacote.manifest.detalhes[chaveDet] : undefined
    const abrir = p.parteAberta === parte || itens.some((it) => it.n === p.itemInicial)
    return (
      <details class="fv-parte" key={`parte:${parte}`} open={abrir} data-testid={`fvs-parte-${parte}`}>
        <summary>
          <b>{NOME_DA_PARTE[parte] ?? parte}</b> <span class={`fv-sit s-${sp}`}>{ROTULO_SITUACAO[sp]}</span>
          {!p.partes.includes(parte) && <span class="discreto"> · sem {(NOME_DA_PARTE[parte] ?? parte).toLowerCase()} nesta planta</span>}
        </summary>
        {img ? (
          <div class="fv-det">
            <img src={img} alt={`${NOME_DA_PARTE[parte] ?? parte} ${peca.nome}`} onClick={() => p.aoZoom(img)} onLoad={rolarAoItem} />
            <p class="fv-dica">
              {detParte?.titulo} · {detParte?.prancha} · toque na imagem para ampliar
            </p>
          </div>
        ) : (
          p.partes.includes(parte) && <p class="fv-dica">Sem detalhe desta parte no pacote.</p>
        )}
        {montar(itens)}
      </details>
    )
  })

  return (
    <aside class="fv-painel" aria-live="polite" data-testid="fvs-painel">
      <div class="fv-cab">
        <div class="fv-nm" data-testid="fvs-painel-nome">{peca.comodo ?? peca.nome}</div>
        <div class="fv-inf">
          {NOME_TIPO[peca.tipo] ?? peca.tipo}
          {peca.comodo && <> <span class="fv-sem-quebra">{peca.nome}</span></>}
          {peca.grupo && (
            <>
              {' '}
              · <b>{peca.grupo}</b>
            </>
          )}
          {peca.secao && (
            <>
              {' '}
              · {peca.tipo === 'A' || peca.tipo === 'F' || peca.tipo === 'E' || peca.tipo === 'M' || p.area ? '' : 'seção '}
              <b>{peca.secao}</b>
            </>
          )}
          <br />
          <span class={`fv-sit s-${sit}`}>{ROTULO_SITUACAO[sit]}</span>
          {pct !== null && ` · ${pct}% conforme`}
        </div>
        <button type="button" onClick={p.aoFechar}>
          Fechar
        </button>
      </div>
      <div
        class="fv-corpo"
        ref={corpo}
        onPointerDown={() => {
          mexeuNoPainel.current = true
        }}
        onWheel={() => {
          mexeuNoPainel.current = true
        }}
      >
        {p.furos.length > 0 && (
          <div class="fv-sec fv-irmaos" data-testid={peca.tipo === 'A' ? 'fvs-esquadrias-do-ambiente' : 'fvs-furos-da-viga'}>
            <h3>
              <span>
                {resumoDosFilhos.texto}
                {peca.tipo === 'A' && p.itemDosFilhos && <span class="discreto"> · {p.itemDosFilhos}</span>}
              </span>
            </h3>
            <div class="fv-chips">
              {p.furos.map((f) => (
                <button type="button" key={f.id} class={`fv-chip s-${f.sit}`} aria-label={`${f.nome}: ${ROTULO_SITUACAO[f.sit]}`} onClick={() => p.aoIrComTipo(f.id)}>
                  {f.rotulo}
                </button>
              ))}
            </div>
          </div>
        )}
        {peca.tipo === 'E' && (
          <div class="fv-sec" data-testid="fvs-esquadria-info">
            <p>
              {esq?.classe === 'janela' ? 'Janela' : 'Porta'} <b>{esq?.codigo ?? peca.secao}</b>
              {esq?.modelo && <span class="discreto"> ({esq.modelo})</span>}
            </p>
            {esq?.outro_lado && <p class="discreto">Do outro lado: {esq.outro_lado} (tem a sua esquadria)</p>}
            {!ficha && <p class="aviso">A ficha deste serviço não tem item de esquadria: a esquadria fica só para ver.</p>}
            {p.viga && (
              <button type="button" class="fv-link" data-testid="fvs-ir-ambiente" onClick={() => p.aoIrComTipo(p.viga!.id)}>
                Ver o ambiente {p.viga.nome}
              </button>
            )}
          </div>
        )}
        {peca.tipo === 'F' && (
          <div class="fv-sec" data-testid="fvs-furo-info">
            <p>
              {furo?.forma === 'retangular' ? 'Furo retangular' : 'Furo circular'}
              {furo?.laje && ' de laje'}
              {furo?.fundo !== undefined && ` · ${furo.fundo} cm do fundo`}
              {furo?.espessura !== undefined && ` · laje de ${furo.espessura} cm`}
            </p>
            {!!furo?.disciplinas?.length && <p class="discreto">{furo.disciplinas.map((d) => NOME_DA_DISCIPLINA[d] ?? d).join(', ')}</p>}
            {p.furoDeLaje && !p.furoDeLaje.area && (
              // fora de área (21/11): grava no próprio furo, na ficha de laje que tem o item da instalação
              <p class={ficha ? 'discreto' : 'aviso'} data-testid="fvs-furo-fora-area">
                {ficha ? `Fora de área de laje: o registro fica no furo, em ${ficha.titulo}.` : p.furoDeLaje.aviso}
              </p>
            )}
            {!ficha && !(p.furoDeLaje && !p.furoDeLaje.area) && <p class="aviso">{p.furoDeLaje ? p.furoDeLaje.aviso : 'A ficha de viga não tem item de furação: o furo fica só para ver.'}</p>}
            {p.furoDeLaje?.area && (
              <button type="button" class="fv-link" data-testid="fvs-ir-area" onClick={() => p.aoIrComTipo(p.furoDeLaje!.area!.id)}>
                Ver a área {p.furoDeLaje.area.nome}
              </button>
            )}
            {p.viga && (
              <button type="button" class="fv-link" data-testid="fvs-ir-viga" onClick={() => p.aoIrComTipo(p.viga!.id)}>
                Ver a viga {p.viga.nome}
              </button>
            )}
          </div>
        )}
        {abertas.length > 0 && (
          <div class="fv-sec fv-abertas" data-testid="fvs-fichas-abertas">
            {p.abertas.length > 1 && (
              <h3 class="fv-dup">
                <span>Ficha duplicada: {p.abertas.length} fichas nesta peça</span>
              </h3>
            )}
            {abertas.map((a) => {
              const sa = situacaoDaFichaAberta(a, fichaPorId, p.eventos)
              const conteudo = (
                <>
                  <b>{a.codigo}</b>
                  <span>
                    {a.status} · <span class={`fv-sit s-${sa}`}>{ROTULO_SITUACAO[sa]}</span>
                    {a.inspetor && ` · ${a.inspetor}`}
                    {a.atualizada_em && ` · ${quando(a.atualizada_em)}`}
                  </span>
                  {a.ficha_codigo && a.ficha_codigo !== ficha?.codigo && <span>{a.ficha_codigo}</span>}
                </>
              )
              return abertas.length > 1 ? (
                <button type="button" key={a.id} class={`fv-aberta${a.id === aberta?.id ? ' on' : ''}`} aria-pressed={a.id === aberta?.id} onClick={() => setIdAberta(a.id)}>
                  {conteudo}
                </button>
              ) : (
                <div key={a.id} class="fv-aberta">
                  {conteudo}
                </div>
              )
            })}
          </div>
        )}
        {peca.tipo === 'A' && recortesA.length > 0 ? (
          <>
            {recortesA.map((r) => {
              const img = pacote.url(`d:${r.chave}`)
              return (
                <div key={r.chave} class="fv-sec fv-det fv-det-amb" data-testid={r.modulacao ? 'fvs-modulacao' : 'fvs-projeto'}>
                  <h3>
                    <span>{r.titulo}</span>
                  </h3>
                  {img && <img src={img} alt={r.titulo} onClick={() => p.aoZoom(img)} onLoad={rolarAoItem} />}
                  <p class="fv-dica">{r.prancha} · toque na imagem para ampliar</p>
                  {r.modulacao && corrigidoEm && (
                    <p class="fv-dica" data-testid="fvs-detalhe-corrigido">
                      Detalhe corrigido em {corrigidoEm}
                    </p>
                  )}
                </div>
              )
            })}
            {irmaosDoAmbiente}
          </>
        ) : imgDet && peca.tipo !== 'A' ? (
          <>
            <div class="fv-sec fv-det">
              <h3>
                <span>{`Detalhe${det && det.titulo !== peca.nome ? ` (${det.titulo})` : ''}`}</span>
              </h3>
              <img src={imgDet} alt={`Detalhe ${peca.nome}`} onClick={() => p.aoZoom(imgDet)} onLoad={rolarAoItem} />
              {imgAco && (
                <>
                  <h3>
                    <span>Tabela de aço</span>
                  </h3>
                  <img src={imgAco} alt={`Tabela de aço ${peca.nome}`} onClick={() => p.aoZoom(imgAco)} onLoad={rolarAoItem} />
                </>
              )}
              <p class="fv-dica">
                {det?.prancha} · toque na imagem para ampliar
              </p>
              {corrigidoEm && (
                <p class="fv-dica" data-testid="fvs-detalhe-corrigido">
                  Detalhe corrigido em {corrigidoEm}
                </p>
              )}
            </div>
            {irmaosDoAmbiente}
          </>
        ) : p.area ? (
          <div class="fv-sec fv-area" data-testid="fvs-area-info">
            <h3>
              <span>Área de laje</span>
            </h3>
            <p class="discreto">
              Criada {quando(p.area.criada_em)}
              {ctx.sistema && (p.area.codigo_ficha ? ` · ficha no ${ctx.sistema.nome}: ${p.area.codigo_ficha}` : ` · sem código da ficha no ${ctx.sistema.nome}`)}
            </p>
            {p.travas.length > 0 && (
              <div class="aviso" data-testid="fvs-area-travada">
                <b>Travada:</b> consolo ou capitel dentro desta área ainda sem liberar. Confira antes de concretar:
                <ul>
                  {p.travas.map((t) => (
                    <li key={`${t.elementoId}|${t.tipo}`}>
                      <button type="button" class="fv-link" onClick={() => p.aoIrParte(t.elementoId, t.tipo)}>
                        {NOME_DA_PARTE[t.tipo] ?? t.tipo} do {t.nome}
                      </button>{' '}
                      · {ROTULO_SITUACAO[t.situacao]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {p.barras && (
              <div class="fv-barras-area" data-testid="fvs-barras-da-area">
                <p>
                  <b>{p.barras.resumo}</b>
                </p>
                {p.pode && p.barras.naCamada > 0 && (
                  <button type="button" class="on" data-testid="fvs-tudo-ok-camada" disabled={!p.barras.semConferir} onClick={p.barras.aoTudoOk}>
                    Tudo OK nesta camada ({p.barras.semConferir})
                  </button>
                )}
                {p.barras.aoVer ? (
                  <p class="discreto">
                    {p.barras.naCamada > 0 ? `Camada: ${p.barras.camada.toLowerCase()}. ` : ''}
                    <button type="button" class="fv-link" data-testid="fvs-ver-barras" onClick={p.barras.aoVer}>
                      Ver as barras
                    </button>
                  </p>
                ) : (
                  <p class="discreto">As barras se conferem na armadura de laje, no menu do pavimento.</p>
                )}
              </div>
            )}
            {p.pode && (
              <div class="fv-nc-acoes">
                <button type="button" data-testid="fvs-redesenhar-area" onClick={p.aoRedesenhar}>
                  Redesenhar contorno
                </button>
                <button type="button" class="fv-link" data-testid="fvs-apagar-area" onClick={p.aoApagarArea}>
                  Apagar área
                </button>
              </div>
            )}
          </div>
        ) : peca.tipo === 'F' || peca.tipo === 'E' || peca.tipo === 'M' ? null : peca.tipo === 'A' ? (
          irmaosDoAmbiente
        ) : (
          <div class="fv-sec">
            <p class="aviso">O detalhe desta peça não está nas pranchas carregadas.</p>
          </div>
        )}
        <div class="fv-sec">
          {soDetalhe && (
            <p class="aviso" data-testid="fvs-so-detalhe">
              Arranque: {peca.nome} está na planta só para conferir o detalhe. O pilar deste pavimento é o de baixo; a ficha deste é no pavimento de cima.
            </p>
          )}
          {!soDetalhe && !aberta && p.fichas.length > 1 && (
            <select aria-label="Ficha" value={ficha?.codigo} onChange={(ev) => p.aoTrocarFicha((ev.target as HTMLSelectElement).value)}>
              {p.fichas.map((f) => (
                <option value={f.codigo} key={f.codigo}>
                  {f.codigo} {f.titulo}
                </option>
              ))}
            </select>
          )}
          {soDetalhe ? null : ficha ? (
            <p class="fv-ficha" data-testid="fvs-ficha-do-painel">
              {ficha.codigo} · {ficha.titulo} · rev. {ficha.revisao}
              {vigente && vigente.id !== ficha.id && ` (a vigente é a rev. ${vigente.revisao}; esta peça foi marcada nesta)`}
            </p>
          ) : (
            // furo e esquadria não têm ficha própria (usam a do pai): o aviso de cima já diz o que falta
            !ehFilho(peca.tipo) && <p class="aviso">Não há ficha (PVS) para {NOME_TIPO[peca.tipo] ?? peca.tipo} nesta obra.</p>
          )}
          {!soDetalhe && p.foraDaFicha && (
            <p class="aviso" data-testid="fvs-fora-da-ficha">
              Esta ficha não vale {peca.comodo ? `em ${peca.comodo}` : 'neste cômodo'}, pela tabela de fichas por tipo de cômodo da obra. Escolha outra ficha.
            </p>
          )}
          {!soDetalhe && !p.foraDaFicha && !p.pode && <p class="discreto">Seu acesso nesta obra é só de leitura.</p>}
          {!soDetalhe && !p.foraDaFicha && linhas}
          {!soDetalhe && secoesDasPartes}
          {daFicha.length > 0 && (
            <details class="fv-hist-peca" data-testid="fvs-hist-peca">
              <summary>Todos os registros desta ficha ({daFicha.length})</summary>
              <ul>
                {corrigidoEm && (
                  <li data-testid="fvs-hist-detalhe-corrigido">
                    <b>Detalhe corrigido em {corrigidoEm}</b> · a imagem do detalhe mudou; nada foi reaberto
                  </li>
                )}
                {[...daFicha]
                  .sort((a, b) => (maisNovo(a, b) ? -1 : 1))
                  .map((e) => (
                    <li key={e.id}>
                      <b class={e.resultado ? `r-${e.resultado}` : ''}>{e.resultado ?? 'Desmarcado'}</b> item {e.item} · {rotuloRodada(e.rodada)} · {quando(e.criado_em_dispositivo)} · {nomeDe(e)}
                      {e.lote_id && !ehDaLigacao(e) && ' · em lote'}
                      {e.observacao && <span class="fv-hist-obs"> · {e.observacao}</span>}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </aside>
  )
}

/**
 * "O que fazer?" de um item reprovado. Grava um segundo depois de parar de digitar e ao sair do
 * campo (o que vier primeiro); a gravação confere o texto contra o registro mais novo, então
 * repetir não duplica.
 */
function CampoNc({ inicial, pode, salvar }: { inicial: string; pode: boolean; salvar: (t: string) => unknown }) {
  const [texto, setTexto] = useState(inicial)
  const espera = useRef<number | undefined>(undefined)
  const ultimo = useRef(texto)
  ultimo.current = texto
  const agora = () => {
    window.clearTimeout(espera.current)
    espera.current = undefined
    salvar(ultimo.current)
  }
  // saiu da tela (fechou o painel, trocou de peça) com texto ainda não gravado
  useEffect(() => () => {
    if (espera.current !== undefined) agora()
  }, [])
  // foi para outro app: o Android pode fechar este sem avisar, então grava logo
  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden' && espera.current !== undefined) agora()
    }
    document.addEventListener('visibilitychange', aoEsconder)
    return () => document.removeEventListener('visibilitychange', aoEsconder)
  }, [])
  return (
    <label>
      O que fazer?
      <textarea
        rows={2}
        disabled={!pode}
        value={texto}
        placeholder="Descreva a não conformidade e o que precisa ser corrigido"
        onFocus={(ev) => {
          // no celular, o teclado sobe por cima da parte de baixo do painel: o campo vai para o alto dele
          const campo = ev.target as HTMLTextAreaElement
          window.setTimeout(() => campo.scrollIntoView({ block: 'start' }), 300)
        }}
        onInput={(ev) => {
          setTexto((ev.target as HTMLTextAreaElement).value)
          window.clearTimeout(espera.current)
          espera.current = window.setTimeout(agora, 1000)
        }}
        onBlur={() => {
          if (espera.current !== undefined) agora()
        }}
      />
    </label>
  )
}

/** Fotos de uma reprovação: toque amplia. Do aparelho ou, com internet, do armazenamento. */
function FotosDoItem({ ids, ctx, aoZoom }: { ids: string[]; ctx: ContextoFvs; aoZoom: (src: string) => void }) {
  if (!ids.length) return null
  return (
    <div class="fv-fotos">
      {ids.map((id) => (
        <FotoDoItem key={id} id={id} ctx={ctx} aoZoom={aoZoom} />
      ))}
    </div>
  )
}

function FotoDoItem({ id, ctx, aoZoom }: { id: string; ctx: ContextoFvs; aoZoom: (src: string) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    urlDaFoto(id, ctx.dados.arquivoPorId.get(id))
      .then((u) => vivo && setUrl(u))
      .catch((e) => console.warn('FVS: foto não carregou', e))
    return () => {
      vivo = false
    }
  }, [id])
  return url ? (
    <button type="button" class="fv-foto-mini" aria-label="Ampliar a foto" onClick={() => aoZoom(url)}>
      <img src={url} alt="Foto da reprovação" />
    </button>
  ) : (
    // já enviada e sem internet agora: mostra que a foto existe
    <span class="fv-foto-mini">Foto</span>
  )
}
