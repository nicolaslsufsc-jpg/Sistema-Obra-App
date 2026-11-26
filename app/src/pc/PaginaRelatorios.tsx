// Central de relatórios (versão PC): uma aba por módulo, os mesmos filtros em todas (pavimento e
// período), uma prévia em tabela larga e os botões que geram o arquivo. Usa as exportações que já
// existem: a folha do "Exportar PDF" (folha_pdf.ts), a FVS (pdf.ts e a planilha da situação), a planilha
// de controle do Concreto e a ficha de entrega do Projetos. Nada aqui grava na obra.
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import type { Linha } from '../nucleo/banco_local'
import { sincronizador } from '../nucleo/servicos'
import { BotaoExportarPdf } from '../telas/ExportarPdf'
import type { FolhaPdf } from '../telas/folha_pdf'
import { LinhaResumo, Tabela, type ColunaTabela } from '../telas/Tabela'
import { reprovacoesDaObra, situacaoDaObra } from '../fvs/dados'
import { folhaDaFvs } from '../fvs/pdf'
import { baixarTexto, planilhaDaSituacao, type LinhaDaSituacao } from '../fvs/planilha'
import { linhasDaPlanilha, preencherModelo, LAYOUT_PADRAO } from '../concreto/planilha_controle'
import { itensDaPlanilha } from '../concreto/planilha_controle_dados'
import { bytesDoModelo, modeloDaObra } from '../concreto/planilha_modelo'
import { LAYOUT_EXE, modeloExe } from '../concreto/modelo_exe'
import { abrirXlsx, montarXlsx } from '../concreto/xlsx'
import { entregasDaObra, eventosDaEntrega, filtrarEntregas, type EntregaAgrupada } from '../projetos/entregas'
import { folhaDoComprovante, imagemDaAssinatura } from '../projetos/assinatura'
import { disciplinasDaFicha, linhasDaFicha, modeloDasLinhas, TABELA_FORMULARIOS, type ModeloFichaEntrega } from '../projetos/ficha_entrega'
import { FichaEntrega, recortarAssinatura } from '../projetos/telas/FichaEntrega'
import type { Documento } from '../documentos/regras'
import { dataBR, type DadosPc } from './dados_pc'
import { noPeriodo, textoDoPeriodo } from './versao_pc'

type Aba = 'fvs' | 'concreto' | 'projetos' | 'documentos'
const ABAS: ReadonlyArray<{ id: Aba; nome: string }> = [
  { id: 'fvs', nome: 'FVS' },
  { id: 'concreto', nome: 'Concreto' },
  { id: 'projetos', nome: 'Projetos' },
  { id: 'documentos', nome: 'Documentos' },
]

interface Filtro {
  pavimento: string
  de: string
  ate: string
}

interface PropsAba {
  dados: DadosPc
  obra: ObraLocal
  usuario: UsuarioLocal
  filtro: Filtro
}

const nomeLimpo = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
const quando = (iso: string | null) => (iso ? `${dataBR(iso)} ${iso.slice(11, 16)}`.trim() : '–')

