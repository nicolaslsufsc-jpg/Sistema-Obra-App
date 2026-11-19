// "Abrir pacote da obra (.zip)": escolhe o arquivo no aparelho (o Chrome do Android não abre pasta,
// só arquivo) e entrega o pacote para a casca preparar a obra, como faz com a pasta ao lado do app.
import { useRef, useState } from 'preact/hooks'
import { abrirPacoteZip, type PacoteLocalizado } from '../nucleo/pacote_obra'

export function AbrirPacote({
  aoAbrir,
  principal = false,
  rotulo = 'Abrir pacote da obra (.zip)',
}: {
  aoAbrir: (pacote: PacoteLocalizado) => void
  principal?: boolean
  rotulo?: string
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function escolher(arquivo: File) {
    setLendo(true)
    setErro(null)
    try {
      aoAbrir(await abrirPacoteZip(arquivo))
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha))
    } finally {
      setLendo(false)
    }
  }

  return (
    <div data-testid="abrir-pacote">
      <div class="acoes-linha">
        <button type="button" class={principal ? 'principal' : undefined} onClick={() => entrada.current?.click()} disabled={lendo}>
          {lendo ? 'Lendo o pacote…' : rotulo}
        </button>
        <input
          ref={entrada}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          hidden
          aria-label="Pacote da obra (.zip)"
          onChange={(e) => {
            const campo = e.target as HTMLInputElement
            const f = campo.files?.[0]
            campo.value = '' // o mesmo arquivo pode ser escolhido de novo
            if (f) escolher(f)
          }}
        />
      </div>
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}
