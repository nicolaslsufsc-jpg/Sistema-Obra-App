// Aviso de relógio diferente entre aparelhos, com o caminho para acertar no Android.
import { COMO_ACERTAR_HORA } from '../dados'

export function AvisoHora({ texto, testid }: { texto: string; testid: string }) {
  return (
    <div class="fv-aviso-hora" role="status" data-testid={testid}>
      <p>{texto}</p>
      <details>
        <summary>Como acertar</summary>
        <p>{COMO_ACERTAR_HORA}</p>
      </details>
    </div>
  )
}
