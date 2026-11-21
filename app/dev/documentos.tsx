// Bancada do módulo Documentos (ver documentos.html). Põe no banco do navegador, como se tivessem
// descido do servidor, três documentos da obra EXE com arquivo só no servidor (sem os bytes no
// aparelho). O "servidor" é de mentira: devolve um PDF de exemplo conferido pelo SHA-256. Sem login.
import { render } from 'preact'
import '../src/style.css'
import { banco } from '../src/nucleo/servicos'
import { DocumentosSobDemanda } from '../src/documentos/telas/SobDemanda'
import { trocarBaixador } from '../src/documentos/dados'
import { pdfDeExemplo } from '../src/documentos/exemplos'
import { sha256Hex } from '../src/fvs/pacote'
import type { ObraLocal, UsuarioLocal } from '../src/nucleo/conta'

const params = new URLSearchParams(location.search)
const OBRA = 'b0000000-0000-0000-0000-0000000000de'
const usuario: UsuarioLocal = { id: '00000000-0000-0000-0000-0000000000a1', email: 'bancada@teste.local' }
const papel = (params.get('papel') ?? 'gestor') as ObraLocal['papel']
const obra: ObraLocal = { id: OBRA, codigo: 'EXE', nome: 'Obra Exemplo (bancada)', empresa: 'Construtora Exemplo', papel }

const DOCS = [
  { n: 1, escopo: 'obra', categoria: 'pqo', codigo: 'EXE-PQO', titulo: 'Plano da Qualidade da Obra', revisao: '02' },
  { n: 2, escopo: 'obra', categoria: 'controle_tecnologico', codigo: 'EXE-PCT', titulo: 'Plano de controle tecnológico', revisao: '00' },
  { n: 3, escopo: 'obra', categoria: 'controle_tecnologico', codigo: 'EXE-LAB', titulo: 'Contrato do laboratório', revisao: '01' },
  { n: 4, escopo: 'empresa', categoria: 'sistema', codigo: 'EXE-MQ', titulo: 'Manual da Qualidade', revisao: '05' },
] as const

const uuid = (p: string, n: number) => `${p}-0000-0000-0000-${String(n).padStart(12, '0')}`
const caminhoDe = (n: number) => `${OBRA}/documentos/${uuid('f0000000', n)}.pdf`
const bytesDe = (n: number) => {
  const d = DOCS.find((x) => x.n === n)!
  const u = pdfDeExemplo(['DOCUMENTO DE BANCADA', `${d.codigo} rev. ${d.revisao}`, d.titulo])
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

async function semear() {
  if ((await banco.registros.where('[tabela+obra_id]').equals(['doc_documentos', OBRA]).count()) > 0) return
  const agora = new Date().toISOString()
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: agora, apagado: false }
  const linhas: Array<{ tabela: string; linha: Record<string, unknown> & { id: string } }> = []
  for (const d of DOCS) {
    const bytes = bytesDe(d.n)
    const arquivoId = uuid('f0000000', d.n)
    linhas.push({ tabela: 'arquivos', linha: { ...base, id: arquivoId, caminho: caminhoDe(d.n), nome_original: `${d.codigo}_rev${d.revisao}.pdf`, hash: await sha256Hex(bytes), tamanho: bytes.byteLength, tipo: 'application/pdf' } })
    linhas.push({
      tabela: 'doc_documentos',
      linha: { ...base, id: uuid('d0000000', d.n), escopo: d.escopo, categoria: d.categoria, codigo: d.codigo, titulo: d.titulo, revisao: d.revisao, data_revisao: '2026-11-10', validade: null, responsavel: 'Engenheiro da obra', situacao: 'vigente', arquivo_id: arquivoId, observacao: null, substitui_id: null, cancelado: false },
    })
  }
  await banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: OBRA, linha: l.linha as never, pendente: 0 as const })))
}

// o "servidor": responde pelo caminho, devagar o bastante para ver o "Baixando 1 de 2…"
trocarBaixador(async (caminho) => {
  await new Promise((r) => setTimeout(r, 300))
  const d = DOCS.find((x) => caminhoDe(x.n) === caminho)
  return d ? bytesDe(d.n) : null
})

semear().then(() => {
  history.replaceState({ tela: 'documentos' }, '')
  render(<DocumentosSobDemanda usuario={usuario} obra={obra} aoSair={() => location.reload()} aoPerderObra={() => {}} />, document.getElementById('app')!)
})
