// As páginas que só o PC tem. Arquivo separado, carregado só quando a pessoa abre uma delas: o celular
// nunca baixa este código para a memória (vai para o cache do app como os módulos, então abre sem internet).
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import type { DestinoPc } from './CascaPc'
import { usarDadosPc } from './dados_pc'
import { usarSincronizacao } from '../nucleo/usarSincronizacao'
import { PaginaAvanco } from './PaginaAvanco'
import { PaginaQualidade } from './PaginaQualidade'
import { PaginaRelatorios } from './PaginaRelatorios'
import { PaginaPranchas } from './PaginaPranchas'
import type { PaginaPc } from './versao_pc'
import { TelaUnidades } from '../nova_obra/TelaUnidades'

export function PaginasPc({ pagina, obra, usuario, aoIr, aoPerderObra }: { pagina: PaginaPc; obra: ObraLocal; usuario: UsuarioLocal; aoIr: (d: DestinoPc) => void; aoPerderObra: () => void }) {
  // a sincronização de sempre do núcleo: busca no servidor o que a equipe registrou e avisa quando chega dado novo
  const { estado, sincronizarAgora } = usarSincronizacao(usuario.id, obra.id, aoPerderObra)
  const dados = usarDadosPc(obra, usuario, estado.versaoDados)
  // não precisa dos dados dos módulos: lê só as fichas e as regras da obra
  if (pagina === 'unidades') return <TelaUnidades obra={obra} usuario={usuario} versao={estado.versaoDados} />
  if (!dados) {
    return (
      <main class="tela pc-pagina" data-testid={`pc-pagina-${pagina}`} aria-busy="true">
        <p>Lendo a obra neste aparelho…</p>
      </main>
    )
  }
  if (pagina === 'painel') return <PaginaAvanco dados={dados} obra={obra} usuario={usuario} sincronizacao={estado} aoSincronizar={sincronizarAgora} aoIr={aoIr} />
  if (pagina === 'qualidade') return <PaginaQualidade dados={dados} obra={obra} usuario={usuario} />
  if (pagina === 'relatorios') return <PaginaRelatorios dados={dados} obra={obra} usuario={usuario} />
  return <PaginaPranchas dados={dados} obra={obra} aoIr={aoIr} />
}
