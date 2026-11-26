import { dataLocal } from '../cps'
import { cancelar, piorDoCaminhao, podeLancarLaudo, podeRegistrar } from '../dados'
import type { Contexto } from './ModuloConcreto'
import { sistemaDaObra } from '../../integracoes/sistema_oficial'
import { dataBR, horaBR, numBR, plural, Selo, Topo, corDoCaminhao } from './comum'
import { nomeDaConcretagem, ROTULO_FICHA } from '../exemplo'

export function TelaConcretagem({ ctx, raiz }: { ctx: Contexto; raiz: string }) {
  const { dados, obra, usuario, ir, voltar, recarregar } = ctx
  const sistema = sistemaDaObra(obra)
  const c = dados.concretagens.find((x) => x.raiz === raiz)
  if (!c) {
    return (
      <main class="tela">
        <Topo titulo="Concretagem" aoVoltar={voltar} />
        <p>Esta concretagem foi apagada.</p>
      </main>
    )
  }
  const pav = dados.pavimentos.find((p) => p.id === c.pavimento_id)
  const cams = dados.caminhoesDe.get(c.raiz) ?? []
  const volume = cams.reduce((s, x) => s + (x.volume_m3 ?? 0), 0)
  const hoje = dataLocal(new Date())
  const pode = podeRegistrar(obra.papel)

  const apagar = async () => {
    const aviso = cams.length > 0 ? `\n\nOs ${cams.length} caminhões dela também saem das listas.` : ''
    if (!confirm(`Apagar a concretagem de ${dataBR(c.data)} (${c.local_descricao})?${aviso}\n\nO registro continua no histórico.`)) return
    await cancelar('concretagens', obra.id, usuario.id, c)
    await recarregar()
    voltar()
  }

  return (
    <main class="tela">
      <Topo titulo={`${dataBR(c.data)} · ${nomeDaConcretagem(c)}`} sub={`${pav?.nome ?? ''} · Concreto`} aoVoltar={voltar} />
      {c.exemplo && (
        <p class="aviso" role="note">
          Concretagem de EXEMPLO. Não é concretagem real da obra.
        </p>
      )}

      <section class="cartao">
        <dl class="cc-dados">
          <dt>fck</dt>
          <dd>{numBR(c.fck_mpa)} MPa</dd>
          <dt>Slump</dt>
          <dd>{c.slump_cm !== null ? `${numBR(c.slump_cm)} ± ${numBR(c.slump_tolerancia_cm ?? 0)} cm` : '—'}</dd>
          <dt>Fornecedor</dt>
          <dd>{c.fornecedor || '—'}</dd>
          {sistema && (
            <>
              <dt>{ROTULO_FICHA}</dt>
              <dd>{c.codigo_construpoint || '—'}</dd>
            </>
          )}
          <dt>CPs</dt>
          <dd>
            {c.cps_por_idade} por idade · {c.idades_dias.join(' e ')} dias
          </dd>
          <dt>Total</dt>
          <dd>
            {plural(cams.length, 'caminhão', 'caminhões')} · {numBR(volume)} m³
          </dd>
        </dl>
        {c.observacao && <p>{c.observacao}</p>}
      </section>

      <div class="acoes">
        <button type="button" class="principal" onClick={() => ir({ nome: 'mapa', pavimentoId: c.pavimento_id, concretagemRaiz: c.raiz })}>
          {pode ? 'Desenhar na planta' : 'Ver na planta'}
        </button>
        <button type="button" onClick={() => ir({ nome: 'relatorio', concretagemRaiz: c.raiz })}>
          Relatório de peças
        </button>
        <button type="button" onClick={() => ir({ nome: 'ficha', data: c.data })}>
          Ficha de concreto do dia
        </button>
        {podeLancarLaudo(obra.papel) && cams.length > 0 && (
          <button type="button" onClick={() => ir({ nome: 'laudo', concretagemRaiz: c.raiz })}>
            Lançar laudo
          </button>
        )}
      </div>

      <h2>Caminhões</h2>
      {pode && (
        <button type="button" class="cc-largo" onClick={() => ir({ nome: 'novo-caminhao', concretagemRaiz: c.raiz })}>
          + Caminhão
        </button>
      )}
      {cams.length === 0 ? (
        <p class="discreto">Sem caminhões</p>
      ) : (
        <ul class="lista">
          {cams.map((x) => {
            const pior = piorDoCaminhao(dados, x, c, hoje)
            const pecas = [...(dados.pecasDe.get(x.raiz)?.values() ?? [])].filter((e) => e.incluido).length
            return (
              <li key={x.raiz}>
                <button type="button" class="cc-linha" onClick={() => ir({ nome: 'caminhao', raiz: x.raiz })}>
                  <span class="cc-bolinha" style={{ background: corDoCaminhao(x.sequencia) }}>
                    {x.sequencia}
                  </span>
                  <span>
                    <strong>
                      NF {x.nota_fiscal || '—'} · {numBR(x.volume_m3, 2)} m³
                    </strong>
                    <span class="discreto">
                      {x.inicio_descarga ? `descarga ${horaBR(x.inicio_descarga)}` : 'sem horário'}
                      {x.slump_medido_cm !== null ? ` · slump ${numBR(x.slump_medido_cm)}` : ''} ·{' '}
                      {pecas > 0 ? plural(pecas, 'peça', 'peças') : 'sem peça desenhada'}
                    </span>
                  </span>
                  {pior && <Selo situacao={pior} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {pode && (
        <div class="acoes">
          <button type="button" onClick={() => ir({ nome: 'corrigir-concretagem', raiz: c.raiz })}>
            Corrigir dados
          </button>
          <button type="button" class="perigo" onClick={apagar}>
            Apagar concretagem
          </button>
        </div>
      )}
    </main>
  )
}
