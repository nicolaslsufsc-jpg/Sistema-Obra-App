// Painel das cópias em campo (protótipo aprovado pelo Nicolas em 14/11/2026).
// Lê a base importada (lista vigente + distribuição), cruza no aparelho e mostra: em dia, desatualizadas,
// conferir, faixas de atraso, barras por empresa e por disciplina e as listas.
import { useState } from 'preact/hooks'
import { importarBase, type BaseProjetos } from '../base'
import { chaveNumero, ErroDeArquivo, FAIXAS, rotuloRev, type Barra, type CopiaCruzada, type Resumo, type Vigente, rotuloDaCopia } from '../painel'
import type { ResumoEscritorio } from '../edicoes'
import type { GrupoAEntregar } from '../distribuicao'
import { CabecalhoBase, tocavel, usarBase } from './baseComum'
import { podeGerir } from '../dados'
import type { Contexto } from './ModuloProjetos'
import { COLUNAS_RESUMO, dataBR, plural, type LinhaResumoObra } from './comum'
import { LinhaResumo, Tabela } from '../../telas/Tabela'
import { alvoDe } from './TelaPranchaBase'
import { escritorioDasFolhas, situacaoFicha, SITUACOES_FICHA } from '../canteiro'
import { fichaV2Xlsx, nomeFichaV2 } from '../ficha_v2'
import type { RegistroEscritorio } from '../edicoes'
import { baixarBlob } from '../../nucleo/baixar'
import { frasesAgora, oQueFazerAgora } from '../agora'
import { QuadroSituacao } from './QuadroSituacao'
import { Ajuda } from '../../telas/Ajuda'
import { Icone } from '../../telas/icones'
import { BotaoArquivo } from '../../telas/BotaoArquivo'

const LIMITE = 40

export function TelaPainel({ ctx, aoSair, importar }: { ctx: Contexto; aoSair: () => void; importar?: boolean }) {
  const { ir, trocar } = ctx
  const { base, setBase, resumo, escritorio, regras, pendentes, cruzadas, corrigida, fonteVigente, vigServidor, escondidas, retiradas } = usarBase(ctx)

  if (base === undefined) return <main class="tela">Carregando…</main>
  const mostrarImportar = importar || !resumo

  return (
    <main class="tela pj-painel">
      <CabecalhoBase ctx={ctx} aba={mostrarImportar ? 'importar' : 'painel'} aoSair={aoSair} base={base} temCruzamento={!!resumo} />
      {mostrarImportar ? (
        <Importar
          ctx={ctx}
          base={base}
          vigenteDoServidor={!!vigServidor}
          aoImportar={(b) => {
            setBase(b)
            trocar({ nome: 'painel' })
          }}
        />
      ) : (
        resumo &&
        escritorio &&
        cruzadas &&
        corrigida && (
          <>
            {escondidas > 0 && (
              <p class="pj-aviso-base discreto" data-testid="painel-retiradas">
                {plural(escondidas, 'cópia em campo não aparece', 'cópias em campo não aparecem')} aqui: {retiradas.size === 1 ? 'são de uma pasta' : `são de ${retiradas.size} pastas`} do Autodoc
                com todas as pranchas obsoletas (pasta retirada da obra). Nada foi apagado.
              </p>
            )}
            <Canteiro ctx={ctx} cruzadas={cruzadas} vigentes={corrigida.vigentes} escritorio={corrigida.escritorio} fonteVigente={fonteVigente} />
            <Painel resumo={resumo} escritorio={escritorio} ir={ir} trocar={trocar} temLista={regras.some((r) => r.ativo)} pendentes={pendentes ?? []} cruzadas={cruzadas} documentos={ctx.dados.documentos} />
          </>
        )
      )}
    </main>
  )
}

