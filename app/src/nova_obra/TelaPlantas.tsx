// Nova obra, etapas 2 e 3: plantas. Para cada pavimento, sobe o PDF da forma, escolhe a janela (o
// desenho, sem carimbo) e a escala, desenha a planta no navegador e marca as peças: lendo sozinho
// (com o jeito da projetista, ensinado com 2 ou 3 toques), tocando no nome ou desenhando.
import { useEffect, useRef, useState } from 'preact/hooks'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { RascunhoObra } from './modelo'
import { abrirPdf, escalaDosTextos, trechoDosTextos, gerarTiles, imagemDaPagina, lerDesenho, tamanhoDaPagina, textosDaPagina, TILE, type DesenhoDaPagina, type Retangulo, type TextoDaPagina } from './pdf'
import { conferirArquivo, conferirPagina, mensagemDoPdf, PLANTA_EM_BRANCO } from './limites'
import { aprenderPerfil, lerComPerfis, lerPecas, type Leitura, type PerfilProjetista, type Toque } from './leitor'
import { guardarPerfil, perfisParaLer } from './perfis'
import { apagarPlanta, guardarPdf, guardarTiles, lerPdf, lerTiles } from './guardados'
import {
  aplicarLeitura,
  contornoDaLeitura,
  conferencia,
  tipoDoNome,
  type ItemConferencia,
  moverJanela,
  pecaDoTexto,
  plantaEmDia,
  pranchaDoArquivo,
  retanguloDeDoisToques,
  textoPerto,
  nomeESecao,
  type PecaRascunho,
  type PlantaRascunho,
  type TipoPeca,
} from './planta'

