// Abas "A entregar" e "Distribuição" (proposta aprovada em 20/11/2026).
// Distribuição: quem recebe cada disciplina ou pasta do Autodoc (só o gestor muda; nada se apaga).
// A entregar: para cada pessoa, as pranchas cuja vigente ela ainda não tem, e a cópia antiga a recolher.
import { useMemo, useState } from 'preact/hooks'
import { chavePessoa, chaveRegra, lerListaDestinatarios, mesclarLista, pavimentoDaFolha, sugerirRegras, type Destinatario, type SugestaoRegra } from '../distribuicao'
import type { CopiaCruzada, Vigente } from '../painel'
import { ordemPavimento } from '../obra'
import { podeGerir } from '../dados'
import { ErroDeArquivo, normalizar, rotuloRev, rotuloDaCopia } from '../painel'
import type { Contexto } from './ModuloProjetos'
import { CabecalhoBase, tocavel, usarBase } from './baseComum'
import { Campo, dataBR, plural } from './comum'
import { alvoDaFolha, ondeDaCopia } from './TelaPranchaBase'

const pessoa = (empresa: string, colaborador: string) => (colaborador ? `${empresa} · ${colaborador}` : `${empresa} (qualquer pessoa)`)

// ---------------------------------------------------------------------------------------------
// A entregar
// ---------------------------------------------------------------------------------------------

