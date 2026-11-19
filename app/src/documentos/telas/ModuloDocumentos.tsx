// Módulo Documentos: lista mestra (PBQP-H/SiAC), documento com as revisões, cadastro e impressão.
// O botão voltar do Android volta uma tela (estado { tela: 'documentos', documentos: <tela> }).
import { useCallback, useEffect, useState } from 'preact/hooks'
import type { PropsModulo } from '../../modulos'
import { dataLocal } from '../../concreto/cps'
import { banco } from '../../nucleo/servicos'
import type { Escopo } from '../categorias'
import { carregar, moduloDisponivel, type DadosDocumentos } from '../dados'
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
  const { obra, aoSair } = props
  const [tela, setTela] = useState<TelaDoc>(() => (history.state?.documentos as TelaDoc) ?? { nome: 'lista', escopo: 'obra' })
  const [dados, setDados] = useState<DadosDocumentos | null>(null)
  const [disponivel, setDisponivel] = useState<boolean | null>(null)
  const [hoje] = useState(() => dataLocal(new Date()))

  const recarregar = useCallback(async () => {
    setDados(await carregar(obra.id))
  }, [obra.id])

  useEffect(() => {
    let vivo = true
    moduloDisponivel().then(async (ok) => {
      if (!vivo) return
      setDisponivel(ok)
      if (!ok) return
      await semearExemplos(banco, obra, hoje).catch(() => 0)
      if (vivo) await recarregar()
    })
    return () => {
      vivo = false
    }
  }, [obra.id])

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

  if (disponivel === false) {
    return (
      <main class="tela">
        <h1>Documentos</h1>
        <p class="aviso">Por enquanto o módulo Documentos funciona só no modo sem conta (pacote da obra). A tabela do servidor ainda não foi criada.</p>
        <button type="button" onClick={aoSair}>
          Voltar ao menu
        </button>
      </main>
    )
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
