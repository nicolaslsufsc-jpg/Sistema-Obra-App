// O leitor (three.js + web-ifc, a parte mais pesada do app) só carrega quando é aberto.
import { useEffect, useState } from 'preact/hooks'
import type { ComponentType } from 'preact'
import type { PropsModuloIfc } from './ModuloIfc'

export function IfcSobDemanda(props: PropsModuloIfc) {
  const [Tela, setTela] = useState<ComponentType<PropsModuloIfc> | null>(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let vivo = true
    import('./ModuloIfc')
      .then((m) => {
        if (vivo) setTela(() => m.ModuloIfc)
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
        <p class="erro">Não foi possível abrir o leitor de IFC neste aparelho.</p>
        {props.aoSair && (
          <button type="button" onClick={props.aoSair}>
            Voltar ao menu
          </button>
        )}
      </main>
    )
  }
  return (
    <main class="tela tela-estreita">
      <p>Abrindo o leitor de IFC...</p>
    </main>
  )
}