function baixarXlsx(bytes: Uint8Array<ArrayBuffer>, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function Erro({ texto }: { texto?: string }) {
  return texto ? <p class="pc-msg pc-erro">Não deu para ler este módulo neste aparelho: {texto}</p> : null
}

/** O que os filtros cortam, numa frase (vai no subtítulo do PDF também). */
function textoDoFiltro(f: Filtro): string {
  return `${f.pavimento || 'Todos os pavimentos'} · ${textoDoPeriodo(f.de, f.ate)}`
}

// ---------------------------------------------------------------- FVS
const COLUNAS_FVS: ColunaTabela<LinhaDaSituacao>[] = [
  { titulo: 'Pavimento', valor: (l) => l.pavimento },
  { titulo: 'Tipo', valor: (l) => l.tipo },
  { titulo: 'Peça', valor: (l) => (l.secao ? `${l.peca} (${l.secao})` : l.peca) },
  { titulo: 'Ficha', valor: (l) => l.ficha },
  { titulo: 'Situação', valor: (l) => l.situacao },
  { titulo: 'C', valor: (l) => l.a, numero: true },
  { titulo: 'NC', valor: (l) => l.r, numero: true },
  { titulo: 'NA', valor: (l) => l.na, numero: true },
  { titulo: 'Vazios', valor: (l) => l.vazios, numero: true },
  { titulo: '% conf.', valor: (l) => (l.conforme === null ? null : `${l.conforme}%`), numero: true },
  { titulo: 'Última marcação', valor: (l) => quando(l.ultima), numero: true },
  { titulo: 'Quem', valor: (l) => l.quem },
]

function AbaFvs({ dados, obra, usuario, filtro }: PropsAba) {
  const f = dados.fvs
  const todas = useMemo(() => (f ? situacaoDaObra(f) : []), [f])
  const reprovacoes = useMemo(() => (f ? reprovacoesDaObra(f) : []), [f])
  if (!f) return <Erro texto={dados.erros.fvs ?? 'sem dados'} />
  const pavId = f.pavimentos.find((p) => p.nome === filtro.pavimento)?.id
  const comPeriodo = !!(filtro.de || filtro.ate)
  const linhas = todas.filter((l) => (!filtro.pavimento || l.pavimento === filtro.pavimento) && (!comPeriodo || noPeriodo(l.ultima, filtro.de, filtro.ate)))
  const ncs = reprovacoes.filter((r) => (!pavId || r.pavimentoId === pavId) && (!comPeriodo || noPeriodo(r.quando, filtro.de, filtro.ate)))
  const nome = new Map(f.pavimentos.map((p) => [p.id, p.nome]))
  const montar = (): FolhaPdf => ({
    ...folhaDaFvs({ titulo: filtro.pavimento || 'Obra inteira', linhas, reprovacoes: ncs, comPavimento: !filtro.pavimento, nomeDoPavimento: (id) => nome.get(id) ?? '' }),
    sub: textoDoFiltro(filtro),
  })
  return (
    <>
      <LinhaResumo
        testid="pc-fvs-resumo"
        partes={[`${linhas.length} ${linhas.length === 1 ? 'ficha' : 'fichas'}`, `${ncs.filter((r) => r.aberta).length} NCs abertas`, comPeriodo && 'só as fichas marcadas no período']}
      />
      <div class="pc-acoes">
        <BotaoExportarPdf obra={obra} usuario={usuario} montar={montar} rotulo="PDF da FVS (fichas e NCs)" testid="pc-fvs-pdf" desativado={linhas.length === 0} />
        <button
          type="button"
          class="pc-bt"
          data-testid="pc-fvs-csv"
          disabled={linhas.length === 0}
          onClick={() => baixarTexto(`situacao_fvs_${nomeLimpo(obra.codigo)}_${nomeLimpo(filtro.pavimento || 'obra')}.csv`, planilhaDaSituacao(linhas))}
        >
          Planilha da situação (.csv)
        </button>
      </div>
      <p class="pc-nota">A mesma folha e a mesma planilha da tela da FVS, agora com o filtro de pavimento e de período. A prévia mostra até 300 linhas; o arquivo leva todas.</p>
      <Tabela rotulo="Fichas da FVS" testid="pc-fvs-tabela" colunas={COLUNAS_FVS} linhas={linhas.slice(0, 300)} chave={(l) => `${l.pavimento}|${l.peca}|${l.ficha}|${l.secao}`} />
    </>
  )
}

// ---------------------------------------------------------------- Concreto
function AbaConcreto({ dados, obra, usuario, filtro }: PropsAba) {
  const c = dados.concreto
  const [modelo, setModelo] = useState<Linha | null>(null)
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null)
  useEffect(() => {
    sincronizador
      .linhas('arquivos', obra.id)
      .then((a) => setModelo(modeloDaObra(a)))
      .catch(() => setModelo(null))
  }, [obra.id])
  if (!c) return <Erro texto={dados.erros.concreto ?? 'sem dados'} />
  const nomePav = new Map(c.pavimentos.map((p) => [p.id, p.nome]))
  const passa = (data: string, pavimento: string) => (!filtro.pavimento || pavimento === filtro.pavimento) && noPeriodo(data, filtro.de, filtro.ate)
  const itens = itensDaPlanilha(c).filter((i) => passa(i.concretagem.data, i.concretagem.pavimento))
  const concretagens = c.concretagens.filter((x) => passa(x.data, nomePav.get(x.pavimento_id) ?? '')).sort((a, b) => a.data.localeCompare(b.data))
  const linhas = concretagens.map((x) => {
    const cams = c.caminhoesDe.get(x.raiz) ?? []
    return {
      chave: x.raiz,
      data: x.data,
      pavimento: nomePav.get(x.pavimento_id) ?? '',
      local: x.local_descricao + (x.exemplo ? ' (exemplo)' : ''),
      fck: x.fck_mpa,
      caminhoes: cams.length,
      volume: cams.reduce((s, k) => s + (k.volume_m3 ?? 0), 0),
      fornecedor: x.fornecedor ?? '',
    }
  })
  type L = (typeof linhas)[number]
  const colunas: ColunaTabela<L>[] = [
    { titulo: 'Data', valor: (l) => dataBR(l.data), numero: true },
    { titulo: 'Pavimento', valor: (l) => l.pavimento },
    { titulo: 'Local', valor: (l) => l.local },
    { titulo: 'Fornecedor', valor: (l) => l.fornecedor || null },
    { titulo: 'fck (MPa)', valor: (l) => l.fck, numero: true },
    { titulo: 'Caminhões', valor: (l) => l.caminhoes, numero: true },
    { titulo: 'Volume (m³)', valor: (l) => l.volume, numero: true, casas: 1 },
  ]
  const caminhoesNaPlanilha = itens.reduce((s, i) => s + i.caminhoes.length, 0)
  const gerar = async () => {
    setMsg(null)
    try {
      const daObra = !!modelo
      const arquivos = daObra ? await abrirXlsx(await bytesDoModelo(modelo!)) : modeloExe()
      const layout = daObra ? LAYOUT_PADRAO : LAYOUT_EXE
      const r = preencherModelo(arquivos, linhasDaPlanilha(itens, layout), layout)
      baixarXlsx(montarXlsx(arquivos), `planilha_controle_${nomeLimpo(obra.codigo)}_${nomeLimpo(filtro.pavimento || 'obra')}.xlsx`)
      setMsg({ erro: false, texto: `Planilha gerada ${daObra ? 'no modelo da obra' : 'no modelo de exemplo (a obra ainda não tem modelo guardado)'}: ${r.linhas} ${r.linhas === 1 ? 'caminhão' : 'caminhões'}.` })
    } catch (e) {
      setMsg({ erro: true, texto: e instanceof Error ? e.message : String(e) })
    }
  }
  const montar = (): FolhaPdf => ({
    modulo: 'Concreto',
    titulo: 'Concretagens',
    sub: textoDoFiltro(filtro),
    resumo: [`${linhas.length} concretagens`, `${linhas.reduce((s, l) => s + l.caminhoes, 0)} caminhões`, `${linhas.reduce((s, l) => s + l.volume, 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m³`],
    tabelas: [
      {
        colunas: colunas.map((k) => k.titulo),
        curtas: [0, 4, 5, 6],
        linhas: linhas.map((l) => [dataBR(l.data), l.pavimento, l.local, l.fornecedor, l.fck, l.caminhoes, l.volume.toLocaleString('pt-BR', { maximumFractionDigits: 1 })]),
        vazio: 'Nenhuma concretagem com estes filtros.',
      },
    ],
  })
  return (
    <>
      <LinhaResumo testid="pc-concreto-resumo" partes={[`${linhas.length} concretagens`, `${caminhoesNaPlanilha} caminhões na planilha`]} />
      <div class="pc-acoes">
        <button type="button" class="pc-bt pc-principal" data-testid="pc-concreto-planilha" onClick={gerar}>
          Planilha de controle (.xlsx)
        </button>
        <BotaoExportarPdf obra={obra} usuario={usuario} montar={montar} rotulo="PDF das concretagens" testid="pc-concreto-pdf" />
      </div>
      <p class="pc-nota">
        {modelo ? 'A planilha sai no modelo guardado da obra.' : 'A obra ainda não tem modelo de planilha guardado: sai no modelo de exemplo. O modelo se guarda no Concreto › Planilha de controle.'} A concretagem de exemplo da apresentação não
        entra na planilha.
      </p>
      {msg && (
        <p class={`pc-msg${msg.erro ? ' pc-erro' : ''}`} role={msg.erro ? 'alert' : 'status'}>
          {msg.texto}
        </p>
      )}
      <Tabela rotulo="Concretagens" testid="pc-concreto-tabela" colunas={colunas} linhas={linhas} chave={(l) => l.chave} />
      {linhas.length === 0 && <p class="pc-nota">Nenhuma concretagem {filtro.pavimento || filtro.de || filtro.ate ? 'com estes filtros' : 'registrada neste aparelho'}.</p>}
    </>
  )
}

