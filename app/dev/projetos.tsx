// Bancada do módulo Projetos (ver projetos.html). Põe no banco do navegador, como se tivessem sido
// baixados do servidor, projetos de uma obra inventada (TST): 4 disciplinas, 10 pranchas, revisões
// EX/LO (uma obsoleta, uma prancha sem vigente), 4 empresas e entregas cobrindo as quatro situações
// (OK, RECOLHER, DEVOLVIDO, CONFERIR) e uma pasta de escritório vencida.
// Sem login: a sincronização falha e o módulo trabalha só com o aparelho (como sem internet).
// ?papel=campo ou ?papel=leitura troca o papel do usuário (padrão: gestor).
import { render } from 'preact'
import '../src/style.css'
import { banco } from '../src/nucleo/servicos'
import type { ObraLocal, PapelNaObra, UsuarioLocal } from '../src/nucleo/conta'
import { ModuloProjetos } from '../src/projetos/telas/ModuloProjetos'
import { dataLocal, somarDias } from '../src/projetos/regras'

const OBRA = 'b0000000-0000-0000-0000-0000000000bb'
const papel = (new URLSearchParams(location.search).get('papel') as PapelNaObra | null) ?? 'gestor'
const usuario: UsuarioLocal = { id: '00000000-0000-0000-0000-0000000000a1', email: 'bancada@teste.local' }
const obra: ObraLocal = { id: OBRA, codigo: 'TST', nome: 'Bancada dos Projetos', empresa: null, papel }

const uuid = (prefixo: string, n: number) => `${prefixo}-0000-0000-0000-${String(n).padStart(12, '0')}`
const HOJE = dataLocal(new Date())
const dia = (n: number) => somarDias(HOJE, -n)
const hora = (diasAtras: number, h = 10) => new Date(new Date(`${dia(diasAtras)}T00:00:00`).getTime() + h * 3600_000).toISOString()

