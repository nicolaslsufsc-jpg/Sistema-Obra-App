import { useEffect, useState } from 'preact/hooks'
import { conta } from '../nucleo/servicos'
import type { UsuarioLocal } from '../nucleo/conta'

const ESPERA_REENVIO_S = 60

export function Codigo({
  email,
  aoEntrar,
  aoTrocarEmail,
}: {
  email: string
  aoEntrar: (u: UsuarioLocal) => void
  aoTrocarEmail: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [conferindo, setConferindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [espera, setEspera] = useState(ESPERA_REENVIO_S)

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  async function confirmar(e: Event) {
    e.preventDefault()
    setConferindo(true)
    setErro(null)
    const r = await conta.confirmarCodigo(email, codigo)
    setConferindo(false)
    if (typeof r === 'string') setErro(r)
    else aoEntrar(r)
  }

  async function reenviar() {
    setErro(null)
    const falha = await conta.pedirCodigo(email)
    if (falha) setErro(falha)
    else {
      setAviso('Código novo enviado.')
      setEspera(ESPERA_REENVIO_S)
    }
  }

  const digitos = codigo.replace(/\D/g, '')
  return (
    <main class="tela tela-estreita">
      <h1>Digite o código</h1>
      <p>
        Mandamos um código para <strong>{email}</strong>. Se não chegar, olhe a caixa de spam.
      </p>
      <form onSubmit={confirmar}>
        <label for="codigo">Código</label>
        <input
          id="codigo"
          class="codigo"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={10}
          required
          value={codigo}
          onInput={(e) => setCodigo((e.target as HTMLInputElement).value.replace(/\D/g, ''))}
        />
        {erro && <p class="erro" role="alert">{erro}</p>}
        {aviso && !erro && <p class="aviso">{aviso}</p>}
        <button type="submit" class="principal" disabled={conferindo || digitos.length < 6}>
          {conferindo ? 'Conferindo…' : 'Entrar'}
        </button>
      </form>
      <div class="acoes">
        <button type="button" onClick={reenviar} disabled={espera > 0}>
          {espera > 0 ? `Reenviar código (${espera} s)` : 'Reenviar código'}
        </button>
        <button type="button" onClick={aoTrocarEmail}>
          Trocar e-mail
        </button>
      </div>
    </main>
  )
}
