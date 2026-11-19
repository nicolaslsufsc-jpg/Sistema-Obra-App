// Módulo Relatórios: navegação interna (o botão voltar do Android volta uma tela).
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { ObraLocal, UsuarioLocal } from '../../nucleo/conta'
import { usarSincronizacao } from '../../nucleo/usarSincronizacao'
import { carregar } from '../dados'
import { avisoDaSincronizacao, type Alvo, type DadosRelatorios } from '../regras'
import type { TabelaSecao } from '../tipos'
import { TelaInicio } from './TelaInicio'
import { TelaDia } from './TelaDia'
import { TelaItem } from './TelaItem'
import { TelaCadastro } from './TelaCadastro'
import { TelaMarcar } from './TelaMarcar'
import { TelaMapa } from './TelaMapa'
import { FormRelatorio, TelaRelatorio } from './TelaRelatorio'
import { TelaImprimirDia, TelaImprimirRelatorio } from './TelaImprimir'
import '../relatorios.css'

export type Aba = 'diario' | 'relatorios'

export type TelaRel =
  | { nome: 'inicio'; aba?: Aba }
  | { nome: 'dia'; data: string }
  | { nome: 'item'; tabela: TabelaSecao; data: string; raiz?: string }
  | { nome: 'cadastro' }
  | { nome: 'marcar'; alvo: Alvo; titulo: string }
  | { nome: 'mapa' }
  | { nome: 'novo-relatorio'; data?: string }
  | { nome: 'editar-relatorio'; raiz: string }
  | { nome: 'relatorio'; raiz: string }
  | { nome: 'imprimir-dia'; data: string }
  | { nome: 'imprimir-relatorio'; raiz: string }

export interface Contexto {
  usuario: UsuarioLocal
  obra: ObraLocal
  dados: DadosRelatorios
  ir: (t: TelaRel) => void
  /** Troca a tela atual sem empilhar (ex.: depois de salvar um formulário). */
  trocar: (t: TelaRel) => void
  voltar: () => void
  /** Relê o banco do aparelho (depois de registrar algo). */
  recarregar: () => Promise<void>
  /** Sem conta: não há servidor (nada de "vai para o servidor"). */
  local?: boolean
}

export function ModuloRelatorios({ usuario, obra, aoSair, aoPerderObra }: { usuario: UsuarioLocal; obra: ObraLocal; aoSair: () => void; aoPerderObra: () => void }) {
  const { estado } = usarSincronizacao(usuario.id, obra.id, aoPerderObra)
  const [tela, setTela] = useState<TelaRel>(() => (history.state?.relatorios as TelaRel) ?? { nome: 'inicio' })
  const [dados, setDados] = useState<DadosRelatorios | null>(null)

  const recarregar = useCallback(async () => {
    setDados(await carregar(obra.id))
  }, [obra.id])

  useEffect(() => {
    recarregar()
  }, [recarregar, estado.versaoDados])

  // Ao voltar de um formulário, a tela volta ao ponto em que estava (no celular o dia é comprido: antes
  // voltava ao topo e a pessoa rolava tudo de novo a cada item).
  const rolagemAoVoltar = useRef<number | null>(null)

  useEffect(() => {
    const aoVoltar = (e: PopStateEvent) => {
      if (e.state?.tela !== 'relatorios') return
      rolagemAoVoltar.current = typeof e.state.rolagem === 'number' ? e.state.rolagem : null
      setTela((e.state.relatorios as TelaRel) ?? { nome: 'inicio' })
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  useEffect(() => {
    if (tela.nome === 'marcar' || tela.nome === 'mapa') return
    const y = rolagemAoVoltar.current ?? 0
    rolagemAoVoltar.current = null
    window.scrollTo(0, y)
  }, [tela])

  const ir = (t: TelaRel) => {
    // guarda onde a pessoa estava, para o voltar trazer de volta ao mesmo ponto
    if (history.state?.tela === 'relatorios') history.replaceState({ ...history.state, rolagem: Math.round(window.scrollY) }, '')
    history.pushState({ tela: 'relatorios', relatorios: t }, '')
    setTela(t)
  }
  const trocar = (t: TelaRel) => {
    history.replaceState({ tela: 'relatorios', relatorios: t }, '')
    setTela(t)
  }
  const voltar = () => {
    if (history.state?.tela === 'relatorios') history.back()
    else aoSair()
  }

  if (!dados) return <main class="tela">Carregando…</main>
  const ctx: Contexto = { usuario, obra, dados, ir, trocar, voltar, recarregar, local: estado.local }

  // Recusado pelo servidor vem primeiro: não some sozinho e alguém precisa olhar (lista no menu da obra).
  const avisoSync = avisoDaSincronizacao(estado)

  let conteudo
  switch (tela.nome) {
    case 'inicio':
      conteudo = <TelaInicio ctx={ctx} aba={tela.aba ?? 'diario'} aoSair={aoSair} />
      break
    case 'dia':
      conteudo = <TelaDia key={tela.data} ctx={ctx} data={tela.data} />
      break
    case 'item':
      conteudo = <TelaItem key={tela.raiz ?? tela.tabela} ctx={ctx} tabela={tela.tabela} data={tela.data} raiz={tela.raiz} />
      break
    case 'cadastro':
      conteudo = <TelaCadastro ctx={ctx} />
      break
    case 'marcar':
      return <TelaMarcar key={tela.alvo.raiz} ctx={ctx} alvo={tela.alvo} titulo={tela.titulo} aviso={avisoSync} />
    case 'mapa':
      return <TelaMapa ctx={ctx} aviso={avisoSync} />
    case 'novo-relatorio':
      conteudo = <FormRelatorio ctx={ctx} data={tela.data} />
      break
    case 'editar-relatorio':
      conteudo = <FormRelatorio key={tela.raiz} ctx={ctx} raiz={tela.raiz} />
      break
    case 'relatorio':
      conteudo = <TelaRelatorio key={tela.raiz} ctx={ctx} raiz={tela.raiz} />
      break
    case 'imprimir-dia':
      conteudo = <TelaImprimirDia ctx={ctx} data={tela.data} />
      break
    case 'imprimir-relatorio':
      conteudo = <TelaImprimirRelatorio ctx={ctx} raiz={tela.raiz} />
      break
  }
  return (
    <>
      {avisoSync && (
        <p class="faixa-aviso rl-sync nao-imprimir" data-testid="relatorios-sync">
          {avisoSync}
        </p>
      )}
      {conteudo}
    </>
  )
}
