// Exemplos fictícios do módulo Documentos (Construtora Exemplo, obra EXE), para a apresentação.
// Entram uma vez por obra, como registros já baixados (pendente 0): não vão para a fila nem para o
// arquivo .obra, igual aos exemplos do Diário. Cada documento leva um PDF de uma página escrito
// aqui mesmo, com "DOCUMENTO DE EXEMPLO". Para refazer: apagar a chave `exemplos_documentos:<obra>`
// da tabela `meta` do banco do navegador.
import type { BancoLocal } from '../nucleo/banco_local'
import type { ObraLocal } from '../nucleo/conta'
import { USUARIO_DO_PACOTE, uuidDeterministico } from '../nucleo/pacote_obra'
import { diasAntes } from '../relatorios/regras'
import type { Escopo } from './categorias'
import { TABELA_DOCUMENTOS } from './regras'

const chaveExemplos = (obraId: string) => `exemplos_documentos:${obraId}`
const DISPOSITIVO = '00000000-0000-0000-0000-000000000000'

/** Só ASCII imprimível no PDF (a fonte padrão não tem acento): troca os acentos. */
function paraPdf(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '-')
    .replace(/([\\()])/g, '\\$1')
}

/** Um PDF de uma página (A4) com as linhas de texto. */
export function pdfDeExemplo(linhas: readonly string[]): Uint8Array {
  const texto = ['BT', '/F1 22 Tf', '60 770 Td', `(${paraPdf(linhas[0] ?? '')}) Tj`, '/F1 13 Tf', '0 -34 Td']
  for (const l of linhas.slice(1)) texto.push(`(${paraPdf(l)}) Tj`, '0 -22 Td')
  texto.push('ET', '0.85 0.2 0.2 RG 4 w 50 60 m 545 60 l S')
  const fluxo = texto.join('\n')
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const posicoes: number[] = []
  objetos.forEach((o, i) => {
    posicoes.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
  for (const p of posicoes) pdf += `${String(p).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

interface Exemplo {
  escopo: Escopo
  categoria: string
  codigo: string
  titulo: string
  revisao: string
  /** dias antes de hoje */
  feito: number
  /** dias depois de hoje (negativo = já venceu); null = não vence */
  vence: number | null
  responsavel: string
  situacao?: 'em_revisao'
  observacao?: string
}

const EXEMPLOS: readonly Exemplo[] = [
  { escopo: 'empresa', categoria: 'sistema', codigo: 'EXE-MQ', titulo: 'Manual da Qualidade', revisao: '03', feito: 270, vence: null, responsavel: 'Coordenação da Qualidade' },
  { escopo: 'empresa', categoria: 'sistema', codigo: 'EXE-POL', titulo: 'Política da qualidade', revisao: '01', feito: 400, vence: null, responsavel: 'Diretoria' },
  { escopo: 'empresa', categoria: 'sistema', codigo: 'EXE-OBJ', titulo: 'Objetivos e indicadores da qualidade', revisao: '02', feito: 300, vence: 52, responsavel: 'Diretoria' },
  { escopo: 'empresa', categoria: 'procedimentos', codigo: 'EXE-PS-01', titulo: 'Controle de documentos e registros', revisao: '01', feito: 500, vence: null, responsavel: 'Coordenação da Qualidade' },
  { escopo: 'empresa', categoria: 'procedimentos', codigo: 'EXE-PS-01', titulo: 'Controle de documentos e registros', revisao: '02', feito: 120, vence: null, responsavel: 'Coordenação da Qualidade', observacao: 'Inclui a lista mestra do aplicativo.' },
  { escopo: 'empresa', categoria: 'procedimentos', codigo: 'EXE-PS-03', titulo: 'Não conformidade e ação corretiva', revisao: '00', feito: 200, vence: null, responsavel: 'Coordenação da Qualidade', situacao: 'em_revisao' },
  { escopo: 'empresa', categoria: 'pes', codigo: 'EXE-PES-01', titulo: 'Execução de alvenaria de vedação', revisao: '02', feito: 180, vence: null, responsavel: 'Engenharia' },
  { escopo: 'empresa', categoria: 'pes', codigo: 'EXE-PES-05', titulo: 'Fôrma, armação e concretagem de pilares', revisao: '01', feito: 160, vence: null, responsavel: 'Engenharia' },
  { escopo: 'empresa', categoria: 'fvs', codigo: 'EXE-FVS-05', titulo: 'Verificação de pilares', revisao: '01', feito: 160, vence: null, responsavel: 'Engenharia' },
  { escopo: 'empresa', categoria: 'fornecedores', codigo: 'EXE-FOR-01', titulo: 'Avaliação de fornecedores 2026', revisao: '00', feito: 340, vence: 20, responsavel: 'Suprimentos' },
  { escopo: 'obra', categoria: 'pqo', codigo: 'EXE-PQO', titulo: 'Plano da Qualidade da Obra Exemplo', revisao: '01', feito: 90, vence: null, responsavel: 'Engenheiro da obra' },
  { escopo: 'obra', categoria: 'controle_tecnologico', codigo: 'EXE-PCT', titulo: 'Plano de controle tecnológico', revisao: '00', feito: 95, vence: null, responsavel: 'Engenheiro da obra' },
  { escopo: 'obra', categoria: 'equipamentos', codigo: 'EXE-CAL-TR01', titulo: 'Certificado de calibração · trena 5 m', revisao: '00', feito: 380, vence: -15, responsavel: 'Mestre de obras' },
  { escopo: 'obra', categoria: 'equipamentos', codigo: 'EXE-CAL-NV01', titulo: 'Certificado de calibração · nível a laser', revisao: '00', feito: 160, vence: 205, responsavel: 'Mestre de obras' },
  { escopo: 'obra', categoria: 'pessoas', codigo: 'EXE-TRE-01', titulo: 'Lista de presença · treinamento do PES-05', revisao: '00', feito: 150, vence: null, responsavel: 'Engenheiro da obra' },
  { escopo: 'obra', categoria: 'outros', codigo: 'EXE-ART-01', titulo: 'ART de execução', revisao: '00', feito: 110, vence: null, responsavel: 'Responsável técnico' },
  { escopo: 'obra', categoria: 'outros', codigo: 'EXE-ALV', titulo: 'Alvará de construção', revisao: '00', feito: 120, vence: 420, responsavel: 'Escritório' },
]

const depois = (hoje: string, n: number) => diasAntes(hoje, -n)

const uidDoExemplo = (obraId: string, chave: string) => uuidDeterministico(`${obraId}:exemplo-doc:${chave}`)
const chaveDoExemplo = (e: Exemplo) => `${e.escopo}:${e.codigo}:${e.revisao}`

/**
 * Ids dos documentos de exemplo desta obra. Os semeados antes de 09/11/2026 não têm a coluna `exemplo`:
 * são reconhecidos pelo id, derivado do mesmo jeito.
 */
export async function idsDosExemplos(obraId: string): Promise<Set<string>> {
  return new Set(await Promise.all(EXEMPLOS.map((e) => uidDoExemplo(obraId, `doc:${chaveDoExemplo(e)}`))))
}

/**
 * Tira os exemplos da obra (e os PDFs deles) e não semeia de novo. O que alguém fez aqui sobre um exemplo
 * (revisão nova, "em revisão") fica: já é registro da pessoa. Devolve quantos documentos saíram.
 */
export async function tirarExemplos(banco: BancoLocal, obraId: string): Promise<number> {
  const docs = await idsDosExemplos(obraId)
  const arquivos = new Set(await Promise.all(EXEMPLOS.map((e) => uidDoExemplo(obraId, `arquivo:${chaveDoExemplo(e)}`))))
  let saiu = 0
  await banco.transaction('rw', banco.registros, banco.conteudos, banco.meta, async () => {
    for (const id of docs) {
      const r = await banco.registros.get([TABELA_DOCUMENTOS, id])
      if (r && r.pendente === 0) {
        await banco.registros.delete([TABELA_DOCUMENTOS, id])
        saiu++
      }
    }
    for (const id of arquivos) {
      await banco.registros.delete(['arquivos', id])
      await banco.conteudos.delete(id)
    }
    await banco.gravarMeta(chaveExemplos(obraId), true)
  })
  return saiu
}

/**
 * Semeia os exemplos (uma vez por obra) e só em obra sem nenhum documento: numa obra que já tem os seus,
 * exemplo só atrapalha. Devolve quantos documentos entraram (0 = já havia ou a obra tem documentos).
 */
export async function semearExemplos(banco: BancoLocal, obra: ObraLocal, hoje: string): Promise<number> {
  // Obra montada pela Nova obra é obra de verdade: sem exemplos (mesma regra do #57 no Relatórios).
  // A origem vem do indice.json e o núcleo guarda na meta do pacote (nucleo/pacote_obra.ts). Se o
  // aparelho já tinha semeado antes desta regra, os exemplos saem (o que a pessoa fez sobre eles fica).
  const doPacote = await banco.lerMeta<{ origem?: string | null }>(`pacote_obra:${obra.id}`)
  if (doPacote?.origem === 'nova_obra') {
    await tirarExemplos(banco, obra.id)
    return 0
  }
  if (await banco.lerMeta<boolean>(chaveExemplos(obra.id))) return 0
  if ((await banco.registros.where('[tabela+obra_id]').equals([TABELA_DOCUMENTOS, obra.id]).count()) > 0) {
    await banco.gravarMeta(chaveExemplos(obra.id), true)
    return 0
  }
  const uid = (chave: string) => uidDoExemplo(obra.id, chave)
  const registros: Array<{ tabela: string; id: string; linha: Record<string, unknown> }> = []
  const conteudos: Array<{ id: string; bytes: ArrayBuffer }> = []
  for (const e of EXEMPLOS) {
    const data = diasAntes(hoje, e.feito)
    const criado = new Date(`${data}T10:00:00-03:00`).toISOString()
    const chave = chaveDoExemplo(e)
    const arquivoId = await uid(`arquivo:${chave}`)
    const pdf = pdfDeExemplo([
      'DOCUMENTO DE EXEMPLO',
      `${e.codigo}  rev. ${e.revisao}`,
      e.titulo,
      `Construtora Exemplo · ${e.escopo === 'obra' ? 'Obra Exemplo (EXE)' : 'todas as obras'}`,
      `Data da revisao: ${data.split('-').reverse().join('/')}`,
      `Responsavel: ${e.responsavel}`,
      '',
      'Arquivo ficticio, gerado pelo aplicativo para a demonstracao.',
    ])
    const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
    conteudos.push({ id: arquivoId, bytes })
    const comuns = { obra_id: obra.id, usuario_id: USUARIO_DO_PACOTE, dispositivo_id: DISPOSITIVO, criado_em_dispositivo: criado, apagado: false }
    registros.push({
      tabela: 'arquivos',
      id: arquivoId,
      linha: { id: arquivoId, ...comuns, caminho: `${obra.id}/documentos/${arquivoId}.pdf`, nome_original: `${e.codigo}_rev${e.revisao}.pdf`, hash: '0'.repeat(64), tamanho: pdf.byteLength, tipo: 'application/pdf' },
    })
    const id = await uid(`doc:${chave}`)
    registros.push({
      tabela: TABELA_DOCUMENTOS,
      id,
      linha: {
        id,
        ...comuns,
        escopo: e.escopo,
        categoria: e.categoria,
        codigo: e.codigo,
        titulo: e.titulo,
        revisao: e.revisao,
        data_revisao: data,
        validade: e.vence === null ? null : depois(hoje, e.vence),
        responsavel: e.responsavel,
        situacao: e.situacao ?? 'vigente',
        arquivo_id: arquivoId,
        observacao: e.observacao ?? null,
        substitui_id: null,
        cancelado: false,
        exemplo: true,
      },
    })
  }
  await banco.transaction('rw', banco.registros, banco.conteudos, banco.meta, async () => {
    if (await banco.lerMeta<boolean>(chaveExemplos(obra.id))) return
    for (const r of registros) {
      if (await banco.registros.get([r.tabela, r.id])) continue
      await banco.registros.put({ tabela: r.tabela, id: r.id, obra_id: obra.id, linha: r.linha as never, pendente: 0 })
    }
    for (const c of conteudos) await banco.conteudos.put(c)
    await banco.gravarMeta(chaveExemplos(obra.id), true)
  })
  return EXEMPLOS.length
}
