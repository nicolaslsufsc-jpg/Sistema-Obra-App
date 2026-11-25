// Pranchas e PDFs (versão PC): uma busca só nas pranchas do Projetos (cadastro e lista vigente importada),
// nos documentos e PDFs da lista mestra e nas plantas da FVS. Tabela larga à esquerda, detalhe à direita
// com o que dá para abrir. Só leitura.
import { useMemo, useState } from 'preact/hooks'
import type { ObraLocal } from '../nucleo/conta'
import { Tabela, type ColunaTabela } from '../telas/Tabela'
import { rotulo } from '../projetos/regras'
import { urlDoArquivo } from '../documentos/dados'
import type { IdModulo } from '../modulos'
import type { DestinoPc } from './CascaPc'
import { buscar, contarPorOrigem, juntar, NOME_DA_ORIGEM, type ItemDaBusca, type Origem } from './busca'
import { dataBR, type DadosPc } from './dados_pc'

const MODULO_DA_ORIGEM: Record<Origem, IdModulo> = { projetos: 'projetos', documentos: 'documentos', fvs: 'fvs' }

/** Monta a lista única a partir do que cada módulo tem no aparelho. */
export function itensDaObra(d: DadosPc): ItemDaBusca[] {
  const p = d.projetos
  const doCadastro: ItemDaBusca[] = (p?.documentos ?? []).map((doc) => {
    const rev = p!.vigentes.get(doc.id)
    return {
      chave: `projetos:${doc.id}`,
      origem: 'projetos',
      codigo: doc.codigo,
      titulo: doc.titulo,
      grupo: doc.disciplina,
      revisao: rev ? rotulo(rev) : '',
      data: String(rev?.data_revisao ?? rev?.data ?? '').slice(0, 10),
      link: doc.link_pasta,
      detalhe: doc.pasta_autodoc ? `Pasta: ${doc.pasta_autodoc}` : undefined,
    }
  })
  const daBase: ItemDaBusca[] = (d.base?.vigentes ?? []).map((v, i) => ({
    chave: `base:${i}:${v.codigo}`,
    origem: 'projetos',
    codigo: v.codigo,
    titulo: v.titulo,
    grupo: v.disciplina,
    revisao: `${v.fase} R${String(v.revisao).padStart(2, '0')}`,
    data: v.data,
    detalhe: `Lista vigente importada · pasta ${v.pasta} · ${v.status}`,
  }))
  const docs: ItemDaBusca[] = (d.documentos?.documentos ?? []).map((x) => ({
    chave: `documentos:${x.chave}`,
    origem: 'documentos',
    codigo: x.codigo,
    titulo: x.atual.titulo + (x.exemplo ? ' (exemplo)' : ''),
    grupo: x.categoria,
    revisao: x.atual.revisao,
    data: x.atual.data_revisao,
    arquivoId: x.atual.arquivo_id,
    detalhe: `${x.atual.situacao}${x.atual.validade ? ` · validade ${dataBR(x.atual.validade)}` : ''}`,
  }))
  const f = d.fvs
  const plantas: ItemDaBusca[] = (f?.pavimentos ?? []).flatMap((pav) =>
    (f!.plantasDe.get(pav.id) ?? []).map((pl) => ({
      chave: `fvs:${pl.id}`,
      origem: 'fvs' as const,
      codigo: pl.prancha,
      titulo: `Planta de ${pl.disciplina === 'arquitetura' ? 'ambientes' : 'fôrma'} · ${pl.trecho}`,
      grupo: pav.nome,
      revisao: pl.revisao,
      data: String(pl.criado_em_dispositivo ?? '').slice(0, 10),
      detalhe: `${pl.elementos} ${pl.elementos === 1 ? 'peça desenhada' : 'peças desenhadas'}`,
    })),
  )
  // a prancha da FVS é a mesma folha do Projetos, mas fica: ela abre a planta tocável
  return juntar(doCadastro, daBase, docs, plantas)
}

const COLUNAS: ColunaTabela<ItemDaBusca>[] = [
  { titulo: 'Código', valor: (i) => i.codigo || null },
  { titulo: 'Título', valor: (i) => i.titulo || null },
  { titulo: 'Disciplina ou pavimento', valor: (i) => i.grupo || null },
  { titulo: 'Revisão', valor: (i) => i.revisao || null },
  { titulo: 'Data', valor: (i) => (i.data ? dataBR(i.data) : null), numero: true },
  { titulo: 'Origem', valor: (i) => <span class="pc-origem">{NOME_DA_ORIGEM[i.origem]}</span> },
]

/** Com o detalhe aberto ao lado, a tabela fica só com o que identifica a linha (o resto está no detalhe). */
const COLUNAS_COM_DETALHE = [COLUNAS[0], COLUNAS[1], COLUNAS[3]]

