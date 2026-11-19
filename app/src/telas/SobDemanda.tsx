// Tela de módulo que só carrega quando é aberta: o app abre mais rápido no celular porque a
// primeira tela não traz o código de todos os módulos. Funciona sem internet: o arquivo
// separado vai para o cache do app na instalação (vite.config.ts, globPatterns).
// Mesmo padrão dos SobDemanda da FVS, do Concreto e dos Relatórios, em versão genérica.
import { useEffect, useState } from 'preact/hooks'
import type { ComponentType } from 'preact'
import type { PropsModulo } from '../modulos'

export function sobDemanda(
  nome: string,
  carregar: () => Promise<ComponentType<PropsModulo>>,
): ComponentType<PropsModulo> {
  return function TelaSobDemanda(props: PropsModulo) {
    const [Tela, setTela] = useState<ComponentType<PropsModulo> | null>(null)
    const [falhou, setFalhou] = useState(false)

    useEffect(() => {
      let vivo = true
      carregar()
        .then((t) => {
          if (vivo) setTela(() => t)
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
          <p class="erro">Não foi possível abrir {nome} neste aparelho.</p>
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
}
