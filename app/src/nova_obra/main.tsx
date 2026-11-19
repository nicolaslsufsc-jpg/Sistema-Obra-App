import '../nucleo/compat'
// Página da Nova obra (nova_obra.html): fica fora da casca do app (núcleo) até o Nicolas aprovar o
// botão "Nova obra" no menu sem conta. Não usa conta, servidor nem o banco do app.
import { render } from 'preact'
import { NovaObra } from './NovaObra'
import '../style.css'
import './nova_obra.css'

render(<NovaObra />, document.getElementById('app')!)
