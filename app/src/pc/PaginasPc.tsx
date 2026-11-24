// As páginas que só o PC tem. Arquivo separado, carregado só quando a pessoa abre uma delas: o celular
// nunca baixa este código para a memória (vai para o cache do app como os módulos, então abre sem internet).
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import type { DestinoPc } from './CascaPc'
import { usarDadosPc } from './dados_pc'
import { PaginaPainel } from './PaginaPainel'
import { PaginaRelatorios } from './PaginaRelatorios'
import { PaginaPranchas } from './PaginaPranchas'
import type { PaginaPc } from './versao_pc'

export function PaginasPc({ pagina, obra, usuario, aoIr }: { pagina: PaginaPc; obra: ObraLocal; usuario: UsuarioLocal; aoIr: (d: DestinoPc) => void }) {
  const dados = usarDadosPc(obra, usuario)
  if (!dados) {
    return (
      <main class="tela pc-pagina" data-testid={`pc-pagina-${pagina}`} aria-busy="true">
        <p>Lendo a obra neste aparelho…</p>
      </main>
    )
  }
  if (pagina === 'painel') return <PaginaPainel dados={dados} aoIr={aoIr} />
  if (pagina === 'relatorios') return <PaginaRelatorios dados={dados} obra={obra} usuario={usuario} />
  return <PaginaPranchas dados={dados} obra={obra} aoIr={aoIr} />
}
