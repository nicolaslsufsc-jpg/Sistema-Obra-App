// Bancada do módulo Relatórios (ver relatorios.html). Põe no banco do navegador, como se tivessem
// sido baixados do servidor, 2 pavimentos com peças de teste e o diário de ontem. A planta é a
// esquemática da obra TESTE. Sem login: a sincronização falha e o módulo trabalha só com o aparelho
// (como sem internet).
import { render } from 'preact'
import '../src/style.css'
import { banco } from '../src/nucleo/servicos'
import { RelatoriosSobDemanda } from '../src/relatorios/telas/SobDemanda'
import { guardarPacote } from '../src/fvs/pacote'
import type { ObraLocal, UsuarioLocal } from '../src/nucleo/conta'

const params = new URLSearchParams(location.search)
const pasta = params.get('pasta')
// Obra separada para os pacotes de verdade (?pasta=...): não mistura com a planta de teste.
const OBRA = pasta ? 'b0000000-0000-0000-0000-0000000000bc' : 'b0000000-0000-0000-0000-0000000000bb'
const usuario: UsuarioLocal = { id: '00000000-0000-0000-0000-0000000000a1', email: 'bancada@teste.local' }
const papel = (params.get('papel') ?? 'gestor') as ObraLocal['papel']
const obra: ObraLocal = pasta
  ? { id: OBRA, codigo: 'BANCADA', nome: 'Prancha de verdade (só neste PC)', empresa: null, papel }
  : { id: OBRA, codigo: 'TESTE', nome: 'Bancada dos Relatórios', empresa: 'Empresa de Teste', papel }

function uuid(prefixo: string, n: number) {
  return `${prefixo}-0000-0000-0000-${String(n).padStart(12, '0')}`
}

function dataLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function semear() {
  if ((await banco.registros.where('[tabela+obra_id]').equals(['pavimentos', OBRA]).count()) > 0) return
  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  const data = dataLocal(ontem)
  const hora = ontem.toISOString()
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: hora, apagado: false }
  const corrigivel = { ...base, substitui_id: null, cancelado: false }
  const linhas: Array<{ tabela: string; linha: Record<string, unknown> & { id: string } }> = []
  const pavs = [
    { id: uuid('a0000000', 1), nome: '3º Pavimento', ordem: 3, p: 20, v: 26, l: 6 },
    { id: uuid('a0000000', 2), nome: '4º Pavimento', ordem: 4, p: 12, v: 17, l: 0 },
    { id: uuid('a0000000', 3), nome: 'Sem peças', ordem: 5, p: 0, v: 0, l: 0 },
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
  // o diário de ontem, para ver "Copiar de" e a lista de dias
  linhas.push({ tabela: 'diario_clima', linha: { ...base, id: uuid('c1000000', 1), data, periodo: 'manha', tempo: 'sol', condicao: 'praticavel' } })
  linhas.push({ tabela: 'diario_clima', linha: { ...base, id: uuid('c1000000', 2), data, periodo: 'tarde', tempo: 'chuva_forte', condicao: 'impraticavel' } })
  linhas.push({ tabela: 'diario_efetivo', linha: { ...corrigivel, id: uuid('c1000000', 3), data, empresa: 'Empresa de Teste', funcao: 'Pedreiro', quantidade: 6, observacao: null } })
  linhas.push({ tabela: 'diario_efetivo', linha: { ...corrigivel, id: uuid('c1000000', 4), data, empresa: 'Empresa de Teste', funcao: 'Servente', quantidade: 4, observacao: null } })
  linhas.push({ tabela: 'diario_equipamentos', linha: { ...corrigivel, id: uuid('c1000000', 5), data, nome: 'Grua', quantidade: 1, situacao: 'operando', observacao: null } })
  await banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: OBRA, linha: l.linha as never, pendente: 0 as const })))
}

/**
 * Prancha de verdade: dev/relatorios.html?pasta=http://127.0.0.1:8766/&pavimento=3
 * Antes, noutra janela: py pipeline/fvs/bancada.py PASTA_DOS_PACOTES (nada sai do PC; os pacotes
 * ficam fora do repositório). Cadastra a obra inteira e guarda no navegador os pacotes de estrutura
 * dos pavimentos cujo nome contém `pavimento` (são vários MB por trecho).
 */
interface IndicePasta {
  pavimentos: Array<{
    nome: string
    pecas: Array<{ id: string; tipo: string; nome: string; secao: string }>
    plantas: Array<{ id: string; trecho: string; pasta: string; prancha: string; revisao: string; largura: number; altura: number; elementos: number; disciplina?: string }>
  }>
}

async function semearDaPasta(pasta: string, filtro: string) {
  const raiz = pasta.endsWith('/') ? pasta : `${pasta}/`
  const indice = (await (await fetch(`${raiz}indice.json`)).json()) as IndicePasta
  const agora = new Date().toISOString()
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: agora, apagado: false }
  const linhas: Array<{ tabela: string; linha: Record<string, unknown> & { id: string } }> = []
  const chave = (t: string) => t.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase()
  for (const [i, pv] of indice.pavimentos.entries()) {
    const pavId = `pav-${chave(pv.nome)}`
    linhas.push({ tabela: 'pavimentos', linha: { ...base, id: pavId, nome: pv.nome, ordem: i + 1 } })
    for (const pc of pv.pecas) linhas.push({ tabela: 'elementos', linha: { ...base, id: pc.id, pavimento_id: pavId, tipo: pc.tipo, nome: pc.nome, secao: pc.secao || null } })
    for (const pl of pv.plantas) {
      if (pl.disciplina === 'arquitetura' || !pv.nome.includes(filtro)) continue
      linhas.push({
        tabela: 'plantas',
        linha: { ...base, id: pl.id, pavimento_id: pavId, setor_id: `setor-${chave(pv.nome)}-${chave(pl.trecho)}`, prancha: pl.prancha, revisao: pl.revisao, largura: pl.largura, altura: pl.altura, elementos: pl.elementos },
      })
      const dir = raiz + pl.pasta
      const [manifest, bin] = await Promise.all([fetch(`${dir}manifest.json`).then((r) => r.text()), fetch(`${dir}pacote.bin`).then((r) => r.blob())])
      await guardarPacote(manifest, bin, { obraId: OBRA, usuarioId: usuario.id })
    }
  }
  await banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: OBRA, linha: l.linha as never, pendente: 0 as const })))
}

;(pasta ? semearDaPasta(pasta, params.get('pavimento') ?? '') : semear()).then(() => {
  history.replaceState({ tela: 'relatorios' }, '')
  render(<RelatoriosSobDemanda usuario={usuario} obra={obra} aoSair={() => location.reload()} aoPerderObra={() => {}} />, document.getElementById('app')!)
})
