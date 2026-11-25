// Módulo Concreto: navegação interna (o botão voltar do Android volta uma tela).
import { useCallback, useEffect, useState } from 'preact/hooks'
import { fontePlantasFvs } from '../../fvs/plantas'
import type { ObraLocal, UsuarioLocal } from '../../nucleo/conta'
import { usarSincronizacao } from '../../nucleo/usarSincronizacao'
import { avisoDaSincronizacao } from '../aviso_sync'
import { carregar, type DadosConcreto } from '../dados'
import { carregarFvm, type DadosFvm } from '../fvm_dados'
import { TelaMaterial, TelaMateriais, TelaReceber, TelaRecebimento } from './TelasFvm'
import { registrarFonteDePlantas } from '../planta'
import { TelaInicio } from './TelaInicio'
import { TelaPavimento } from './TelaPavimento'
import { TelaConcretagem } from './TelaConcretagem'
import { TelaCaminhao } from './TelaCaminhao'
import { FormCaminhao, FormConcretagem } from './Formularios'
import { TelaMapa } from './TelaMapa'
import { TelaRelatorio } from './TelaRelatorio'
import { TelaFicha } from './TelaFicha'
import { TelaLaudo } from './TelaLaudo'
import '../concreto.css'
import { FaixaLocal } from '../../telas/FaixaLocal'
import { BotaoReportar } from '../../reportes/BotaoReportar'
import { AcoesDoModulo } from '../../telas/Cabecalho'

// As pranchas que a FVS baixou para o aparelho. Fica neste arquivo porque ele só carrega quando o
// módulo abre (SobDemanda.tsx): assim o código da FVS não entra no arquivo principal do app.
// Roda uma vez só: o navegador avalia cada arquivo uma vez, mesmo abrindo o módulo de novo.
registrarFonteDePlantas(fontePlantasFvs)

export type TelaConcreto =
  | { nome: 'inicio' }
  | { nome: 'pavimento'; pavimentoId: string }
  | { nome: 'concretagem'; raiz: string }
  | { nome: 'nova-concretagem'; pavimentoId: string }
  | { nome: 'corrigir-concretagem'; raiz: string }
  | { nome: 'caminhao'; raiz: string }
  | { nome: 'novo-caminhao'; concretagemRaiz: string }
  | { nome: 'corrigir-caminhao'; raiz: string }
  | { nome: 'mapa'; pavimentoId: string; concretagemRaiz?: string; caminhaoRaiz?: string; plantaId?: string }
  | { nome: 'relatorio'; concretagemRaiz: string }
  | { nome: 'ficha'; data: string }
  | { nome: 'laudo'; concretagemRaiz: string }
  | { nome: 'materiais' }
  | { nome: 'material'; codigo?: string }
  | { nome: 'receber'; codigo?: string }
  | { nome: 'recebimento'; raiz: string }

export interface Contexto {
  usuario: UsuarioLocal
  obra: ObraLocal
  dados: DadosConcreto
  /**
   * FVM (recebimento de materiais). null = escondido: por enquanto só no app sem conta (e no
   * ambiente de desenvolvimento), porque as tabelas dele ainda não têm migração no servidor.
   */
  fvm: DadosFvm | null
  ir: (t: TelaConcreto) => void
  /** Troca a tela atual sem empilhar (ex.: depois de salvar um formulário). */
  trocar: (t: TelaConcreto) => void
  voltar: () => void
  /** Relê o banco do aparelho (depois de registrar algo). */
  recarregar: () => Promise<void>
}

