// Aba Pessoas (21/11/2026): quem tem o quê, em estilo painel. Menu = empresas; submenu = as pessoas de cada
// uma; tocar numa pessoa abre o painel dela: o que recolher (revisão antiga), o que entregar e tudo o que
// ela tem em campo, por disciplina e pasta. Só leitura. Ver projetos/pessoas.ts.
import { useMemo, useState } from 'preact/hooks'
import { normalizar, rotuloRev, type CopiaCruzada } from '../painel'
import { gruposDaPessoa, pessoasDaObra, porEmpresa, type Pessoa } from '../pessoas'
import type { Contexto } from './ModuloProjetos'
import { CabecalhoBase, tocavel, usarBase } from './baseComum'
import { dataBR, plural } from './comum'
import { alvoDaFolha, alvoDe, seloDe } from './TelaPranchaBase'

const nomeDa = (p: Pick<Pessoa, 'colaborador'>) => p.colaborador || 'sem nome (a empresa)'

function usarPessoas(ctx: Contexto) {
  const b = usarBase(ctx)
  const pessoas = useMemo(() => (b.cruzadas ? pessoasDaObra(b.cruzadas, b.pendentes ?? []) : []), [b.cruzadas, b.pendentes])
  return { ...b, pessoas }
}

export function TelaPessoas({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { base, resumo, pessoas } = usarPessoas(ctx)
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const empresas = useMemo(() => porEmpresa(pessoas), [pessoas])

  if (base === undefined) return <main class="tela">Carregando…</main>
  const q = normalizar(busca).trim()
  const filtradas = q
    ? empresas
        .map((e) => ({ ...e, pessoas: normalizar(e.empresa).includes(q) ? e.pessoas : e.pessoas.filter((p) => normalizar(p.colaborador).includes(q)) }))
        .filter((e) => e.pessoas.length)
    : empresas

  return (
    <main class="tela pj-painel">
      <CabecalhoBase ctx={ctx} aba="pessoas" aoSair={aoSair} base={base} temCruzamento={!!resumo} />
      <section class="pj-bloco">
        <h2>Quem tem o quê</h2>
        <p class="discreto">
          {plural(pessoas.length, 'pessoa', 'pessoas')} em {plural(empresas.length, 'empresa', 'empresas')}. Toque na empresa para ver as pessoas e na pessoa para ver
          as pranchas dela.
        </p>
        <div class="pj-busca">
          <input type="search" aria-label="Buscar empresa ou pessoa" placeholder="Buscar empresa ou pessoa" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} />
        </div>
        {filtradas.length === 0 && <p class="discreto">Ninguém com esse nome.</p>}
        <ul class="pj-empresas" data-testid="pessoas-empresas">
          {filtradas.map((e) => {
            const aberto = !!q || aberta === e.empresa
            return (
              <li key={e.empresa} class={e.atrasadas ? 'ruim' : e.aEntregar ? 'atencao' : 'bom'}>
                <button type="button" class="pj-empresa" aria-expanded={aberto} onClick={() => setAberta(aberto && !q ? null : e.empresa)}>
                  <span class="pj-empresa-nome">
                    <b>{e.empresa}</b>
                    <span class="discreto">
                      {plural(e.pessoas.length, 'pessoa', 'pessoas')} · {plural(e.emCampo, 'cópia', 'cópias')} em campo
                    </span>
                  </span>
                  <Contagens atrasadas={e.atrasadas} aEntregar={e.aEntregar} conferir={e.conferir} />
                  <span class="pj-seta" aria-hidden="true">
                    {aberto ? '▾' : '▸'}
                  </span>
                </button>
                {aberto && (
                  <ul class="pj-lista-painel pj-pessoas" data-testid="pessoas-da-empresa">
                    {e.pessoas.map((p) => (
                      <li key={p.chave} class="pj-linha-painel pj-tocavel" {...tocavel(() => ctx.ir({ nome: 'pessoa', chave: p.chave }))}>
                        <div>
                          <b>{nomeDa(p)}</b>
                          <div class="discreto">
                            {plural(p.emCampo.length, 'cópia', 'cópias')} em campo{p.ultimaEntrega ? ` · última entrega ${dataBR(p.ultimaEntrega)}` : ''}
                          </div>
                        </div>
                        <Contagens atrasadas={p.atrasadas.length} aEntregar={p.aEntregar.length} conferir={p.conferir.length} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}

function Contagens({ atrasadas, aEntregar, conferir }: { atrasadas: number; aEntregar: number; conferir: number }) {
  if (!atrasadas && !aEntregar && !conferir) return <span class="pj-selo ok">em dia</span>
  return (
    <span class="pj-contagens">
      {atrasadas > 0 && <span class="pj-selo des">{plural(atrasadas, 'atrasada', 'atrasadas')}</span>}
      {aEntregar > 0 && <span class="pj-selo conf">{aEntregar} a entregar</span>}
      {conferir > 0 && <span class="pj-selo rec">{conferir} conferir</span>}
    </span>
  )
}

export function TelaPessoa({ ctx, chave }: { ctx: Contexto; chave: string }) {
  const { base, pessoas } = usarPessoas(ctx)
  if (base === undefined) return <main class="tela">Carregando…</main>
  const p = pessoas.find((x) => x.chave === chave)
  if (!p)
    return (
      <main class="tela pj-painel">
        <Topo ctx={ctx} titulo="Pessoa" subtitulo="" />
        <p class="discreto">Essa pessoa não está mais na base desta obra.</p>
      </main>
    )
  const grupos = gruposDaPessoa(p)

  return (
    <main class="tela pj-painel" data-testid="pessoa">
      <Topo ctx={ctx} titulo={nomeDa(p)} subtitulo={p.empresa} />

      <ul class="pj-cartoes" aria-label="Resumo da pessoa" data-testid="pessoa-resumo">
        <li class="neutro">
          <span class="numero">{p.emCampo.length}</span>
          <strong>em campo</strong>
          <span class="discreto">{p.ultimaEntrega ? `última entrega ${dataBR(p.ultimaEntrega)}` : 'cópias em campo'}</span>
        </li>
        <li class={p.atrasadas.length ? 'ruim' : 'bom'}>
          <span class="numero" data-testid="pessoa-atrasadas">{p.atrasadas.length}</span>
          <strong>atrasadas</strong>
          <span class="discreto">{p.atrasadas.length ? `a mais antiga há ${p.maiorAtraso} d` : 'nenhuma revisão antiga'}</span>
        </li>
        <li class={p.aEntregar.length ? 'atencao' : 'bom'}>
          <span class="numero" data-testid="pessoa-a-entregar">{p.aEntregar.length}</span>
          <strong>a entregar</strong>
          <span class="discreto">pela lista de distribuição</span>
        </li>
        <li class={p.conferir.length ? 'atencao' : 'neutro'}>
          <span class="numero">{p.conferir.length}</span>
          <strong>conferir</strong>
          <span class="discreto">o app não decidiu sozinho</span>
        </li>
      </ul>

      {p.atrasadas.length > 0 && (
        <section class="pj-bloco" data-testid="pessoa-tirar">
          <h2>Recolher ({p.atrasadas.length})</h2>
          <p class="discreto">Revisão que não vale mais: recolher e entregar a vigente.</p>
          <ul class="pj-lista-painel">
            {[...p.atrasadas].sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0)).map((x) => (
              <LinhaCopia key={x.copia.linha} ctx={ctx} x={x} trocaPor />
            ))}
          </ul>
        </section>
      )}

      {p.aEntregar.length > 0 && (
        <section class="pj-bloco" data-testid="pessoa-entregar">
          <h2>Entregar ({p.aEntregar.length})</h2>
          <ul class="pj-lista-painel">
            {p.aEntregar.map((d) => (
              <li key={d.vigente.codigo} class="pj-linha-painel pj-tocavel" {...tocavel(() => ctx.ir({ nome: 'prancha-base', ...alvoDaFolha(d.vigente) }))}>
                <div>
                  <b>{d.vigente.codigo}</b> <span class="discreto">{d.vigente.titulo}</span>
                  <br />
                  entregar <span class="pj-rev nova">{rotuloRev(d.vigente.fase, d.vigente.revisao)}</span>
                  {d.regra.copias > 1 ? ` (${d.regra.copias} cópias)` : ''}
                  <div class="discreto">{d.motivo === 'trocar' ? 'no lugar da cópia antiga' : `revisão nova de ${dataBR(d.vigente.data)}`}</div>
                </div>
                <span class={`pj-selo ${d.motivo === 'trocar' ? 'des' : 'conf'}`}>{d.motivo === 'trocar' ? 'trocar' : 'nova'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="pj-bloco" data-testid="pessoa-tem">
        <h2>O que tem em campo</h2>
        {grupos.length === 0 && <p class="discreto">Nenhuma cópia em campo.</p>}
        {grupos.map((g) => (
          <details key={g.disciplina} class="pj-disc" open={grupos.length <= 2}>
            <summary>
              <b>{g.disciplina}</b> <span class="discreto">{plural(g.pastas.reduce((s, x) => s + x.copias.length, 0), 'cópia', 'cópias')}</span>
              {g.pastas.some((x) => x.copias.some((c) => c.resultado === 'desatualizada')) && <span class="pj-selo des">tem atrasada</span>}
            </summary>
            {g.pastas.map((pasta) => (
              <div key={pasta.pasta} class="pj-subgrupo">
                <h3>
                  {pasta.pasta} <span class="discreto">· {pasta.copias.length}</span>
                </h3>
                <ul class="pj-lista-painel">
                  {pasta.copias.map((x) => (
                    <LinhaCopia key={x.copia.linha} ctx={ctx} x={x} />
                  ))}
                </ul>
              </div>
            ))}
          </details>
        ))}
      </section>
    </main>
  )
}

function Topo({ ctx, titulo, subtitulo }: { ctx: Contexto; titulo: string; subtitulo: string }) {
  return (
    <header class="pj-topo">
      <button type="button" class="pj-voltar" onClick={ctx.voltar} aria-label="Voltar">
        ‹ Voltar
      </button>
      <div class="pj-titulo">
        <h1>{titulo}</h1>
        <p class="discreto">{subtitulo}</p>
      </div>
    </header>
  )
}

function LinhaCopia({ ctx, x, trocaPor }: { ctx: Contexto; x: CopiaCruzada; trocaPor?: boolean }) {
  const c = x.copia
  const selo = seloDe(x)
  return (
    <li class="pj-linha-painel pj-tocavel" {...tocavel(() => ctx.ir({ nome: 'prancha-base', ...alvoDe(x) }))}>
      <div>
        <b>{x.vigente?.codigo ?? `${c.disciplinaNome} ${c.codigo}`}</b> <span class="discreto">{x.vigente?.titulo || c.titulo}</span>
        <br />
        tem <span class="pj-rev">{rotuloRev(c.fase, c.revisao)}</span>
        {trocaPor && x.vigente ? (
          <>
            {' '}
            → vigente <span class="pj-rev nova">{rotuloRev(x.vigente.fase, x.vigente.revisao)}</span>
          </>
        ) : null}
        <div class="discreto">entregue {c.entrega ? dataBR(c.entrega) : `"${c.entregaTexto}"`}</div>
      </div>
      <span class={`pj-selo ${selo.classe}`}>{selo.texto}</span>
    </li>
  )
}