// ---------------------------------------------------------------- Projetos
function AbaProjetos({ dados, obra, usuario, filtro }: PropsAba) {
  const p = dados.projetos
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [modelo, setModelo] = useState<ModeloFichaEntrega | null>(null)
  useEffect(() => {
    sincronizador
      .linhas(TABELA_FORMULARIOS, obra.id)
      .then((l) => setModelo(modeloDasLinhas(l)))
      .catch(() => setModelo(null))
  }, [obra.id])
  if (!p) return <Erro texto={dados.erros.projetos ?? 'sem dados'} />
  const entregas = filtrarEntregas(entregasDaObra(p), { de: filtro.de || undefined, ate: filtro.ate || undefined })
  const colunas: ColunaTabela<EntregaAgrupada>[] = [
    { titulo: 'Dia', valor: (e) => dataBR(e.dia), numero: true },
    { titulo: 'Empresa', valor: (e) => e.empresa || null },
    { titulo: 'Quem retirou', valor: (e) => e.colaborador || null },
    { titulo: 'Pranchas', valor: (e) => e.pranchas, numero: true },
    { titulo: 'Cópias', valor: (e) => e.copias, numero: true },
    { titulo: 'Devolvidas', valor: (e) => e.devolvidas, numero: true },
    { titulo: 'Assinada', valor: (e) => (e.assinaturaId ? 'sim' : 'não') },
  ]
  const sel = entregas.find((e) => e.chave === escolhida) ?? null
  const fichaDaEntrega = async (e: EntregaAgrupada): Promise<FolhaPdf> => {
    const linhas = eventosDaEntrega(p, e.chave)
    const imagem = e.assinaturaId ? await imagemDaAssinatura(obra.id, e.assinaturaId) : null
    if (!modelo) return folhaDoComprovante(p, linhas, imagem)
    const pranchas = linhas.flatMap((l) => {
      const doc = p.documentoPorId.get(String(l.documento_id))
      return doc ? [doc] : []
    })
    const { marcadas, outros } = disciplinasDaFicha(modelo, pranchas)
    return {
      modulo: 'Projetos',
      titulo: `${modelo.referencia || 'Ficha'} entrega`,
      tabelas: [],
      deitada: true,
      propria: <FichaEntrega modelo={modelo} obra={obra.nome} linhas={linhasDaFicha(p, linhas)} marcadas={marcadas} outros={outros} assinatura={await recortarAssinatura(imagem)} />,
    }
  }
  const todasNoPeriodo = (): FolhaPdf => {
    const linhas = linhasDaFicha(p, entregas.flatMap((e) => eventosDaEntrega(p, e.chave)))
    return {
      modulo: 'Projetos',
      titulo: 'Entregas de cópias',
      sub: textoDoPeriodo(filtro.de, filtro.ate),
      resumo: [`${entregas.length} entregas`, `${entregas.reduce((s, e) => s + e.copias, 0)} cópias`],
      deitada: true,
      tabelas: [
        {
          colunas: ['Código', 'Descrição', 'Revisão', 'Cópias', 'Data', 'Empresa', 'Quem retirou'],
          curtas: [2, 3, 4],
          linhas: linhas.map((l) => [l.codigo, l.descricao, l.versao, l.copias, l.data, l.empreiteira, l.nome]),
          vazio: 'Nenhuma entrega no período.',
        },
      ],
    }
  }
  return (
    <>
      <LinhaResumo testid="pc-projetos-resumo" partes={[`${entregas.length} entregas`, filtro.pavimento && 'o pavimento não vale aqui: as entregas são por prancha']} />
      <div class="pc-acoes">
        <BotaoExportarPdf obra={obra} usuario={usuario} montar={todasNoPeriodo} rotulo="PDF das entregas do período" testid="pc-projetos-pdf" desativado={entregas.length === 0} />
        <BotaoExportarPdf
          obra={obra}
          usuario={usuario}
          montar={() => fichaDaEntrega(sel!)}
          rotulo={sel ? `${modelo ? `Ficha ${modelo.referencia || 'de entrega'}` : 'Comprovante'} da entrega escolhida` : 'Escolha uma entrega na tabela'}
          testid="pc-projetos-ficha"
          desativado={!sel}
        />
      </div>
      <p class="pc-nota">{modelo ? 'A ficha sai no formulário da obra, como na tela de Entregas.' : 'A obra não tem formulário de ficha de entrega: sai o comprovante de sempre.'} Clique numa linha para escolher a entrega.</p>
      <Tabela rotulo="Entregas de cópias" testid="pc-projetos-tabela" colunas={colunas} linhas={entregas} chave={(e) => e.chave} aoTocar={(e) => setEscolhida(e.chave)} selecionada={escolhida} />
      {entregas.length === 0 && <p class="pc-nota">Nenhuma entrega registrada {filtro.de || filtro.ate ? 'neste período' : 'neste aparelho'}.</p>}
    </>
  )
}