export function TelaAEntregar({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { base, resumo, regras, pendentes } = usarBase(ctx)
  const [busca, setBusca] = useState('')
  if (base === undefined) return <main class="tela">Carregando…</main>
  const grupos = (pendentes ?? []).filter((g) => !busca.trim() || normalizar(`${g.empresa} ${g.colaborador}`).includes(normalizar(busca).trim()))
  const total = (pendentes ?? []).reduce((s, g) => s + g.pendencias.length, 0)

  return (
    <main class="tela pj-painel">
      <CabecalhoBase ctx={ctx} aba="a-entregar" aoSair={aoSair} base={base} temCruzamento={!!resumo} />
      <section class="pj-bloco">
        <h2>A entregar</h2>
        {!regras.some((r) => r.ativo) ? (
          <p class="discreto" data-testid="a-entregar-sem-lista">
            Ainda não há lista de distribuição. Monte na aba Distribuição: quem recebe cada disciplina ou pasta.
          </p>
        ) : (
          <>
            <p class="discreto" data-testid="a-entregar-resumo">
              {total === 0
                ? 'Todos da lista estão com a revisão vigente.'
                : `${plural(total, 'prancha', 'pranchas')} para ${plural(pendentes!.length, 'pessoa', 'pessoas')}. Entregue a vigente e recolha a antiga.`}
            </p>
            {pendentes!.length > 3 && (
              <div class="pj-busca">
                <input type="search" aria-label="Buscar empresa ou colaborador" placeholder="Buscar empresa ou colaborador" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} />
              </div>
            )}
          </>
        )}
      </section>

      {grupos.map((g) => (
        <section key={chavePessoa(g.empresa, g.colaborador)} class="pj-bloco" data-testid="a-entregar-pessoa">
          <h2>
            {pessoa(g.empresa, g.colaborador)} <span class="pj-selo des">{plural(g.pendencias.length, 'prancha', 'pranchas')}</span>
          </h2>
          <ul class="pj-lista-painel">
            {g.pendencias.map((p) => (
              <li key={p.vigente.codigo} class="pj-linha-painel pj-tocavel" {...tocavel(() => ctx.ir({ nome: 'prancha-base', ...alvoDaFolha(p.vigente) }))}>
                <div>
                  <b>{p.vigente.codigo}</b> <span class="discreto">{p.vigente.titulo}</span>
                  <br />
                  entregar <span class="pj-rev nova">{rotuloRev(p.vigente.fase, p.vigente.revisao)}</span>
                  {p.regra.copias > 1 ? ` (${p.regra.copias} cópias)` : ''}
                  {p.regra.pavimento ? ` · ${p.regra.pavimento}` : ''}
                  <div class="discreto">
                    {p.motivo === 'trocar'
                      ? `recolher ${p.devolver.map((x) => `${rotuloDaCopia(x.copia)} (${ondeDaCopia(x.copia)})`).join(', ')}`
                      : `revisão nova de ${dataBR(p.vigente.data)}`}
                  </div>
                </div>
                <span class={`pj-selo ${p.motivo === 'trocar' ? 'des' : 'conf'}`}>{p.motivo === 'trocar' ? 'trocar' : 'nova'}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}

// ---------------------------------------------------------------------------------------------
// Distribuição
// ---------------------------------------------------------------------------------------------

export function TelaDistribuicao({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { obra, avisar, dados } = ctx
  const { base, corrigida, resumo, regras, destinatarios, salvarRegras, cruzadas } = usarBase(ctx)
  const [inativas, setInativas] = useState(false)
  const gestor = podeGerir(obra.papel)

  const grupos = useMemo(() => {
    const m = new Map<string, Destinatario[]>()
    for (const r of regras) {
      if (!r.ativo && !inativas) continue
      const k = `${r.disciplina}|${r.pasta}|${r.pavimento ?? ''}`
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return [...m.entries()]
      .map(([k, rs]) => {
        const [disciplina, pasta, pavimento] = k.split('|')
        return { disciplina, pasta, pavimento, regras: rs.sort((a, b) => pessoa(a.empresa, a.colaborador).localeCompare(pessoa(b.empresa, b.colaborador), 'pt-BR')) }
      })
      .sort(
        (a, b) =>
          a.disciplina.localeCompare(b.disciplina, 'pt-BR') ||
          a.pasta.localeCompare(b.pasta, 'pt-BR') ||
          (a.pavimento ? ordemPavimento(a.pavimento) : -1) - (b.pavimento ? ordemPavimento(b.pavimento) : -1),
      )
  }, [regras, inativas])

  if (base === undefined) return <main class="tela">Carregando…</main>
  const nInativas = regras.filter((r) => !r.ativo).length

  const mudarAtivo = async (r: Destinatario, ativo: boolean) => {
    const { id, em: _em, usuario: _u, substitui_id: _s, ...dadosRegra } = r
    await salvarRegras([{ ...dadosRegra, ativo, substitui_id: id }])
    avisar(`${pessoa(r.empresa, r.colaborador)}: ${ativo ? 'volta a receber' : 'não recebe mais'} ${r.pasta || r.disciplina}.`)
  }

  return (
    <main class="tela pj-painel">
      <CabecalhoBase ctx={ctx} aba="distribuicao" aoSair={aoSair} base={base} temCruzamento={!!resumo} />
      <section class="pj-bloco">
        <h2>Lista de distribuição</h2>
        <p class="discreto">
          Quem recebe cada projeto. A regra pode valer para a disciplina inteira ou para uma pasta do Autodoc dentro dela (a da pasta vale mais), e para todos os pavimentos
          ou só um. Quando sai revisão nova, a pessoa aparece em "A entregar".
        </p>
        {gestor ? <NovaRegra ctx={ctx} vigentes={corrigida?.vigentes ?? []} empresas={empresasDa(base?.copias ?? [])} regras={regras} salvar={salvarRegras} /> : <p class="discreto">Só o gestor muda a lista.</p>}
        {gestor && corrigida && cruzadas && (
          <SugerirRegras vigentes={corrigida.vigentes} cruzadas={cruzadas} regras={regras} hoje={dados.hoje} salvar={salvarRegras} avisar={avisar} />
        )}
        {gestor && <ImportarLista hoje={dados.hoje} regras={regras} salvar={salvarRegras} avisar={avisar} />}
      </section>

      <section class="pj-bloco">
        <h2>
          Quem recebe <span class="discreto">({plural(regras.filter((r) => r.ativo).length, 'regra', 'regras')})</span>
        </h2>
        {nInativas > 0 && (
          <button type="button" class="pj-pequeno secundario" aria-pressed={inativas} onClick={() => setInativas(!inativas)}>
            {inativas ? 'Esconder desativadas' : `Mostrar desativadas (${nInativas})`}
          </button>
        )}
        {grupos.length === 0 && <p class="discreto">Lista vazia.</p>}
        <div data-testid="lista-distribuicao">
          {grupos.map((g) => (
            <div key={`${g.disciplina}|${g.pasta}|${g.pavimento}`}>
              <h3 class="pj-grupo">
                {g.disciplina} · {g.pasta || 'disciplina inteira'} · {g.pavimento || 'todos os pavimentos'}
              </h3>
              <ul class="pj-lista-painel">
                {g.regras.map((r) => (
                  <li key={r.id} class="pj-linha-painel" data-testid="regra">
                    <div>
                      <b>{pessoa(r.empresa, r.colaborador)}</b>
                      <div class="discreto">
                        {plural(r.copias, 'cópia', 'cópias')} · desde {dataBR(r.desde)}
                        {destinatarios.length > regras.length && r.substitui_id ? ` · mudada em ${dataBR(r.em)} por ${r.usuario}` : ''}
                      </div>
                    </div>
                    {!r.ativo && <span class="pj-selo rec">desativada</span>}
                    {gestor && (
                      <button type="button" class="pj-pequeno secundario" onClick={() => mudarAtivo(r, !r.ativo)}>
                        {r.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function empresasDa(copias: { empresa: string; colaborador: string }[]) {
  const empresas = new Set<string>()
  const pessoas = new Set<string>()
  for (const c of copias) {
    if (c.empresa) empresas.add(c.empresa)
    if (c.colaborador) pessoas.add(c.colaborador)
  }
  const ordem = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return { empresas: ordem(empresas), pessoas: ordem(pessoas) }
}

function NovaRegra({
  ctx,
  vigentes,
  empresas,
  regras,
  salvar,
}: {
  ctx: Contexto
  vigentes: { disciplina: string; pasta: string; codigo: string; titulo: string }[]
  empresas: { empresas: string[]; pessoas: string[] }
  regras: Destinatario[]
  salvar: ReturnType<typeof usarBase>['salvarRegras']
}) {
  const disciplinas = [...new Set(vigentes.map((v) => v.disciplina))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const [aberto, setAberto] = useState(false)
  const [disciplina, setDisciplina] = useState('')
  const [pasta, setPasta] = useState('')
  const [pavimento, setPavimento] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [colaborador, setColaborador] = useState('')
  const [copias, setCopias] = useState('1')
  const [erro, setErro] = useState('')
  if (!aberto)
    return (
      <button type="button" class="principal" onClick={() => setAberto(true)}>
        Adicionar quem recebe
      </button>
    )
  const pastas = [...new Set(vigentes.filter((v) => v.disciplina === disciplina && v.pasta).map((v) => v.pasta))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  // os pavimentos das folhas da disciplina (e da pasta, se escolhida), na ordem da obra
  const pavimentos = [
    ...new Set(vigentes.filter((v) => v.disciplina === disciplina && (!pasta || normalizar(v.pasta) === normalizar(pasta))).map((v) => pavimentoDaFolha(v))),
  ].sort((a, b) => ordemPavimento(a) - ordemPavimento(b) || a.localeCompare(b, 'pt-BR'))

  const enviar = async (e: Event) => {
    e.preventDefault()
    const n = Number(copias)
    if (!disciplina || !empresa.trim()) return setErro('Escolha a disciplina e escreva a empresa.')
    if (!Number.isInteger(n) || n < 1) return setErro('Cópias: um número de 1 para cima.')
    const chave = chaveRegra({ disciplina, pasta, pavimento, empresa, colaborador })
    const igual = regras.find((r) => chaveRegra(r) === chave)
    if (igual?.ativo) return setErro(pavimento ? 'Essa pessoa já recebe essa disciplina ou pasta nesse pavimento.' : 'Essa pessoa já recebe essa disciplina ou pasta.')
    await salvar([{ disciplina, pasta, pavimento, empresa: empresa.trim(), colaborador: colaborador.trim(), copias: n, ativo: true, desde: ctx.dados.hoje, substitui_id: igual?.id ?? null }])
    ctx.avisar(`${pessoa(empresa.trim(), colaborador.trim())} recebe ${pasta || disciplina}${pavimento ? ` (${pavimento})` : ''}.`)
    setAberto(false)
    setEmpresa('')
    setColaborador('')
    setCopias('1')
    setErro('')
  }

  return (
    <form class="pj-form pj-form-base" onSubmit={enviar} data-testid="form-regra">
      <Campo rotulo="Disciplina">
        <select
          value={disciplina}
          onChange={(e) => {
            setDisciplina(e.currentTarget.value)
            setPasta('')
            setPavimento('')
          }}
        >
          <option value="">Escolha…</option>
          {disciplinas.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Pasta do Autodoc">
        <select value={pasta} onChange={(e) => setPasta(e.currentTarget.value)} disabled={!disciplina}>
          <option value="">Disciplina inteira</option>
          {pastas.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Pavimento" dica="Do título da folha. Todos = a pasta ou disciplina inteira.">
        <select value={pavimento} onChange={(e) => setPavimento(e.currentTarget.value)} disabled={!disciplina} data-testid="regra-pavimento">
          <option value="">Todos os pavimentos</option>
          {pavimentos.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Empresa">
        <input list="pj-empresas" value={empresa} onInput={(e) => setEmpresa(e.currentTarget.value)} />
      </Campo>
      <Campo rotulo="Colaborador" dica="Vazio = qualquer pessoa da empresa.">
        <input list="pj-pessoas" value={colaborador} onInput={(e) => setColaborador(e.currentTarget.value)} />
      </Campo>
      <Campo rotulo="Cópias">
        <input type="number" min={1} inputMode="numeric" value={copias} onInput={(e) => setCopias(e.currentTarget.value)} />
      </Campo>
      <datalist id="pj-empresas">
        {empresas.empresas.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="pj-pessoas">
        {empresas.pessoas.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      <div class="pj-botoes-form">
        <button type="submit" class="principal">
          Salvar
        </button>
        <button type="button" class="secundario" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/**
 * "Sugerir regras pelo que cada um tem" (21/11/2026, item B): uma sugestão por pessoa × disciplina × pavimento,
 * das cópias em campo. Nada vem marcado; o gestor marca, muda as cópias e salva só o que confirmou.
 */
function SugerirRegras({
  vigentes,
  cruzadas,
  regras,
  hoje,
  salvar,
  avisar,
}: {
  vigentes: Vigente[]
  cruzadas: CopiaCruzada[]
  regras: Destinatario[]
  hoje: string
  salvar: ReturnType<typeof usarBase>['salvarRegras']
  avisar: Contexto['avisar']
}) {
  const [aberto, setAberto] = useState(false)
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({})
  const [copias, setCopias] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const sugestoes = useMemo(() => (aberto ? sugerirRegras(vigentes, cruzadas, regras, hoje) : []), [aberto, vigentes, cruzadas, regras, hoje])
  if (!aberto)
    return (
      <button type="button" class="secundario" onClick={() => setAberto(true)} data-testid="sugerir-regras">
        Sugerir regras pelo que cada um tem
      </button>
    )
  const chave = (s: SugestaoRegra) => chaveRegra(s.dados)
  const escolhidas = sugestoes.filter((s) => marcadas[chave(s)])
  const erroCopias = escolhidas.some((s) => {
    const n = Number(copias[chave(s)] ?? s.dados.copias)
    return !Number.isInteger(n) || n < 1 || n > 50
  })
  const confirmar = async () => {
    if (!escolhidas.length || erroCopias) return
    setSalvando(true)
    try {
      await salvar(escolhidas.map((s) => ({ ...s.dados, copias: Number(copias[chave(s)] ?? s.dados.copias), substitui_id: s.substitui_id })))
      avisar(`${plural(escolhidas.length, 'regra salva', 'regras salvas')} na lista de distribuição.`)
      setMarcadas({})
      setCopias({})
      setAberto(false)
    } finally {
      setSalvando(false)
    }
  }
  return (
    <div class="pj-sugestoes" data-testid="sugestoes-regras">
      <h3 class="pj-grupo">Sugestões pelo que cada um tem em campo</h3>
      {sugestoes.length === 0 ? (
        <p class="discreto">Nada a sugerir: as regras já cobrem todas as cópias em campo.</p>
      ) : (
        <>
          <p class="discreto">
            Uma linha por pessoa, disciplina e pavimento (quem tem todos os pavimentos fica com a disciplina inteira). Cópias = o máximo que a pessoa tem de uma folha. Marque o
            que vale; só o marcado é salvo.
          </p>
          <button type="button" class="pj-pequeno secundario" onClick={() => setMarcadas(Object.fromEntries(sugestoes.map((s) => [chave(s), true])))}>
            Marcar todas ({sugestoes.length})
          </button>
          <ul class="pj-lista-painel">
            {sugestoes.map((s) => {
              const k = chave(s)
              return (
                <li key={k} class="pj-linha-painel" data-testid="sugestao-regra">
                  <label class="pj-marcar">
                    <input type="checkbox" checked={!!marcadas[k]} onChange={(e) => setMarcadas({ ...marcadas, [k]: e.currentTarget.checked })} />
                    <span>
                      <b>{pessoa(s.dados.empresa, s.dados.colaborador)}</b>
                      <span class="discreto">
                        {' '}
                        · {s.dados.disciplina} · {s.dados.pavimento || 'todos os pavimentos'} · tem {plural(s.folhas, 'folha', 'folhas')}
                        {s.substitui_id ? ' · reativa a regra desativada' : ''}
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    class="pj-copias"
                    min={1}
                    max={50}
                    inputMode="numeric"
                    aria-label={`Cópias para ${pessoa(s.dados.empresa, s.dados.colaborador)}`}
                    value={copias[k] ?? String(s.dados.copias)}
                    onInput={(e) => setCopias({ ...copias, [k]: e.currentTarget.value })}
                  />
                </li>
              )
            })}
          </ul>
          {erroCopias && (
            <p class="erro" role="alert">
              Cópias: um número de 1 a 50.
            </p>
          )}
        </>
      )}
      <div class="pj-botoes-form">
        {sugestoes.length > 0 && (
          <button type="button" class="principal" disabled={!escolhidas.length || erroCopias || salvando} onClick={confirmar} data-testid="salvar-sugestoes">
            {salvando ? 'Salvando…' : `Salvar ${plural(escolhidas.length, 'regra', 'regras')}`}
          </button>
        )}
        <button type="button" class="secundario" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </div>
    </div>
  )
}

function ImportarLista({
  hoje,
  regras,
  salvar,
  avisar,
}: {
  hoje: string
  regras: Destinatario[]
  salvar: ReturnType<typeof usarBase>['salvarRegras']
  avisar: Contexto['avisar']
}) {
  const [erro, setErro] = useState('')
  const ler = async (arquivo: File | undefined) => {
    setErro('')
    if (!arquivo) return
    try {
      const lidas = lerListaDestinatarios(await arquivo.text(), hoje)
      const novas = mesclarLista(regras, lidas)
      if (novas.length) await salvar(novas)
      avisar(novas.length ? `Lista importada: ${plural(novas.length, 'regra nova ou mudada', 'regras novas ou mudadas')}.` : 'A lista do arquivo é igual à atual.')
    } catch (err) {
      setErro(err instanceof ErroDeArquivo ? err.message : 'Não consegui ler o arquivo. Salve como CSV (separado por ";") e tente de novo.')
    }
  }
  return (
    <label class="pj-campo">
      <span>Importar lista (.csv)</span>
      <input type="file" accept=".csv,text/csv" data-testid="arquivo-lista" onChange={(e) => ler(e.currentTarget.files?.[0])} />
      <span class="discreto">Colunas: disciplina, pasta, pavimento (opcional), empresa, colaborador, copias, ativo. Confira antes: a lista sugerida sai de quem recebeu cada pasta nos últimos 90 dias.</span>
      {erro && (
        <span class="erro" role="alert">
          {erro}
        </span>
      )}
    </label>
  )
}
