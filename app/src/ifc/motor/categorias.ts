// Toda peça cai numa categoria que faz sentido para quem está na obra (parede, pilar, porta...).
// A classe do IFC não basta: o ArchiCAD exporta quase tudo como "IfcBuildingElementProxy" ou
// "IfcBuildingElementPart", e o que separa uma coisa da outra é a camada e o nome.
//
// A paleta foi escolhida para dois modelos sobrepostos continuarem legíveis:
// estrutura em azuis frios, arquitetura em tons quentes e claros, instalações em cores vivas.

export type IdCategoria =
  | 'parede'
  | 'pilar'
  | 'viga'
  | 'laje'
  | 'fundacao'
  | 'escada'
  | 'porta'
  | 'vidro'
  | 'caixilho'
  | 'cobertura'
  | 'forro'
  | 'guarda'
  | 'hidraulica'
  | 'eletrica'
  | 'climatizacao'
  | 'mobiliario'
  | 'terreno'
  | 'outros'

export interface Categoria {
  id: IdCategoria
  nome: string
  /** sRGB em hexadecimal, como aparece na tela com luz cheia. */
  cor: string
  /** 1 = opaco. */
  alfa: number
  /** Cor do material cortado no corte (a parte "cheia" do desenho). */
  corCorte: string
}

export const CATEGORIAS: readonly Categoria[] = [
  { id: 'pilar', nome: 'Pilares', cor: '#4F7CAC', alfa: 1, corCorte: '#2C4A6B' },
  { id: 'viga', nome: 'Vigas', cor: '#6F9BC8', alfa: 1, corCorte: '#35587E' },
  { id: 'laje', nome: 'Lajes e pisos', cor: '#B4BFCA', alfa: 1, corCorte: '#55636F' },
  { id: 'fundacao', nome: 'Fundações', cor: '#8C7A67', alfa: 1, corCorte: '#51453A' },
  { id: 'parede', nome: 'Paredes', cor: '#EDE6D9', alfa: 1, corCorte: '#8A7B64' },
  { id: 'escada', nome: 'Escadas e rampas', cor: '#A6A2CC', alfa: 1, corCorte: '#5D5988' },
  { id: 'porta', nome: 'Portas', cor: '#BC8455', alfa: 1, corCorte: '#74492A' },
  { id: 'vidro', nome: 'Vidros', cor: '#7CC6DE', alfa: 0.34, corCorte: '#2F8FAD' },
  { id: 'caixilho', nome: 'Caixilhos', cor: '#7A8791', alfa: 1, corCorte: '#46515A' },
  { id: 'cobertura', nome: 'Coberturas', cor: '#B5654D', alfa: 1, corCorte: '#6F3A2B' },
  { id: 'forro', nome: 'Forros', cor: '#F5F2EB', alfa: 1, corCorte: '#A49D8E' },
  { id: 'guarda', nome: 'Guarda-corpos', cor: '#5F6B76', alfa: 1, corCorte: '#3A434B' },
  { id: 'hidraulica', nome: 'Hidráulica', cor: '#2FA58C', alfa: 1, corCorte: '#1A6A59' },
  { id: 'eletrica', nome: 'Elétrica', cor: '#E2AE32', alfa: 1, corCorte: '#94701A' },
  { id: 'climatizacao', nome: 'Climatização', cor: '#C57BAE', alfa: 1, corCorte: '#814B70' },
  { id: 'mobiliario', nome: 'Mobiliário e louças', cor: '#D3BFA6', alfa: 1, corCorte: '#8E7A62' },
  { id: 'terreno', nome: 'Terreno e paisagismo', cor: '#94AE7D', alfa: 1, corCorte: '#5A7246' },
  { id: 'outros', nome: 'Outros', cor: '#C7CACC', alfa: 1, corCorte: '#6C7276' },
]

