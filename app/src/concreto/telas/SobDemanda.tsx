// O módulo Concreto (com o Leaflet, a parte mais pesada do app) só carrega quando é aberto:
// o app abre mais rápido no tablet. Funciona sem internet: o arquivo separado também vai
// para o cache do app na instalação (vite.config.ts, globPatterns).
import { useEffect, useState } from 'preact/hooks'
import type { ComponentType } from 'preact'
import type { PropsModulo } from '../../modulos'

export function ConcretoSobDemanda(props: PropsModulo) {
  const [Tela, setTela] = useState<ComponentType<PropsModulo> | null>(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let vivo = true
    import('./ModuloConcreto')
      .then((m) => {
        if (vivo) setTela(() => m.ModuloConcreto)
      })
      .catch(() => {
        if (vivo) setFalhou(true)
      })
    return () => {
      vivo = false
    }
  }, [])

  if (Tela) return <Tela {...props} />
  if (falhou) {
    return (
      <main class="tela tela-estreita">
        <p class="erro">Não foi possível abrir o Concreto neste aparelho.</p>
        <p>Isso costuma acontecer logo depois de uma versão nova do app. Nada do que você registrou foi perdido.</p>
        <div class="acoes">
          <button type="button" class="principal" onClick={() => location.reload()}>
            Recarregar o app
          </button>
          <button type="button" onClick={props.aoSair}>
            Voltar
          </button>
        </div>
      </main>
    )
  }
  return <main class="tela">Carregando…</main>
}