// ---------------------------------------------------------------- Documentos
function AbaDocumentos({ dados, obra, usuario, filtro }: PropsAba) {
  const d = dados.documentos
  if (!d) return <Erro texto={dados.erros.documentos ?? 'sem dados'} />
  const docs = d.documentos.filter((x) => noPeriodo(x.atual.data_revisao, filtro.de, filtro.ate))
  const colunas: ColunaTabela<Documento>[] = [
    { titulo: 'Código', valor: (x) => x.codigo },
    { titulo: 'Título', valor: (x) => x.atual.titulo + (x.exemplo ? ' (exemplo)' : '') },
    { titulo: 'Categoria', valor: (x) => x.categoria },
    { titulo: 'Revisão', valor: (x) => x.atual.revisao },
    { titulo: 'Data da revisão', valor: (x) => dataBR(x.atual.data_revisao), numero: true },
    { titulo: 'Validade', valor: (x) => (x.atual.validade ? dataBR(x.atual.validade) : null), numero: true },
    { titulo: 'Situação', valor: (x) => x.atual.situacao },
    { titulo: 'Arquivo', valor: (x) => (x.atual.arquivo_id ? 'sim' : 'não') },
  ]
  const montar = (): FolhaPdf => ({
    modulo: 'Documentos',
    titulo: 'Lista mestra',
    sub: `Revisões ${textoDoPeriodo(filtro.de, filtro.ate)}`,
    deitada: true,
    resumo: [`${docs.length} documentos`],
    tabelas: [{ colunas: colunas.map((k) => k.titulo), curtas: [3, 4, 5, 7], linhas: docs.map((x) => colunas.map((k) => String(k.valor(x) ?? ''))), vazio: 'Nenhum documento com estes filtros.' }],
  })
  return (
    <>
      <LinhaResumo testid="pc-documentos-resumo" partes={[`${docs.length} documentos`, filtro.pavimento && 'o pavimento não vale aqui']} />
      <div class="pc-acoes">
        <BotaoExportarPdf obra={obra} usuario={usuario} montar={montar} rotulo="PDF da lista mestra" testid="pc-documentos-pdf" desativado={docs.length === 0} />
      </div>
      <p class="pc-nota">O período filtra pela data da revisão em vigor. A impressão própria da lista mestra continua no módulo Documentos.</p>
      <Tabela rotulo="Lista mestra" testid="pc-documentos-tabela" colunas={colunas} linhas={docs} chave={(x) => x.chave} />
      {docs.length === 0 && <p class="pc-nota">Nenhum documento {filtro.de || filtro.ate ? 'com revisão neste período' : 'na lista mestra neste aparelho'}.</p>}
    </>
  )
}

