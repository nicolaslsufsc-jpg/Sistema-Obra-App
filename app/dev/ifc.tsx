// Bancada do leitor de IFC (ver ifc.html): sem login e sem servidor, os arquivos são escolhidos no aparelho.
import { render } from 'preact'
import '../src/style.css'
import { IfcSobDemanda } from '../src/ifc/telas/SobDemanda'

render(<IfcSobDemanda />, document.getElementById('app')!)
