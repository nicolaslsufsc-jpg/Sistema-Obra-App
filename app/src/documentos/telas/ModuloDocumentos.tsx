// Módulo Documentos: lista mestra (PBQP-H/SiAC), documento com as revisões, cadastro e impressão.
// O botão voltar do Android volta uma tela (estado { tela: 'documentos', documentos: <tela> }).
import { useCallback, useEffect, useState } from 'preact/hooks'
import type { PropsModulo } from '../../modulos'
import { dataLocal } from '../../concreto/cps'
import { banco } from '../../nucleo/servicos'
import { ehModoLocal } from '../../nucleo/local'
import { usarSincronizacao } from '../../nucleo/usarSincronizacao'
import type { Escopo } from '../categorias'
import { carregar, type DadosDocumentos } from '../dados'
import { semearExemplos } from '../exemplos'
import { TelaLista } from './TelaLista'
import { TelaDocumento } from './TelaDocumento'
import { TelaFormulario } from './TelaFormulario'
import { TelaImprimir } from './TelaImprimir'
import '../../relatorios/relatorios.css'
import '../documentos.css'

export type TelaDoc =
  | { nome: 'lista'; escopo: Escopo }
  | { nome: 'documento'; chave: string }
  | { nome: 'novo'; escopo: Escopo }
  | { nome: 'revisao'; chave: string }
  | { nome: 'imprimir'; escopo: Escopo }

export interface ContextoDoc extends PropsModulo {
  dados: DadosDocumentos
  hoje: string
  ir: (t: TelaDoc) => void
  trocar: (t: TelaDoc) => void
  voltar: () => void
  recarregar: () => Promise<void>
}

export function ModuloDocumentos(props: PropsModulo) {
  const { obra, usuario, aoSair, aoPerderObra } = props
  // com conta: envia e baixa enquanto o módulo está aberto, e a lista relê quando chega coisa nova
  const { estado } = usarSincronizacao(usuario.id, obra.id, aoPerderObra)
  const [tela, setTela] = useState<TelaDoc>(() => (history.state?.documentos as TelaDoc) ?? { nome: 'lista', escopo: 'obra' })
  const [dados, setDados] = useState<DadosDocumentos | null>(null)
  const [hoje] = useState(() => dataLocal(new Date()))

  const recarregar = useCallback(async () => {
    setDados(await carregar(obra.id))
  }, [obra.id])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      // Exemplos só no modo sem conta (demonstração). Com conta, a lista é a do servidor: um exemplo
      // corrigido ou marcado "em revisão" apontaria para uma linha que o servidor não tem.
      if (await ehModoLocal(banco)) await semearExemplos(banco, obra, hoje).catch(() => 0)
      if (vivo) await recarregar()
    })()
    return () => {
      vivo = false
    }
  }, [obra.id])

  // dados novos do servidor (outro aparelho cadastrou): relê
  useEffect(() => {
    if (estado.versaoDados > 0) recarregar()
  }, [estado.versaoDados])

  useEffect(() => {
    const aoVoltar = (e: PopStateEvent) => {
      if (e.state?.tela === 'documentos') setTela((e.state.documentos as TelaDoc) ?? { nome: 'lista', escopo: 'obra' })
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tela.nome])

  const ir = (t: TelaDoc) => {
    history.pushState({ tela: 'documentos', documentos: t }, '')
    setTela(t)
  }
  const trocar = (t: TelaDoc) => {
    history.replaceState({ tela: 'documentos', documentos: t }, '')
    setTela(t)
  }
  const voltar = () => {
    if (history.state?.tela === 'documentos' && history.state?.documentos) history.back()
    else aoSair()
  }

  if (!dados) return <main class="tela">Carregando…</main>

  const ctx: ContextoDoc = { ...props, dados, hoje, ir, trocar, voltar, recarregar }
  return (
    <main class="tela doc">
      {tela.nome === 'lista' && <TelaLista ctx={ctx} escopo={tela.escopo} />}
      {tela.nome === 'documento' && <TelaDocumento ctx={ctx} chave={tela.chave} />}
      {tela.nome === 'novo' && <TelaFormulario ctx={ctx} escopo={tela.escopo} />}
      {tela.nome === 'revisao' && <TelaFormulario ctx={ctx} chave={tela.chave} />}
      {tela.nome === 'imprimir' && <TelaImprimir ctx={ctx} escopo={tela.escopo} />}
    </main>
  )
}
