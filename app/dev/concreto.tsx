// Bancada do módulo Concreto (ver concreto.html). Põe no banco do navegador, como se tivessem
// sido baixados do servidor, 3 pavimentos e peças de teste:
//   - "Pavimento pequeno": 12 pilares, 17 vigas, 6 lajes
//   - "Pavimento grande": 200 pilares, 360 vigas (para ver se o desenho continua leve)
//   - "Pavimento em 2 trechos": duas plantas, como as pranchas de forma por trecho
// Sem login: a sincronização falha e o módulo trabalha só com o aparelho (como sem internet).
// Com ?papel=campo a pessoa da bancada é de campo (o padrão é admin).
// Com ?obra=<id> não põe nada no banco: abre a obra que a bancada da FVS (dev/fvs.html) deixou
// neste navegador, como obra de verdade (sem planta esquemática). As plantas vêm dos pacotes
// que a FVS guardou no aparelho. Com ?obra=b0000000-0000-0000-0000-0000000000cc são os pacotes
// servidos pelo PC (dev/fvs.html?pasta=...).
// Com ?exemplo=1 a concretagem de ontem tem o id da concretagem de exemplo (aparece com EXEMPLO).
import { render } from 'preact'
import '../src/style.css'
import { banco } from '../src/nucleo/servicos'
import { ConcretoSobDemanda } from '../src/concreto/telas/SobDemanda'
import { idDaConcretagemDeExemplo } from '../src/concreto/exemplo'
import { plantaEsquematica, refDaPlanta, registrarFonteDePlantas, type PlantaPavimento, type TipoPeca } from '../src/concreto/planta'
import type { ObraLocal, PapelNaObra, UsuarioLocal } from '../src/nucleo/conta'
import { sistemasInstalados } from '../src/integracoes/sistema_oficial'

const OBRA = 'b0000000-0000-0000-0000-0000000000aa'
const usuario: UsuarioLocal = { id: '00000000-0000-0000-0000-0000000000a1', email: 'bancada@teste.local' }
const params = new URLSearchParams(location.search)
const obraDaFvs = params.get('obra')
// ?papel=campo (ou gestor, leitura) abre a bancada com outro papel na obra; o padrão é admin
const PAPEIS: readonly PapelNaObra[] = ['admin', 'gestor', 'campo', 'leitura']
const papel = PAPEIS.find((p) => p === params.get('papel')) ?? 'admin'
// Sistema oficial da bancada: ?sistema=ID, ?sistema= (vazio) para nenhum; sem o parâmetro, o primeiro galho instalado.
const sistema_oficial = params.has('sistema') ? params.get('sistema') || null : (sistemasInstalados()[0]?.id ?? null)
const obra: ObraLocal = obraDaFvs
  ? { id: obraDaFvs, codigo: 'BANCADA', nome: 'Bancada do Concreto (pacotes da FVS)', empresa: null, papel, sistema_oficial }
  : { id: OBRA, codigo: 'TESTE', nome: 'Bancada do Concreto', empresa: null, papel, sistema_oficial }

function uuid(prefixo: string, n: number) {
  return `${prefixo}-0000-0000-0000-${String(n).padStart(12, '0')}`
}

async function semear() {
  if ((await banco.registros.where('[tabela+obra_id]').equals(['pavimentos', OBRA]).count()) > 0) return
  const agora = new Date().toISOString()
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: agora, apagado: false }
  const linhas: Array<{ tabela: string; linha: Record<string, unknown> & { id: string } }> = []
  const pavs = [
    { id: uuid('a0000000', 1), nome: 'Pavimento pequeno', ordem: 1, p: 12, v: 17, l: 6 },
    { id: uuid('a0000000', 2), nome: 'Pavimento grande', ordem: 2, p: 200, v: 360, l: 0 },
    { id: uuid('a0000000', 3), nome: 'Sem peças', ordem: 3, p: 0, v: 0, l: 0 },
  ]
  let n = 0
  for (const pv of pavs) {
    linhas.push({ tabela: 'pavimentos', linha: { ...base, id: pv.id, nome: pv.nome, ordem: pv.ordem } })
    for (const [tipo, qtd] of [['P', pv.p], ['V', pv.v], ['L', pv.l]] as const) {
      for (let i = 1; i <= qtd; i++) {
        linhas.push({ tabela: 'elementos', linha: { ...base, id: uuid('e0000000', ++n), pavimento_id: pv.id, tipo, nome: `${tipo}${i}`, secao: null } })
      }
    }
  }
  await banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: OBRA, linha: l.linha as never, pendente: 0 as const })))
}

