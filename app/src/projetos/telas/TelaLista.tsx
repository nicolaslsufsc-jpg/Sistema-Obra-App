// Lista de projetos. Desde 23/11/2026 em pastas e subpastas (pedido do Nicolas: "está um pouco difícil de
// achar"): disciplina › pasta do Autodoc (LO/EX › tipo) › pavimento, com a contagem e os avisos em cada pasta
// (ver projetos/pastas.ts). A busca continua valendo por cima de tudo e mostra a pasta de cada prancha.
import { useMemo, useState } from 'preact/hooks'
import { normalizar, revisaoNova } from '../regras'
import type { DadosProjetos, Documento } from '../dados'
import { acharPasta, arvoreDePranchas, caminhoDaPrancha, type InfoPrancha, type Pasta } from '../pastas'
import type { Contexto } from './ModuloProjetos'
import { plural, rotuloRevisao, Topo } from './comum'
import { EtiquetaStatus, Tabela } from '../../telas/Tabela'
import { BotaoExportarPdf } from '../../telas/ExportarPdf'
import type { FolhaPdf } from '../../telas/folha_pdf'

function infoDa(dados: DadosProjetos, d: Documento): InfoPrancha {
  const sits = dados.situacoesDe.get(d.id) ?? []
  return {
    fase: dados.vigentes.get(d.id)?.fase as string | undefined,
    nova: (dados.revisoesDe.get(d.id) ?? []).some((r) => revisaoNova(r, dados.hoje, 7, dados.carga)),
    recolher: sits.filter((s) => s.situacao === 'RECOLHER').length,
    conferir: sits.filter((s) => s.situacao === 'CONFERIR').length,
  }
}

/** Todas as pranchas de uma pasta, com as das subpastas. */
function pranchasDe(p: Pasta): Documento[] {
  return [...p.docs, ...p.pastas.flatMap(pranchasDe)]
}