function Painel({
  resumo: r,
  escritorio: esc,
  ir,
  trocar,
  temLista,
  pendentes,
  cruzadas,
  documentos,
}: {
  resumo: Resumo
  escritorio: ResumoEscritorio
  ir: Contexto['ir']
  trocar: Contexto['trocar']
  temLista: boolean
  pendentes: GrupoAEntregar[]
  cruzadas: CopiaCruzada[]
  documentos: Contexto['dados']['documentos']
}) {
  const aEntregar = pendentes.reduce((s, g) => s + g.pendencias.length, 0)
  const agora = oQueFazerAgora(pendentes, cruzadas)
  const rolarPara = (testid: string) => document.querySelector(`[data-testid="${testid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const [todasDes, setTodasDes] = useState(false)
  const [todasConf, setTodasConf] = useState(false)
  const maxFaixa = Math.max(1, ...r.faixas)
  const linhas: LinhaResumoObra[] = [
    { id: 'em-dia', rotulo: 'Em dia', testidRotulo: 'painel-cartao-em-dia', n: r.emDia, nota: `de ${plural(r.emCampo, 'cópia', 'cópias')} em campo`, status: 'liberado', abrir: () => trocar({ nome: 'pranchas-base', filtro: 'canteiro' }) },
    { id: 'desatualizadas', rotulo: 'Desatualizadas', testid: 'painel-desatualizadas', testidRotulo: 'painel-cartao-desatualizadas', n: r.desatualizadas.length, nota: 'recolher e entregar a nova', status: r.desatualizadas.length ? 'nc' : 'liberado', abrir: () => trocar({ nome: 'pranchas-base', filtro: 'trocar' }) },
    { id: 'conferir', rotulo: 'Conferir', testid: 'painel-conferir', n: r.conferir.length, nota: 'não achada, revisão maior, datas', status: r.conferir.length ? 'pendente' : 'liberado', abrir: () => rolarPara('painel-lista-conferir') },
    {
      id: 'escritorio',
      rotulo: 'Escritório desatualizado',
      testid: 'painel-escritorio',
      n: esc.desatualizados.length,
      nota: `pasta sem a vigente${esc.semRegistro ? ` · ${plural(esc.semRegistro, 'folha', 'folhas')} sem registro` : ''}`,
      status: esc.desatualizados.length ? 'nc' : 'liberado',
      abrir: () => trocar({ nome: 'pranchas-base', filtro: 'escritorio' }),
    },
    {
      id: 'a-entregar',
      rotulo: 'A entregar',
      testid: 'painel-a-entregar',
      n: temLista ? aEntregar : '–',
      nota: !temLista ? 'monte a lista de distribuição' : aEntregar ? `para ${plural(pendentes.length, 'pessoa', 'pessoas')} da lista de distribuição` : 'todos da lista com a vigente',
      status: !temLista ? 'sem-dado' : aEntregar ? 'nc' : 'liberado',
      abrir: () => trocar({ nome: temLista ? 'a-entregar' : 'distribuicao' }),
    },
  ]
  return (
    <>
      {/* o resumo do "O que fazer agora" no topo do painel (item C); toque abre a lista */}
      <button type="button" class={`pj-agora-topo ${agora.copias || agora.recolher.length ? 'ruim' : 'bom'}`} onClick={() => trocar({ nome: 'agora' })} data-testid="painel-agora">
        <strong>O que fazer agora:</strong> {frasesAgora(agora)} <Icone id="avancar" />
      </button>
      <QuadroSituacao cruzadas={cruzadas} ir={ir} documentos={documentos} />
      {/* resumo numa linha e tabela no lugar dos cartões (guia de estilo, 23/11/2026); cada linha abre a lista dela (item D) */}
      <LinhaResumo
        testid="painel-linha-resumo"
        partes={[`${r.emDia} em dia`, `${r.desatualizadas.length} desatualizadas`, `${r.conferir.length} a conferir`, temLista ? `${aEntregar} a entregar` : null]}
      />
      <Tabela rotulo="Resumo" testid="painel-resumo" colunas={COLUNAS_RESUMO} linhas={linhas} chave={(l) => l.id} aoTocar={(l) => l.abrir()} />

      <section class="pj-bloco">
        <h2>Há quanto tempo estão desatualizadas</h2>
        <ol class="pj-faixas" data-testid="painel-faixas">
          {FAIXAS.map((f, i) => (
            <li key={f.rotulo} class={r.faixas[i] ? `f${i}` : 'zerada'} title={`${r.faixas[i]} de ${maxFaixa}`}>
              <b>{r.faixas[i]}</b>
              {f.rotulo}
            </li>
          ))}
        </ol>
        <p class="discreto pj-nota">Contado desde a data da revisão vigente. Sem prazo fixo para recolher.</p>
      </section>

      <div class="pj-grade">
        <Barras titulo="Desatualizadas, por empresa" barras={r.porEmpresa} comAtraso />
        <Barras titulo="Desatualizadas, por disciplina" barras={r.porDisciplina} />
      </div>

      <section class="pj-bloco">
        <h2>Desatualizadas, mais antigas primeiro</h2>
        {r.desatualizadas.length === 0 && <p class="discreto">Sem cópias desatualizadas</p>}
        <ul class="pj-lista-painel" data-testid="painel-lista">
          {(todasDes ? r.desatualizadas : r.desatualizadas.slice(0, LIMITE)).map((x) => (
            <LinhaDesatualizada key={x.copia.linha} x={x} abrir={() => ir({ nome: 'prancha-base', ...alvoDe(x) })} />
          ))}
        </ul>
        {!todasDes && r.desatualizadas.length > LIMITE && (
          <button type="button" class="pj-pequeno" onClick={() => setTodasDes(true)}>
            Mostrar todas ({r.desatualizadas.length})
          </button>
        )}
      </section>

      <section class="pj-bloco">
        <h2>
          Conferir <span class="pj-selo conf">{r.conferir.length}</span>
        </h2>
        <ul class="pj-lista-painel" data-testid="painel-lista-conferir">
          {(todasConf ? r.conferir : r.conferir.slice(0, LIMITE)).map((x) => (
            <LinhaConferir key={x.copia.linha} x={x} abrir={() => ir({ nome: 'prancha-base', ...alvoDe(x) })} />
          ))}
        </ul>
        {!todasConf && r.conferir.length > LIMITE && (
          <button type="button" class="pj-pequeno" onClick={() => setTodasConf(true)}>
            Mostrar todas ({r.conferir.length})
          </button>
        )}
      </section>

      <section class="pj-bloco">
        <h2>Escritório desatualizado</h2>
        {esc.desatualizados.length === 0 && (
          <p class="discreto so-com-ajuda">
            {esc.emDia === 0 ? 'Sem pastas do escritório registradas' : 'Todas as pastas registradas estão com a vigente.'}
            {esc.emDia === 0 && <Ajuda>Abra uma prancha e toque em "Atualizar" quando a pasta estiver com a vigente.</Ajuda>}
          </p>
        )}
        <ul class="pj-lista-painel" data-testid="painel-lista-escritorio">
          {esc.desatualizados.map((x) => (
            <li
              key={x.vigente.codigo}
              class="pj-linha-painel pj-tocavel"
              {...tocavel(() => ir({ nome: 'prancha-base', disciplina: x.vigente.disciplina, numero: chaveNumero(x.vigente.de), folha: x.vigente.codigo }))}
            >
              <div>
                <b>{x.vigente.codigo}</b> <span class="discreto">{x.vigente.titulo}</span>
                <br />
                pasta: <span class="pj-rev velha">{rotuloRev(x.registro.fase, x.registro.revisao)}</span> · vigente{' '}
                <span class="pj-rev nova">{rotuloRev(x.vigente.fase, x.vigente.revisao)}</span>
              </div>
              <div class={`pj-dias${x.dias <= 15 ? ' leve' : ''}`}>
                {x.dias} d<small>desde {dataBR(x.vigente.data)}</small>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p class="discreto pj-nota" data-testid="painel-recolhidas">
        {plural(r.recolhidas, 'cópia ficou', 'cópias ficaram')} fora da conta como <span class="pj-selo rec">provavelmente recolhida</span>: a mesma pessoa tem uma cópia mais nova da mesma prancha.
      </p>
    </>
  )
}

/** Controle do canteiro: a Situação de cada cópia como na ficha v2 e o Excel no mesmo formato. */
function Canteiro({
  ctx,
  cruzadas,
  vigentes,
  escritorio,
  fonteVigente,
}: {
  ctx: Contexto
  cruzadas: CopiaCruzada[]
  vigentes: Vigente[]
  escritorio: ReadonlyMap<string, RegistroEscritorio>
  fonteVigente: string
}) {
  const conta = { OK: 0, RECOLHER: 0, DEVOLVIDO: 0, CONFERIR: 0 }
  for (const x of cruzadas) conta[situacaoFicha(x)]++
  const exportar = () => {
    const linhasEsc = escritorioDasFolhas(vigentes, escritorio)
    const bytes = fichaV2Xlsx({ obra: ctx.obra.codigo, hoje: ctx.dados.hoje, fonteVigente, cruzadas, vigentes, escritorio: linhasEsc })
    baixarBlob(nomeFichaV2(ctx.obra.codigo, ctx.dados.hoje), new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  }
  return (
    <section class="pj-bloco" data-testid="painel-canteiro">
      <h2>Controle do canteiro</h2>
      <ul class="pj-situacoes" aria-label="Situação das cópias, como na ficha v2">
        {SITUACOES_FICHA.map((s) => (
          <li key={s} class={`pj-sit-${s.toLowerCase()}`} data-testid={`canteiro-${s.toLowerCase()}`}>
            <b>{conta[s]}</b>
            {s}
          </li>
        ))}
      </ul>
      <p class="discreto pj-nota">Revisão vigente: {fonteVigente}.</p>
      <button type="button" class="pj-pequeno" onClick={exportar} data-testid="exportar-ficha-v2">
        Exportar ficha v2 (.xlsx)
      </button>
    </section>
  )
}

function Barras({ titulo, barras, comAtraso }: { titulo: string; barras: Barra[]; comAtraso?: boolean }) {
  const max = Math.max(1, ...barras.map((b) => b.quantas))
  return (
    <section class="pj-bloco">
      <h2>{titulo}</h2>
      {barras.length === 0 && <p class="discreto">–</p>}
      {barras.map((b) => (
        <div class="pj-barra" key={b.nome}>
          <b>{b.nome}</b>
          <span>
            {b.quantas}
            {comAtraso ? ` · até ${b.maiorAtraso} d` : ''}
          </span>
          <div class="trilho">
            <i class={b.maiorAtraso > 15 ? '' : 'leve'} style={{ width: `${Math.max(3, (b.quantas / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </section>
  )
}

function LinhaDesatualizada({ x, abrir }: { x: CopiaCruzada; abrir: () => void }) {
  const c = x.copia
  const v = x.vigente
  return (
    <li class="pj-linha-painel pj-tocavel" {...tocavel(abrir)}>
      <div>
        <b>
          {c.disciplinaNome} {c.codigo}
        </b>{' '}
        <span class="discreto">{c.titulo}</span>
        <br />
        <span class="pj-rev velha">{rotuloDaCopia(c)}</span> → {v ? <span class="pj-rev nova">{rotuloRev(v.fase, v.revisao)}</span> : <b>recolher: prancha fora de uso</b>}
        {x.loDepois && <span class="discreto"> a LO saiu depois da entrega</span>}
        {v && !x.loDepois && <span class="discreto"> revisão nova</span>}
        <div class="discreto">
          {c.empresa}
          {c.colaborador ? ` · ${c.colaborador}` : ''} · entregue {dataBR(c.entrega)}
        </div>
      </div>
      <div class={`pj-dias${(x.dias ?? 0) <= 15 ? ' leve' : ''}`}>
        {v ? (
          <>
            {x.dias ?? '?'} d<small>desde {dataBR(v.data)}</small>
          </>
        ) : (
          'recolher'
        )}
      </div>
    </li>
  )
}

const TEXTO_MOTIVO: Record<string, string> = {
  'não achada': 'não achada na lista vigente',
  'revisão maior': 'revisão em campo maior que a vigente',
  datas: 'a cópia já diz LO, mas a LO da lista é bem posterior à entrega',
  'mais de uma folha': 'o número tem mais de uma folha e o título não decide',
  'data de entrega': `data de entrega com erro`,
  'revisão ilegível': 'revisão ilegível na planilha',
}

function LinhaConferir({ x, abrir }: { x: CopiaCruzada; abrir: () => void }) {
  const c = x.copia
  return (
    <li class="pj-linha-painel pj-tocavel" {...tocavel(abrir)}>
      <div>
        <b>
          {c.disciplinaNome} {c.codigo}
        </b>{' '}
        <span class="discreto">{c.titulo}</span>
        <br />
        em campo <span class="pj-rev">{rotuloDaCopia(c)}</span>
        {x.vigente && (
          <>
            {' '}
            · vigente <span class="pj-rev">{rotuloRev(x.vigente.fase, x.vigente.revisao)}</span> de {dataBR(x.vigente.data)}
          </>
        )}
        <div class="discreto">
          {c.empresa} · {TEXTO_MOTIVO[x.motivo ?? ''] ?? x.motivo}
          {x.motivo === 'data de entrega' ? ` ("${c.entregaTexto}")` : ''}
        </div>
      </div>
      <span class="pj-selo conf">{x.motivo}</span>
    </li>
  )
}

function Importar({
  ctx,
  base,
  vigenteDoServidor,
  aoImportar,
}: {
  ctx: Contexto
  base: BaseProjetos | null
  vigenteDoServidor: boolean
  aoImportar: (b: BaseProjetos) => void
}) {
  const { obra, avisar } = ctx
  const [vig, setVig] = useState<File | null>(null)
  const [dist, setDist] = useState<File | null>(null)
  const [esc, setEsc] = useState<File | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  if (!podeGerir(obra.papel)) return <p class="pj-vazio">Só o gestor importa a base desta obra.</p>

  const importar = async (e: Event) => {
    e.preventDefault()
    setErro('')
    if (!vig && !dist && !esc) {
      setErro('Escolha pelo menos um arquivo.')
      return
    }
    setSalvando(true)
    try {
      const b = await importarBase(obra.id, { vigentes: vig, distribuicao: dist, escritorio: esc })
      const partes = [
        vig && plural(b.vigentes.length, 'linha da lista vigente', 'linhas da lista vigente'),
        dist && plural(b.copias.length, 'cópia da ficha', 'cópias da ficha'),
        esc && plural(Object.keys(b.escritorioIndice ?? {}).length, 'folha no escritório', 'folhas no escritório'),
      ].filter(Boolean)
      avisar(`Importado: ${partes.join(', ')}.`)
      aoImportar(b)
    } catch (err) {
      setErro(err instanceof ErroDeArquivo ? err.message : 'Não consegui ler o arquivo. Use a ficha .xlsx ou salve como CSV (separado por ";") no Excel e tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form class="pj-bloco pj-importar" onSubmit={importar} data-testid="painel-importar">
      <h2>Importar a base da obra</h2>
      <p class="discreto so-com-ajuda">
        Arquivos só neste aparelho.
        <Ajuda>Eles não entram no "Salvar arquivo". Quando a ficha ou o índice mudar, importe de novo: o painel é refeito.</Ajuda>
      </p>
      {vigenteDoServidor && (
        <p class="pj-aviso-base so-com-ajuda" data-testid="importar-vigente-servidor">
          A revisão vigente vem do servidor.
          <Ajuda>É a lista do Autodoc publicada pelo PC. A lista vigente em CSV só vale sem conta.</Ajuda>
        </p>
      )}
      <div class="pj-campo">
        <span class="so-com-ajuda">
          Lista vigente (.csv){vigenteDoServidor ? ' · não precisa' : ''}
          <Ajuda>Colunas: disciplina, numero_de, numero_ate, codigo_exemplo, revisao, data (e, se tiver, pasta, status, titulo).</Ajuda>
        </span>
        <BotaoArquivo
          rotulo="Importar lista (.csv)"
          rotuloLeitor="Lista vigente (.csv)"
          accept=".csv,text/csv"
          testid="arquivo-vigentes"
          nome={vig?.name ?? (base?.vigentesArquivo ? `Atual: ${base.vigentesArquivo} (${base.vigentes.length} linhas)` : null)}
          aoEscolher={(arquivos) => setVig(arquivos[0] ?? null)}
        />
      </div>
      <div class="pj-campo">
        <span class="so-com-ajuda">
          Distribuição de cópias (ficha .xlsx ou .csv)
          <Ajuda>A ficha de controle do Excel entra como está (primeira aba). Em CSV, as colunas: codigo, revisao, titulo, disciplina, entrega, empresa, colaborador, devolucao.</Ajuda>
        </span>
        <BotaoArquivo
          rotulo="Importar planilha (.xlsx)"
          rotuloLeitor="Distribuição de cópias (ficha .xlsx ou .csv)"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          testid="arquivo-distribuicao"
          nome={dist?.name ?? (base?.copiasArquivo ? `Atual: ${base.copiasArquivo} (${base.copias.length} cópias)` : null)}
          aoEscolher={(arquivos) => setDist(arquivos[0] ?? null)}
        />
      </div>
      <div class="pj-campo">
        <span class="so-com-ajuda">
          Índice do escritório (.csv)
          <Ajuda>As pranchas que estão na pasta do PC (coluna codigo ou arquivo, com o código do Autodoc). Vale a revisão mais nova de cada folha.</Ajuda>
        </span>
        <BotaoArquivo
          rotulo="Importar lista (.csv)"
          rotuloLeitor="Índice do escritório (.csv)"
          accept=".csv,text/csv"
          testid="arquivo-escritorio"
          nome={esc?.name ?? (base?.escritorioArquivo ? `Atual: ${base.escritorioArquivo} (${Object.keys(base.escritorioIndice ?? {}).length} folhas)` : null)}
          aoEscolher={(arquivos) => setEsc(arquivos[0] ?? null)}
        />
      </div>
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" class="principal" disabled={salvando}>
        {salvando ? 'Importando…' : 'Importar'}
      </button>
    </form>
  )
}
