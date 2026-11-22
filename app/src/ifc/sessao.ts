// O que está aberto agora e o que cada botão faz. A tela (Preact) só lê daqui e chama estes métodos.
import { Box3, Vector3 } from 'three'
import { CATEGORIAS, corDoModelo, corDoPavimento, escurecer, parseHex } from './motor/categorias'
import { cortar, direcaoPrincipal, planoDe, preencher, type Cancelamento, type EntradaCorte, type PlanoCorte, type ResultadoCorte } from './motor/corte'
import { corteParaDxf, corteParaSvg, type InfoPeca, type Nivel } from './motor/exportar'
import { abrirGuardado, apagarGuardado, arquivoGuardado, guardar, idDoArquivo, listarGuardados, type ModeloGuardado } from './motor/guardados'
import { buscar, filtroAtivo, filtroVazio, indexarModelo, novosDicionarios, type Faceta, type Filtro, type IndiceModelo, type ResultadoBusca } from './motor/indice'
import { ajusteDePontos, ajusteEhNeutro, ajusteNeutro, matrizDoModelo, type Ajuste } from './motor/alinhamento'
import { abrirArquivoDePacote, pacoteParaBlob } from './motor/pacote'
import type { ModeloIfc, Vec3 } from './motor/tipos'
import type { Visor, Toque } from './motor/visor'
import type { PedidoLeitura, RespostaLeitura } from './motor/leitor.worker'

export type ModoCor = 'categoria' | 'modelo' | 'pavimento' | 'original'
export type ModoFiltro = 'destacar' | 'isolar' | 'lista'
export type TipoCorte = 'planta' | 'longitudinal' | 'transversal' | 'face'

export interface ModeloAberto {
  chave: number
  id: string
  nome: string
  modelo: ModeloIfc
  indice: IndiceModelo
  /** Bit 1 visível, bit 2 destaque, bit 4 fantasma. */
  flags: Uint8Array
  cor: string
  visivel: boolean
  opacidade: number
  ajuste: Ajuste
  guardado: boolean
  elementosVidro?: Uint8Array
}

export interface Leitura {
  id: string
  nome: string
  fase: string
  fracao: number
}

export interface EstadoCorte {
  tipo: TipoCorte
  nome: string
  plano: PlanoCorte
  /** Ponto de referência: o plano anda a partir dele. */
  base: Vec3
  deslocamento: number
  min: number
  max: number
  resultado: ResultadoCorte | null
  calculando: boolean
  vista2D: boolean
}

export interface CorteSalvo {
  id: string
  nome: string
  tipo: TipoCorte
  /** Em coordenada real: continua valendo se a ordem de abrir os modelos mudar. */
  pontoReal: Vec3
  normal: Vec3
  u: Vec3
  v: Vec3
}

export interface NivelVista {
  nome: string
  elevacao: number
  ponto: Vec3
}

export interface Alinhamento {
  chave: number
  de: Vec3[]
  para: Vec3[]
}

export interface Selecao {
  chave: number
  elemento: number
}

const CHAVE_CORTES = 'ifc.cortes.v1'

function lerLocal<T>(chave: string): T | null {
  try {
    const t = localStorage.getItem(chave)
    return t ? (JSON.parse(t) as T) : null
  } catch {
    return null
  }
}

function gravarLocal(chave: string, valor: unknown): void {
  try {
    if (valor === null) localStorage.removeItem(chave)
    else localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    // navegador em modo privado: o ajuste vale só até fechar
  }
}

