import { useState } from 'preact/hooks'
import { conta } from '../nucleo/servicos'
import type { PacoteLocalizado } from '../nucleo/pacote_obra'
import { AbrirPacote } from './AbrirPacote'

export function Entrar({
  emailInicial,
  aoEnviar,
  aoVoltar,
  aoAbrirPacote,
}: {
  emailInicial: string
  aoEnviar: (email: string) => void
  /** Existe quando a pessoa já estava no app (login vencido): volta sem entrar. */
  aoVoltar?: () => void
  /** Sem conta: a obra vem de um pacote (.zip) escolhido no aparelho. */
  aoAbrirPacote?: (pacote: PacoteLocalizado) => void
}) {
  const [email, setEmail] = useState(emailInicial)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: Event) {
    e.preventDefault()
    if (!navigator.onLine) {
      setErro('Sem internet. Para entrar o aparelho precisa estar conectado.')
      return
    }
    setEnviando(true)
    setErro(null)
    const falha = await conta.pedirCodigo(email)
    setEnviando(false)
    if (falha) setErro(falha)
    else aoEnviar(email.trim().toLowerCase())
  }

  return (
    <main class="tela tela-estreita">
      <h1>Sistema Obra</h1>
      <p>Digite seu e-mail. Vamos mandar um código por e-mail.</p>
      <p class="discreto">Se o site já pediu um código para abrir, este é outro: o código do app.</p>
      <form onSubmit={enviar}>
        <label for="email">E-mail</label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        />
        {erro && <p class="erro" role="alert">{erro}</p>}
        <button type="submit" class="principal" disabled={enviando || !email.includes('@')}>
          {enviando ? 'Enviando…' : 'Enviar código'}
        </button>
      </form>
      {aoAbrirPacote && (
        <section class="cartao" aria-labelledby="sem-conta">
          <h2 id="sem-conta">Sem conta, sem internet</h2>
          <p>Abra o pacote da obra (.zip) que veio do PC. Tudo fica guardado neste aparelho.</p>
          <AbrirPacote aoAbrir={aoAbrirPacote} />
        </section>
      )}
      {aoVoltar && (
        <div class="acoes">
          <button type="button" onClick={aoVoltar}>
            Voltar para a obra
          </button>
        </div>
      )}
    </main>
  )
}
