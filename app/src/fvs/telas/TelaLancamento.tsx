// O que foi marcado no app e falta lançar no sistema oficial, ficha por ficha, com planilha para baixar.
// O app não escreve no sistema oficial: esta tela só organiza o trabalho de quem lança.
import { useMemo, useState } from 'preact/hooks'
import { marcarLancados, paraLancarDaObra } from '../dados'
import { hojeNoAparelho, quando } from '../formato'
import { agruparPorFicha, planilhaDeLancamento } from '../lancamento'
import { baixarTexto } from '../planilha'
import { rotuloRodada } from '../situacao'
import type { ContextoFvs } from './ModuloFvs'
import type { SistemaOficial } from '../../integracoes/sistema_oficial'
import '../../telas/cabecalho.css'

const NOME_TIPO: Record<string, string> = { P: 'Pilar', V: 'Viga', L: 'Laje', A: 'Ambiente', F: 'Furo' }

export function TelaLancamento({ ctx, sistema, aviso }: { ctx: ContextoFvs; sistema: SistemaOficial; aviso: string }) {
  const { dados, props, voltar, recarregar } = ctx
  const obraId = props.obra.id
  const [mostrarTudo, setMostrarTudo] = useState(false)
  const linhas = useMemo(() => paraLancarDaObra(dados, mostrarTudo ? null : dados.lancados), [dados, mostrarTudo])
  const grupos = useMemo(() => agruparPorFicha(linhas), [linhas])

  const baixarPlanilha = () => baixarTexto(`lancar_${sistema.id}_${props.obra.codigo}_${hojeNoAparelho()}.csv`, planilhaDeLancamento(linhas, sistema.nome))

  const marcarLancado = async () => {
    await marcarLancados(obraId, linhas.map((l) => l.eventoId))
    await recarregar()
    setMostrarTudo(false)
  }

  return (
    <main class="tela fv-inicio fv-lancamento">
      <header class="so-cabecalho fv-topo-inicio">
        <button type="button" class="fv-voltar so-cab-voltar" onClick={voltar} aria-label="Voltar">
          <span aria-hidden="true">‹</span>
        </button>
        <div class="so-cab-titulo">
          <h1>Lançar no {sistema.nome}</h1>
          <p class="discreto" data-testid="fvs-lan-contagem">
            {linhas.length} {linhas.length === 1 ? 'marcação' : 'marcações'} em {grupos.length} {grupos.length === 1 ? 'ficha' : 'fichas'}
          </p>
        </div>
      </header>
      {aviso && <p class="faixa-aviso">{aviso}</p>}
      <p class="discreto">
        O que foi marcado neste app e ainda não está no {sistema.nome}. O app não escreve lá: quem lança é você, ficha por ficha.
      </p>

      <div class="fv-lan-acoes">
        <button type="button" class="fv-abrir" data-testid="fvs-lan-planilha" disabled={linhas.length === 0} onClick={baixarPlanilha}>
          Baixar planilha
        </button>
        <button type="button" class="fv-baixar" data-testid="fvs-lan-marcar" disabled={linhas.length === 0 || mostrarTudo} onClick={marcarLancado}>
          Já lancei estas
        </button>
        {dados.lancados.size > 0 && (
          <button type="button" class="fv-link-lan" data-testid="fvs-lan-tudo" onClick={() => setMostrarTudo(!mostrarTudo)}>
            {mostrarTudo ? 'Só o que falta' : 'Ver também o que já lancei'}
          </button>
        )}
      </div>

      {grupos.length === 0 ? (
        <p class="discreto" data-testid="fvs-lan-vazia">
          Nada para lançar.
        </p>
      ) : (
        grupos.map((g) => (
          <section class="cartao fv-lan-ficha" key={g.chave} data-testid="fvs-lan-ficha">
            <h2>
              {g.pecaNome} <span class="discreto">{NOME_TIPO[g.tipo] ?? g.tipo} · {g.pavimentoNome}</span>
            </h2>
            <p class="discreto">
              {g.fichaCodigo} · {g.fichaTitulo}
              <br />
              {g.fichaCampoCodigo ? (
                <>
                  Ficha no {sistema.nome}: <b>{g.fichaCampoCodigo}</b>
                </>
              ) : (
                <b>Sem ficha no {sistema.nome}: abrir uma nova</b>
              )}
            </p>
            <ul class="lista">
              {g.linhas.map((l) => (
                <li key={l.chave} class="fv-lan-item">
                  <span class={`fv-lan-res r-${l.resultado ?? 'vazio'}`}>{l.resultado ?? 'Desmarcar'}</span>
                  <span>
                    <b>
                      {l.item}. {l.itemTitulo}
                    </b>
                    {l.soDoApp && (
                      <>
                        <br />
                        <span class="fv-so-do-app" data-testid="fvs-lan-so-do-app">
                          Só do app (não vai para o {sistema.nome})
                        </span>
                      </>
                    )}
                    <br />
                    <span class="discreto">
                      {rotuloRodada(l.rodada)} · {quando(l.quando)} · {l.quem}
                    </span>
                    {l.observacao && <span class="fv-rep-obs fv-lan-obs">{l.observacao}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  )
}
