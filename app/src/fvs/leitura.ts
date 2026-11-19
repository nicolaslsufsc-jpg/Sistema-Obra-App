// Os dados que a tela mostra: leituras do aparelho e registros que acabaram de ser gravados.
//
// O toque não relê o aparelho: o registro entra direto nos dados da tela, porque com milhares de
// registros reler tudo passa do limite de resposta do campo (0,1 s). A sincronização continua mandando
// reler de tempos em tempos, e as duas coisas se cruzam. Sem cuidado, uma leitura que começou antes do
// toque apagaria a marcação recém-feita da tela: é o "marca e não registra" que este app existe para evitar.

import type { Linha } from '../nucleo/banco_local'
import { comRegistros, type DadosFvs } from './dados'

export class DadosDaTela {
  private atual: DadosFvs | null = null
  /** Registros gravados durante cada leitura em curso: ela pode não ter visto. */
  private readonly durante = new Set<Linha[]>()
  private ultimaLeitura = 0

  constructor(
    private readonly ler: () => Promise<DadosFvs>,
    private readonly publicar: (d: DadosFvs) => void,
  ) {}

  async recarregar(): Promise<DadosFvs> {
    const minha = ++this.ultimaLeitura
    const chegaram: Linha[] = []
    this.durante.add(chegaram)
    try {
      const lidos = await this.ler()
      // uma leitura mais nova já foi pedida: ela é que vale, esta não pode passar por cima
      if (minha !== this.ultimaLeitura && this.atual) return this.atual
      return this.trocar(comRegistros(lidos, chegaram))
    } finally {
      this.durante.delete(chegaram)
    }
  }

  /** Acrescenta registros recém-gravados, sem reler o aparelho. */
  registrados(linhas: readonly Linha[]): DadosFvs {
    for (const lista of this.durante) lista.push(...linhas)
    if (!this.atual) throw new Error('FVS: registro gravado antes de a tela ter dados')
    return this.trocar(comRegistros(this.atual, linhas))
  }

  private trocar(d: DadosFvs): DadosFvs {
    this.atual = d
    this.publicar(d)
    return d
  }
}
