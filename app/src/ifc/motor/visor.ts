// A cena 3D: desenha os modelos, responde ao toque, mostra o corte e a vista 2D.
// Só desenha quando algo muda (a bateria do tablet agradece) e não conhece busca nem tela de filtro:
// quem decide o que aparece é a sessao.ts.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import type { BlocoGeometria, Caixa, ModeloIfc, Vec3 } from './tipos'
import { criarMateriais, criarMaterialTampa, novosComuns, type MateriaisModelo } from './materiais'
import type { PlanoCorte } from './corte'
import { caixaSemIsolados } from './enquadramento'

// As cores do projeto já estão em sRGB e saem assim na tela, sem conversão para espaço linear.
THREE.ColorManagement.enabled = false

const FUNDO_3D = 0xe6ebf0
const FUNDO_CORTE = 0xffffff
const LARGURA_TEXTURA = 1024
/** Acima disso a tela já está pesada: as arestas somem enquanto a câmera anda. */
const QUADRO_PESADO_MS = 45
/** Abaixo disso, mesmo no modo leve, a tela aguenta a qualidade cheia. */
const QUADRO_FOLGADO_MS = 15
/** Traço do contorno das peças cortadas, em pixels de tela. */
const LARGURA_CONTORNO = 1.6

export interface InstanciaVisor {
  chave: number
  modelo: ModeloIfc
  grupo: THREE.Group
  materiais: MateriaisModelo
  texEstado: THREE.DataTexture
  texCor: THREE.DataTexture
  desenhos: Array<{ opaco: THREE.Mesh; transparente: THREE.Mesh; fantasma: THREE.Mesh; linhas: THREE.LineSegments; alfaProprio: boolean }>
  visivel: boolean
  /** Alguma peça transparente além das do próprio IFC (fantasma, opacidade, vidro por cor). */
  transparenciaGeral: boolean
}

export interface Toque {
  chave: number
  elemento: number
  /** Ponto na cena, se foi possível calcular. */
  ponto: Vec3 | null
  normal: Vec3 | null
  /** Vértice mais próximo do toque, na cena (para encaixar em cantos ao alinhar modelos). */
  vertice: Vec3 | null
}

export interface EventosVisor {
  aoTocar?: (t: Toque | null) => void
  aoDesenhar?: () => void
  aoPerderContexto?: () => void
}