/** Uma concretagem de ontem com 3 caminhões no pavimento pequeno (para ver a ficha de concreto e os CPs). */
async function semearConcretagem() {
  if ((await banco.registros.where('[tabela+obra_id]').equals(['concretagens', OBRA]).count()) > 0) return
  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  const p = (n: number) => String(n).padStart(2, '0')
  const data = `${ontem.getFullYear()}-${p(ontem.getMonth() + 1)}-${p(ontem.getDate())}`
  const hora = (h: string) => {
    const [hh, mm] = h.split(':').map(Number)
    return new Date(ontem.getFullYear(), ontem.getMonth(), ontem.getDate(), hh, mm).toISOString()
  }
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: hora('07:30'), apagado: false, substitui_id: null, cancelado: false }
  const conc = {
    ...base,
    id: params.get('exemplo') === '1' ? await idDaConcretagemDeExemplo(OBRA) : uuid('c0000000', 1),
    pavimento_id: uuid('a0000000', 1),
    data,
    local_descricao: 'Trecho 2 · Vigas',
    codigo_construpoint: 'FIC-0215',
    fornecedor: 'Polimix',
    fck_mpa: 40,
    slump_cm: 12,
    slump_tolerancia_cm: 2,
    idades_dias: [7, 28],
    cps_por_idade: 2,
    observacao: null,
  }
  const cams = [
    { seq: 1, nf: '184201', saida: '06:50', chegada: '07:35', inicio: '07:45', fim: '08:20', slump: 12.5, agua: null, obs: null },
    { seq: 2, nf: '184202', saida: '07:20', chegada: '08:05', inicio: '08:25', fim: '09:00', slump: 11, agua: 20, obs: null },
    { seq: 3, nf: '184203', saida: '07:55', chegada: '08:50', inicio: '09:05', fim: '09:40', slump: 13, agua: null, obs: 'bomba travou 10 min' },
  ].map((c) => ({
    ...base,
    id: uuid('d0000000', c.seq),
    concretagem_id: conc.id,
    sequencia: c.seq,
    nota_fiscal: c.nf,
    volume_m3: 8.5,
    saida_usina: hora(c.saida),
    chegada_obra: hora(c.chegada),
    inicio_descarga: hora(c.inicio),
    fim_descarga: hora(c.fim),
    slump_medido_cm: c.slump,
    agua_adicionada_l: c.agua,
    cps_moldados: 4,
    observacao: c.obs,
  }))
  const linhas = [{ tabela: 'concretagens', linha: conc }, ...cams.map((linha) => ({ tabela: 'caminhoes', linha }))]
  await banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: OBRA, linha: l.linha as never, pendente: 0 as const })))
}

/**
 * "Pavimento em 2 trechos": duas plantas esquemáticas (uma por trecho, como as pranchas de
 * forma), com P9 e P10 nas duas (pilares da emenda). Testa a troca de trecho e o cálculo
 * de peças por planta.
 */
const PAV_TRECHOS = uuid('a0000000', 4)
async function semearTrechos() {
  if (await banco.registros.get(['pavimentos', PAV_TRECHOS])) return
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: new Date().toISOString(), apagado: false }
  const linhas: Array<Record<string, unknown> & { id: string; tabela: string }> = [
    { ...base, tabela: 'pavimentos', id: PAV_TRECHOS, nome: 'Pavimento em 2 trechos', ordem: 4 },
  ]
  let n = 9000
  for (const [tipo, qtd] of [['P', 16], ['V', 20]] as const) {
    for (let i = 1; i <= qtd; i++) linhas.push({ ...base, tabela: 'elementos', id: uuid('e0000000', ++n), pavimento_id: PAV_TRECHOS, tipo, nome: `${tipo}${i}`, secao: null })
  }
  await banco.registros.bulkPut(linhas.map(({ tabela, ...linha }) => ({ tabela, id: linha.id, obra_id: OBRA, linha: linha as never, pendente: 0 as const })))
}

