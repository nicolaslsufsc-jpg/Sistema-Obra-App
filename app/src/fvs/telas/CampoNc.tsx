// Campo "O que fazer?" de um item com NC: grava sozinho depois de 1 s parado, ao sair do campo e quando o
// Android esconde o app (pode fechar sem avisar). Usado no painel da planta e na tela do local do sistema.
import { useEffect, useRef, useState } from 'preact/hooks'

/**
 * "O que fazer?" de um item reprovado. Grava um segundo depois de parar de digitar e ao sair do
 * campo (o que vier primeiro); a gravação confere o texto contra o registro mais novo, então
 * repetir não duplica.
 */
export function CampoNc({ inicial, pode, salvar }: { inicial: string; pode: boolean; salvar: (t: string) => unknown }) {
  const [texto, setTexto] = useState(inicial)
  const espera = useRef<number | undefined>(undefined)
  const ultimo = useRef(texto)
  ultimo.current = texto
  const agora = () => {
    window.clearTimeout(espera.current)
    espera.current = undefined
    salvar(ultimo.current)
  }
  // saiu da tela (fechou o painel, trocou de peça) com texto ainda não gravado
  useEffect(() => () => {
    if (espera.current !== undefined) agora()
  }, [])
  // foi para outro app: o Android pode fechar este sem avisar, então grava logo
  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden' && espera.current !== undefined) agora()
    }
    document.addEventListener('visibilitychange', aoEsconder)
    return () => document.removeEventListener('visibilitychange', aoEsconder)
  }, [])
  return (
    <label>
      O que fazer?
      <textarea
        rows={2}
        disabled={!pode}
        value={texto}
        placeholder="Descreva a não conformidade e o que precisa ser corrigido"
        onFocus={(ev) => {
          // no celular, o teclado sobe por cima da parte de baixo do painel: o campo vai para o alto dele
          const campo = ev.target as HTMLTextAreaElement
          window.setTimeout(() => campo.scrollIntoView({ block: 'start' }), 300)
        }}
        onInput={(ev) => {
          setTexto((ev.target as HTMLTextAreaElement).value)
          window.clearTimeout(espera.current)
          espera.current = window.setTimeout(agora, 1000)
        }}
        onBlur={() => {
          if (espera.current !== undefined) agora()
        }}
      />
    </label>
  )
}
