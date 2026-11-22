// "Baixar modelo da obra": a lista dos IFCs da obra que ficam no Google Drive (nunca no servidor).
//
// A lista é dado da obra, fora do repositório: um arquivo JSON pequeno que o gestor carrega no leitor.
// - Com conta: vai para o servidor como arquivo do núcleo (módulo ifc, nome `modelos_drive.json`) e
//   desce para todos os aparelhos da obra. Sem tabela nova.
// - Sem conta: fica só neste aparelho.
// - Obra EXE (fictícia): sem lista carregada, mostra a de exemplo daqui.
// O aparelho baixa o arquivo pelo próprio Drive (o link abre o Drive; a pessoa precisa ter acesso à
// pasta) e abre no leitor pelo "Importar IFC". Antes, o app mostra o tamanho e pede Wi-Fi nos grandes.
//
// Formato do JSON:
// { "tipo": "sistema-obra/modelos-drive", "versao": 1, "pasta": "<id da pasta>",
//   "modelos": [{ "nome": "X.ifc", "disciplina": "Arquitetura", "tamanho": 123, "drive": "<id do arquivo>", "situacao": "..." }] }

export const NOME_LISTA = 'modelos_drive.json'
export const TIPO_LISTA = 'sistema-obra/modelos-drive'

/** Acima disto, abrir no celular ou no tablet pode travar (o leitor precisa de ~4x o arquivo de memória). */
export const GRANDE_PARA_APARELHO = 300 * 1e6
/** Acima disto, o app pede Wi-Fi. */
export const PEDE_WIFI = 20 * 1e6

export interface ModeloDrive {
  nome: string
  disciplina: string
  tamanho: number
  /** Id do arquivo no Google Drive (só letras, números, - e _). */
  drive: string
  situacao?: string
}

export interface ListaModelos {
  pasta?: string
  modelos: ModeloDrive[]
  /** De onde veio: o arquivo da obra ou o exemplo da EXE. */
  exemplo?: boolean
}

const ID_DRIVE = /^[A-Za-z0-9_-]{10,80}$/

/** Id do Drive a partir do id puro ou de um link de arquivo/pasta do Drive. Null se não for do Drive. */
export function idDoDrive(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (ID_DRIVE.test(t)) return t
  try {
    const u = new URL(t)
    if (u.protocol !== 'https:' || !/(^|\.)(drive|docs)\.google\.com$/.test(u.hostname)) return null
    const m = /\/(?:file\/d|folders)\/([A-Za-z0-9_-]{10,80})/.exec(u.pathname)
    const id = m?.[1] ?? u.searchParams.get('id')
    return id && ID_DRIVE.test(id) ? id : null
  } catch {
    return null
  }
}

/**
 * O link é montado aqui, nunca copiado do arquivo: só abre o Drive. É o de baixar direto: arquivo
 * pequeno já começa a baixar; grande passa antes pela página "não dá para verificar vírus" do Drive.
 * A pasta precisa estar como "qualquer pessoa com o link: leitor" (ou a pessoa logada com acesso).
 */
