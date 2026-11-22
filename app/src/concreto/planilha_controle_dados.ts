// Liga a planilha de controle (planilha_controle.ts) aos dados do Concreto (dados.ts).
// A concretagem de exemplo da apresentação (exemplo.ts) não entra: a planilha é da obra.

import { caminhoesComLajeDesenhada, type DadosConcreto } from './dados'
import { relatorioPorCaminhao, type PecaRelatorio } from './relatorio'
import type { CaminhaoDaPlanilha, ConcretagemDaPlanilha } from './planilha_controle'

export function itensDaPlanilha(dados: DadosConcreto): Array<{ concretagem: ConcretagemDaPlanilha; caminhoes: CaminhaoDaPlanilha[] }> {
  const nomePav = new Map(dados.pavimentos.map((p) => [p.id, p.nome]))
  const pecas = new Map<string, PecaRelatorio>([...dados.pecaPorId.values()].map((p) => [p.id, { id: p.id, nome: p.nome, tipo: p.tipo }]))
  return dados.concretagens
    .filter((c) => !c.exemplo)
    .map((c) => {
      const cams = dados.caminhoesDe.get(c.raiz) ?? []
      const porCaminhao = new Map(relatorioPorCaminhao(cams, dados.pecasDe, pecas, dados.lajesFvsDe, caminhoesComLajeDesenhada(dados)).map((l) => [l.caminhao.raiz, l.pecas]))
      return {
        concretagem: {
          raiz: c.raiz,
          data: c.data,
          pavimento: nomePav.get(c.pavimento_id) ?? '',
          local_descricao: c.local_descricao,
          codigo_oficial: c.codigo_construpoint,
          fornecedor: c.fornecedor,
          fck_mpa: c.fck_mpa,
          observacao: c.observacao,
        },
        caminhoes: cams.map((k) => ({
          sequencia: k.sequencia,
          nota_fiscal: k.nota_fiscal,
          volume_m3: k.volume_m3,
          saida_usina: k.saida_usina,
          chegada_obra: k.chegada_obra,
          inicio_descarga: k.inicio_descarga,
          fim_descarga: k.fim_descarga,
          slump_medido_cm: k.slump_medido_cm,
          agua_adicionada_l: k.agua_adicionada_l,
          cps_moldados: k.cps_moldados,
          observacao: k.observacao,
          pecas: (porCaminhao.get(k.raiz) ?? []).map((i) => ({ nome: i.peca.nome, tipo: i.peca.tipo, fracao: i.fracao, parcial: i.parcial })),
          resultados: (dados.resultadosDe.get(k.raiz) ?? []).map((r) => ({ idade_dias: r.idade_dias, numero_cp: r.numero_cp, resistencia_mpa: r.resistencia_mpa })),
        })),
      }
    })
}