export function ModuloConcreto({
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
  const { estado, sincronizarAgora } = usarSincronizacao(usuario.id, obra.id, aoPerderObra)
  const [tela, setTela] = useState<TelaConcreto>(() => (history.state?.concreto as TelaConcreto) ?? { nome: 'inicio' })
  const [dados, setDados] = useState<DadosConcreto | null>(null)
  const [fvm, setFvm] = useState<DadosFvm | null>(null)

  const lerDados = useCallback(async () => {
    const [d, f] = await Promise.all([carregar(obra.id), carregarFvm(obra.id)])
    setDados(d)
    setFvm(f)
  }, [obra.id])

  // Chegou dado novo do servidor: só relê (sem enviar de novo, senão vira laço).
  useEffect(() => {
    lerDados()
  }, [lerDados, estado.versaoDados])

  // Depois de gravar: relê e já tenta enviar. Isso também reconta o aviso "esperando envio"
  // (sem isso ele ficava velho e o envio esperava até 5 min). Não espera o envio terminar:
  // a tela segue na hora, com ou sem internet.
  const recarregar = useCallback(async () => {
    await lerDados()
    sincronizarAgora().catch(() => {})
  }, [lerDados, sincronizarAgora])

  useEffect(() => {
    const aoVoltar = (e: PopStateEvent) => {
      if (e.state?.tela === 'concreto') setTela((e.state.concreto as TelaConcreto) ?? { nome: 'inicio' })
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  useEffect(() => {
    if (tela.nome !== 'mapa') window.scrollTo(0, 0)
  }, [tela])

  const ir = (t: TelaConcreto) => {
    history.pushState({ tela: 'concreto', concreto: t }, '')
    setTela(t)
  }
  const trocar = (t: TelaConcreto) => {
    history.replaceState({ tela: 'concreto', concreto: t }, '')
    setTela(t)
  }
  const voltar = () => {
    if (history.state?.tela === 'concreto') history.back()
    else aoSair()
  }

  if (!dados) return <main class="tela">Carregando…</main>
  // FVM com ou sem conta desde a migração de 20/11 (concreto/tabelas.ts)
  const ctx: Contexto = { usuario, obra, dados, fvm, ir, trocar, voltar, recarregar }

  // sem conta (estado.local) não há servidor: nenhum aviso de envio (concreto/aviso_sync.ts);
  // no lugar, a FaixaLocal (só neste aparelho · Salvar arquivo)
  const avisoSync = avisoDaSincronizacao(estado)

  let conteudo
  switch (tela.nome) {
    case 'inicio':
      conteudo = <TelaInicio ctx={ctx} aoSair={aoSair} />
      break
    case 'pavimento':
      conteudo = <TelaPavimento ctx={ctx} pavimentoId={tela.pavimentoId} />
      break
    case 'concretagem':
      conteudo = <TelaConcretagem ctx={ctx} raiz={tela.raiz} />
      break
    case 'nova-concretagem':
      conteudo = <FormConcretagem ctx={ctx} pavimentoId={tela.pavimentoId} />
      break
    case 'corrigir-concretagem':
      conteudo = <FormConcretagem ctx={ctx} raiz={tela.raiz} />
      break
    case 'caminhao':
      conteudo = <TelaCaminhao ctx={ctx} raiz={tela.raiz} />
      break
    case 'novo-caminhao':
      conteudo = <FormCaminhao ctx={ctx} concretagemRaiz={tela.concretagemRaiz} />
      break
    case 'corrigir-caminhao':
      conteudo = <FormCaminhao ctx={ctx} raiz={tela.raiz} />
      break
    case 'mapa':
      return (
        <>
          <TelaMapa
            key={tela.pavimentoId}
            ctx={ctx}
            pavimentoId={tela.pavimentoId}
            concretagemRaiz={tela.concretagemRaiz}
            caminhaoRaiz={tela.caminhaoRaiz}
            plantaId={tela.plantaId}
            aviso={avisoSync}
            acoes={<BotaoReportar modulo="concreto" tela="mapa" obra={obra} usuario={usuario} estado={estado} noCabecalho />}
          />
        </>
      )
    case 'relatorio':
      conteudo = <TelaRelatorio ctx={ctx} concretagemRaiz={tela.concretagemRaiz} />
      break
    case 'ficha':
      conteudo = <TelaFicha ctx={ctx} data={tela.data} />
      break
    case 'laudo':
      conteudo = <TelaLaudo ctx={ctx} concretagemRaiz={tela.concretagemRaiz} />
      break
    case 'materiais':
    case 'material':
    case 'receber':
    case 'recebimento':
      // FVM escondido (ex.: voltou pelo histórico depois de entrar com conta): volta ao início
      if (!ctx.fvm) conteudo = <TelaInicio ctx={ctx} aoSair={aoSair} />
      else if (tela.nome === 'materiais') conteudo = <TelaMateriais ctx={ctx} fvm={ctx.fvm} />
      else if (tela.nome === 'material') conteudo = <TelaMaterial key={tela.codigo ?? 'novo'} ctx={ctx} fvm={ctx.fvm} codigo={tela.codigo} />
      else if (tela.nome === 'receber') conteudo = <TelaReceber ctx={ctx} fvm={ctx.fvm} codigo={tela.codigo} />
      else conteudo = <TelaRecebimento ctx={ctx} fvm={ctx.fvm} raiz={tela.raiz} />
      break
  }
  return (
    <>
      {estado.local && <FaixaLocal usuario={usuario} obra={obra} gatilho={estado.pendentes} />}
      {avisoSync && (
        <p class="faixa-aviso cc-sync" data-testid="concreto-sync">
          {avisoSync}
        </p>
      )}
      {/* Reportar problema (sem servidor): por ora só no Concreto, no cabeçalho de cada tela (guia de estilo,
          21/11/2026); em toda tela do app é proposta (núcleo) */}
      <AcoesDoModulo.Provider value={<BotaoReportar modulo="concreto" tela={tela.nome} obra={obra} usuario={usuario} estado={estado} noCabecalho />}>
        {conteudo}
      </AcoesDoModulo.Provider>
    </>
  )
}