export function linkDoArquivo(id: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`
}

export function linkDaPasta(id: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
}

/** Lê e confere o JSON. Lança erro com o motivo, em português. */
export function lerLista(texto: string): ListaModelos {
  let j: unknown
  try {
    j = JSON.parse(texto)
  } catch {
    throw new Error('o arquivo não é um JSON válido')
  }
  const o = j as { tipo?: unknown; modelos?: unknown; pasta?: unknown }
  if (!o || typeof o !== 'object' || o.tipo !== TIPO_LISTA) throw new Error(`o arquivo não é uma lista de modelos (falta "tipo": "${TIPO_LISTA}")`)
  if (!Array.isArray(o.modelos)) throw new Error('falta a lista "modelos"')
  const modelos: ModeloDrive[] = []
  o.modelos.forEach((m: unknown, i: number) => {
    const x = m as Record<string, unknown>
    const drive = idDoDrive(x?.drive)
    const nome = typeof x?.nome === 'string' ? x.nome.trim() : ''
    const tamanho = Number(x?.tamanho)
    if (!nome || !drive || !Number.isFinite(tamanho) || tamanho <= 0) throw new Error(`modelo ${i + 1}: precisa de "nome", "drive" (id ou link do Drive) e "tamanho" em bytes`)
    modelos.push({
      nome: nome.slice(0, 200),
      disciplina: typeof x.disciplina === 'string' && x.disciplina.trim() ? x.disciplina.trim().slice(0, 60) : 'Outros',
      tamanho,
      drive,
      situacao: typeof x.situacao === 'string' && x.situacao.trim() ? x.situacao.trim().slice(0, 80) : undefined,
    })
  })
  if (modelos.length === 0) throw new Error('a lista não tem nenhum modelo')
  const pasta = idDoDrive(o.pasta) ?? undefined
  modelos.sort((a, b) => a.disciplina.localeCompare(b.disciplina, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'))
  return { pasta, modelos }
}

/** Lista de exemplo da obra fictícia EXE (ids de mentira: o link não abre arquivo nenhum). */
export function listaDeExemplo(): ListaModelos {
  return {
    exemplo: true,
    modelos: [
      { nome: 'EXE.AR.EX.000.TORRE-R00.ifc', disciplina: 'Arquitetura', tamanho: 285e6, drive: 'exemplo_exe_arquitetura', situacao: 'Projeto Executivo' },
      { nome: 'EXE.FR.EX.000.GERAL-R00.ifc', disciplina: 'Furação', tamanho: 9e6, drive: 'exemplo_exe_furacao', situacao: 'Projeto Executivo' },
      { nome: 'EXE.HI.LO.000.GERAL-R00.ifc', disciplina: 'Hidráulico', tamanho: 1009e6, drive: 'exemplo_exe_hidraulico', situacao: 'Liberado Obra' },
    ],
  }
}

export interface Conexao {
  /** 'wifi', 'cellular', ... ou undefined quando o navegador não diz. */
  tipo?: string
  economia?: boolean
}

export function conexaoAtual(): Conexao {
  const c = (navigator as unknown as { connection?: { type?: string; saveData?: boolean } }).connection
  return { tipo: c?.type, economia: c?.saveData }
}

/** Avisos antes de baixar, do mais importante para o menos. */
export function avisosAntesDeBaixar(m: ModeloDrive, conexao: Conexao): string[] {
  const r: string[] = []
  const dados = conexao.tipo === 'cellular' || conexao.economia === true
  if (m.tamanho >= PEDE_WIFI) r.push(dados ? 'Você está nos dados móveis. Conecte no Wi-Fi antes de baixar.' : 'Arquivo grande: baixe com Wi-Fi.')
  if (m.tamanho >= GRANDE_PARA_APARELHO) r.push('Modelo grande para celular e tablet: pode travar ao abrir. Prefira abrir no PC, ou o IFC por pavimento.')
  return r
}

const chaveLocal = (obraId: string) => `ifc.modelos_drive.${obraId}`

export function lerListaLocal(obraId: string): ListaModelos | null {
  try {
    const t = localStorage.getItem(chaveLocal(obraId))
    return t ? lerLista(t) : null
  } catch {
    return null
  }
}

export function gravarListaLocal(obraId: string, texto: string | null): void {
  try {
    if (texto === null) localStorage.removeItem(chaveLocal(obraId))
    else localStorage.setItem(chaveLocal(obraId), texto)
  } catch {
    // modo privado: a lista vale só até fechar
  }
}

/** De onde a lista vem e para onde vai (servidor com conta; aparelho sem conta; memória na bancada). */
export interface FonteListaModelos {
  ler(): Promise<ListaModelos | null>
  /** Guarda o JSON já conferido. Ausente = esta pessoa não pode trocar a lista. */
  gravar?: (texto: string) => Promise<void>
}

/** Sem conta (e na bancada): a lista fica só neste aparelho. */
export function fonteLocal(obraId: string, exemploSeVazia: boolean): FonteListaModelos {
  return {
    ler: async () => lerListaLocal(obraId) ?? (exemploSeVazia ? listaDeExemplo() : null),
    gravar: async (texto) => gravarListaLocal(obraId, texto),
  }
}
