// O módulo (com o Leaflet, a parte mais pesada do app) só carrega quando é aberto. Funciona sem
// internet: o arquivo separado também vai para o cache do app (vite.config.ts, globPatterns).
// Mesmo padrão do Concreto e da FVS.
import { useEffect, useState } from 'preact/hooks'
import type { ComponentType } from 'preact'
import type { PropsModulo } from '../../modulos'

export function RelatoriosSobDemanda(props: PropsModulo) {
  const [Tela, setTela] = useState<ComponentType<PropsModulo> | null>(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let vivo = true
    import('./ModuloRelatorios')
      .then((m) => {
        if (vivo) setTela(() => m.ModuloRelatorios)
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
      <main class="tela">
        <p class="erro">Não consegui abrir o módulo. Confira a internet e tente de novo.</p>
        <button type="button" onClick={props.aoSair}>
          Voltar ao menu
        </button>
      </main>
    )
  }
  return <main class="tela">Carregando…</main>
}