function Detalhe({ item, dados, aoIr, aoFechar }: { item: ItemDaBusca; dados: DadosPc; aoIr: (d: DestinoPc) => void; aoFechar: () => void }) {
  const [msg, setMsg] = useState('')
  const online = navigator.onLine
  const abrirArquivo = async () => {
    setMsg('')
    const arq = item.arquivoId ? dados.documentos?.arquivos.get(item.arquivoId) : undefined
    try {
      const r = item.arquivoId ? await urlDoArquivo({ id: item.arquivoId, ...arq }, online) : null
      if (!r) {
        setMsg(online ? 'O arquivo não está neste aparelho nem no servidor.' : 'O arquivo não está neste aparelho. Com internet, ele abre do servidor.')
        return
      }
      window.open(r.url, '_blank', 'noopener')
    } catch (e) {
      setMsg(`Não deu para abrir: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const modulo = MODULO_DA_ORIGEM[item.origem]
  return (
    <aside class="pc-detalhe" data-testid="pc-detalhe" aria-label="Detalhe">
      <button type="button" class="pc-fechar" aria-label="Fechar o detalhe" onClick={aoFechar}>
        ×
      </button>
      <p class="pc-origem">{NOME_DA_ORIGEM[item.origem]}</p>
      <h2>{item.codigo || item.titulo}</h2>
      <dl>
        <dt>Título</dt>
        <dd>{item.titulo || '–'}</dd>
        <dt>{item.origem === 'fvs' ? 'Pavimento' : item.origem === 'documentos' ? 'Categoria' : 'Disciplina'}</dt>
        <dd>{item.grupo || '–'}</dd>
        <dt>Revisão</dt>
        <dd>{item.revisao || '–'}</dd>
        <dt>Data</dt>
        <dd>{item.data ? dataBR(item.data) : '–'}</dd>
        {item.detalhe && (
          <>
            <dt>Mais</dt>
            <dd>{item.detalhe}</dd>
          </>
        )}
      </dl>
      <div class="pc-acoes">
        {item.arquivoId && (
          <button type="button" class="pc-bt pc-principal" data-testid="pc-abrir-arquivo" onClick={abrirArquivo}>
            Abrir o PDF
          </button>
        )}
        {item.link &&
          (online ? (
            <a class="pc-bt pc-principal" href={item.link} target="_blank" rel="noopener noreferrer">
              Abrir a pasta da prancha
            </a>
          ) : (
            <button type="button" class="pc-bt" disabled title="Precisa de internet">
              Pasta da prancha (sem internet)
            </button>
          ))}
        <button type="button" class="pc-bt" data-testid="pc-abrir-modulo" onClick={() => aoIr({ tipo: 'modulo', id: modulo })}>
          {item.origem === 'fvs' ? 'Abrir a FVS' : `Abrir ${item.origem === 'projetos' ? 'o Projetos' : 'o Documentos'}`} ›
        </button>
      </div>
      {!item.arquivoId && !item.link && item.origem !== 'fvs' && <p class="pc-nota">Esta linha não tem arquivo guardado no app: a prancha está na pasta da obra.</p>}
      {msg && (
        <p class="pc-msg pc-erro" role="alert">
          {msg}
        </p>
      )}
    </aside>
  )
}

export function PaginaPranchas({ dados, aoIr }: { dados: DadosPc; obra: ObraLocal; aoIr: (d: DestinoPc) => void }) {
  const todos = useMemo(() => itensDaObra(dados), [dados])
  const [texto, setTexto] = useState('')
  const [origem, setOrigem] = useState<Origem | 'todas'>('todas')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const achados = buscar(todos, texto)
  const conta = contarPorOrigem(achados)
  const lista = origem === 'todas' ? achados : achados.filter((i) => i.origem === origem)
  const item = lista.find((i) => i.chave === escolhido) ?? null
  const chip = (o: Origem | 'todas', nome: string, n: number) => (
    <button type="button" class="pc-chip" aria-pressed={origem === o} data-testid={`pc-origem-${o}`} onClick={() => setOrigem(o)}>
      {nome} ({n})
    </button>
  )
  return (
    <main class="tela pc-pagina" data-testid="pc-pagina-pranchas">
      <div class="pc-titulo">
        <h1>Pranchas e PDFs</h1>
        <p>Uma busca só: pranchas do Projetos, documentos da lista mestra e plantas da FVS.</p>
      </div>
      <div class="pc-filtros">
        <label class="pc-busca">
          Procurar por código, título, disciplina ou revisão
          <input type="search" value={texto} placeholder="Ex.: formas pilotis, PO-01, R02" data-testid="pc-busca" autoFocus onInput={(e) => setTexto((e.target as HTMLInputElement).value)} />
        </label>
        <div class="pc-chips" role="group" aria-label="Onde procurar">
          {chip('todas', 'Tudo', achados.length)}
          {chip('projetos', 'Pranchas', conta.projetos)}
          {chip('documentos', 'Documentos', conta.documentos)}
          {chip('fvs', 'Plantas da FVS', conta.fvs)}
        </div>
      </div>
      {(['projetos', 'documentos', 'fvs'] as const).some((m) => dados.erros[m]) && (
        <p class="pc-msg pc-erro">Parte da busca ficou de fora: {(['projetos', 'documentos', 'fvs'] as const).filter((m) => dados.erros[m]).join(', ')} não deu para ler neste aparelho.</p>
      )}
      <div class={`pc-dividido${item ? ' pc-com-detalhe' : ''}`}>
        <div>
          {lista.length === 0 ? (
            <p class="pc-nota" data-testid="pc-sem-resultado">
              {todos.length === 0 ? 'Ainda não há pranchas, documentos nem plantas neste aparelho.' : 'Nada encontrado. Tente menos palavras ou outra grafia.'}
            </p>
          ) : (
            <Tabela rotulo="Resultados da busca" testid="pc-resultados" colunas={item ? COLUNAS_COM_DETALHE : COLUNAS} linhas={lista} chave={(i) => i.chave} aoTocar={(i) => setEscolhido(i.chave)} selecionada={escolhido} />
          )}
        </div>
        {item && <Detalhe key={item.chave} item={item} dados={dados} aoIr={aoIr} aoFechar={() => setEscolhido(null)} />}
      </div>
    </main>
  )
}