const ESCALAS = [20, 25, 50, 75, 100, 125, 200]
const NOME_TIPO: Record<TipoPeca, string> = { P: 'Pilar', V: 'Viga', L: 'Laje' }
const COR_TIPO: Record<TipoPeca, string> = { P: '#1f4e79', V: '#b26a00', L: '#2e7d32' }
const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`)

interface Props {
  r: RascunhoObra
  mudar: (p: Partial<RascunhoObra>) => void
  seguir: () => void
}

export function PassoPlantas({ r, mudar, seguir }: Props) {
  const [editando, setEditando] = useState<string | null>(null)
  const [lendo, setLendo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const plantas = r.plantas ?? []
  const mudarPlanta = (p: PlantaRascunho) => mudar({ plantas: plantas.map((x) => (x.id === p.id ? p : x)) })
  const aberta = plantas.find((p) => p.id === editando)

  if (aberta)
    return (
      <EditorPlanta
        key={aberta.id}
        planta={aberta}
        mudar={mudarPlanta}
        fechar={() => setEditando(null)}
        apagar={async () => {
          if (!confirm(`Tirar a planta ${aberta.prancha} e as ${aberta.pecas.length} peças marcadas nela?`)) return
          await apagarPlanta(aberta.id)
          mudar({ plantas: plantas.filter((p) => p.id !== aberta.id) })
          setEditando(null)
        }}
      />
    )

  async function subir(pavimento: string, arquivo: File) {
    setErro(null)
    const pesado = conferirArquivo(arquivo.name, arquivo.size)
    if (pesado) return setErro(pesado)
    setLendo(pavimento)
    try {
      const doc = await abrirPdf(await arquivo.arrayBuffer())
      const pagina = await doc.getPage(1)
      const tam = tamanhoDaPagina(pagina)
      const grande = conferirPagina(tam.largura, tam.altura)
      if (grande) {
        await doc.fechar()
        return setErro(`${arquivo.name}: ${grande}`)
      }
      const textos = await textosDaPagina(pagina)
      await doc.fechar()
      const id = crypto.randomUUID()
      await guardarPdf(id, arquivo)
      const doPav = plantas.filter((p) => p.pavimento === pavimento).length
      const { prancha, revisao } = pranchaDoArquivo(arquivo.name)
      const nova: PlantaRascunho = {
        id,
        pavimento,
        // o trecho do título da prancha; senão, a primeira é a planta inteira e as outras, Trecho 2, 3...
        trecho: trechoDosTextos(textos) ?? (doPav ? `Trecho ${doPav + 1}` : 'Planta inteira'),
        prancha,
        revisao,
        arquivo: arquivo.name,
        pagina: tam,
        janela: [0, 0, tam.largura, tam.altura],
        escala: escalaDosTextos(textos),
        semTexto: textos.length === 0,
        pecas: [],
        gerada: null,
      }
      mudar({ plantas: [...plantas, nova] })
      setEditando(id)
    } catch (e) {
      setErro(`Não consegui abrir ${arquivo.name} como PDF. ${mensagemDoPdf(e)}`)
    } finally {
      setLendo(null)
    }
  }

  return (
    <section class="cartao" aria-labelledby="t-plantas">
      <h2 id="t-plantas">Plantas</h2>
      <p class="discreto">Para cada pavimento, o PDF da planta de forma. Dá para pular e voltar depois: a obra também sai sem planta.</p>
      {!r.pavimentos.length && <p class="aviso">Cadastre os pavimentos antes.</p>}
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      <ul class="no-lista">
        {[...r.pavimentos].reverse().map((pav) => (
          <li key={pav} class="no-item">
            <h3>{pav}</h3>
            {plantas
              .filter((p) => p.pavimento === pav)
              .map((p) => (
                <button type="button" key={p.id} class="no-ficha" onClick={() => setEditando(p.id)}>
                  <strong>{p.trecho}</strong> {p.prancha}
                  <span class="discreto">
                    {p.pecas.length} peças · {p.escala ? `1:${p.escala}` : 'sem escala'} · {plantaEmDia(p) ? 'planta desenhada' : 'falta desenhar a planta'}
                  </span>
                </button>
              ))}
            <EscolherPdf pavimento={pav} lendo={lendo === pav} aoEscolher={(f) => subir(pav, f)} />
          </li>
        ))}
      </ul>
      <div class="acoes">
        <button type="button" class="principal" onClick={seguir}>
          Seguir para as fichas
        </button>
      </div>
    </section>
  )
}

function EscolherPdf({ pavimento, lendo, aoEscolher }: { pavimento: string; lendo: boolean; aoEscolher: (f: File) => void }) {
  const entrada = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" disabled={lendo} onClick={() => entrada.current?.click()}>
        {lendo ? 'Lendo o PDF…' : '+ PDF da planta'}
      </button>
      <input
        ref={entrada}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        aria-label={`PDF da planta do ${pavimento}`}
        onChange={(e) => {
          const c = e.target as HTMLInputElement
          const f = c.files?.[0]
          c.value = ''
          if (f) aoEscolher(f)
        }}
      />
    </>
  )
}

function EditorPlanta({ planta: p, mudar, fechar, apagar }: { planta: PlantaRascunho; mudar: (p: PlantaRascunho) => void; fechar: () => void; apagar: () => void }) {
  const [pagina, setPagina] = useState<PDFPageProxy | null>(null)
  const [textos, setTextos] = useState<TextoDaPagina[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [versaoTiles, setVersaoTiles] = useState(0)
  const cancelar = useRef(false)
  const docAberto = useRef<Awaited<ReturnType<typeof abrirPdf>> | null>(null)
  const desenho = useRef<Promise<DesenhoDaPagina> | null>(null)
  /** traços, textos e camadas da folha, lidos uma vez só (a leitura de peças usa) */
  const obterDesenho = () => {
    if (!docAberto.current || !pagina) return Promise.reject(new Error('O PDF ainda está abrindo.'))
    desenho.current ??= lerDesenho(docAberto.current, pagina)
    return desenho.current
  }

  useEffect(() => {
    let fim = false
    let doc: Awaited<ReturnType<typeof abrirPdf>> | null = null
    ;(async () => {
      const pdf = await lerPdf(p.id)
      if (!pdf) throw new Error('O PDF desta planta não está mais neste navegador. Tire a planta e suba o PDF de novo.')
      const pesado = conferirArquivo(p.arquivo, pdf.size)
      if (pesado) throw new Error(pesado)
      doc = await abrirPdf(await pdf.arrayBuffer())
      docAberto.current = doc
      const pg = await doc.getPage(1)
      const tx = await textosDaPagina(pg)
      if (!fim) {
        setPagina(pg)
        setTextos(tx)
      }
    })().catch((e) => !fim && setErro(mensagemDoPdf(e)))
    return () => {
      fim = true
      cancelar.current = true
      doc?.fechar()
    }
  }, [p.id])

  async function desenhar() {
    if (!pagina) return
    setErro(null)
    cancelar.current = false
    const inicio = performance.now()
    setProgresso('Começando…')
    try {
      const r = await gerarTiles(pagina, p.janela, (x) => setProgresso(`Desenhando: nível ${x.nivel} de ${x.niveis}, ${x.tiles} imagens`), () => cancelar.current)
      if (!r.tiles.size) throw new Error(PLANTA_EM_BRANCO)
      const lista = [...r.tiles.entries()]
      const bytes = lista.reduce((s, [, b]) => s + b.size, 0)
      await guardarTiles({ id: p.id, janela: p.janela, niveis: r.niveis, largura: r.largura, altura: r.altura, tiles: lista })
      mudar({ ...p, gerada: { janela: p.janela, tiles: lista.length, bytes, segundos: Math.round((performance.now() - inicio) / 100) / 10 } })
      setVersaoTiles((v) => v + 1)
    } catch (e) {
      if (!cancelar.current) setErro(`Não consegui desenhar a planta. ${mensagemDoPdf(e)}`)
    } finally {
      setProgresso(null)
    }
  }

  const emDia = plantaEmDia(p)
  const escalaOpcoes = p.escala && !ESCALAS.includes(p.escala) ? [...ESCALAS, p.escala].sort((a, b) => a - b) : ESCALAS
  return (
    <section class="cartao" aria-labelledby="t-planta">
      <h2 id="t-planta">
        {p.pavimento}: {p.trecho}
      </h2>
      <p class="discreto">{p.arquivo}</p>
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      <div class="no-linha">
        <label>
          Trecho
          <input value={p.trecho} onInput={(e) => mudar({ ...p, trecho: (e.target as HTMLInputElement).value })} />
        </label>
        <label>
          Prancha
          <input value={p.prancha} onInput={(e) => mudar({ ...p, prancha: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="no-curto">
          Revisão
          <input value={p.revisao} onInput={(e) => mudar({ ...p, revisao: (e.target as HTMLInputElement).value })} />
        </label>
      </div>
      <label for="no-escala">Escala da planta</label>
      <select id="no-escala" value={p.escala ?? ''} onChange={(e) => mudar({ ...p, escala: Number((e.target as HTMLSelectElement).value) || null })}>
        <option value="">Escolha a escala</option>
        {escalaOpcoes.map((n) => (
          <option key={n} value={n}>
            1:{n}
          </option>
        ))}
      </select>
      {p.semTexto && <p class="aviso">Este PDF não tem texto (parece escaneado). As peças vão ser marcadas desenhando.</p>}

      <h3>Janela</h3>
      <p class="discreto">Arraste sobre a folha para marcar só o desenho, sem carimbo e notas. Toque fora para ver a folha inteira de novo.</p>
      {pagina ? <EscolherJanela pagina={pagina} planta={p} aoMudar={(j) => mudar(moverJanela(p, j))} /> : <p>Abrindo o PDF…</p>}
      <div class="acoes">
        <button type="button" onClick={() => mudar(moverJanela(p, [0, 0, p.pagina.largura, p.pagina.altura]))}>
          Folha inteira
        </button>
        <button type="button" class="principal" disabled={!pagina || !!progresso} onClick={desenhar}>
          {emDia ? 'Desenhar de novo' : 'Desenhar a planta'}
        </button>
        {progresso && (
          <button type="button" onClick={() => (cancelar.current = true)}>
            Parar
          </button>
        )}
      </div>
      {progresso && <p role="status">{progresso}</p>}
      {emDia && p.gerada && (
        <p class="no-ok" role="status">
          Planta desenhada: {p.gerada.tiles} imagens, {mb(p.gerada.bytes)}, em {p.gerada.segundos.toLocaleString('pt-BR')} s.
        </p>
      )}
      {p.gerada && !emDia && <p class="aviso">A janela mudou: desenhe a planta de novo.</p>}

      {emDia && <MarcarPecas key={versaoTiles} planta={p} textos={textos} mudar={mudar} obterDesenho={obterDesenho} />}

      <div class="acoes">
        <button type="button" class="principal" onClick={fechar}>
          Pronto
        </button>
        <button type="button" onClick={apagar}>
          Tirar esta planta
        </button>
      </div>
    </section>
  )
}

/** A folha do PDF com a janela por cima; arrastar marca uma janela nova. */
function EscolherJanela({ pagina, planta: p, aoMudar }: { pagina: PDFPageProxy; planta: PlantaRascunho; aoMudar: (j: Retangulo) => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(0)
  const [arrasto, setArrasto] = useState<Retangulo | null>(null)
  const inicio = useRef<[number, number] | null>(null)

  useEffect(() => {
    let fim = false
    const div = caixa.current!
    const largura = Math.min(div.clientWidth || 340, 1100)
    imagemDaPagina(pagina, Math.round(largura * Math.min(2, window.devicePixelRatio || 1))).then((c) => {
      if (fim) return
      c.style.width = '100%'
      c.style.display = 'block'
      c.setAttribute('aria-hidden', 'true')
      div.querySelector('canvas')?.remove()
      div.prepend(c)
      setEscala(largura / p.pagina.largura)
    })
    return () => {
      fim = true
    }
  }, [pagina])

  const ponto = (e: PointerEvent): [number, number] => {
    const r = caixa.current!.getBoundingClientRect()
    const s = r.width / p.pagina.largura
    return [Math.max(0, Math.min(p.pagina.largura, (e.clientX - r.left) / s)), Math.max(0, Math.min(p.pagina.altura, (e.clientY - r.top) / s))]
  }
  const j = arrasto ?? p.janela
  const s = escala || 1
  return (
    <div
      ref={caixa}
      class="no-folha"
      data-testid="folha"
      onPointerDown={(e) => {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        inicio.current = ponto(e)
      }}
      onPointerMove={(e) => {
        if (!inicio.current) return
        const [x, y] = ponto(e)
        const [x0, y0] = inicio.current
        setArrasto([Math.min(x0, x), Math.min(y0, y), Math.max(x0, x), Math.max(y0, y)])
      }}
      onPointerUp={() => {
        const a = arrasto
        inicio.current = null
        setArrasto(null)
        // toque sem arrastar: não muda nada (janela pequena demais por engano)
        if (a && a[2] - a[0] > 20 && a[3] - a[1] > 20) aoMudar(a.map((v) => Math.round(v * 10) / 10) as Retangulo)
      }}
    >
      {escala > 0 && <div class="no-janela" style={{ left: `${j[0] * s}px`, top: `${j[1] * s}px`, width: `${(j[2] - j[0]) * s}px`, height: `${(j[3] - j[1]) * s}px` }} />}
    </div>
  )
}

type Modo = 'nome' | 'desenhar' | 'ensinar'

const contarLidas = (l: Leitura) => {
  const np = l.pecas.filter((x) => x.tipo === 'P').length
  const nv = l.pecas.filter((x) => x.tipo === 'V').length
  return `${np} ${np === 1 ? 'pilar' : 'pilares'} e ${nv} ${nv === 1 ? 'viga' : 'vigas'}`
}

/** A planta desenhada (os tiles guardados), com as peças por cima; tocar marca peça. */
/**
 * Texto do PDF (ou digitado) para o Leaflet: string em bindTooltip é lida como HTML, então vai como elemento
 * com textContent. Um nome "<img onerror=...>" num PDF aparece como texto, não roda.
 */
function textoSeguro(t: string): HTMLElement {
  const s = document.createElement('span')
  s.textContent = t
  return s
}

function MarcarPecas({
  planta: p,
  textos,
  mudar,
  obterDesenho,
}: {
  planta: PlantaRascunho
  textos: TextoDaPagina[]
  mudar: (p: PlantaRascunho) => void
  obterDesenho: () => Promise<DesenhoDaPagina>
}) {
  const div = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const camada = useRef<L.LayerGroup | null>(null)
  const [tipo, setTipo] = useState<TipoPeca>('P')
  const [modo, setModo] = useState<Modo>(p.semTexto ? 'desenhar' : 'nome')
  const [canto, setCanto] = useState<[number, number] | null>(null)
  const [escolhida, setEscolhida] = useState<number | null>(null)
  const [contornoPara, setContornoPara] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number | null>(null)
  /** altura típica (mediana) dos textos da planta, em pontos: diz se dá para ler e tocar os nomes */
  const alturaNome = (() => {
    const hs = textos.map((t) => t.ret[3] - t.ret[1]).filter((h) => h > 0).sort((a, b) => a - b)
    return hs.length ? hs[Math.floor(hs.length / 2)] : null
  })()
  /** altura do nome na tela, em pixels (CRS.Simple: 2^zoom pixels por ponto) */
  const pxNome = (z: number) => (alturaNome ? alturaNome * 2 ** z : null)
  /** toques do ensino em andamento; extra = o terceiro toque, num nome escrito de outro jeito */
  const [ensino, setEnsino] = useState<{ toques: Toque[]; extra: boolean } | null>(null)
  /** o último ensino que deu certo (para o terceiro toque) */
  const ensinado = useRef<{ toques: Toque[]; perfil: PerfilProjetista } | null>(null)
  // o clique do mapa lê sempre o estado mais novo
  const estado = useRef({ p, tipo, modo, canto, contornoPara, textos, ensino })
  estado.current = { p, tipo, modo, canto, contornoPara, textos, ensino }
  /** leitura automática da planta (com a escala e a janela de agora), para dar contorno à peça marcada à mão */
  const cacheLeitura = useRef<{ chave: string; l: Promise<Leitura | null> } | null>(null)
  const chaveLeitura = (pl: PlantaRascunho) => `${pl.escala}|${pl.janela.join(',')}`
  function leituraDaPlanta(): Promise<Leitura | null> {
    const atual = estado.current.p
    const escala = atual.escala
    if (!escala) return Promise.resolve(null)
    const chave = chaveLeitura(atual)
    if (cacheLeitura.current?.chave !== chave)
      cacheLeitura.current = {
        chave,
        l: obterDesenho()
          .then((d) => lerComPerfis(d, perfisParaLer(), escala, atual.janela)?.leitura ?? null)
          .catch(() => null),
      }
    return cacheLeitura.current.l
  }

  /** Peça marcada pelo nome: pega o contorno que a leitura automática acha para esse nome. */
  async function completarContorno(tipoPeca: TipoPeca, nome: string) {
    if (tipoPeca === 'L' || !nome) return
    const l = await leituraDaPlanta()
    // deixa a tela gravar a peça nova antes
    await new Promise((ok) => setTimeout(ok))
    if (!l) return
    const atual = estado.current.p
    const polys = contornoDaLeitura(atual.janela, l, tipoPeca, nome)
    const i = atual.pecas.findIndex((pc) => pc.tipo === tipoPeca && pc.nome.toUpperCase() === nome.toUpperCase() && !pc.polys.length)
    if (!polys || i < 0) return
    mudar({ ...atual, pecas: atual.pecas.map((pc, j) => (j === i ? { ...pc, polys } : pc)) })
  }

  /** Lê pilares e vigas com os perfis conhecidos; nenhum serve: pede para ensinar. */
  async function lerSozinho() {
    if (!p.escala) return setAviso('Escolha a escala da planta antes de ler as peças.')
    setAviso(null)
    setMensagem(null)
    setLendo(true)
    try {
      const d = await obterDesenho()
      const r = lerComPerfis(d, perfisParaLer(), p.escala, p.janela)
      if (!r) return comecarEnsino('Não achei peças nesta planta. Me ensine o jeito desta projetista:')
      cacheLeitura.current = { chave: chaveLeitura(estado.current.p), l: Promise.resolve(r.leitura) }
      mudar(aplicarLeitura(estado.current.p, r.leitura, r.perfil.nome))
      setEscolhida(null)
      setMensagem(`Li ${contarLidas(r.leitura)}. Confira a lista embaixo da planta.`)
    } catch (e) {
      setAviso(`Não consegui ler as peças. ${mensagemDoPdf(e)}`)
    } finally {
      setLendo(false)
    }
  }

  function comecarEnsino(intro: string, extra = false) {
    setModo('ensinar')
    setCanto(null)
    setContornoPara(null)
    setEscolhida(null)
    setEnsino({ toques: extra && ensinado.current ? ensinado.current.toques : [], extra })
    setMensagem(intro)
  }

  async function ensinar(tq: Toque, folga: number) {
    const e = estado.current.ensino
    const escala = estado.current.p.escala
    if (!e || !escala) return
    const d = await obterDesenho()
    // o toque achou um nome? senão, pede de novo o mesmo toque
    const ruim = aprenderPerfil(d, [tq], escala, undefined, folga).avisos.find((a) => /não achei nome|não parece/.test(a))
    if (ruim) return setAviso(ruim)
    const toques = [...e.toques, tq]
    if (!e.extra && toques.length < 2) return setEnsino({ toques, extra: false })
    const { perfil, avisos } = aprenderPerfil(d, toques, escala, e.extra ? ensinado.current?.perfil : undefined, folga)
    if (!perfil) {
      setEnsino({ toques: [], extra: false })
      return setAviso(avisos.join(' '))
    }
    const l = lerPecas(d, perfil, escala, estado.current.p.janela)
    guardarPerfil(perfil)
    ensinado.current = { toques, perfil }
    cacheLeitura.current = { chave: chaveLeitura(estado.current.p), l: Promise.resolve(l) }
    mudar(aplicarLeitura(estado.current.p, l, perfil.nome))
    setEnsino(null)
    setModo('nome')
    setMensagem(
      l.pecas.length
        ? `Aprendi. Li ${contarLidas(l)}. Se algum nome escrito de outro jeito ficou de fora, use "Ensinar mais um nome".`
        : 'Aprendi o jeito, mas não achei peças com ele. Confira se tocou nos nomes certos, ou marque à mão.',
    )
  }

  useEffect(() => {
    let fim = false
    const urls: string[] = []
    ;(async () => {
      const t = await lerTiles(p.id)
      if (!t || fim || !div.current) return
      const tiles = new Map(t.tiles)
      const m = L.map(div.current, { crs: L.CRS.Simple, minZoom: -6, maxZoom: 3, zoomSnap: 0.25, attributionControl: false, preferCanvas: true })
      const limites = L.latLngBounds([-t.altura, 0], [0, t.largura])
      const Tiles = L.GridLayer.extend({
        createTile(c: L.Coords) {
          const b = tiles.get(`${c.z}/${c.x}/${c.y}`)
          if (!b) return document.createElement('div')
          const img = document.createElement('img')
          const u = URL.createObjectURL(b)
          urls.push(u)
          img.alt = ''
          img.src = u
          return img
        },
      })
      new (Tiles as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({
        tileSize: TILE,
        minNativeZoom: Math.min(...t.niveis),
        maxNativeZoom: Math.max(...t.niveis),
        minZoom: -6,
        maxZoom: 3,
        bounds: limites,
        noWrap: true,
      }).addTo(m)
      m.fitBounds(limites)
      setZoom(m.getZoom())
      camada.current = L.layerGroup().addTo(m)
      m.on('click', (e: L.LeafletMouseEvent) => tocar(e.latlng.lng, -e.latlng.lat, m.getZoom()))
      m.on('zoomend', () => {
        setZoom(m.getZoom())
        redesenhar.current()
      })
      mapa.current = m
      if (import.meta.env.DEV) (window as unknown as { __noMapa: L.Map }).__noMapa = m
      desenharPecas()
    })()
    return () => {
      fim = true
      mapa.current?.remove()
      mapa.current = null
      for (const u of urls) URL.revokeObjectURL(u)
    }
  }, [p.id])

  useEffect(() => desenharPecas(), [p.pecas, escolhida, canto])

  function desenharPecas() {
    const g = camada.current
    if (!g) return
    g.clearLayers()
    const ll = ([x, y]: [number, number]) => L.latLng(-y, x)
    // planta afastada: os rótulos se amontoam (achado do Testador no celular). Mostra os nomes quando o
    // texto da planta passa de 7 px na tela; sem texto (escaneada), pelo número de peças.
    const z = mapa.current?.getZoom() ?? 0
    const px = pxNome(z)
    const comNomes = px !== null ? px >= 7 : p.pecas.length <= 20 || z >= -0.5
    p.pecas.forEach((pc, i) => {
      const cor = COR_TIPO[pc.tipo]
      const peso = i === escolhida ? 4 : 2
      for (const pl of pc.polys) L.polygon(pl.map(ll), { color: cor, weight: peso, fillOpacity: 0.25, interactive: false }).addTo(g)
      const [x0, y0, x1, y1] = pc.rotulo
      const r = L.rectangle(L.latLngBounds(ll([x0, y0]), ll([x1, y1])), { color: cor, weight: peso, dashArray: pc.polys.length ? '4 3' : undefined, fillOpacity: 0.1, interactive: false })
      if (comNomes || i === escolhida) r.bindTooltip(textoSeguro(pc.nome || '?'), { permanent: true, direction: 'top', className: 'no-rotulo' })
      r.addTo(g)
    })
    if (canto) L.circleMarker(ll(canto), { radius: 6, color: '#b3261e', interactive: false }).addTo(g)
  }
  const redesenhar = useRef(desenharPecas)
  redesenhar.current = desenharPecas

  /** Aproxima até os nomes ficarem com uns 12 px na tela, no meio do que está à vista. */
  function aproximar() {
    const m = mapa.current
    if (!m || !alturaNome) return
    m.setZoom(Math.min(3, Math.log2(12 / alturaNome)))
  }

  /** Leva o mapa até o retângulo (pontos da planta), perto o bastante para ler o nome. */
  function irPara(r: Retangulo) {
    const m = mapa.current
    if (!m) return
    const c = L.latLng(-(r[1] + r[3]) / 2, (r[0] + r[2]) / 2)
    // perto o bastante para o nome ficar com uns 12 px (sem texto: zoom 0,5)
    m.setView(c, Math.max(m.getZoom(), alturaNome ? Math.min(3, Math.log2(12 / alturaNome)) : 0.5))
    div.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  /** Item da conferência: abre a peça; texto não lido vira peça (o tipo pelo nome, senão o escolhido). */
  function abrirItem(it: ItemConferencia) {
    setAviso(null)
    if (it.peca !== undefined) {
      setEscolhida(it.peca)
      return irPara(it.ret)
    }
    const ns = nomeESecao(it.texto)
    const nova: PecaRascunho = { tipo: tipoDoNome(ns.nome) ?? (tipo === 'L' ? 'P' : tipo), nome: ns.nome, secao: ns.secao, rotulo: it.ret, polys: [] }
    mudar({ ...p, pecas: [...p.pecas, nova] })
    setEscolhida(p.pecas.length)
    irPara(it.ret)
    setAviso(`${nova.nome} virou peça. Confira o tipo e o contorno.`)
    void completarContorno(nova.tipo, nova.nome)
  }

  function tocar(x: number, y: number, zoom: number) {
    const { p, tipo, modo, canto, contornoPara, textos, ensino } = estado.current
    const folga = 12 / 2 ** zoom // uns 12 pixels da tela, em pontos
    setAviso(null)
    if (modo === 'ensinar' && ensino) {
      const tipoDoToque: 'P' | 'V' = ensino.extra ? (tipo === 'V' ? 'V' : 'P') : ensino.toques.length === 0 ? 'P' : 'V'
      // folga de uns 12 px, entre 15 e 40 pontos: com a planta toda afastada, aproximar antes de tocar
      void ensinar({ tipo: tipoDoToque, x: x + p.janela[0], y: y + p.janela[1] }, Math.min(40, Math.max(15, folga)))
      return
    }
    if (modo === 'desenhar') {
      if (!canto) {
        setCanto([x, y])
        return
      }
      setCanto(null)
      const { rotulo, poly } = retanguloDeDoisToques(canto, [x, y])
      if (rotulo[2] - rotulo[0] < 1 || rotulo[3] - rotulo[1] < 1) return setAviso('Os dois cantos ficaram no mesmo lugar. Toque de novo, em cantos opostos.')
      if (contornoPara !== null && p.pecas[contornoPara]) {
        mudar({ ...p, pecas: p.pecas.map((pc, i) => (i === contornoPara ? { ...pc, polys: [poly], lida: false } : pc)) })
        setEscolhida(contornoPara)
        setContornoPara(null)
        return
      }
      // nome: o texto que estiver dentro do retângulo, se houver
      const dentro = textos.find((t) => {
        const cx = (t.ret[0] + t.ret[2]) / 2 - p.janela[0]
        const cy = (t.ret[1] + t.ret[3]) / 2 - p.janela[1]
        return cx >= rotulo[0] && cx <= rotulo[2] && cy >= rotulo[1] && cy <= rotulo[3]
      })
      const ns = dentro ? nomeESecao(dentro.texto) : { nome: '', secao: '' }
      const nova: PecaRascunho = { tipo, nome: ns.nome, secao: ns.secao, rotulo, polys: [poly] }
      mudar({ ...p, pecas: [...p.pecas, nova] })
      setEscolhida(p.pecas.length)
      return
    }
    // Ordem: peça já marcada tocada em cheio; senão, o nome mais perto; senão, peça marcada perto do
    // toque. Com a folga primeiro, no celular o rótulo de uma peça engolia o nome da vizinha.
    const tocada = (margem: number) =>
      p.pecas.findIndex((pc) => {
        const caixas = [pc.rotulo, ...pc.polys.map((pl) => [Math.min(...pl.map((q) => q[0])), Math.min(...pl.map((q) => q[1])), Math.max(...pl.map((q) => q[0])), Math.max(...pl.map((q) => q[1]))] as Retangulo)]
        return caixas.some((c) => x >= c[0] - margem && x <= c[2] + margem && y >= c[1] - margem && y <= c[3] + margem)
      })
    const emCheio = tocada(0)
    if (emCheio >= 0) {
      setEscolhida(emCheio)
      return
    }
    const t = textoPerto(textos, x + p.janela[0], y + p.janela[1], folga)
    if (!t) {
      const perto = tocada(folga)
      if (perto >= 0) return setEscolhida(perto)
      return setAviso('Nenhum nome aqui. Toque em cima do nome da peça, ou use "Desenhar".')
    }
    const nova = pecaDoTexto(t, p.janela, tipo)
    const repetida = p.pecas.findIndex((pc) => pc.tipo === nova.tipo && pc.nome.toUpperCase() === nova.nome.toUpperCase())
    if (repetida >= 0) {
      setEscolhida(repetida)
      return setAviso(`${nova.nome} já está marcado.`)
    }
    mudar({ ...p, pecas: [...p.pecas, nova] })
    setEscolhida(p.pecas.length)
    void completarContorno(nova.tipo, nova.nome)
  }

  const pc = escolhida !== null ? p.pecas[escolhida] : undefined
  // peça corrigida à mão deixa de ser "lida": ler de novo não desfaz a correção
  const mudarPeca = (parcial: Partial<PecaRascunho>) => mudar({ ...p, pecas: p.pecas.map((x, i) => (i === escolhida ? { ...x, ...parcial, lida: false } : x)) })
  const conta = (t: TipoPeca) => p.pecas.filter((x) => x.tipo === t).length
  return (
    <div class="no-pecas">
      <h3>Peças</h3>
      <p class="discreto">
        {conta('P')} pilares, {conta('V')} vigas, {conta('L')} lajes.{' '}
        {modo === 'ensinar' ? '' : modo === 'nome' ? 'Toque no nome da peça na planta.' : canto ? 'Agora toque no canto oposto.' : 'Toque num canto da peça.'}
      </p>
      {!p.semTexto && (
        <div class="no-leitura" role="group" aria-label="Leitura automática">
          {modo === 'ensinar' && ensino ? (
            <>
              <p class="no-ensino" role="status">
                {mensagem && <span>{mensagem} </span>}
                <strong>
                  {ensino.extra
                    ? 'Toque no nome que ficou de fora (escolha antes, embaixo, se é Pilar ou Viga).'
                    : ensino.toques.length === 0
                      ? '1 de 2: toque no nome de um pilar.'
                      : '2 de 2: agora toque no nome de uma viga.'}
                </strong>
              </p>
              <div class="acoes">
                <button type="button" onClick={() => (setEnsino(null), setModo('nome'), setMensagem(null))}>
                  Cancelar o ensino
                </button>
              </div>
            </>
          ) : (
            <>
              {mensagem && (
                <p class="no-ok" role="status">
                  {mensagem}
                </p>
              )}
              {p.leitura && !mensagem && <p class="discreto">Peças lidas com: {p.leitura.perfil}.</p>}
              <div class="acoes">
                <button type="button" class="principal" disabled={lendo} onClick={lerSozinho}>
                  {lendo ? 'Lendo as peças…' : p.leitura ? 'Ler as peças de novo' : 'Ler as peças sozinho'}
                </button>
                <button type="button" disabled={lendo} onClick={() => comecarEnsino('Ensine o jeito desta projetista:')}>
                  Ensinar a projetista
                </button>
                {ensinado.current && ensinado.current.toques.length < 3 && (
                  <button type="button" onClick={() => comecarEnsino('Mais um nome:', true)}>
                    Ensinar mais um nome
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      <div class="no-barra" role="group" aria-label="Tipo da peça">
        {(['P', 'V', 'L'] as const).map((t) => (
          <button type="button" key={t} class={tipo === t ? 'principal' : undefined} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
            {NOME_TIPO[t]}
          </button>
        ))}
      </div>
      <div class="no-barra" role="group" aria-label="Como marcar">
        <button type="button" class={modo === 'nome' ? 'principal' : undefined} aria-pressed={modo === 'nome'} disabled={p.semTexto} onClick={() => (setModo('nome'), setCanto(null), setContornoPara(null), setEnsino(null))}>
          Tocar no nome
        </button>
        <button type="button" class={modo === 'desenhar' ? 'principal' : undefined} aria-pressed={modo === 'desenhar'} onClick={() => (setModo('desenhar'), setCanto(null), setEnsino(null))}>
          Desenhar
        </button>
      </div>
      {aviso && (
        <p class="aviso" role="status">
          {aviso}
        </p>
      )}
      {modo !== 'desenhar' && zoom !== null && (pxNome(zoom) ?? 99) < 8 && (
        <div class="no-dica" role="note">
          <p>Os nomes estão pequenos para tocar ({Math.max(1, Math.round(pxNome(zoom)!))} px na tela). Aproxime com dois dedos ou pelo botão.</p>
          <button type="button" onClick={aproximar}>
            Aproximar
          </button>
        </div>
      )}
      <div ref={div} class="no-mapa" data-testid="mapa-pecas" />
      {formPeca()}
      <Conferir planta={p} abrir={abrirItem} />
    </div>
  )

  // função chamada direto (não componente): o campo não perde o foco a cada letra
  function formPeca() {
    return (
      <>
      {pc && (
        <div class="no-peca" role="group" aria-label="Peça escolhida">
          <div class="no-linha">
            <label class="no-curto">
              Tipo
              <select value={pc.tipo} onChange={(e) => mudarPeca({ tipo: (e.target as HTMLSelectElement).value as TipoPeca })}>
                {(['P', 'V', 'L'] as const).map((t) => (
                  <option key={t} value={t}>
                    {NOME_TIPO[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome da peça
              <input value={pc.nome} onInput={(e) => mudarPeca({ nome: (e.target as HTMLInputElement).value.replace(/\s+/g, '') })} />
            </label>
            <label class="no-curto">
              Seção
              <input value={pc.secao} placeholder="20x50" onInput={(e) => mudarPeca({ secao: (e.target as HTMLInputElement).value })} />
            </label>
          </div>
          <div class="acoes">
            <button
              type="button"
              onClick={() => {
                setModo('desenhar')
                setCanto(null)
                setContornoPara(escolhida)
                setAviso(`Toque em dois cantos opostos do contorno de ${pc.nome || 'peça'}.`)
              }}
            >
              Desenhar contorno
            </button>
            <button
              type="button"
              onClick={() => {
                mudar({ ...p, pecas: p.pecas.filter((_, i) => i !== escolhida) })
                setEscolhida(null)
              }}
            >
              Tirar peça
            </button>
            <button type="button" onClick={() => setEscolhida(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
      </>
    )
  }
}

const LISTAS: Array<{ chave: keyof ReturnType<typeof conferencia>; titulo: string; ajuda: string }> = [
  { chave: 'naoLidos', titulo: 'Parece nome de peça, mas não li', ajuda: 'Toque para virar peça. Se forem muitos, ensine mais um nome.' },
  { chave: 'semContorno', titulo: 'Sem contorno', ajuda: 'Toque, depois "Desenhar contorno".' },
  { chave: 'repetidos', titulo: 'Nome repetido', ajuda: 'Confira se é a mesma peça ou um erro de nome.' },
  { chave: 'semSecao', titulo: 'Sem seção', ajuda: 'Toque e escreva a seção (ex. 20x50).' },
  { chave: 'paineis', titulo: 'Tratei como painel de laje, não viga', ajuda: 'Tem "h=" encostado. Se for viga, toque para virar peça.' },
]
const MAX_ITENS = 40

/** As listas para conferir a planta: cada item leva à peça (ou vira peça). */
function Conferir({ planta, abrir }: { planta: PlantaRascunho; abrir: (it: ItemConferencia) => void }) {
  const cf = conferencia(planta)
  const total = LISTAS.reduce((s, l) => s + cf[l.chave].length, 0)
  if (!planta.pecas.length && !planta.leitura) return null
  return (
    <section class="no-conferir" aria-labelledby={`t-conferir-${planta.id}`}>
      <h4 id={`t-conferir-${planta.id}`}>Conferir {total ? `(${total})` : ''}</h4>
      {!total && <p class="no-ok">Nada para conferir nesta planta.</p>}
      {LISTAS.map(({ chave, titulo, ajuda }) => {
        const itens = cf[chave]
        if (!itens.length) return null
        return (
          <div key={chave} role="group" aria-label={titulo}>
            <p>
              <strong>
                {titulo} ({itens.length})
              </strong>
              <br />
              <span class="discreto">{ajuda}</span>
            </p>
            <ul>
              {itens.slice(0, MAX_ITENS).map((it, i) => (
                <li key={`${chave}${i}`}>
                  <button type="button" onClick={() => abrir(it)}>
                    {it.texto}
                  </button>
                </li>
              ))}
              {itens.length > MAX_ITENS && <li class="discreto">e mais {itens.length - MAX_ITENS}</li>}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
