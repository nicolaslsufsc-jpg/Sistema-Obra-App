// Sistema oficial externo: o sistema em que a empresa da obra registra a FVS (ou o concreto) de
// verdade. O app não escreve nele: só mostra o código da ficha que a pessoa abriu lá, a lista do que
// falta lançar e as fichas duplicadas. Cada sistema é um "galho" numa pasta própria
// (integracoes/<id>/index.ts); a obra diz qual usa pelo campo sistema_oficial do pacote (indice.json).
// Sem o campo, ou sem a pasta do galho, o app não mostra nada de sistema oficial
// (docs/modulos/integracoes.md).

export interface SistemaOficial {
  /** como vem no indice.json do pacote, ex. "meu_sistema" */
  id: string
  /** nome nos textos das telas e das planilhas */
  nome: string
  /** exemplo de local, no campo "Local" do Concreto */
  dicaLocal?: string
  /** exemplo de código de ficha */
  dicaCodigoFicha?: string
}

// O Vite junta aqui os galhos que existirem na pasta. Tirou a pasta, o build continua: a lista fica vazia.
const galhos = import.meta.glob<{ default: SistemaOficial }>('./*/index.ts', { eager: true })

const instalados = new Map<string, SistemaOficial>()
for (const m of Object.values(galhos)) instalados.set(m.default.id, m.default)

/** Os galhos que vieram nesta versão do app. */
export function sistemasInstalados(): SistemaOficial[] {
  return [...instalados.values()]
}

/** O sistema oficial da obra, ou null: a obra não tem, ou o galho dele não está nesta versão. */
export function sistemaDaObra(obra: { sistema_oficial?: string | null } | null | undefined): SistemaOficial | null {
  const id = obra?.sistema_oficial?.trim().toLowerCase()
  return (id && instalados.get(id)) || null
}

/**
 * Aviso para o início da FVS quando o pacote traz histórico de fichas (fichas abertas num sistema
 * oficial) e o app não sabe de qual sistema: sem o campo sistema_oficial no pacote, ou com um sistema
 * cujo galho não veio nesta versão. Sem histórico, ou com o sistema achado, não há aviso (null).
 */
export function avisoDoSistemaOficial(obra: { sistema_oficial?: string | null } | null | undefined, temHistorico: boolean): string | null {
  if (!temHistorico || sistemaDaObra(obra)) return null
  const id = obra?.sistema_oficial?.trim()
  if (id) return `Este pacote tem histórico do sistema oficial "${id}", que não vem nesta versão do app.`
  return 'Este pacote tem histórico de um sistema oficial, mas não diz qual. Gere o pacote de novo com --sistema-oficial.'
}