registrarFonteDePlantas(({ pavimento, pecas }) => {
  if (pavimento.id !== PAV_TRECHOS) return []
  const num = (nome: string) => Number(nome.slice(1))
  const t1 = pecas.filter((p) => (p.tipo === 'P' ? num(p.nome) <= 10 : num(p.nome) <= 12))
  const t2 = pecas.filter((p) => (p.tipo === 'P' ? num(p.nome) >= 9 : num(p.nome) > 12))
  return [
    plantaEsquematica('bancada:trecho-2', 'Pavimento em 2 trechos · Trecho 2', t2, 'Trecho 2', 'R01'),
    plantaEsquematica('bancada:trecho-1', 'Pavimento em 2 trechos · Trecho 1', t1, 'Trecho 1', 'R01'),
  ]
})

/**
 * Prévia com forma real: dev/concreto.html?plantas=http://127.0.0.1:5180/plantas.json
 * O plantas.json e os tiles ficam FORA do repositório (dados de obra), gerados no PC e
 * servidos localmente. Cada pavimento do arquivo vira um pavimento da bancada, com as peças.
 */
interface PlantaLocal {
  id: string
  revisao: string
  trecho: string
  titulo: string
  largura: number
  altura: number
  tile: number
  niveis: number[]
  base: string
  chaves: string[]
  elementos: Array<{ id: string; tipo: TipoPeca; nome: string; rotulo: [number, number, number, number]; polys: Array<Array<[number, number]>> }>
}

async function carregarPlantasLocais(url: string) {
  const indice = (await (await fetch(url)).json()) as { pavimentos: Array<{ nome: string; plantas: PlantaLocal[] }> }
  const raiz = url.slice(0, url.lastIndexOf('/'))
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: new Date().toISOString(), apagado: false }
  const porPavimento = new Map<string, PlantaPavimento[]>()
  for (const [i, pav] of indice.pavimentos.entries()) {
    // id estável pelo nome: o banco do navegador continua valendo se a lista mudar de ordem
    const pavId = uuid('a0000000', 1000 + [...pav.nome].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_000, 7))
    const linhas: Array<Record<string, unknown> & { id: string; tabela: string }> = [{ ...base, tabela: 'pavimentos', id: pavId, nome: `${pav.nome} (forma real)`, ordem: 100 + i }]
    const vistos = new Set<string>()
    for (const pl of pav.plantas) {
      for (const e of pl.elementos) {
        if (vistos.has(e.id)) continue // pilar da emenda aparece em dois trechos: é uma peça só
        vistos.add(e.id)
        linhas.push({ ...base, tabela: 'elementos', id: e.id, pavimento_id: pavId, tipo: e.tipo, nome: e.nome, secao: null })
      }
    }
    await banco.registros.bulkPut(linhas.map(({ tabela, ...linha }) => ({ tabela, id: linha.id, obra_id: OBRA, linha: linha as never, pendente: 0 as const })))
    porPavimento.set(
      pavId,
      pav.plantas.map((pl) => {
        const chaves = new Set(pl.chaves)
        return {
          id: pl.id,
          revisao: pl.revisao,
          ref: refDaPlanta(pl.id, pl.revisao),
          trecho: pl.trecho,
          titulo: pl.titulo,
          largura: pl.largura,
          altura: pl.altura,
          elementos: pl.elementos,
          fundo: {
            tile: pl.tile,
            niveis: pl.niveis,
            url: (z, x, y) => (chaves.has(`${z}/${x}/${y}`) ? `${raiz}/${pl.base}/${z}_${x}_${y}.webp` : undefined),
          },
        }
      }),
    )
  }
  registrarFonteDePlantas(({ pavimento }) => porPavimento.get(pavimento.id) ?? [])
}

const urlPlantas = params.get('plantas')

const prepararBanco = async () => {
  if (obraDaFvs) return
  await semear()
  await semearConcretagem()
  await semearTrechos()
  if (urlPlantas) await carregarPlantasLocais(urlPlantas)
}

prepararBanco().then(() => {
  history.replaceState({ tela: 'concreto' }, '')
  render(<ConcretoSobDemanda usuario={usuario} obra={obra} aoSair={() => location.reload()} aoPerderObra={() => {}} />, document.getElementById('app')!)
})
