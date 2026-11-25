// Liga as contas do avanço (avanco.ts) aos dados da FVS e do Concreto. Só leitura: nada grava na obra.
// A situação de cada peça é a mesma da planta e do início da FVS (situacaoDoLocal); o que foi concretado
// vem do Concreto (peças de cada caminhão e as áreas de laje da FVS que ele cobriu).
import { fichaDoLocalNaObra, partesDoPilar, type DadosFvs } from '../fvs/dados'
import type { ApoiosDaPeca } from '../fvs/escoramento_residencial'
import { concretadaDe } from '../fvs/concretada'
import { soDetalheGuardado } from '../fvs/pacote'
import { fichaDaPeca, situacaoDoLocal, ultimosPorItem, type Situacao } from '../fvs/situacao'
import type { DadosConcreto } from '../concreto/dados'
import { sincronizador } from '../nucleo/servicos'
import { ehItemDeArmadura, lerCentrosDeApoios, lerIndiceDeApoios, residenciaisDasPecas, situacaoDaArmadura, type CaminhaoDoAvanco, type CentrosDoIndice, type Estado, type IndiceDeApoios, type PecaDoAvanco, type TipoDePeca } from './avanco'

const ESTADO: Record<Situacao, Estado> = { liberado: 'pronto', concretagem: 'concretar', andamento: 'andamento', reprovado: 'nc', nada: 'pendente' }

/** Os caminhões da obra com as peças de cada um (a concretagem de exemplo da apresentação fica de fora). */
export function caminhoesDoAvanco(c: DadosConcreto | undefined): CaminhaoDoAvanco[] {
  if (!c) return []
  const saida: CaminhaoDoAvanco[] = []
  for (const conc of c.concretagens) {
    if (conc.exemplo) continue
    for (const k of c.caminhoesDe.get(conc.raiz) ?? []) {
      const pecas = [...(c.pecasDe.get(k.raiz)?.values() ?? [])].filter((e) => e.incluido).map((e) => e.elemento_id)
      const lajes = (c.lajesFvsDe.get(k.raiz) ?? []).map((l) => l.area_id)
      saida.push({ id: k.raiz, concretagemId: conc.raiz, pavimentoId: conc.pavimento_id, data: conc.data, volume: k.volume_m3, pecas: [...new Set([...pecas, ...lajes])] })
    }
  }
  return saida
}

/**
 * O índice de apoios publicado nas regras da FVS da obra (chave "apoios" da linha que vale em fvs_regras;
 * sem conta, veio do config_fvs.json do pacote). Lido do banco do aparelho: nenhum download. Sem índice, null.
 * `centros`: onde fica cada pilar e viga, para as lajes desenhadas no app (25/11); índice antigo, null.
 */
export async function indiceDeApoiosDaObra(obraId: string): Promise<{ indice: IndiceDeApoios | null; centros: CentrosDoIndice | null }> {
  const linhas = await sincronizador.linhas('fvs_regras', obraId)
  // a linha que vale: a mesma escolha de regrasVigentes (fvs/regras.ts): a mais nova, pela hora do servidor
  const quando = (l: (typeof linhas)[number]) => String(l.criado_em_servidor ?? l.criado_em_dispositivo ?? '')
  let atual: (typeof linhas)[number] | undefined
  for (const l of linhas) {
    if (l.apagado === true) continue
    if (!atual || quando(l) > quando(atual) || (quando(l) === quando(atual) && l.id > atual.id)) atual = l
  }
  const apoios = (atual?.regras as { apoios?: unknown } | null | undefined)?.apoios
  return { indice: lerIndiceDeApoios(apoios), centros: lerCentrosDeApoios(apoios) }
}

export interface PecaBase {
  id: string
  tipo: TipoDePeca
  nome: string
  pavimentoId: string
}

/** Pilares, vigas e lajes da obra (peças da planta e áreas de laje desenhadas), sem a situação. */
export function pecasBase(d: DadosFvs): PecaBase[] {
  const base = new Map<string, PecaBase>()
  for (const p of d.pecaPorId.values()) {
    if ((p.tipo === 'P' || p.tipo === 'V' || p.tipo === 'L') && !soDetalheGuardado(p.id)) base.set(p.id, { id: p.id, tipo: p.tipo, nome: p.nome, pavimentoId: p.pavimento_id })
  }
  for (const a of d.areaPorId.values()) base.set(a.id, { id: a.id, tipo: 'L', nome: a.nome, pavimentoId: a.pavimento_id })
  return [...base.values()]
}

/** As peças com a situação de cada uma. `apoios`: quem apoia cada viga e laje (das plantas ou do índice). */
export function pecasDoAvanco(d: DadosFvs, caminhoes: readonly CaminhaoDoAvanco[], apoios: ReadonlyMap<string, ApoiosDaPeca>): PecaDoAvanco[] {
  const fichaPorId = (id: string) => d.fichaPorId.get(id)
  // concretada = a mesma regra do verde da planta (fvs/concretada.ts, 24/11): caminhões cobrindo 90% da peça
  // ou da área de laje. Sem o cálculo da FVS (dados antigos), qualquer caminhão com a peça.
  const comCaminhao = new Set(caminhoes.flatMap((c) => c.pecas))
  const concretadas = d.concretadas ?? comCaminhao
  const lista = pecasBase(d)
  const nomeDoPavimento = new Map(d.pavimentos.map((p) => [p.id, p.nome]))
  const res = residenciaisDasPecas(lista, d.regras.residenciais ?? [], (id) => nomeDoPavimento.get(id) ?? '', apoios)
  return lista.map((p) => {
    const eventos = d.eventosDe.get(p.id) ?? []
    const ficha = fichaDaPeca(fichaDoLocalNaObra(d, p), eventos, fichaPorId)
    // verde (pronto) só concretado, como na planta; ficha toda marcada sem concretagem fica "para concretar"
    const situacao = situacaoDoLocal(ficha, d.fichasCampoDe.get(p.id) ?? [], fichaPorId, eventos, undefined, partesDoPilar(p.id), concretadaDe(concretadas, p.id, p.tipo))
    const ult = ficha ? ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id)) : new Map()
    const deArmadura = ficha ? ficha.itens.filter(ehItemDeArmadura) : []
    return {
      ...p,
      estado: ESTADO[situacao],
      armadura: situacaoDaArmadura(deArmadura.map((it) => ult.get(it.n)?.resultado)),
      concretada: concretadas.has(p.id),
      parcial: comCaminhao.has(p.id) && !concretadas.has(p.id),
      residenciais: res.get(p.id) ?? [],
    }
  })
}