async function semear() {
  if ((await banco.registros.where('[tabela+obra_id]').equals(['documentos', OBRA]).count()) > 0) return
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: hora(30), apagado: false }
  const linhas: Array<{ tabela: string; linha: Record<string, unknown> & { id: string } }> = []
  const por = (tabela: string, linha: Record<string, unknown> & { id: string }) => linhas.push({ tabela, linha: { ...base, ...linha } })

  // Empresas
  const E = { alfa: uuid('e0000000', 1), beta: uuid('e0000000', 2), gama: uuid('e0000000', 3), antiga: uuid('e0000000', 4) }
  por('empresas', { id: E.alfa, nome: 'Empreiteira Alfa', contato: 'João · (48) 9 9999-0001', ativa: true })
  por('empresas', { id: E.beta, nome: 'Hidráulica Beta', contato: 'Maria', ativa: true })
  por('empresas', { id: E.gama, nome: 'Elétrica Gama', contato: null, ativa: true })
  por('empresas', { id: E.antiga, nome: 'Antiga Ltda', contato: null, ativa: false })

  // Documentos
  const docs = [
    ['ES', 'Estrutura', '112', 'FORPILOTIS', 'PLANTA DE FORMA DO PILOTIS - TRECHO 1'],
    ['ES', 'Estrutura', '113', 'FORPILOTIS', 'PLANTA DE FORMA DO PILOTIS - TRECHO 2'],
    ['ES', 'Estrutura', '130', 'FOR3PAVTIP', 'PLANTA DE FORMA DO 3º PAVIMENTO TIPO - TRECHO 1'],
    ['ES', 'Estrutura', '200', 'PILPILOTIS', 'DETALHAMENTO DE PILARES DO PILOTIS'],
    ['AR', 'Arquitetura', '010', 'PLANTABAIX', 'PLANTA BAIXA DO PAVIMENTO TIPO'],
    ['AR', 'Arquitetura', '011', 'CORTESXXXX', 'CORTES AA E BB'],
    ['HS', 'Hidrossanitário', '020', 'ESGOTOTERR', 'ESGOTO DO TÉRREO'],
    ['HS', 'Hidrossanitário', '021', 'AGUAFRIATI', 'ÁGUA FRIA DO PAVIMENTO TIPO'],
    ['FR', 'Furação', '030', '3PVTOXXXXA', 'PISO DO 3º PAVIMENTO - SETOR A'],
    ['FR', 'Furação', '031', '3PVTOXXXXB', 'PISO DO 3º PAVIMENTO - SETOR B'],
  ] as const
  const D: string[] = []
  docs.forEach(([sigla, disciplina, numero, nome, titulo], i) => {
    const id = uuid('d0000000', i + 1)
    D.push(id)
    por('documentos', {
      id,
      codigo: `TST.${sigla}.${numero}.${nome}`,
      disciplina_sigla: sigla,
      disciplina,
      numero,
      nome_curto: nome,
      titulo,
      pasta_autodoc: `129 - TST (Obra de Teste)/PROJETOS/${disciplina}/Liberado Obra/`,
      link_pasta: 'https://plataforma.autodoc.com.br/projetos/directories',
    })
  })

  // Revisões: [doc, fase, numero, obsoleta, vista há N dias]
  const revs: Array<[number, string, string, boolean, number]> = [
    [0, 'EX', '05', false, 40], [0, 'LO', '02', false, 2],
    [1, 'LO', '01', false, 20],
    [2, 'EX', '03', false, 30], [2, 'EX', '04', false, 1],
    [3, 'LO', '00', false, 60],
    [4, 'EX', '04', false, 15],
    [5, 'EX', '02', true, 50],
    [6, 'LO', '01', true, 45], [6, 'LO', '02', false, 10],
    [7, 'EX', '01', false, 25],
    [8, 'EX', '02', false, 0],
    [9, 'EX', '02', false, 5],
  ]
  const R: Record<string, string> = {}
  revs.forEach(([d, fase, numero, obsoleta, vista], i) => {
    const id = uuid('a0000000', i + 1)
    R[`${d}:${fase}${numero}`] = id
    por('revisoes', {
      id,
      documento_id: D[d],
      fase,
      numero,
      titulo: docs[d][4],
      status_autodoc: 'Aprovado',
      obsoleta,
      data_obsoleta: obsoleta ? hora(vista - 5) : null,
      cadastrada_em_autodoc: hora(vista + 1, 15),
      cadastrada_por: 'projetos@exemplo.test',
      atualizada_em_autodoc: hora(vista + 1, 17),
      extensoes: 'dwg,pdf',
      vista_em: dia(vista),
    })
  })

  // Escritório: D1 ficou na EX R05 (vencida); D2 com a vigente
  por('escritorio_eventos', { id: uuid('c0000000', 1), documento_id: D[0], revisao_id: R['0:EX05'], data_evento: dia(35), observacao: null, criado_em_dispositivo: hora(35) })
  por('escritorio_eventos', { id: uuid('c0000000', 2), documento_id: D[1], revisao_id: R['1:LO01'], data_evento: dia(18), observacao: null, criado_em_dispositivo: hora(18) })

  // Entregas e devoluções
  let n = 0
  const evento = (campos: Record<string, unknown>) => {
    n++
    const id = uuid('f0000000', n)
    por('distribuicao_eventos', { id, colaborador: null, entrega_id: null, foto_id: null, observacao: null, ...campos })
    return id
  }
  evento({ tipo: 'entrega', empresa_id: E.alfa, colaborador: 'João', documento_id: D[0], revisao_id: R['0:EX05'], data_evento: dia(30), criado_em_dispositivo: hora(30) }) // RECOLHER
  evento({ tipo: 'entrega', empresa_id: E.alfa, documento_id: D[1], revisao_id: R['1:LO01'], data_evento: dia(18), criado_em_dispositivo: hora(18) }) // OK
  const devolvida = evento({ tipo: 'entrega', empresa_id: E.beta, colaborador: 'Maria', documento_id: D[6], revisao_id: R['6:LO01'], data_evento: dia(40), criado_em_dispositivo: hora(40) })
  evento({ tipo: 'devolucao', empresa_id: E.beta, colaborador: 'Maria', documento_id: D[6], revisao_id: R['6:LO01'], entrega_id: devolvida, data_evento: dia(9), criado_em_dispositivo: hora(9) }) // DEVOLVIDO
  evento({ tipo: 'entrega', empresa_id: E.beta, documento_id: D[2], revisao_id: R['2:EX03'], data_evento: dia(28), criado_em_dispositivo: hora(28) })
  evento({ tipo: 'entrega', empresa_id: E.beta, documento_id: D[2], revisao_id: R['2:EX04'], data_evento: dia(1), criado_em_dispositivo: hora(1) }) // CONFERIR (2 abertas)
  evento({ tipo: 'entrega', empresa_id: E.gama, documento_id: D[5], revisao_id: R['5:EX02'], data_evento: dia(48), criado_em_dispositivo: hora(48) }) // CONFERIR (sem vigente)
  evento({ tipo: 'entrega', empresa_id: E.gama, colaborador: 'Carlos', documento_id: D[4], revisao_id: R['4:EX04'], data_evento: dia(14), criado_em_dispositivo: hora(14) }) // OK

  await banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: OBRA, linha: l.linha as never, pendente: 0 as const })))
}

semear().then(() => {
  history.replaceState({ tela: 'projetos' }, '')
  render(<ModuloProjetos usuario={usuario} obra={obra} aoSair={() => location.reload()} aoPerderObra={() => {}} />, document.getElementById('app')!)
})