/** Índice fixo: o que fica guardado por elemento em memória. */
export const INDICE_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c, i) => [c.id, i])) as Record<IdCategoria, number>

export function semAcento(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Classes do IFC que já dizem o que a peça é. */
const POR_CLASSE: Array<[RegExp, IdCategoria]> = [
  [/^ifccolumn/, 'pilar'],
  [/^ifcbeam/, 'viga'],
  [/^ifcslab/, 'laje'],
  [/^ifcfooting|^ifcpile/, 'fundacao'],
  [/^ifcroof/, 'cobertura'],
  [/^ifcstair|^ifcramp/, 'escada'],
  [/^ifcdoor/, 'porta'],
  [/^ifcwindow/, 'caixilho'],
  [/^ifcrailing/, 'guarda'],
  [/^ifccovering/, 'forro'],
  [/^ifccurtainwall/, 'caixilho'],
  [/^ifcmember/, 'caixilho'],
  [/^ifcwall/, 'parede'],
  [/^ifcfurnishing|^ifcfurniture|^ifcsanitary|^ifcflowterminal/, 'mobiliario'],
  [/^ifcsite|^ifcgeographic/, 'terreno'],
  [/^ifcpipe|^ifcfitting|^ifcflowsegment|^ifcflowfitting|^ifcvalve|^ifcpump/, 'hidraulica'],
  [/^ifccable|^ifcelectric|^ifclight|^ifcoutlet|^ifcswitch/, 'eletrica'],
  [/^ifcduct|^ifcair|^ifcfan|^ifcunitary/, 'climatizacao'],
]

/** Palavras que valem mais que a camada: uma porta numa camada de parede continua sendo porta. */
const POR_PECA: Array<[RegExp, IdCategoria]> = [
  [/guarda|\bgc\d/, 'guarda'],
  [/\bporta\b|\bdoor\b|\bp[mca]\d|\bpcf\b|\bpcf\d/, 'porta'],
  [/\bjanela\b|\bwindow\b|\bja\d|\bcaixilho|\bmullion|\bgrelha|\bbrise/, 'caixilho'],
]

/** Palavras na camada ou no nome, nesta ordem. */
const POR_TEXTO: Array<[RegExp, IdCategoria]> = [
  [/guarda|\bgc\d|railing|\bhral\b/, 'guarda'],
  [/forro|ceiling|\bclng\b/, 'forro'],
  [/pilar|column|\bcols\b/, 'pilar'],
  [/\bviga\b|\bbeam\b/, 'viga'],
  [/fundac|sapata|estaca|footing|\bpile\b/, 'fundacao'],
  [/escada|stair|rampa|\bstrs\b/, 'escada'],
  [/cobertura|telha|\broof\b/, 'cobertura'],
  [/\blaje\b|\bslab\b|\bpiso\b|contrapiso|\bflor\b|\bfloor\b|porcelanato/, 'laje'],
  [/floreira|paisag|jardim|\bplnt\b|\bsite\b|terreno|\bsolo\b/, 'terreno'],
  [/hidr|\bpipe\b|\btubo\b|\bsanr\b|esgoto|pluvial/, 'hidraulica'],
  [/eletr|\belec\b|\blumin|\bcabo\b|\bspda\b/, 'eletrica'],
  [/hvac|\bduct\b|clima|ar condic/, 'climatizacao'],
  [/mobili|\bfurn\b|\bcase\b|aquecedor|\bspcq\b|\beqpm\b|elevador/, 'mobiliario'],
  [/parede|\bwall\b|alvenaria|dry|bloco|reboco|gesso|tijolo|\bgenm\b/, 'parede'],
  [/aluminio|inox/, 'caixilho'],
]

export interface DadosCategoria {
  classe: string
  camada: string
  nome: string
  pai: string
  tipo: string
  material: string
}

export function categoriaDe(d: DadosCategoria): IdCategoria {
  const nomeProprio = semAcento(d.nome)
  const peca = semAcento(`${d.nome} ${d.pai} ${d.tipo}`)
  const material = semAcento(d.material)
  const camada = semAcento(d.camada)
  const classe = d.classe.toLowerCase()
  const ehVidro = /\bvidro\b|\bglass\b/

  // Placa em pele de vidro é placa de vidro; em outro lugar, a classe sozinha não diz.
  if (classe.startsWith('ifcplate') && ehVidro.test(`${peca} ${material} ${camada}`)) return 'vidro'
  if ((classe.startsWith('ifcwindow') || classe.startsWith('ifcdoor')) && ehVidro.test(nomeProprio)) return 'vidro'
  for (const [re, cat] of POR_CLASSE) if (re.test(classe)) return cat

  // Proxy e Part: o nome da peça primeiro, depois a camada, depois o material.
  if (ehVidro.test(nomeProprio) || (ehVidro.test(material) && !material.includes('+'))) return 'vidro'
  for (const [re, cat] of POR_PECA) if (re.test(peca)) return cat
  // Peça de alumínio ou inox solta, numa camada genérica: é caixilho, não parede.
  if (/^\.?(aluminio|aco inox)/.test(nomeProprio)) return 'caixilho'
  for (const [re, cat] of POR_TEXTO) if (re.test(camada)) return cat
  for (const [re, cat] of POR_TEXTO) if (re.test(peca)) return cat
  for (const [re, cat] of POR_TEXTO) if (re.test(material)) return cat
  return 'outros'
}

// Cores de identidade de cada modelo, para o modo "por modelo".
const CORES_MODELO: Array<[RegExp, string]> = [
  [/(^|[._\- ])(est|es|estr|estrutura|str|struct)([._\- ]|$)/i, '#4F7CAC'],
  [/(^|[._\- ])(arq|ar|arquitetura|arch)([._\- ]|$)/i, '#E8DCC6'],
  [/(^|[._\- ])(hid|hi|hidr|hidraulica|hs|san)([._\- ]|$)/i, '#2FA58C'],
  [/(^|[._\- ])(ele|el|elet|eletrica|elec)([._\- ]|$)/i, '#E2AE32'],
  [/(^|[._\- ])(ppci|pci|inc|incendio)([._\- ]|$)/i, '#D2553F'],
  [/(^|[._\- ])(hvac|clim)([._\- ]|$)/i, '#C57BAE'],
]
const CORES_RESERVA = ['#8E7CC3', '#D98C4A', '#5BB0A5', '#C9708C', '#7F9C4F', '#6C8EBF']

/** Cor do modelo pelo nome do arquivo (ARQ, EST, HID...). `ordem` desempata quando o nome não diz. */
export function corDoModelo(nomeArquivo: string, ordem: number): string {
  for (const [re, cor] of CORES_MODELO) if (re.test(nomeArquivo)) return cor
  return CORES_RESERVA[ordem % CORES_RESERVA.length]
}

export function parseHex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function paraHex(c: readonly number[]): string {
  return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/** Escala do térreo (claro) ao topo (escuro), para o modo "por pavimento". */
export function corDoPavimento(i: number, total: number): string {
  const paradas = ['#F2D8A7', '#EFA36B', '#D9655F', '#A2478B', '#5B3F99', '#2C4A8C'].map(parseHex)
  const t = total <= 1 ? 0 : i / (total - 1)
  const x = t * (paradas.length - 1)
  const a = Math.floor(x)
  const b = Math.min(paradas.length - 1, a + 1)
  const f = x - a
  return paraHex(paradas[a].map((v, k) => v + (paradas[b][k] - v) * f))
}

/** Escurece na direção de um azul-ardósia (fica melhor que escurecer para preto). */
export function escurecer(hex: string, f = 0.55): string {
  const alvo = [24, 34, 46]
  return paraHex(parseHex(hex).map((v, i) => v + (alvo[i] - v) * f))
}