function proximoQuadro(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

function suavizar(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export class Visor {
  readonly renderer: THREE.WebGLRenderer
  readonly cena = new THREE.Scene()
  readonly camPerspectiva: THREE.PerspectiveCamera
  readonly camOrto: THREE.OrthographicCamera
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
  readonly controles: OrbitControls
  readonly instancias = new Map<number, InstanciaVisor>()
  readonly comuns = novosComuns()
  eventos: EventosVisor = {}

  private readonly alvoId = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true })
  private readonly grupoCorte = new THREE.Group()
  private readonly grupoNiveis = new THREE.Group()
  private readonly grupoMarcas = new THREE.Group()
  private readonly modoIdTampa = { value: 0 }
  private readonly matTampa = criarMaterialTampa(this.modoIdTampa)
  private readonly matContorno = new LineMaterial({ color: 0x18222e, linewidth: LARGURA_CONTORNO, worldUnits: false })
  private tampa: THREE.Mesh | null = null
  private contorno: LineSegments2 | null = null
  private arestasLigadas = true
  private pedido = 0
  private emMovimento = false
  private pesado = false
  private animacao = 0
  private vistaCorte = false
  private ro: ResizeObserver
  private largura = 1
  private altura = 1
  private destruido = false
  private caixaCena: THREE.Box3 | null = null
  private caixaPrincipal: THREE.Box3 | null = null
  private quadroOrto: { centro: THREE.Vector3; largura: number; altura: number } | null = null
  private inicioToque: { x: number; y: number; t: number; id: number } | null = null
  private ultimoToque = 0
  private dedos = 0
  private ultimoQuadro = 0
  private readonly pixelCheio = Math.min(window.devicePixelRatio || 1, 2)

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    this.renderer.setPixelRatio(this.pixelCheio)
    this.cena.background = new THREE.Color(FUNDO_3D)
    this.camPerspectiva = new THREE.PerspectiveCamera(45, 1, 0.05, 2000)
    this.camPerspectiva.position.set(30, 30, 30)
    this.camOrto = new THREE.OrthographicCamera(-10, 10, 10, -10, -2000, 4000)
    this.camera = this.camPerspectiva
    this.cena.add(this.grupoCorte, this.grupoNiveis, this.grupoMarcas)

    this.controles = new OrbitControls(this.camPerspectiva, canvas)
    this.controles.enableDamping = true
    this.controles.dampingFactor = 0.14
    this.controles.zoomToCursor = true
    this.controles.screenSpacePanning = true
    this.definirGestos3D()
    this.controles.addEventListener('change', () => this.pedirDesenho())
    this.controles.addEventListener('start', () => {
      this.emMovimento = true
      this.cancelarAnimacao()
    })
    this.controles.addEventListener('end', () => {
      this.emMovimento = false
      this.pedirDesenho()
    })

    canvas.addEventListener('pointerdown', this.aoPressionar)
    canvas.addEventListener('pointerup', this.aoSoltar)
    canvas.addEventListener('pointercancel', this.aoCancelarToque)
    canvas.addEventListener('webglcontextlost', this.aoPerderContexto)

    this.ro = new ResizeObserver(() => this.redimensionar())
    this.ro.observe(canvas.parentElement ?? canvas)
    this.redimensionar()
  }

  destruir(): void {
    this.destruido = true
    this.ro.disconnect()
    cancelAnimationFrame(this.pedido)
    this.cancelarAnimacao()
    this.canvas.removeEventListener('pointerdown', this.aoPressionar)
    this.canvas.removeEventListener('pointerup', this.aoSoltar)
    this.canvas.removeEventListener('pointercancel', this.aoCancelarToque)
    this.canvas.removeEventListener('webglcontextlost', this.aoPerderContexto)
    for (const chave of [...this.instancias.keys()]) this.removerModelo(chave)
    this.limparTampa()
    this.controles.dispose()
    this.alvoId.dispose()
    this.renderer.dispose()
  }

  private aoPerderContexto = (e: Event) => {
    e.preventDefault()
    this.eventos.aoPerderContexto?.()
  }

  private definirGestos3D(): void {
    const c = this.controles
    c.enableRotate = true
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
  }

  private definirGestos2D(): void {
    const c = this.controles
    c.enableRotate = false
    c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
  }

  private redimensionar(): void {
    const pai = this.canvas.parentElement ?? this.canvas
    const w = Math.max(1, pai.clientWidth)
    const h = Math.max(1, pai.clientHeight)
    if (w === this.largura && h === this.altura) return
    this.largura = w
    this.altura = h
    this.renderer.setSize(w, h, false)
    this.camPerspectiva.aspect = w / h
    this.camPerspectiva.updateProjectionMatrix()
    this.ajustarOrto()
    // O painel abriu ou fechou com o desenho 2D na tela: o desenho continua inteiro à vista.
    if (this.vistaCorte && this.quadroOrto) this.enquadrarOrto(this.quadroOrto.centro, this.quadroOrto.largura, this.quadroOrto.altura, 0)
    this.pedirDesenho()
  }

  private ajustarOrto(): void {
    const aspecto = this.largura / this.altura
    const metade = (this.camOrto.top - this.camOrto.bottom) / 2
    const cy = (this.camOrto.top + this.camOrto.bottom) / 2
    const cx = (this.camOrto.left + this.camOrto.right) / 2
    this.camOrto.left = cx - metade * aspecto
    this.camOrto.right = cx + metade * aspecto
    this.camOrto.top = cy + metade
    this.camOrto.bottom = cy - metade
    this.camOrto.updateProjectionMatrix()
  }

  // ---------- Toque ----------

  private aoPressionar = (e: PointerEvent) => {
    this.dedos++
    this.inicioToque = this.dedos === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null
  }

  private aoCancelarToque = () => {
    this.dedos = Math.max(0, this.dedos - 1)
    this.inicioToque = null
  }

  private aoSoltar = (e: PointerEvent) => {
    this.dedos = Math.max(0, this.dedos - 1)
    const ini = this.inicioToque
    this.inicioToque = null
    if (!ini || ini.id !== e.pointerId) return
    if (e.button > 0) return
    const andou = Math.hypot(e.clientX - ini.x, e.clientY - ini.y)
    if (andou > 8 || performance.now() - ini.t > 450) return

    const toque = this.escolher(e.clientX, e.clientY)
    const agora = performance.now()
    if (agora - this.ultimoToque < 320 && toque?.ponto) {
      // Dois toques: aproxima e passa a girar em volta daquele ponto.
      this.focarPonto(toque.ponto)
    }
    this.ultimoToque = agora
    this.eventos.aoTocar?.(toque)
  }

  /** Qual peça está naquele ponto da tela. */
  escolher(xCliente: number, yCliente: number): Toque | null {
    const r = this.canvas.getBoundingClientRect()
    const x = xCliente - r.left
    const y = yCliente - r.top
    if (x < 0 || y < 0 || x >= r.width || y >= r.height) return null

    const cam = this.camera
    const px = this.renderer.getPixelRatio()
    cam.setViewOffset(this.largura, this.altura, x, y, 1 / px, 1 / px)
    cam.updateProjectionMatrix()

    // Troca de material só durante este desenho de 1 pixel.
    const voltar: Array<() => void> = []
    for (const inst of this.instancias.values()) {
      for (const d of inst.desenhos) {
        const opVis = d.opaco.visible
        const trVis = d.transparente.visible
        const faVis = d.fantasma.visible
        const liVis = d.linhas.visible
        const mat = d.opaco.material
        d.opaco.material = inst.materiais.id
        d.opaco.visible = inst.visivel
        d.transparente.visible = false
        d.fantasma.visible = false
        d.linhas.visible = false
        voltar.push(() => {
          d.opaco.material = mat
          d.opaco.visible = opVis
          d.transparente.visible = trVis
          d.fantasma.visible = faVis
          d.linhas.visible = liVis
        })
      }
    }
    const contVis = this.contorno?.visible ?? false
    if (this.contorno) this.contorno.visible = false
    const niveisVis = this.grupoNiveis.visible
    this.grupoNiveis.visible = false
    const marcasVis = this.grupoMarcas.visible
    this.grupoMarcas.visible = false
    this.modoIdTampa.value = 1
    const fundo = this.cena.background
    this.cena.background = null

    const antigaCor = new THREE.Color()
    this.renderer.getClearColor(antigaCor)
    const antigaAlfa = this.renderer.getClearAlpha()
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setRenderTarget(this.alvoId)
    this.renderer.clear()
    this.renderer.render(this.cena, cam)
    const px4 = new Uint8Array(4)
    this.renderer.readRenderTargetPixels(this.alvoId, 0, 0, 1, 1, px4)
    this.renderer.setRenderTarget(null)
    this.renderer.setClearColor(antigaCor, antigaAlfa)

    this.cena.background = fundo
    this.modoIdTampa.value = 0
    this.grupoNiveis.visible = niveisVis
    this.grupoMarcas.visible = marcasVis
    if (this.contorno) this.contorno.visible = contVis
    for (const f of voltar) f()
    cam.clearViewOffset()
    cam.updateProjectionMatrix()
    this.pedirDesenho()

    const id = px4[0] + (px4[1] << 8) + (px4[2] << 16)
    if (id === 0) return null
    const elemento = id - 1
    const chave = px4[3]
    const inst = this.instancias.get(chave)
    if (!inst) return null
    const detalhes = this.pontoNoElemento(inst, elemento, x, y)
    return { chave, elemento, ponto: detalhes?.ponto ?? null, normal: detalhes?.normal ?? null, vertice: detalhes?.vertice ?? null }
  }

  /** Raio contra os triângulos só daquela peça: exato, e barato porque já sabemos qual é. */
  private pontoNoElemento(inst: InstanciaVisor, elemento: number, x: number, y: number): { ponto: Vec3; normal: Vec3; vertice: Vec3 } | null {
    const ndc = new THREE.Vector2((x / this.largura) * 2 - 1, -(y / this.altura) * 2 + 1)
    const raio = new THREE.Raycaster()
    raio.setFromCamera(ndc, this.camera)
    const inversa = new THREE.Matrix4().copy(inst.grupo.matrixWorld).invert()
    const local = raio.ray.clone().applyMatrix4(inversa)

    const { partesInicio, partes } = inst.modelo.tabela
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const ponto = new THREE.Vector3()
    let melhor = Infinity
    let melhorPonto: THREE.Vector3 | null = null
    let melhorNormal: THREE.Vector3 | null = null
    let melhorVertice: THREE.Vector3 | null = null
    const temPlano = this.comuns.uTemPlano.value === 1
    const plano = this.comuns.uPlano.value
    for (let k = partesInicio[elemento]; k < partesInicio[elemento + 1]; k += 3) {
      const bloco = inst.modelo.blocos[partes[k]]
      const pos = bloco.posicoes
      const idx = bloco.indices
      const fim = partes[k + 1] + partes[k + 2]
      for (let t = partes[k + 1]; t < fim; t += 3) {
        a.fromArray(pos, idx[t] * 3)
        b.fromArray(pos, idx[t + 1] * 3)
        c.fromArray(pos, idx[t + 2] * 3)
        const hit = local.intersectTriangle(a, b, c, false, ponto)
        if (!hit) continue
        const d = local.origin.distanceToSquared(ponto)
        if (d >= melhor) continue
        if (temPlano) {
          const m = ponto.clone().applyMatrix4(inst.grupo.matrixWorld)
          if (m.x * plano.x + m.y * plano.y + m.z * plano.z + plano.w > 0) continue
        }
        melhor = d
        melhorPonto = ponto.clone()
        melhorNormal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
        const da = ponto.distanceToSquared(a)
        const db = ponto.distanceToSquared(b)
        const dc = ponto.distanceToSquared(c)
        melhorVertice = (da <= db && da <= dc ? a : db <= dc ? b : c).clone()
      }
    }
    if (!melhorPonto || !melhorNormal || !melhorVertice) return null
    const mundo = melhorPonto.applyMatrix4(inst.grupo.matrixWorld)
    const normal = melhorNormal.transformDirection(inst.grupo.matrixWorld)
    if (normal.dot(raio.ray.direction) > 0) normal.negate()
    const vertice = melhorVertice.applyMatrix4(inst.grupo.matrixWorld)
    return { ponto: [mundo.x, mundo.y, mundo.z], normal: [normal.x, normal.y, normal.z], vertice: [vertice.x, vertice.y, vertice.z] }
  }

  // ---------- Modelos ----------

  /** Coloca o modelo na cena, um bloco por quadro: a tela segue respondendo enquanto ele aparece. */
  async adicionarModelo(
    chave: number,
    modelo: ModeloIfc,
    matriz: ArrayLike<number>,
    liberarCopias: boolean,
    aoPreparar?: () => void,
    aoProgresso?: (f: number) => void,
  ): Promise<InstanciaVisor> {
    const n = modelo.tabela.expressIds.length
    const altura = Math.max(1, Math.ceil(n / LARGURA_TEXTURA))
    const novaTextura = (preenche: number) => {
      const dados = new Uint8Array(LARGURA_TEXTURA * altura * 4)
      if (preenche) for (let i = 0; i < dados.length; i += 4) dados[i] = preenche
      const t = new THREE.DataTexture(dados, LARGURA_TEXTURA, altura, THREE.RGBAFormat, THREE.UnsignedByteType)
      t.minFilter = THREE.NearestFilter
      t.magFilter = THREE.NearestFilter
      t.generateMipmaps = false
      t.needsUpdate = true
      return t
    }
    const texEstado = novaTextura(255)
    const texCor = novaTextura(0)
    const materiais = criarMateriais(this.comuns, texEstado, texCor, LARGURA_TEXTURA, chave)

    const grupo = new THREE.Group()
    grupo.matrixAutoUpdate = false
    grupo.matrix.fromArray(matriz as number[])
    grupo.matrixWorldNeedsUpdate = true
    this.cena.add(grupo)

    const inst: InstanciaVisor = { chave, modelo, grupo, materiais, texEstado, texCor, desenhos: [], visivel: true, transparenciaGeral: false }
    this.instancias.set(chave, inst)
    // As cores entram antes da primeira peça: o modelo nunca aparece com as cores erradas.
    aoPreparar?.()

    let i = 0
    for (const bloco of modelo.blocos) {
      this.montarBloco(inst, bloco, liberarCopias)
      i++
      aoProgresso?.(i / modelo.blocos.length)
      this.pedirDesenho()
      if (i % 2 === 0) await proximoQuadro()
      if (this.destruido) break
    }
    this.caixaCena = null
    this.caixaPrincipal = null
    return inst
  }

  private montarBloco(inst: InstanciaVisor, bloco: BlocoGeometria, liberar: boolean): void {
    const geo = new THREE.BufferGeometry()
    const pos = new THREE.BufferAttribute(bloco.posicoes, 3)
    const nor = new THREE.BufferAttribute(bloco.normais, 4, true)
    const cor = new THREE.BufferAttribute(bloco.cores, 4, true)
    const el = new THREE.BufferAttribute(bloco.elementos, 1)
    let alfaProprio = false
    for (let i = 3; i < bloco.cores.length; i += 4) {
      if (bloco.cores[i] < 250) {
        alfaProprio = true
        break
      }
    }
    if (liberar) {
      // Depois de enviados à placa de vídeo, estes três vetores não são mais usados no JS.
      nor.onUpload(function (this: THREE.BufferAttribute) {
        ;(this as unknown as { array: unknown }).array = null
        bloco.normais = new Int8Array(0)
      })
      cor.onUpload(function (this: THREE.BufferAttribute) {
        ;(this as unknown as { array: unknown }).array = null
        bloco.cores = new Uint8Array(0)
      })
      el.onUpload(function (this: THREE.BufferAttribute) {
        ;(this as unknown as { array: unknown }).array = null
        bloco.elementos = new Float32Array(0)
      })
    }
    const indiceArestas = new THREE.BufferAttribute(bloco.arestas, 1)
    if (liberar) {
      indiceArestas.onUpload(function (this: THREE.BufferAttribute) {
        ;(this as unknown as { array: unknown }).array = null
        bloco.arestas = new Uint32Array(0)
      })
    }
    geo.setAttribute('position', pos)
    geo.setAttribute('normal', nor)
    geo.setAttribute('aCor', cor)
    geo.setAttribute('aEl', el)
    geo.setIndex(new THREE.BufferAttribute(bloco.indices, 1))

    const [x0, y0, z0, x1, y1, z1] = bloco.caixa
    const centro = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    const raio = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2
    geo.boundingSphere = new THREE.Sphere(centro, raio)
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1))

    const opaco = new THREE.Mesh(geo, inst.materiais.opaco)
    opaco.matrixAutoUpdate = false
    const transparente = new THREE.Mesh(geo, inst.materiais.transparente)
    transparente.matrixAutoUpdate = false
    transparente.renderOrder = 3
    transparente.visible = alfaProprio || inst.transparenciaGeral
    const fantasma = new THREE.Mesh(geo, inst.materiais.fantasma)
    fantasma.matrixAutoUpdate = false
    fantasma.renderOrder = -1
    fantasma.visible = false

    const geoLinhas = new THREE.BufferGeometry()
    geoLinhas.setAttribute('position', pos)
    geoLinhas.setAttribute('normal', nor)
    geoLinhas.setAttribute('aCor', cor)
    geoLinhas.setAttribute('aEl', el)
    geoLinhas.setIndex(indiceArestas)
    geoLinhas.boundingSphere = geo.boundingSphere
    const linhas = new THREE.LineSegments(geoLinhas, inst.materiais.linha)
    linhas.matrixAutoUpdate = false
    linhas.renderOrder = 1
    linhas.visible = this.arestasLigadas

    inst.grupo.add(opaco, transparente, fantasma, linhas)
    inst.grupo.updateMatrixWorld(true)
    inst.desenhos.push({ opaco, transparente, fantasma, linhas, alfaProprio })
    this.pedirDesenho()
  }

  removerModelo(chave: number): void {
    const inst = this.instancias.get(chave)
    if (!inst) return
    for (const d of inst.desenhos) {
      d.opaco.geometry.dispose()
      d.linhas.geometry.dispose()
    }
    inst.texEstado.dispose()
    inst.texCor.dispose()
    inst.materiais.opaco.dispose()
    inst.materiais.transparente.dispose()
    inst.materiais.fantasma.dispose()
    inst.materiais.linha.dispose()
    inst.materiais.id.dispose()
    this.cena.remove(inst.grupo)
    this.instancias.delete(chave)
    this.caixaCena = null
    this.caixaPrincipal = null
    this.pedirDesenho()
  }

  definirMatriz(chave: number, matriz: ArrayLike<number>): void {
    const inst = this.instancias.get(chave)
    if (!inst) return
    inst.grupo.matrix.fromArray(matriz as number[])
    inst.grupo.matrixWorldNeedsUpdate = true
    inst.grupo.updateMatrixWorld(true)
    this.caixaCena = null
    this.caixaPrincipal = null
    this.pedirDesenho()
  }

  definirVisivel(chave: number, visivel: boolean): void {
    const inst = this.instancias.get(chave)
    if (!inst) return
    inst.visivel = visivel
    inst.grupo.visible = visivel
    this.pedirDesenho()
  }

  definirOpacidade(chave: number, o: number): void {
    const inst = this.instancias.get(chave)
    if (!inst) return
    inst.materiais.opaco.uniforms.uOpacidade.value = o
    this.pedirDesenho()
  }

  /** Estado por elemento: bit 1 visível, bit 2 destaque, bit 4 fantasma. */
  aplicarEstado(chave: number, flags: Uint8Array, opcoes: { fantasmas: boolean; transparenciaGeral: boolean; blocosComVidro?: Uint8Array }): void {
    const inst = this.instancias.get(chave)
    if (!inst) return
    const d = inst.texEstado.image.data as Uint8Array
    for (let i = 0; i < flags.length; i++) {
      const f = flags[i]
      const k = i * 4
      d[k] = f & 1 ? 255 : 0
      d[k + 1] = f & 2 ? 255 : 0
      d[k + 2] = f & 4 ? 255 : 0
    }
    inst.texEstado.needsUpdate = true
    inst.transparenciaGeral = opcoes.transparenciaGeral
    // Cada passada a mais custa processar todos os vértices de novo: só nos blocos que precisam.
    inst.desenhos.forEach((des, i) => {
      des.transparente.visible = des.alfaProprio || opcoes.transparenciaGeral || (opcoes.blocosComVidro ? opcoes.blocosComVidro[i] === 1 : false)
      des.fantasma.visible = opcoes.fantasmas
    })
    this.pedirDesenho()
  }

  /** Cor por elemento, RGBA. Alfa 0 = usa a cor original do IFC. */
  aplicarCores(chave: number, rgba: Uint8Array): void {
    const inst = this.instancias.get(chave)
    if (!inst) return
    ;(inst.texCor.image.data as Uint8Array).set(rgba)
    inst.texCor.needsUpdate = true
    this.pedirDesenho()
  }

  definirArestas(ligadas: boolean): void {
    this.arestasLigadas = ligadas
    this.pedirDesenho()
  }

  // ---------- Câmera ----------

  /** Caixa de tudo que está aberto e visível, em coordenada de cena. */
  caixaDaCena(): THREE.Box3 {
    if (this.caixaCena) return this.caixaCena
    const c = new THREE.Box3()
    for (const inst of this.instancias.values()) {
      const [x0, y0, z0, x1, y1, z1] = inst.modelo.meta.caixa
      c.union(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)).applyMatrix4(inst.grupo.matrix))
    }
    if (c.isEmpty()) c.set(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10))
    this.caixaCena = c
    return c
  }

  /**
   * Caixa do botão "Enquadrar" e das vistas prontas: a do conjunto principal, sem peças soltas muito
   * longe (marcador de origem, georreferência). Ver motor/enquadramento.ts.
   */
  caixaParaEnquadrar(): THREE.Box3 {
    if (this.caixaPrincipal) return this.caixaPrincipal
    let total = 0
    for (const inst of this.instancias.values()) total += inst.modelo.tabela.caixas.length
    const todas = new Float64Array(total)
    const b = new THREE.Box3()
    let o = 0
    for (const inst of this.instancias.values()) {
      const c = inst.modelo.tabela.caixas
      for (let i = 0; i + 5 < c.length; i += 6, o += 6) {
        if (!Number.isFinite(c[i]) || !Number.isFinite(c[i + 3])) {
          todas.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], o)
          continue
        }
        b.min.set(c[i], c[i + 1], c[i + 2])
        b.max.set(c[i + 3], c[i + 4], c[i + 5])
        b.applyMatrix4(inst.grupo.matrix)
        todas.set([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z], o)
      }
    }
    const r = caixaSemIsolados(todas)
    this.caixaPrincipal = r
      ? new THREE.Box3(new THREE.Vector3(r[0], r[1], r[2]), new THREE.Vector3(r[3], r[4], r[5]))
      : this.caixaDaCena()
    return this.caixaPrincipal
  }

  private cancelarAnimacao(): void {
    if (this.animacao) cancelAnimationFrame(this.animacao)
    this.animacao = 0
  }

  private animarPara(pos: THREE.Vector3, alvo: THREE.Vector3, ms = 320): void {
    this.cancelarAnimacao()
    const cam = this.camera
    const p0 = cam.position.clone()
    const a0 = this.controles.target.clone()
    if (ms <= 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cam.position.copy(pos)
      this.controles.target.copy(alvo)
      this.pedirDesenho()
      return
    }
    const ini = performance.now()
    const passo = () => {
      const t = Math.min(1, (performance.now() - ini) / ms)
      const s = suavizar(t)
      cam.position.lerpVectors(p0, pos, s)
      this.controles.target.lerpVectors(a0, alvo, s)
      this.pedirDesenho()
      this.animacao = t < 1 ? requestAnimationFrame(passo) : 0
    }
    this.animacao = requestAnimationFrame(passo)
  }

  private distanciaPara(raio: number): number {
    const fov = THREE.MathUtils.degToRad(this.camPerspectiva.fov)
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * this.camPerspectiva.aspect)
    return Math.max(raio / Math.sin(fov / 2), raio / Math.sin(fovH / 2)) * 1.02
  }

  /** Enquadra uma caixa, olhando da direção indicada (padrão: de onde a câmera já está). */
  enquadrar(caixa?: THREE.Box3, direcao?: THREE.Vector3, ms = 320): void {
    const c = caixa ?? this.caixaParaEnquadrar()
    const centro = c.getCenter(new THREE.Vector3())
    const raio = Math.max(c.getSize(new THREE.Vector3()).length() / 2, 0.4)
    if (this.vistaCorte) {
      this.enquadrarOrto(centro, raio * 2, raio * 2, ms)
      return
    }
    const dir = (direcao ?? this.camera.position.clone().sub(this.controles.target)).normalize()
    if (dir.lengthSq() < 0.5) dir.set(1, 0.8, 1).normalize()
    this.animarPara(centro.clone().addScaledVector(dir, this.distanciaPara(raio)), centro, ms)
  }

  /** Vistas prontas. `giro` alinha a vista à direção do prédio. */
  vista(qual: 'iso' | 'topo' | 'frente' | 'lado', giro = 0): void {
    const d = new THREE.Vector3()
    if (qual === 'iso') d.set(1, 0.72, 1)
    if (qual === 'topo') d.set(0, 1, 0.001)
    if (qual === 'frente') d.set(0, 0.02, 1)
    if (qual === 'lado') d.set(1, 0.02, 0)
    d.applyAxisAngle(new THREE.Vector3(0, 1, 0), -giro).normalize()
    this.enquadrar(undefined, d)
  }

  caixaDoElemento(chave: number, elemento: number): THREE.Box3 | null {
    const inst = this.instancias.get(chave)
    if (!inst) return null
    const c = inst.modelo.tabela.caixas
    const b = elemento * 6
    return new THREE.Box3(new THREE.Vector3(c[b], c[b + 1], c[b + 2]), new THREE.Vector3(c[b + 3], c[b + 4], c[b + 5])).applyMatrix4(inst.grupo.matrix)
  }

  focarElemento(chave: number, elemento: number): void {
    const c = this.caixaDoElemento(chave, elemento)
    if (!c) return
    // Peça pequena: abre um pouco, para dar para ver onde ela está.
    const tam = c.getSize(new THREE.Vector3()).length()
    const folga = Math.max(tam * 0.9, 1.5)
    this.enquadrar(c.clone().expandByScalar(folga))
  }

  focarPonto(p: Vec3): void {
    const alvo = new THREE.Vector3(...p)
    if (this.vistaCorte) {
      this.controles.target.copy(alvo)
      return
    }
    const atual = this.camera.position.distanceTo(this.controles.target)
    const dir = this.camera.position.clone().sub(this.controles.target).normalize()
    this.animarPara(alvo.clone().addScaledVector(dir, Math.max(atual * 0.55, 2)), alvo)
  }

  // ---------- Corte ----------

  definirPlano(plano: PlanoCorte | null): void {
    if (!plano) {
      this.comuns.uTemPlano.value = 0
    } else {
      const [nx, ny, nz] = plano.normal
      const [px, py, pz] = plano.ponto
      this.comuns.uPlano.value.set(nx, ny, nz, -(nx * px + ny * py + nz * pz))
      this.comuns.uTemPlano.value = 1
    }
    this.pedirDesenho()
  }

  private limparTampa(): void {
    if (this.tampa) {
      this.tampa.geometry.dispose()
      this.grupoCorte.remove(this.tampa)
      this.tampa = null
    }
    if (this.contorno) {
      this.contorno.geometry.dispose()
      this.grupoCorte.remove(this.contorno)
      this.contorno = null
    }
  }

  /**
   * Desenha o corte: triângulos cheios (posição, cor e id por vértice) e o contorno (pares de pontos).
   * Todas as coordenadas já na cena, 3 números por ponto.
   */
  definirTampa(posicoes: Float32Array | null, cores: Uint8Array | null, ids: Uint8Array | null, contorno: Float32Array | null): void {
    this.limparTampa()
    if (posicoes && posicoes.length && cores && ids) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(posicoes, 3))
      g.setAttribute('aCorTampa', new THREE.BufferAttribute(cores, 3, true))
      g.setAttribute('aIdTampa', new THREE.BufferAttribute(ids, 4, true))
      g.computeBoundingSphere()
      this.tampa = new THREE.Mesh(g, this.matTampa)
      this.grupoCorte.add(this.tampa)
    }
    if (contorno && contorno.length) {
      const g = new LineSegmentsGeometry()
      g.setPositions(contorno)
      this.contorno = new LineSegments2(g, this.matContorno)
      this.contorno.renderOrder = 2
      this.grupoCorte.add(this.contorno)
    }
    this.pedirDesenho()
  }

  /** Linhas de nível na vista do corte (pares de pontos na cena). */
  definirNiveis(pontos: Float32Array | null): void {
    for (const f of [...this.grupoNiveis.children]) {
      ;(f as THREE.LineSegments).geometry.dispose()
      this.grupoNiveis.remove(f)
    }
    if (pontos && pontos.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pontos, 3))
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1f4e79, transparent: true, opacity: 0.55, depthTest: false }))
      l.renderOrder = 4
      this.grupoNiveis.add(l)
    }
    this.pedirDesenho()
  }

  /** Marcas no modelo (pontos do alinhamento). */
  definirMarcas(pontos: Vec3[]): void {
    for (const f of [...this.grupoMarcas.children]) {
      ;(f as THREE.Mesh).geometry.dispose()
      this.grupoMarcas.remove(f)
    }
    const raio = Math.max(this.caixaDaCena().getSize(new THREE.Vector3()).length() * 0.004, 0.08)
    for (const p of pontos) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(raio, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7312, depthTest: false }))
      m.position.set(p[0], p[1], p[2])
      m.renderOrder = 5
      this.grupoMarcas.add(m)
    }
    this.pedirDesenho()
  }

  private enquadrarOrto(centro: THREE.Vector3, largura: number, altura: number, ms: number): void {
    this.quadroOrto = { centro: centro.clone(), largura, altura }
    const dir = this.camera.position.clone().sub(this.controles.target).normalize()
    const dist = Math.max(largura, altura, 10) * 2
    const aspecto = this.largura / this.altura
    // Folga maior que 10%: a faixa com o nome do corte fica por cima do topo do desenho.
    const metadeV = (Math.max(altura, largura / aspecto) * 1.26) / 2
    this.camOrto.top = metadeV
    this.camOrto.bottom = -metadeV
    this.camOrto.left = -metadeV * aspecto
    this.camOrto.right = metadeV * aspecto
    this.camOrto.zoom = 1
    this.camOrto.updateProjectionMatrix()
    this.animarPara(centro.clone().addScaledVector(dir, dist), centro, ms)
  }

  /** Vista 2D do corte: câmera sem perspectiva, de frente para o plano. */
  entrarVistaCorte(plano: PlanoCorte, limites: [number, number, number, number] | null): void {
    this.cancelarAnimacao()
    this.vistaCorte = true
    const n = new THREE.Vector3(...plano.normal)
    const u = new THREE.Vector3(...plano.u)
    const v = new THREE.Vector3(...plano.v)
    const p = new THREE.Vector3(...plano.ponto)
    const [u0, v0, u1, v1] = limites ?? [-10, -10, 10, 10]
    const centro = p.clone().addScaledVector(u, (u0 + u1) / 2).addScaledVector(v, (v0 + v1) / 2)
    const cam = this.camOrto
    cam.up.copy(v)
    cam.position.copy(centro).addScaledVector(n, 200)
    cam.lookAt(centro)
    this.camera = cam
    this.controles.object = cam
    this.controles.target.copy(centro)
    this.definirGestos2D()
    this.cena.background = new THREE.Color(FUNDO_CORTE)
    this.comuns.uDessatura.value = 0.72
    this.enquadrarOrto(centro, u1 - u0, v1 - v0, 0)
    this.controles.update()
    this.pedirDesenho()
  }

  sairVistaCorte(): void {
    if (!this.vistaCorte) return
    this.cancelarAnimacao()
    this.vistaCorte = false
    this.camera = this.camPerspectiva
    this.controles.object = this.camPerspectiva
    this.definirGestos3D()
    this.cena.background = new THREE.Color(FUNDO_3D)
    this.comuns.uDessatura.value = 0
    this.definirNiveis(null)
    this.enquadrar(undefined, new THREE.Vector3(1, 0.72, 1).normalize(), 0)
    this.controles.update()
    this.pedirDesenho()
  }

  naVistaCorte(): boolean {
    return this.vistaCorte
  }

  /** Ponto da cena → pixel da tela. */
  naTela(p: Vec3): { x: number; y: number } {
    const v = new THREE.Vector3(...p).project(this.camera)
    return { x: ((v.x + 1) / 2) * this.largura, y: ((1 - v.y) / 2) * this.altura }
  }

  /** Foto da tela, maior que ela. Para exportar a vista do corte. */
  capturar(escala: number): HTMLCanvasElement {
    const antigaPx = this.renderer.getPixelRatio()
    const k = Math.min(escala, 4096 / Math.max(this.largura, this.altura))
    this.renderer.setPixelRatio(k)
    this.renderer.setSize(this.largura, this.altura, false)
    this.matContorno.linewidth = LARGURA_CONTORNO * k
    this.renderer.render(this.cena, this.camera)
    const saida = document.createElement('canvas')
    saida.width = this.canvas.width
    saida.height = this.canvas.height
    saida.getContext('2d')!.drawImage(this.canvas, 0, 0)
    this.renderer.setPixelRatio(antigaPx)
    this.renderer.setSize(this.largura, this.altura, false)
    this.pedirDesenho()
    return saida
  }

  // ---------- Desenho ----------

  pedirDesenho(): void {
    if (this.pedido || this.destruido) return
    this.pedido = requestAnimationFrame(this.desenhar)
  }

  private ajustarProfundidade(): void {
    if (this.camera !== this.camPerspectiva) return
    const caixa = this.caixaDaCena()
    const centro = caixa.getCenter(new THREE.Vector3())
    const raio = caixa.getSize(new THREE.Vector3()).length() / 2
    const d = this.camera.position.distanceTo(centro)
    this.camPerspectiva.near = Math.max(0.05, (d - raio) * 0.5, d * 0.002)
    this.camPerspectiva.far = Math.max(d + raio * 2.2, 50)
    this.camPerspectiva.updateProjectionMatrix()
  }

  /** Quantos pixels de tela cabem num metro, no centro da vista. */
  private pixelsPorMetro(): number {
    if (this.camera === this.camOrto) return (this.altura * this.camOrto.zoom) / (this.camOrto.top - this.camOrto.bottom)
    const d = Math.max(this.camera.position.distanceTo(this.controles.target), 0.1)
    return this.altura / (2 * d * Math.tan(THREE.MathUtils.degToRad(this.camPerspectiva.fov) / 2))
  }

  private desenhar = () => {
    this.pedido = 0
    if (this.destruido) return
    const agora = performance.now()
    // Só dá para saber o peso de verdade pelo tempo entre quadros: no celular o custo é da placa de vídeo.
    const intervalo = agora - this.ultimoQuadro
    this.ultimoQuadro = agora
    if (this.emMovimento && intervalo < 250) {
      if (intervalo > QUADRO_PESADO_MS) this.pesado = true
      else if (intervalo < QUADRO_FOLGADO_MS) this.pesado = false
    }
    const leve = this.emMovimento && this.pesado
    const px = leve ? 1 : this.pixelCheio
    if (this.renderer.getPixelRatio() !== px) {
      this.renderer.setPixelRatio(px)
      this.renderer.setSize(this.largura, this.altura, false)
    }
    this.matContorno.linewidth = LARGURA_CONTORNO * px

    this.controles.update()
    this.ajustarProfundidade()
    const mostrarLinhas = this.arestasLigadas && !leve
    for (const inst of this.instancias.values()) for (const d of inst.desenhos) d.linhas.visible = mostrarLinhas
    const ppm = this.pixelsPorMetro()
    // De 6 px/m (prédio inteiro na tela) a 60 px/m (uma sala): 0,14 a 0,46
    const t = THREE.MathUtils.clamp(Math.log10(Math.max(ppm, 0.1) / 6), 0, 1)
    this.comuns.uAlfaAresta.value = 0.14 + 0.32 * t
    this.renderer.render(this.cena, this.camera)
    this.eventos.aoDesenhar?.()
  }

  /** Para testes e diagnóstico. */
  estatisticas(): { triangulos: number; chamadas: number; memoria: number } {
    const info = this.renderer.info
    return { triangulos: info.render.triangles, chamadas: info.render.calls, memoria: info.memory.geometries }
  }
}

export function caixaDoModelo(m: ModeloIfc): Caixa {
  return m.meta.caixa
}