/** ids/titulo: a lista aberta por um número do painel da obra (só aquelas pranchas). pasta: onde está. */
export function TelaLista({ ctx, ids, titulo, pasta }: { ctx: Contexto; ids?: string[]; titulo?: string; pasta?: string[] }) {
  const { dados, obra, usuario, ir, trocar, voltar } = ctx
  const [busca, setBusca] = useState('')
  const q = normalizar(busca.trim())
  const so = ids ? new Set(ids) : null
  const base = useMemo(() => (so ? dados.documentos.filter((d) => so.has(d.id)) : dados.documentos), [dados, ids])
  const raiz = useMemo(() => arvoreDePranchas(base, (d) => infoDa(dados, d)), [base, dados])
  const aqui = acharPasta(raiz, pasta ?? [])
  const visiveis = q ? base.filter((d) => d.busca.includes(q)) : pranchasDe(aqui)
  const rota = (caminho: string[]) => ({ nome: 'lista' as const, ids, titulo, pasta: caminho })

  // na busca, agrupado por disciplina como antes, com a pasta de cada uma
  const grupos = new Map<string, Documento[]>()
  if (q)
    for (const d of visiveis) {
      const l = grupos.get(d.disciplina)
      if (l) l.push(d)
      else grupos.set(d.disciplina, [d])
    }

  // a lista (a busca ou a pasta aberta) em A4 (21/11/2026)
  const folha = (): FolhaPdf => {
    const linhas = visiveis.map((d) => {
      const vigente = dados.vigentes.get(d.id)
      const i = infoDa(dados, d)
      return [d.disciplina, d.codigo, d.titulo || 'sem título', vigente ? rotuloRevisao(vigente) : 'sem vigente', i.nova ? 'sim' : '', i.recolher || '', i.conferir || '']
    })
    const onde = aqui.caminho.length ? aqui.caminho.join(' › ') : ''
    return {
      modulo: 'Projetos',
      titulo: titulo ? `Lista de projetos: ${titulo}` : 'Lista de projetos',
      sub: q ? `Busca: "${busca.trim()}"` : onde ? `Pasta: ${onde}` : undefined,
      resumo: [plural(visiveis.length, 'prancha', 'pranchas'), plural(new Set(visiveis.map((d) => d.disciplina)).size, 'disciplina', 'disciplinas')],
      tabelas: [
        {
          colunas: ['Disciplina', 'Código', 'Título', 'Vigente', 'Nova', 'A recolher', 'Conferir'],
          curtas: [1, 3, 4, 5, 6],
          linhas,
          vazio: '–',
          nota: 'A recolher e Conferir: cópias em campo (da lista de distribuição).',
        },
      ],
    }
  }

  // pranchas em tabela (guia de estilo, 23/11/2026): prancha, vigente e as cópias em campo; tocar abre a prancha
  const tabela = (docs: Documento[], comPasta: boolean, testid?: string) => (
    <Tabela
      rotulo="Pranchas"
      testid={testid}
      linhas={docs}
      chave={(d) => d.id}
      atributos={(d) => ({ 'data-codigo': d.codigo })}
      aoTocar={(d) => ir({ nome: 'prancha', documentoId: d.id })}
      colunas={[
        {
          titulo: 'Prancha',
          valor: (d) => {
            const onde = comPasta ? caminhoDaPrancha(raiz, d.id).slice(1).join(' › ') : ''
            return (
              <span class="pj-resumo-item">
                <span class="codigo">{d.codigo}</span>
                <span class="discreto">{d.titulo || '–'}</span>
                {onde && (
                  <span class="discreto pj-onde" data-testid="lista-onde">
                    {onde}
                  </span>
                )}
              </span>
            )
          },
        },
        {
          titulo: 'Vigente',
          valor: (d) => {
            const vigente = dados.vigentes.get(d.id)
            const i = infoDa(dados, d)
            if (!vigente) return null
            return i.nova ? <EtiquetaStatus status="pendente">{rotuloRevisao(vigente)} nova</EtiquetaStatus> : rotuloRevisao(vigente)
          },
        },
        {
          titulo: 'Em campo',
          valor: (d) => {
            const i = infoDa(dados, d)
            if (i.recolher) return <EtiquetaStatus status="nc">{i.recolher} a recolher</EtiquetaStatus>
            if (i.conferir) return <EtiquetaStatus status="pendente">conferir</EtiquetaStatus>
            return null
          },
        },
      ]}
    />
  )

  return (
    <main class="tela">
      <Topo titulo={titulo ? `Projetos: ${titulo}` : 'Lista de projetos'} sub={plural(base.length, 'prancha', 'pranchas')} aoVoltar={voltar} />
      {so && (
        <p class="pj-aviso-base" data-testid="lista-filtrada">
          {base.length === 1 ? 'Só a prancha' : `Só as ${base.length} pranchas`} de "{titulo}".{' '}
          <button type="button" class="pj-pequeno secundario" onClick={() => trocar({ nome: 'lista' })}>
            Ver todas
          </button>
        </p>
      )}
      <div class="acoes">
        <BotaoExportarPdf obra={obra} usuario={usuario} montar={folha} testid="projetos-pdf-lista" desativado={visiveis.length === 0} />
      </div>
      <div class="pj-busca">
        <input
          type="search"
          value={busca}
          onInput={(e) => setBusca(e.currentTarget.value)}
          placeholder="Buscar em todas as pastas"
          aria-label="Buscar por código ou título"
          autocomplete="off"
        />
      </div>
      {base.length === 0 && <p class="pj-vazio">Sem projetos</p>}

      {q ? (
        <>
          {visiveis.length === 0 && <p class="pj-vazio">Nada com esse texto.</p>}
          {[...grupos].map(([disciplina, docs]) => (
            <section key={disciplina}>
              <h2 class="pj-grupo">
                {disciplina} ({docs.length})
              </h2>
              {tabela(docs, true)}
            </section>
          ))}
        </>
      ) : (
        base.length > 0 && (
          <>
            <nav class="pj-trilha" aria-label="Pasta aberta" data-testid="lista-trilha">
              <button type="button" class={aqui.caminho.length ? '' : 'ativa'} aria-current={aqui.caminho.length ? undefined : 'page'} onClick={() => trocar(rota([]))}>
                Todas
              </button>
              {aqui.caminho.length > 0 &&
                trilhaDe(raiz, aqui).map((p) => (
                  <span key={p.caminho.join('/')}>
                    <span aria-hidden="true"> › </span>
                    <button type="button" class={p === aqui ? 'ativa' : ''} aria-current={p === aqui ? 'page' : undefined} onClick={() => trocar(rota(p.caminho))}>
                      {p.nome}
                    </button>
                  </span>
                ))}
            </nav>
            {aqui.pastas.length > 0 && (
              <Tabela
                rotulo="Pastas"
                testid="lista-pastas"
                linhas={aqui.pastas}
                chave={(p) => p.nome}
                atributos={(p) => ({ 'data-pasta': p.nome })}
                aoTocar={(p) => ir(rota(p.caminho))}
                colunas={[
                  { titulo: 'Pasta', valor: (p) => <b>{p.nome}</b> },
                  { titulo: 'Pranchas', valor: (p) => p.pranchas || null, numero: true },
                  {
                    titulo: 'Avisos',
                    valor: (p) =>
                      p.recolher || p.conferir || p.novas ? (
                        <span class="pj-avisos-pasta">
                          {p.recolher > 0 && <EtiquetaStatus status="nc">{p.recolher} a recolher</EtiquetaStatus>}
                          {p.conferir > 0 && <EtiquetaStatus status="pendente">{p.conferir} conferir</EtiquetaStatus>}
                          {p.novas > 0 && <EtiquetaStatus status="pendente">{plural(p.novas, 'nova', 'novas')}</EtiquetaStatus>}
                        </span>
                      ) : null,
                  },
                ]}
              />
            )}
            {aqui.docs.length > 0 && (
              <>
                {aqui.pastas.length > 0 && <h2 class="pj-grupo">Soltas nesta pasta ({aqui.docs.length})</h2>}
                {tabela(aqui.docs, false, 'lista-pranchas')}
              </>
            )}
          </>
        )
      )}
    </main>
  )
}

/** As pastas do caminho até a pasta aberta (sem a raiz). */
function trilhaDe(raiz: Pasta, aqui: Pasta): Pasta[] {
  const trilha: Pasta[] = []
  let p = raiz
  while (p !== aqui) {
    const f = p.pastas.find((x) => aqui.caminho.length >= x.caminho.length && x.caminho.every((n, i) => aqui.caminho[i] === n))
    if (!f) break
    trilha.push(f)
    p = f
  }
  return trilha
}