// ---------------------------------------------------------------- página
export function PaginaRelatorios({ dados, obra, usuario }: { dados: DadosPc; obra: ObraLocal; usuario: UsuarioLocal }) {
  const [aba, setAba] = useState<Aba>('fvs')
  const [filtro, setFiltro] = useState<Filtro>({ pavimento: '', de: '', ate: '' })
  // pavimentos da FVS e do Concreto, na ordem da obra, sem repetir
  const pavimentos = useMemo(() => {
    const vistos = new Set<string>()
    const lista = [...(dados.fvs?.pavimentos ?? []), ...(dados.concreto?.pavimentos ?? [])].sort((a, b) => a.ordem - b.ordem)
    return lista.map((p) => p.nome).filter((n) => !vistos.has(n) && !!vistos.add(n))
  }, [dados])
  const props = { dados, obra, usuario, filtro }
  const periodoErrado = !!(filtro.de && filtro.ate && filtro.de > filtro.ate)
  return (
    <main class="tela pc-pagina" data-testid="pc-pagina-relatorios">
      <div class="pc-titulo">
        <h1>Relatórios</h1>
        <p>Escolha o módulo, filtre e gere o PDF ou a planilha. Funciona sem internet, com o que está neste aparelho.</p>
      </div>
      <div class="pc-abas" role="tablist" aria-label="Módulo do relatório">
        {ABAS.map((a) => (
          <button type="button" role="tab" key={a.id} class="pc-aba" aria-selected={aba === a.id} data-testid={`pc-aba-${a.id}`} onClick={() => setAba(a.id)}>
            {a.nome}
          </button>
        ))}
      </div>
      <div class="pc-filtros">
        <label>
          Pavimento
          <select value={filtro.pavimento} data-testid="pc-filtro-pavimento" onChange={(e) => setFiltro({ ...filtro, pavimento: (e.target as HTMLSelectElement).value })}>
            <option value="">Todos</option>
            {pavimentos.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input type="date" value={filtro.de} data-testid="pc-filtro-de" onInput={(e) => setFiltro({ ...filtro, de: (e.target as HTMLInputElement).value })} />
        </label>
        <label>
          Até
          <input type="date" value={filtro.ate} data-testid="pc-filtro-ate" onInput={(e) => setFiltro({ ...filtro, ate: (e.target as HTMLInputElement).value })} />
        </label>
        {(filtro.pavimento || filtro.de || filtro.ate) && (
          <button type="button" class="pc-bt" onClick={() => setFiltro({ pavimento: '', de: '', ate: '' })}>
            Limpar filtros
          </button>
        )}
      </div>
      {periodoErrado && (
        <p class="pc-msg pc-erro" role="alert">
          A data "De" está depois da data "Até": nada vai aparecer.
        </p>
      )}
      <div role="tabpanel" data-testid={`pc-painel-${aba}`}>
        {aba === 'fvs' && <AbaFvs {...props} />}
        {aba === 'concreto' && <AbaConcreto {...props} />}
        {aba === 'projetos' && <AbaProjetos {...props} />}
        {aba === 'documentos' && <AbaDocumentos {...props} />}
      </div>
    </main>
  )
}
