import './nucleo/compat'
import { render } from 'preact'
import { App } from './app'
import { AvisoAtualizacao } from './telas/AvisoAtualizacao'
import { ouvirInstalacao } from './nucleo/aparelho'
import './style.css'

ouvirInstalacao()

render(
  <>
    <AvisoAtualizacao />
    <App />
  </>,
  document.getElementById('app')!,
)
