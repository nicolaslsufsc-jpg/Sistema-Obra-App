import { dataLocal, piorSituacao, ROTULO_SITUACAO } from '../cps'
import { piorDoCaminhao, podeRegistrar } from '../dados'
import type { Contexto } from './ModuloConcreto'
import { dataBR, numBR, plural, Selo, Topo } from './comum'
import { nomeDaConcretagem } from '../exemplo'
import { sistemaDaObra } from '../../integracoes/sistema_oficial'
import { BotaoExportarPdf } from '../../telas/ExportarPdf'
import type { FolhaPdf } from '../../telas/folha_pdf'

export function TelaPavimento({ ctx, pavimentoId }: { ctx: Contexto; pavimentoId: string }) {
  const { dados, obra, usuario, ir, voltar } = ctx
  const pav = dados.pavimentos.find((p) => p.id === pavimentoId)
  const hoje = dataLocal(new Date())
  const concs = dados.concretagens.filter((c) => c.pavimento_id === pavimentoId)
  const pecas = dados.pecasDoPavimento.get(pavimentoId) ?? []
  const resumoDe = (c: (typeof concs)[number]) => {
    const cams = dados.caminhoesDe.get(c.raiz) ?? []
    const volume = cams.reduce((s, x) => s + (x.volume_m3 ?? 0), 0)
    const pior = piorSituacao(cams.map((x) => piorDoCaminhao(dados, x, c, hoje)).filter((s) => s !== null))
    return { cams, volume, pior }
  }
  // concretagens do pavimento em A4 (21/11/2026)
  const folha = (): FolhaPdf => {
    const sistema = sistemaDaObra(obra)?.nome ?? null
    const linhas = concs.map((c) => {
      const { cams, volume, pior } = resumoDe(c)
      return [dataBR(c.data), nomeDaConcretagem(c), numBR(c.fck_mpa), cams.length, numBR(volume), ...(sistema ? [c.codigo_construpoint] : []), pior ? ROTULO_SITUACAO[pior] : '']
    })
    const total = concs.reduce((s, c) => s + resumoDe(c).volume, 0)
    return {
      modulo: 'Concreto',
      titulo: pav?.nome ?? 'Pavimento',
      sub: plural(pecas.length, 'peça cadastrada', 'peças cadastradas'),
      resumo: [plural(concs.length, 'concretagem', 'concretagens'), `${numBR(total)} m³`],
      tabelas: [
        {
          titulo: 'Concretagens',
          colunas: ['Data', 'Local', 'fck (MPa)', 'Caminhões', 'm³', ...(sistema ? [`Ficha no ${sistema}`] : []), 'Corpos de prova'],
          curtas: [0, 2, 3, 4],
          linhas,
          vazio: 'Nenhuma concretagem neste pavimento.',
        },
      ],
    }
  }

  return (
    <main class="tela">
      <Topo titulo={pav?.nome ?? 'Pavimento'} sub={`${obra.codigo} · Concreto`} aoVoltar={voltar} />

      <div class="acoes">
        {podeRegistrar(obra.papel) && (
          <button type="button" class="principal" onClick={() => ir({ nome: 'nova-concretagem', pavimentoId })}>
            + Nova concretagem
          </button>
        )}
        <button type="button" onClick={() => ir({ nome: 'mapa', pavimentoId })}>
          Mapa do pavimento
        </button>
        <BotaoExportarPdf obra={obra} usuario={usuario} montar={folha} testid="concreto-pdf-pavimento" />
      </div>
      <p class="discreto">{pecas.length > 0 ? `${plural(pecas.length, 'peça cadastrada', 'peças cadastradas')} neste pavimento.` : 'Nenhuma peça cadastrada neste pavimento (a FVS cadastra as peças ao publicar a planta).'}</p>

      <h2>Concretagens</h2>
      {concs.length === 0 ? (
        <p class="discreto" data-testid="pavimento-vazio">
          {podeRegistrar(obra.papel) ? 'Nenhuma concretagem neste pavimento. Toque em Nova concretagem para começar.' : 'Nenhuma concretagem neste pavimento.'}
        </p>
      ) : (
        <ul class="lista">
          {concs.map((c) => {
            const { cams, volume, pior } = resumoDe(c)
            return (
              <li key={c.raiz}>
                <button type="button" class="cc-linha" onClick={() => ir({ nome: 'concretagem', raiz: c.raiz })}>
                  <span>
                    <strong>
                      {dataBR(c.data)} · {nomeDaConcretagem(c)}
                    </strong>
                    <span class="discreto">
                      fck {numBR(c.fck_mpa)} MPa · {plural(cams.length, 'caminhão', 'caminhões')} · {numBR(volume)} m³
                      {c.codigo_construpoint ? ` · ${c.codigo_construpoint}` : ''}
                    </span>
                  </span>
                  {pior && <Selo situacao={pior} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