function baixar(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

function nomeDeArquivo(t: string): string {
  return (
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'corte'
  )
}

export function formatarMetros(v: number): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export class Sessao {
  visor: Visor | null = null
  modelos: ModeloAberto[] = []
  guardados: ModeloGuardado[] = []
  leituras: Leitura[] = []
  avisos: string[] = []
  dic = novosDicionarios()
  filtro: Filtro = filtroVazio()
  modoFiltro: ModoFiltro = 'destacar'
  resultado: ResultadoBusca | null = null
  ocultos = new Map<number, Set<number>>()
  selecao: Selecao | null = null
  modoCor: ModoCor = 'categoria'
  arestas = true
  corte: EstadoCorte | null = null
  cortesSalvos: CorteSalvo[] = lerLocal<CorteSalvo[]>(CHAVE_CORTES) ?? []
  esperandoFace = false
  alinhamento: Alinhamento | null = null
  giroPredio = 0
  versao = 0

  private origemCena: Vec3 | null = null
  private proximaChave = 1
  private ouvintes = new Set<() => void>()
  private cancelCorte: Cancelamento | null = null
  private temporizadorCorte = 0
  private temporizadorBusca = 0
  private alinhamentoDispensado = new Set<number>()

  assinar(fn: () => void): () => void {
    this.ouvintes.add(fn)
    return () => this.ouvintes.delete(fn)
  }

  private avisar(): void {
    this.versao++
    for (const f of this.ouvintes) f()
  }

  avisarUsuario(texto: string): void {
    this.avisos = [...this.avisos, texto]
    this.avisar()
  }

  descartarAviso(i: number): void {
    this.avisos = this.avisos.filter((_, k) => k !== i)
    this.avisar()
  }

  ligarVisor(v: Visor): void {
    this.visor = v
    v.eventos.aoTocar = (t) => this.aoTocar(t)
    v.eventos.aoPerderContexto = () =>
      this.avisarUsuario('A placa de vídeo deste aparelho reiniciou (modelo grande demais para ela). Feche e abra de novo, com menos modelos.')
  }

  async atualizarGuardados(): Promise<void> {
    this.guardados = await listarGuardados()
    this.avisar()
  }

  modelo(chave: number): ModeloAberto | undefined {
    return this.modelos.find((m) => m.chave === chave)
  }

  // ---------- Abrir ----------

  async abrirArquivos(arquivos: readonly File[]): Promise<void> {
    for (const arquivo of arquivos) {
      try {
        const nome = arquivo.name.toLowerCase()
        if (nome.endsWith('.obra3d')) {
          await this.comMarca(arquivo.name, 'Abrindo o pacote', async (marca) => {
            const m = await abrirArquivoDePacote(arquivo)
            marca.fase = 'Guardando neste aparelho'
            this.avisar()
            await guardar(m)
            await this.adicionar(m, true, marca)
          })
        } else if (nome.endsWith('.ifc')) {
          const id = idDoArquivo(arquivo)
          if (this.modelos.some((m) => m.id === id)) continue
          const guardado = await abrirGuardado(id).catch(() => null)
          if (guardado) {
            await this.comMarca(arquivo.name, 'Abrindo o modelo guardado', (marca) => this.adicionar(guardado, true, marca))
          } else {
            const m = await this.lerNoWorker(arquivo, id)
            // Depois da leitura ainda vêm duas etapas longas nos modelos grandes (guardar e mandar para a
            // placa de vídeo): a barra continua, senão a tela volta a ficar vazia e parece que falhou.
            await this.comMarca(arquivo.name, 'Guardando neste aparelho', async (marca) => {
              const ok = await guardar(m)
              await this.adicionar(m, ok, marca)
              // Visto em 22/11 com os modelos de 1 a 1,6 GB: o navegador recusa por falta de espaço. O modelo
              // abre do mesmo jeito; a pessoa precisa saber que, fechando o app, terá de importar de novo.
              if (!ok) this.avisarUsuario(`"${arquivo.name}" abriu, mas não coube neste aparelho para ficar guardado. Ao fechar o app, importe o IFC de novo.`)
            })
          }
        } else {
          this.avisarUsuario(`"${arquivo.name}" não é um IFC. Escolha um arquivo .ifc ou .obra3d.`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        this.avisarUsuario(`Não consegui abrir "${arquivo.name}": ${msg}`)
      }
    }
    await this.atualizarGuardados()
  }

  async abrirDoAparelho(id: string): Promise<void> {
    if (this.modelos.some((m) => m.id === id)) return
    const item = this.guardados.find((g) => g.id === id)
    const marca: Leitura = { id, nome: item?.nome ?? 'Modelo', fase: 'Abrindo o modelo guardado', fracao: 0.2 }
    this.leituras = [...this.leituras, marca]
    this.avisar()
    try {
      const m = await abrirGuardado(id)
      if (!m) throw new Error('o arquivo guardado não foi encontrado')
      await this.adicionar(m, true, marca)
    } catch (e) {
      this.avisarUsuario(`Não consegui abrir: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      this.leituras = this.leituras.filter((l) => l !== marca)
      this.avisar()
    }
  }

  async apagarDoAparelho(id: string): Promise<void> {
    await apagarGuardado(id)
    await this.atualizarGuardados()
  }

  /** Mostra uma barra (fase inicial em 10%) enquanto `fazer` roda; some no fim, com ou sem erro. */
  private async comMarca(nome: string, fase: string, fazer: (marca: Leitura) => Promise<void>): Promise<void> {
    const marca: Leitura = { id: `${nome}#${Date.now()}`, nome, fase, fracao: 0.1 }
    this.leituras = [...this.leituras, marca]
    this.avisar()
    try {
      await fazer(marca)
    } finally {
      this.leituras = this.leituras.filter((l) => l !== marca)
      this.avisar()
    }
  }

  private lerNoWorker(arquivo: File, id: string): Promise<ModeloIfc> {
    const marca: Leitura = { id, nome: arquivo.name, fase: 'Preparando o leitor', fracao: 0 }
    this.leituras = [...this.leituras, marca]
    this.avisar()
    return new Promise<ModeloIfc>((resolve, reject) => {
      const w = new Worker(new URL('./motor/leitor.worker.ts', import.meta.url), { type: 'module' })
      const fim = () => {
        w.terminate()
        this.leituras = this.leituras.filter((l) => l !== marca)
        this.avisar()
      }
      w.onerror = (e) => {
        fim()
        reject(new Error(e.message || 'o leitor parou (pode ter faltado memória neste aparelho)'))
      }
      w.onmessage = (ev: MessageEvent<RespostaLeitura>) => {
        const r = ev.data
        if (r.tipo === 'progresso') {
          marca.fase = r.fase
          marca.fracao = r.fracao
          this.avisar()
        } else if (r.tipo === 'pronto') {
          fim()
          resolve(r.modelo)
        } else {
          fim()
          reject(new Error(r.mensagem))
        }
      }
      const pedido: PedidoLeitura = { arquivo, id }
      w.postMessage(pedido)
    })
  }

  private async adicionar(modelo: ModeloIfc, guardado: boolean, marca?: Leitura): Promise<void> {
    if (!this.visor) return
    const id = modelo.meta.id
    if (this.modelos.some((m) => m.id === id)) return
    if (!this.origemCena) this.origemCena = modelo.meta.origem
    const chave = this.proximaChave++
    const ajuste = lerLocal<Ajuste>(`ifc.ajuste.${id}`) ?? ajusteNeutro()
    const primeiro = this.modelos.length === 0
    const aberto: ModeloAberto = {
      chave,
      id,
      nome: modelo.meta.nome,
      modelo,
      indice: indexarModelo(modelo, this.dic),
      flags: new Uint8Array(modelo.tabela.expressIds.length).fill(1),
      cor: corDoModelo(modelo.meta.nome, this.modelos.length),
      visivel: true,
      opacidade: 1,
      ajuste,
      guardado,
    }
    this.modelos = [...this.modelos, aberto]
    this.ocultos.set(chave, new Set())
    await this.visor.adicionarModelo(
      chave,
      modelo,
      this.matrizDe(aberto).elements,
      guardado,
      () => this.recolorir(aberto),
      (f) => {
        if (marca) {
          marca.fase = 'Mandando para a placa de vídeo'
          marca.fracao = 0.2 + 0.8 * f
          this.avisar()
        }
      },
    )
    this.giroPredio = direcaoPrincipal(this.modelos.map((m) => ({ modelo: m.modelo, matriz: this.matrizDe(m).elements })))
    this.refazerBusca()
    if (primeiro) this.visor.vista('iso', this.giroPredio)
    else if (!this.corte?.vista2D) this.visor.enquadrar()
    this.avisar()
  }

  /**
   * Modelo que caiu longe do primeiro: os arquivos não vieram na mesma coordenada.
   * Quem decide o que fazer é a pessoa; mover sozinho poderia esconder um erro de projeto.
   */
  modeloDesalinhado(): { chave: number; nome: string; distancia: number } | null {
    if (this.modelos.length < 2) return null
    const caixa = (m: ModeloAberto) => {
      const c = m.modelo.meta.caixa
      return new Box3(new Vector3(c[0], c[1], c[2]), new Vector3(c[3], c[4], c[5])).applyMatrix4(this.matrizDe(m))
    }
    const base = caixa(this.modelos[0])
    for (const m of this.modelos.slice(1)) {
      if (this.alinhamentoDispensado.has(m.chave)) continue
      const c = caixa(m)
      if (base.intersectsBox(c)) continue
      const distancia = base.getCenter(new Vector3()).distanceTo(c.getCenter(new Vector3()))
      return { chave: m.chave, nome: m.nome, distancia }
    }
    return null
  }

  dispensarAlinhamento(chave: number): void {
    this.alinhamentoDispensado.add(chave)
    this.avisar()
  }

  private matrizDe(m: ModeloAberto) {
    return matrizDoModelo(m.modelo.meta.origem, this.origemCena ?? m.modelo.meta.origem, m.ajuste)
  }

  fechar(chave: number): void {
    const m = this.modelo(chave)
    if (!m) return
    this.visor?.removerModelo(chave)
    this.modelos = this.modelos.filter((x) => x !== m)
    this.ocultos.delete(chave)
    if (this.selecao?.chave === chave) this.selecao = null
    if (this.alinhamento?.chave === chave) this.cancelarAlinhamento()
    if (this.modelos.length === 0) {
      this.origemCena = null
      this.removerCorte()
    }
    // Os dicionários ficam com valores órfãos: são limpos aqui para a lista não mostrar lixo.
    this.dic = novosDicionarios()
    for (const a of this.modelos) a.indice = indexarModelo(a.modelo, this.dic)
    this.refazerBusca()
    if (this.corte) this.agendarCorte()
    this.avisar()
  }

  definirVisivel(chave: number, v: boolean): void {
    const m = this.modelo(chave)
    if (!m) return
    m.visivel = v
    this.visor?.definirVisivel(chave, v)
    if (this.corte) this.agendarCorte()
    this.avisar()
  }

  definirOpacidade(chave: number, o: number): void {
    const m = this.modelo(chave)
    if (!m) return
    m.opacidade = o
    this.visor?.definirOpacidade(chave, o)
    this.aplicarEstado(m)
    this.avisar()
  }

  async salvarPacote(chave: number): Promise<void> {
    const m = this.modelo(chave)
    if (!m) return
    const nome = m.nome.replace(/\.ifc$/i, '') + '.obra3d'
    const f = await arquivoGuardado(m.id)
    if (f) {
      const z = await new Response(f.stream().pipeThrough(new CompressionStream('gzip'))).blob()
      baixar(z, nome)
      return
    }
    baixar(pacoteParaBlob(m.modelo), nome)
  }

  // ---------- Aparência ----------

  private aplicarEstado(m: ModeloAberto): void {
    const n = m.flags.length
    const ocultos = this.ocultos.get(m.chave)
    const passa = this.resultado ? this.resultado.passa[this.modelos.indexOf(m)] : null
    const ativo = filtroAtivo(this.filtro) && passa
    let fantasmas = 0
    for (let i = 0; i < n; i++) {
      let f = 1
      if (ocultos && ocultos.has(i)) f = 0
      else if (ativo && !passa![i]) {
        if (this.modoFiltro === 'isolar') f = 0
        else if (this.modoFiltro === 'destacar') {
          f = 1 | 4
          fantasmas++
        }
      }
      m.flags[i] = f
    }
    if (this.selecao?.chave === m.chave) {
      m.flags[this.selecao.elemento] = (m.flags[this.selecao.elemento] & ~4) | 1 | 2
    }
    this.visor?.aplicarEstado(m.chave, m.flags, {
      fantasmas: fantasmas > 0,
      transparenciaGeral: m.opacidade < 0.995,
      elementosVidro: this.modoCor !== 'original' ? this.elementosVidro(m) : undefined,
    })
  }

  /** Peças da categoria "vidro" (ficam transparentes mesmo sem o IFC dizer). */
  private elementosVidro(m: ModeloAberto): Uint8Array {
    if (m.elementosVidro) return m.elementosVidro
    const iVidro = CATEGORIAS.findIndex((c) => c.id === 'vidro')
    const r = new Uint8Array(m.flags.length)
    for (let i = 0; i < r.length; i++) if (m.indice.categoria[i] === iVidro) r[i] = 1
    m.elementosVidro = r
    return r
  }

  private aplicarTudo(): void {
    for (const m of this.modelos) this.aplicarEstado(m)
  }

  private recolorir(m: ModeloAberto): void {
    if (!this.visor) return
    const n = m.flags.length
    const alturaTex = Math.max(1, Math.ceil(n / 1024))
    const rgba = new Uint8Array(1024 * alturaTex * 4)
    if (this.modoCor !== 'original') {
      const cats = CATEGORIAS.map((c) => ({ rgb: parseHex(c.cor), a: Math.round(c.alfa * 255) }))
      const rgbModelo = parseHex(m.cor)
      const totalPav = m.modelo.meta.pavimentos.length
      const rgbPav = m.modelo.meta.pavimentos.map((_, i) => parseHex(corDoPavimento(i, totalPav)))
      const iVidro = CATEGORIAS.findIndex((c) => c.id === 'vidro')
      for (let i = 0; i < n; i++) {
        const c = m.indice.categoria[i]
        let rgb = cats[c].rgb
        if (this.modoCor === 'modelo') rgb = c === iVidro ? cats[c].rgb : rgbModelo
        if (this.modoCor === 'pavimento') {
          const p = m.modelo.tabela.pavimento[i]
          rgb = c === iVidro ? cats[c].rgb : p >= 0 ? rgbPav[p] : cats[CATEGORIAS.length - 1].rgb
        }
        const k = i * 4
        rgba[k] = rgb[0]
        rgba[k + 1] = rgb[1]
        rgba[k + 2] = rgb[2]
        rgba[k + 3] = cats[c].a
      }
    }
    this.visor.aplicarCores(m.chave, rgba)
    this.aplicarEstado(m)
  }

  definirModoCor(modo: ModoCor): void {
    this.modoCor = modo
    for (const m of this.modelos) this.recolorir(m)
    if (this.corte?.resultado) this.montarTampa()
    this.avisar()
  }

  definirArestas(v: boolean): void {
    this.arestas = v
    this.visor?.definirArestas(v)
    this.avisar()
  }

  // ---------- Busca ----------

  definirTexto(t: string): void {
    this.filtro = { ...this.filtro, texto: t }
    this.avisar()
    clearTimeout(this.temporizadorBusca)
    this.temporizadorBusca = window.setTimeout(() => this.refazerBusca(), 140)
  }

  alternarMarcado(f: Faceta, valor: string): void {
    const atual = new Set(this.filtro.marcados[f] ?? [])
    if (atual.has(valor)) atual.delete(valor)
    else atual.add(valor)
    this.filtro = { ...this.filtro, marcados: { ...this.filtro.marcados, [f]: atual } }
    this.refazerBusca()
  }

  limparFiltro(): void {
    this.filtro = filtroVazio()
    this.refazerBusca()
  }

  definirModoFiltro(m: ModoFiltro): void {
    this.modoFiltro = m
    this.aplicarTudo()
    if (this.corte) this.agendarCorte()
    this.avisar()
  }

  private refazerBusca(): void {
    this.resultado = this.modelos.length ? buscar(this.modelos.map((m) => m.indice), this.dic, this.filtro) : null
    this.aplicarTudo()
    if (this.corte) this.agendarCorte()
    this.avisar()
  }

  /** Enquadra o que o filtro achou. */
  enquadrarResultado(): void {
    if (!this.visor || !this.resultado) return
    const c = new Box3()
    const p = new Vector3()
    this.modelos.forEach((m, k) => {
      const passa = this.resultado!.passa[k]
      const caixas = m.modelo.tabela.caixas
      const mat = this.matrizDe(m)
      for (let i = 0; i < passa.length; i++) {
        if (!passa[i]) continue
        const b = i * 6
        c.expandByPoint(p.set(caixas[b], caixas[b + 1], caixas[b + 2]).applyMatrix4(mat))
        c.expandByPoint(p.set(caixas[b + 3], caixas[b + 4], caixas[b + 5]).applyMatrix4(mat))
      }
    })
    if (!c.isEmpty()) this.visor.enquadrar(c)
  }

  ocultarResultado(): void {
    if (!this.resultado) return
    this.modelos.forEach((m, k) => {
      const passa = this.resultado!.passa[k]
      const o = this.ocultos.get(m.chave)!
      for (let i = 0; i < passa.length; i++) if (passa[i]) o.add(i)
    })
    this.filtro = filtroVazio()
    this.refazerBusca()
  }

  ocultarSelecao(): void {
    if (!this.selecao) return
    this.ocultos.get(this.selecao.chave)?.add(this.selecao.elemento)
    const m = this.modelo(this.selecao.chave)
    this.selecao = null
    if (m) this.aplicarEstado(m)
    if (this.corte) this.agendarCorte()
    this.avisar()
  }

  isolarSelecao(): void {
    if (!this.selecao) return
    const { chave, elemento } = this.selecao
    for (const m of this.modelos) {
      const o = this.ocultos.get(m.chave)!
      for (let i = 0; i < m.flags.length; i++) if (!(m.chave === chave && i === elemento)) o.add(i)
      this.aplicarEstado(m)
    }
    this.visor?.focarElemento(chave, elemento)
    if (this.corte) this.agendarCorte()
    this.avisar()
  }

  qtdOcultos(): number {
    let t = 0
    for (const o of this.ocultos.values()) t += o.size
    return t
  }

  mostrarTudo(): void {
    for (const o of this.ocultos.values()) o.clear()
    this.aplicarTudo()
    if (this.corte) this.agendarCorte()
    this.avisar()
  }

  selecionar(s: Selecao | null, focar = false): void {
    const antes = this.selecao
    this.selecao = s
    for (const m of this.modelos) if (m.chave === antes?.chave || m.chave === s?.chave) this.aplicarEstado(m)
    if (s && focar) this.visor?.focarElemento(s.chave, s.elemento)
    if (this.corte?.resultado) this.montarTampa()
    this.avisar()
  }

  private aoTocar(t: Toque | null): void {
    if (this.alinhamento) {
      this.tocarNoAlinhamento(t)
      return
    }
    if (this.esperandoFace) {
      if (t?.ponto && t.normal) {
        this.esperandoFace = false
        this.criarCorte('face', 'Corte pela face', t.normal, t.ponto)
      }
      this.avisar()
      return
    }
    this.selecionar(t ? { chave: t.chave, elemento: t.elemento } : null)
  }

  // ---------- Corte ----------

  /** Entradas para o motor de corte: só o que está visível e não é fantasma. */
  private entradasCorte(): EntradaCorte[] {
    return this.modelos
      .filter((m) => m.visivel)
      .map((m) => ({
        chave: m.chave,
        modelo: m.modelo,
        matriz: this.matrizDe(m).elements,
        visivel: (i: number) => (m.flags[i] & 1) === 1 && (m.flags[i] & 4) === 0,
      }))
  }

  /** Direções do prédio: a primeira é a do comprimento maior. */
  private eixosDoPredio(): { comprimento: Vec3; largura: Vec3 } {
    const c = Math.cos(this.giroPredio)
    const s = Math.sin(this.giroPredio)
    const a: Vec3 = [c, 0, s]
    const b: Vec3 = [-s, 0, c]
    const faixa = (d: Vec3) => {
      let min = Infinity
      let max = -Infinity
      const p = new Vector3()
      for (const m of this.modelos) {
        const cx = m.modelo.tabela.caixas
        const mat = this.matrizDe(m)
        const passo = Math.max(1, Math.floor(cx.length / 6 / 3000))
        for (let i = 0; i < cx.length / 6; i += passo) {
          p.set(cx[i * 6], cx[i * 6 + 1], cx[i * 6 + 2]).applyMatrix4(mat)
          const v = p.x * d[0] + p.z * d[2]
          if (v < min) min = v
          if (v > max) max = v
        }
      }
      return max - min
    }
    return faixa(a) >= faixa(b) ? { comprimento: a, largura: b } : { comprimento: b, largura: a }
  }

  private faixaNoEixo(n: Vec3, base: Vec3): { min: number; max: number } {
    const caixa = this.visor!.caixaDaCena()
    let min = Infinity
    let max = -Infinity
    for (const x of [caixa.min.x, caixa.max.x]) {
      for (const y of [caixa.min.y, caixa.max.y]) {
        for (const z of [caixa.min.z, caixa.max.z]) {
          const d = (x - base[0]) * n[0] + (y - base[1]) * n[1] + (z - base[2]) * n[2]
          if (d < min) min = d
          if (d > max) max = d
        }
      }
    }
    return { min, max }
  }

  private criarCorte(tipo: TipoCorte, nome: string, normal: Vec3, ponto: Vec3, refV?: Vec3): void {
    const plano = planoDe(normal, ponto, refV)
    const { min, max } = this.faixaNoEixo(plano.normal, ponto)
    this.corte = { tipo, nome, plano, base: ponto, deslocamento: 0, min, max, resultado: null, calculando: true, vista2D: false }
    this.visor?.definirPlano(plano)
    this.calcularCorte()
    this.olharCorte(plano)
    this.avisar()
  }

  /** Enquadra o prédio inteiro de um ângulo em que dá para ver a parte cortada. */
  private olharCorte(plano: PlanoCorte): void {
    if (!this.visor) return
    const n = plano.normal
    const dir = Math.abs(n[1]) > 0.9 ? new Vector3(0.45, 1, 0.75) : new Vector3(n[0] + 0.55 * n[2], 0.5, n[2] - 0.55 * n[0])
    this.visor.enquadrar(undefined, dir.normalize())
  }

  /** Altura real de um ponto da cena, para mostrar o nível da planta. */
  nivelReal(yCena: number): number {
    return yCena + (this.origemCena?.[1] ?? 0)
  }

  novoCorteVertical(tipo: 'longitudinal' | 'transversal'): void {
    if (!this.visor || !this.modelos.length) return
    const { comprimento, largura } = this.eixosDoPredio()
    const c = this.visor.caixaDaCena().getCenter(new Vector3())
    // Corte longitudinal corre ao longo do comprimento: o plano olha na direção da largura.
    const n = tipo === 'longitudinal' ? largura : comprimento
    this.criarCorte(tipo, tipo === 'longitudinal' ? 'Corte longitudinal' : 'Corte transversal', n, [c.x, c.y, c.z])
  }

  /** Planta: corta na altura indicada, acima do piso do pavimento, e olha de cima. */
  novaPlanta(nomePavimento: string, alturaSobrePiso: number): void {
    if (!this.visor || !this.modelos.length) return
    const y = this.alturaNaCena(nomePavimento) + alturaSobrePiso
    const c = this.visor.caixaDaCena().getCenter(new Vector3())
    const { comprimento } = this.eixosDoPredio()
    // Prédio deitado na tela: o "para cima" do desenho é a direção da largura.
    const refV: Vec3 = [-comprimento[2], 0, comprimento[0]]
    this.criarCorte('planta', `Planta ${nomePavimento} ${alturaSobrePiso.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`, [0, 1, 0], [c.x, y, c.z], refV)
  }

  /** Lista dos pavimentos de todos os modelos abertos, de baixo para cima. */
  pavimentos(): Array<{ nome: string; elevacao: number }> {
    const vistos = new Map<string, number>()
    for (const m of this.modelos) {
      for (const p of m.modelo.meta.pavimentos) {
        if (p.elevacao === null || vistos.has(p.nome)) continue
        vistos.set(p.nome, p.elevacao)
      }
    }
    return [...vistos.entries()].map(([nome, elevacao]) => ({ nome, elevacao })).sort((a, b) => a.elevacao - b.elevacao)
  }

  private alturaNaCena(nomePavimento: string): number {
    for (const m of this.modelos) {
      const p = m.modelo.meta.pavimentos.find((q) => q.nome === nomePavimento)
      if (p && p.elevacao !== null) return p.elevacao - (this.origemCena?.[1] ?? 0) + m.ajuste.delta[1]
    }
    return 0
  }

  esperarFace(): void {
    this.esperandoFace = true
    this.avisar()
  }

  cancelarEsperaFace(): void {
    this.esperandoFace = false
    this.avisar()
  }

  moverCorte(d: number): void {
    const c = this.corte
    if (!c) return
    const v = Math.min(c.max, Math.max(c.min, d))
    c.deslocamento = v
    const n = c.plano.normal
    c.plano = { ...c.plano, ponto: [c.base[0] + n[0] * v, c.base[1] + n[1] * v, c.base[2] + n[2] * v] }
    this.visor?.definirPlano(c.plano)
    this.agendarCorte()
    this.avisar()
  }

  /** Mostra o outro lado do corte. */
  inverterCorte(): void {
    const c = this.corte
    if (!c) return
    const n = c.plano.normal
    const novo = planoDe([-n[0], -n[1], -n[2]], c.plano.ponto)
    const { min, max } = this.faixaNoEixo(novo.normal, c.plano.ponto)
    this.corte = { ...c, plano: novo, base: c.plano.ponto, deslocamento: 0, min, max }
    this.visor?.definirPlano(novo)
    this.calcularCorte()
    if (c.vista2D) this.abrirVista2D()
    this.avisar()
  }

  removerCorte(): void {
    if (this.corte?.vista2D) this.fecharVista2D()
    this.cancelCorte && (this.cancelCorte.cancelado = true)
    clearTimeout(this.temporizadorCorte)
    this.corte = null
    this.visor?.definirPlano(null)
    this.visor?.definirTampa(null, null, null, null)
    this.visor?.definirNiveis(null)
    this.avisar()
  }

  private agendarCorte(): void {
    clearTimeout(this.temporizadorCorte)
    this.temporizadorCorte = window.setTimeout(() => this.calcularCorte(), 70)
  }

  private async calcularCorte(): Promise<void> {
    const c = this.corte
    if (!c) return
    if (this.cancelCorte) this.cancelCorte.cancelado = true
    const cancel: Cancelamento = { cancelado: false }
    this.cancelCorte = cancel
    c.calculando = true
    this.avisar()
    const r = await cortar(this.entradasCorte(), c.plano, cancel)
    if (cancel.cancelado || !r || this.corte !== c) return
    c.resultado = r
    c.calculando = false
    this.montarTampa()
    if (c.vista2D) this.atualizarNiveis()
    this.avisar()
  }

  private corDoCorte(chave: number, elemento: number): string {
    const m = this.modelo(chave)
    if (!m) return '#6C7276'
    const cat = CATEGORIAS[m.indice.categoria[elemento]]
    if (this.modoCor === 'modelo') return cat.id === 'vidro' ? cat.corCorte : escurecer(m.cor)
    if (this.modoCor === 'pavimento') {
      const p = m.modelo.tabela.pavimento[elemento]
      if (p >= 0 && cat.id !== 'vidro') return escurecer(corDoPavimento(p, m.modelo.meta.pavimentos.length), 0.4)
    }
    return cat.corCorte
  }

  /** Transforma o resultado do corte em geometria da tampa. */
  private montarTampa(): void {
    const c = this.corte
    const r = c?.resultado
    if (!c || !r || !this.visor) return
    const { normal: n, ponto: p, u, v } = r.plano
    // Um pouco para o lado da câmera, para não brigar com face que esteja exatamente no plano.
    const ox = p[0] + n[0] * 0.001
    const oy = p[1] + n[1] * 0.001
    const oz = p[2] + n[2] * 0.001
    const pos: number[] = []
    const cores: number[] = []
    const ids: number[] = []
    const linhas: number[] = []
    const emCena = (a: number, b: number, saida: number[]) => {
      saida.push(ox + u[0] * a + v[0] * b, oy + u[1] * a + v[1] * b, oz + u[2] * a + v[2] * b)
    }
    for (const peca of r.pecas) {
      const sel = this.selecao?.chave === peca.chave && this.selecao.elemento === peca.elemento
      const rgb = parseHex(sel ? '#FF7312' : this.corDoCorte(peca.chave, peca.elemento))
      const id = peca.elemento + 1
      const tri = preencher(peca.lacos)
      for (let i = 0; i < tri.length; i += 2) {
        emCena(tri[i], tri[i + 1], pos)
        cores.push(rgb[0], rgb[1], rgb[2])
        ids.push(id & 255, (id >> 8) & 255, (id >> 16) & 255, peca.chave)
      }
      for (const lista of [peca.lacos, peca.abertos]) {
        const fechado = lista === peca.lacos
        for (const l of lista) {
          const q = l.length / 2
          const fim = fechado ? q : q - 1
          for (let k = 0; k < fim; k++) {
            const a = k * 2
            const b = ((k + 1) % q) * 2
            emCena(l[a], l[a + 1], linhas)
            emCena(l[b], l[b + 1], linhas)
          }
        }
      }
    }
    this.visor.definirTampa(Float32Array.from(pos), Uint8Array.from(cores), Uint8Array.from(ids), Float32Array.from(linhas))
  }

  abrirVista2D(): void {
    const c = this.corte
    if (!c || !this.visor) return
    c.vista2D = true
    // Corte vertical: espaço à esquerda para os nomes dos pavimentos não ficarem por cima do desenho.
    const lim = c.resultado?.limites ?? null
    const comRotulos = lim && this.niveisDoCorte().length ? ([lim[0] - (lim[2] - lim[0]) * 0.28, lim[1], lim[2], lim[3]] as [number, number, number, number]) : lim
    this.visor.entrarVistaCorte(c.plano, comRotulos)
    this.atualizarNiveis()
    this.avisar()
  }

  fecharVista2D(): void {
    const c = this.corte
    if (!c || !this.visor) return
    c.vista2D = false
    this.visor.sairVistaCorte()
    this.avisar()
  }

  /** Pavimentos que aparecem no corte vertical, na ordem. */
  niveisDoCorte(): NivelVista[] {
    const c = this.corte
    if (!c || Math.abs(c.plano.normal[1]) > 0.5) return []
    const saida: NivelVista[] = []
    const oy = this.origemCena?.[1] ?? 0
    const p = c.plano.ponto
    const limites = c.resultado?.limites
    for (const m of this.modelos) {
      if (!m.visivel) continue
      for (const pv of m.modelo.meta.pavimentos) {
        if (pv.elevacao === null) continue
        const y = pv.elevacao - oy + m.ajuste.delta[1]
        // Dois modelos com o mesmo nível: fica um rótulo só.
        if (saida.some((s) => Math.abs(s.ponto[1] - y) < 0.1)) continue
        const u0 = limites ? limites[0] : 0
        const ponto: Vec3 = [p[0] + c.plano.u[0] * u0, y, p[2] + c.plano.u[2] * u0]
        saida.push({ nome: pv.nome, elevacao: pv.elevacao, ponto })
      }
    }
    return saida.sort((a, b) => a.elevacao - b.elevacao)
  }

  private atualizarNiveis(): void {
    const c = this.corte
    if (!c || !this.visor) return
    const niveis = this.niveisDoCorte()
    const lim = c.resultado?.limites
    if (!niveis.length || !lim) {
      this.visor.definirNiveis(null)
      return
    }
    const folga = (lim[2] - lim[0]) * 0.06 + 1
    const u = c.plano.u
    const p = c.plano.ponto
    const a = lim[0] - folga
    const b = lim[2] + folga
    const pts: number[] = []
    for (const nv of niveis) {
      pts.push(p[0] + u[0] * a, nv.ponto[1], p[2] + u[2] * a, p[0] + u[0] * b, nv.ponto[1], p[2] + u[2] * b)
    }
    this.visor.definirNiveis(Float32Array.from(pts))
  }

  salvarCorte(): void {
    const c = this.corte
    if (!c) return
    const o = this.origemCena ?? [0, 0, 0]
    const p = c.plano.ponto
    const salvo: CorteSalvo = {
      id: Math.random().toString(36).slice(2, 10),
      nome: c.nome,
      tipo: c.tipo,
      pontoReal: [p[0] + o[0], p[1] + o[1], p[2] + o[2]],
      normal: c.plano.normal,
      u: c.plano.u,
      v: c.plano.v,
    }
    this.cortesSalvos = [salvo, ...this.cortesSalvos]
    gravarLocal(CHAVE_CORTES, this.cortesSalvos)
    this.avisar()
  }

  abrirCorteSalvo(id: string): void {
    const s = this.cortesSalvos.find((c) => c.id === id)
    if (!s || !this.visor) return
    const o = this.origemCena ?? [0, 0, 0]
    const ponto: Vec3 = [s.pontoReal[0] - o[0], s.pontoReal[1] - o[1], s.pontoReal[2] - o[2]]
    const plano: PlanoCorte = { normal: s.normal, ponto, u: s.u, v: s.v }
    const { min, max } = this.faixaNoEixo(s.normal, ponto)
    if (this.corte?.vista2D) this.fecharVista2D()
    this.corte = { tipo: s.tipo, nome: s.nome, plano, base: ponto, deslocamento: 0, min, max, resultado: null, calculando: true, vista2D: false }
    this.visor.definirPlano(plano)
    this.calcularCorte()
    this.olharCorte(plano)
    this.avisar()
  }

  apagarCorteSalvo(id: string): void {
    this.cortesSalvos = this.cortesSalvos.filter((c) => c.id !== id)
    gravarLocal(CHAVE_CORTES, this.cortesSalvos)
    this.avisar()
  }

  private infoPeca = (chave: number, elemento: number): InfoPeca => {
    const m = this.modelo(chave)
    const cat = m ? CATEGORIAS[m.indice.categoria[elemento]] : CATEGORIAS[CATEGORIAS.length - 1]
    return { camada: cat.nome, corCorte: this.corDoCorte(chave, elemento) }
  }

  private niveisParaExportar(): Nivel[] {
    const c = this.corte
    if (!c) return []
    return this.niveisDoCorte().map((n) => ({ nome: `${n.nome} ${formatarMetros(n.elevacao)}`, v: n.ponto[1] - c.plano.ponto[1] }))
  }

  exportarCorte(formato: 'dxf' | 'svg' | 'png'): void {
    const c = this.corte
    if (!c?.resultado || !this.visor) return
    const nome = nomeDeArquivo(c.nome)
    if (formato === 'dxf') {
      baixar(new Blob([corteParaDxf(c.resultado, this.infoPeca, this.niveisParaExportar())], { type: 'application/dxf' }), `${nome}.dxf`)
    } else if (formato === 'svg') {
      baixar(new Blob([corteParaSvg(c.resultado, this.infoPeca, this.niveisParaExportar())], { type: 'image/svg+xml' }), `${nome}.svg`)
    } else {
      const foto = this.visor.capturar(3)
      const k = foto.width / (this.visor.canvas.clientWidth || 1)
      const ctx = foto.getContext('2d')!
      ctx.font = `600 ${12 * k}px system-ui, sans-serif`
      ctx.textBaseline = 'bottom'
      for (const n of this.niveisDoCorte()) {
        const { y } = this.visor.naTela(n.ponto)
        ctx.fillStyle = '#1f4e79'
        ctx.fillText(`${n.nome}  ${formatarMetros(n.elevacao)}`, 10 * k, y * k - 3 * k)
      }
      ctx.fillStyle = '#14202b'
      ctx.font = `700 ${15 * k}px system-ui, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(c.nome, 10 * k, 10 * k)
      foto.toBlob((b) => b && baixar(b, `${nome}.png`), 'image/png')
    }
  }

  // ---------- Alinhar modelos ----------

  iniciarAlinhamento(chave: number): void {
    this.alinhamento = { chave, de: [], para: [] }
    this.selecionar(null)
    this.visor?.definirMarcas([])
    this.avisar()
  }

  cancelarAlinhamento(): void {
    this.alinhamento = null
    this.visor?.definirMarcas([])
    this.avisar()
  }

  /** Em que passo está: o texto que a tela mostra. */
  passoAlinhamento(): { texto: string; podeConcluir: boolean } | null {
    const a = this.alinhamento
    if (!a) return null
    const m = this.modelo(a.chave)?.nome ?? 'modelo'
    const quantos = a.de.length
    if (a.de.length === a.para.length) {
      if (quantos === 0) return { texto: `Toque num canto de "${m}" (o modelo que vai mexer).`, podeConcluir: false }
      if (quantos === 1) return { texto: 'Para acertar o giro também, toque num segundo canto, longe do primeiro. Ou conclua só com o deslocamento.', podeConcluir: true }
      return { texto: 'Pronto.', podeConcluir: true }
    }
    return { texto: 'Agora toque no mesmo canto no outro modelo.', podeConcluir: false }
  }

  private tocarNoAlinhamento(t: Toque | null): void {
    const a = this.alinhamento
    if (!a) return
    if (!t?.vertice) return
    const o = this.origemCena ?? [0, 0, 0]
    const real: Vec3 = [t.vertice[0] + o[0], t.vertice[1] + o[1], t.vertice[2] + o[2]]
    const querDe = a.de.length === a.para.length
    if (querDe && t.chave !== a.chave) {
      this.avisarUsuario(`Toque no modelo que vai mexer: "${this.modelo(a.chave)?.nome}".`)
      return
    }
    if (!querDe && t.chave === a.chave) {
      this.avisarUsuario('Este ponto é do modelo que vai mexer. Toque no outro modelo.')
      return
    }
    if (querDe) a.de.push(real)
    else a.para.push(real)
    this.visor?.definirMarcas([...a.de, ...a.para].map((p) => [p[0] - o[0], p[1] - o[1], p[2] - o[2]]))
    if (a.para.length === 2) this.concluirAlinhamento()
    this.avisar()
  }

  concluirAlinhamento(): void {
    const a = this.alinhamento
    if (!a) return
    const m = this.modelo(a.chave)
    if (m && a.para.length > 0) {
      const qtd = a.para.length
      this.definirAjuste(m, ajusteDePontos(m.ajuste, a.de.slice(0, qtd), a.para))
      this.visor?.enquadrar()
    }
    this.cancelarAlinhamento()
  }

  /** Encaixa pelo centro das caixas, em planta: primeira tentativa rápida, sem tocar em nada. */
  encaixarPelaCaixa(chave: number): void {
    const m = this.modelo(chave)
    if (!m || !this.visor) return
    const outros = this.modelos.filter((x) => x !== m)
    if (!outros.length) return
    const centro = (x: ModeloAberto) => {
      const c = x.modelo.meta.caixa
      return new Vector3((c[0] + c[3]) / 2, 0, (c[2] + c[5]) / 2).applyMatrix4(this.matrizDe(x))
    }
    const alvo = centro(outros[0])
    const atual = centro(m)
    this.definirAjuste(m, {
      ...m.ajuste,
      delta: [m.ajuste.delta[0] + alvo.x - atual.x, m.ajuste.delta[1], m.ajuste.delta[2] + alvo.z - atual.z],
    })
    this.visor.enquadrar()
  }

  /** Acerto fino com números: desloca em metros e gira em graus. */
  ajustarFino(chave: number, dx: number, dy: number, dz: number, giroGraus: number): void {
    const m = this.modelo(chave)
    if (!m) return
    const c = m.modelo.meta.caixa
    const o = m.modelo.meta.origem
    const pivo: Vec3 = ajusteEhNeutro(m.ajuste) ? [o[0] + (c[0] + c[3]) / 2, 0, o[2] + (c[2] + c[5]) / 2] : m.ajuste.pivo
    this.definirAjuste(m, {
      giro: m.ajuste.giro + (giroGraus * Math.PI) / 180,
      pivo,
      delta: [m.ajuste.delta[0] + dx, m.ajuste.delta[1] + dy, m.ajuste.delta[2] + dz],
    })
  }

  zerarAjuste(chave: number): void {
    const m = this.modelo(chave)
    if (m) this.definirAjuste(m, ajusteNeutro())
  }

  private definirAjuste(m: ModeloAberto, a: Ajuste): void {
    m.ajuste = a
    gravarLocal(`ifc.ajuste.${m.id}`, ajusteEhNeutro(a) ? null : a)
    this.visor?.definirMatriz(m.chave, this.matrizDe(m).elements)
    if (this.corte) this.agendarCorte()
    this.avisar()
  }

  destruir(): void {
    clearTimeout(this.temporizadorBusca)
    clearTimeout(this.temporizadorCorte)
    if (this.cancelCorte) this.cancelCorte.cancelado = true
    this.visor?.destruir()
    this.visor = null
    this.ouvintes.clear()
  }
}
