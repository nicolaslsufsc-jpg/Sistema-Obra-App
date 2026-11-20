// Módulo Projetos: navegação interna (o botão voltar do Android volta uma tela).
import { useCallback, useEffect, useState } from 'preact/hooks'
import type { ObraLocal, UsuarioLocal } from '../../nucleo/conta'
import { usarSincronizacao } from '../../nucleo/usarSincronizacao'
import { carregar, type DadosProjetos } from '../dados'
import { TelaInicio } from './TelaInicio'
import { TelaLista } from './TelaLista'
import { TelaPrancha } from './TelaPrancha'
import { FormDevolucao, FormEntrega } from './Formularios'
import { TelaEmpresas } from './TelaEmpresas'
import { TelaAcoes } from './TelaAcoes'
import { TelaPainel } from './TelaPainel'
import { TelaEntregasBase, TelaPranchasBase } from './TelaListasBase'
import { TelaAEntregar, TelaDistribuicao } from './TelaDistribuicao'
import { TelaPranchaBase, type AlvoPrancha } from './TelaPranchaBase'
import { Mensagem } from './comum'
import { avisoDoEnvio } from '../aviso_sync'
import '../projetos.css'

export type TelaProjetos =
  | { nome: 'painel'; importar?: boolean }
  | { nome: 'pranchas-base' }
  | { nome: 'entregas-base' }
  | { nome: 'a-entregar' }
  | { nome: 'distribuicao' }
  | { nome: 'inicio' }
  | ({ nome: 'prancha-base' } & AlvoPrancha)
  | { nome: 'lista' }
  | { nome: 'prancha'; documentoId: string }
  | { nome: 'entregar'; documentoId: string; empresaId?: string }
  | { nome: 'recolher'; documentoId: string; entregaId?: string }
  | { nome: 'empresas' }
  | { nome: 'acoes' }

export interface Contexto {
  usuario: UsuarioLocal
  obra: ObraLocal
  dados: DadosProjetos
  ir: (t: TelaProjetos) => void
  /** Troca a tela atual sem empilhar (ex.: depois de salvar um formulário). */
  trocar: (t: TelaProjetos) => void
  voltar: () => void
  /** Relê o banco do aparelho (depois de registrar algo). */
  recarregar: () => Promise<void>
  /** Mensagem no alto da próxima tela ("Entrega registrada."). */
  avisar: (texto: string, tipo?: 'ok' | 'erro') => void
  /** App sem conta (um usuário, sem servidor): nada chega pela sincronização. */
  semConta: boolean
}

export function ModuloProjetos({
  usuario,
  obra,
  aoSair,
  aoPerderObra,
}: {
  usuario: UsuarioLocal
  obra: ObraLocal
  aoSair: () => void
  aoPerderObra: () => void
}) {
  const { estado } = usarSincronizacao(usuario.id, obra.id, aoPerderObra)
  const [tela, setTela] = useState<TelaProjetos>(() => (history.state?.projetos as TelaProjetos) ?? { nome: 'painel' })
  const [dados, setDados] = useState<DadosProjetos | null>(null)
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: 'ok' | 'erro' } | null>(null)

  const recarregar = useCallback(async () => {
    setDados(await carregar(obra.id))
  }, [obra.id])

  useEffect(() => {
    recarregar()
  }, [recarregar, estado.versaoDados])

  useEffect(() => {
    const aoVoltar = (e: PopStateEvent) => {
      if (e.state?.tela === 'projetos') {
        setMensagem(null)
        setTela((e.state.projetos as TelaProjetos) ?? { nome: 'painel' })
      }
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tela])

  const ir = (t: TelaProjetos) => {
    setMensagem(null)
    history.pushState({ tela: 'projetos', projetos: t }, '')
    setTela(t)
  }
  const trocar = (t: TelaProjetos) => {
    history.replaceState({ tela: 'projetos', projetos: t }, '')
    setTela(t)
  }
  const voltar = () => {
    if (history.state?.tela === 'projetos') history.back()
    else aoSair()
  }
  const avisar = (texto: string, tipo: 'ok' | 'erro' = 'ok') => setMensagem({ texto, tipo })

  if (!dados) return <main class="tela">Carregando…</main>
  const ctx: Contexto = { usuario, obra, dados, ir, trocar, voltar, recarregar, avisar, semConta: estado.local }

  // sem conta (estado.local) não há servidor: nenhum aviso de envio (projetos/aviso_sync.ts)
  const avisoSync = avisoDoEnvio(estado)

  let conteudo
  switch (tela.nome) {
    case 'painel':
      conteudo = <TelaPainel ctx={ctx} aoSair={aoSair} importar={tela.importar} />
      break
    case 'pranchas-base':
      conteudo = <TelaPranchasBase ctx={ctx} aoSair={aoSair} />
      break
    case 'entregas-base':
      conteudo = <TelaEntregasBase ctx={ctx} aoSair={aoSair} />
      break
    case 'a-entregar':
      conteudo = <TelaAEntregar ctx={ctx} aoSair={aoSair} />
      break
    case 'distribuicao':
      conteudo = <TelaDistribuicao ctx={ctx} aoSair={aoSair} />
      break
    case 'prancha-base':
      conteudo = <TelaPranchaBase ctx={ctx} alvo={tela} />
      break
    case 'inicio':
      conteudo = <TelaInicio ctx={ctx} aoSair={voltar} />
      break
    case 'lista':
      conteudo = <TelaLista ctx={ctx} />
      break
    case 'prancha':
      conteudo = <TelaPrancha ctx={ctx} documentoId={tela.documentoId} />
      break
    case 'entregar':
      conteudo = <FormEntrega ctx={ctx} documentoId={tela.documentoId} empresaId={tela.empresaId} />
      break
    case 'recolher':
      conteudo = <FormDevolucao ctx={ctx} documentoId={tela.documentoId} entregaId={tela.entregaId} />
      break
    case 'empresas':
      conteudo = <TelaEmpresas ctx={ctx} />
      break
    case 'acoes':
      conteudo = <TelaAcoes ctx={ctx} />
      break
  }
  return (
    <>
      {avisoSync && (
        <p class="faixa-aviso pj-sync" data-testid="projetos-sync">
          {avisoSync}
        </p>
      )}
      {mensagem && <Mensagem texto={mensagem.texto} tipo={mensagem.tipo} />}
      {conteudo}
    </>
  )
}
