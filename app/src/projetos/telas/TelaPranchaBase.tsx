// Prancha vista pelo painel (protótipo aprovado em 14/11/2026, tela de edição): a revisão vigente da lista,
// todas as cópias dela, a pasta do escritório e o histórico. Quem gere a obra corrige aqui; nada se apaga:
// cada correção é uma linha nova (projetos/edicoes.ts) e a anterior fica no histórico.
import { useMemo, useState } from 'preact/hooks'
import { podeGerir } from '../dados'
import { chaveFolha, compararEscritorio, historicoDaPrancha, type CorrecaoCopia, type Edicao, type NovaEdicao } from '../edicoes'
import { chaveNumero, melhor, rotuloRev, type Copia, type CopiaCruzada, type Fase, type Vigente } from '../painel'
import type { Contexto } from './ModuloProjetos'
import { usarBase } from './baseComum'
import { Campo, dataBR, plural, Topo } from './comum'

export interface AlvoPrancha {
  disciplina: string
  numero: string
  /** código da folha vigente (codigo_exemplo); vazio quando a cópia não achou folha */
  folha?: string
}

/** A prancha de uma folha da lista vigente. */
export function alvoDaFolha(v: Vigente): AlvoPrancha {
  return { disciplina: v.disciplina, numero: chaveNumero(v.de), folha: v.codigo }
}

/** A prancha de uma linha do painel. */
export function alvoDe(x: CopiaCruzada): AlvoPrancha {
  return x.vigente ? alvoDaFolha(x.vigente) : { disciplina: x.copia.disciplina, numero: chaveNumero(x.copia.codigo) }
}

export function seloDe(x: CopiaCruzada): { classe: string; texto: string } {
  if (x.situacao === 'devolvida') return { classe: 'rec', texto: 'devolvida' }
  if (x.situacao === 'recolhida') return { classe: 'rec', texto: 'provavelmente recolhida' }
  if (x.resultado === 'desatualizada') return { classe: 'des', texto: `${x.dias ?? '?'} d desatualizada` }
  if (x.resultado === 'conferir') return { classe: 'conf', texto: x.motivo ?? 'conferir' }
  return { classe: 'ok', texto: 'em dia' }
}

export function TelaPranchaBase({ ctx, alvo }: { ctx: Contexto; alvo: AlvoPrancha }) {
  const { obra, dados, voltar, avisar } = ctx
  const { base, corrigida, cruzadas, edicoes, salvar } = usarBase(ctx)
  const gestor = podeGerir(obra.papel)
  const folha = alvo.folha ? chaveFolha({ codigo: alvo.folha }) : undefined

  const daPrancha = useMemo(
    () =>
      (cruzadas ?? []).filter((x) =>
        folha ? !!x.vigente && chaveFolha(x.vigente) === folha : !x.vigente && x.copia.disciplina === alvo.disciplina && chaveNumero(x.copia.codigo) === alvo.numero,
      ),
    [cruzadas, folha, alvo.disciplina, alvo.numero],
  )

  if (base === undefined || !corrigida) return <main class="tela">{base === null ? 'Sem base importada.' : 'Carregando…'}</main>
  const daFolha = folha ? corrigida.vigentes.filter((v) => chaveFolha(v) === folha) : []
  const vigente = daFolha.length ? melhor(daFolha) : undefined
  const emCampo = daPrancha.filter((x) => x.situacao === 'em campo')
  const outras = daPrancha.filter((x) => x.situacao !== 'em campo')
  const registro = folha ? corrigida.escritorio.get(folha) : undefined
  const escritorioAtrasado = !!registro && !!vigente && compararEscritorio(registro, vigente) === 'desatualizado'
  const historico = historicoDaPrancha(edicoes, folha, daPrancha.map((x) => x.copia.linha))
  const empresas = [...new Set(corrigida.copias.map((c) => c.empresa).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const gravar = async (nova: NovaEdicao, texto: string) => {
    await salvar(nova)
    avisar(texto)
  }

  return (
    <main class="tela pj-painel" data-testid="painel-prancha">
      <Topo titulo={vigente?.codigo ?? `${daPrancha[0]?.copia.disciplinaNome ?? alvo.disciplina} ${alvo.numero}`} sub={vigente?.titulo ?? daPrancha[0]?.copia.titulo} aoVoltar={voltar} />

      <div class="pj-grade">
        <section class="pj-bloco" data-testid="prancha-vigente">
          <h2>Prancha</h2>
          {vigente ? (
            <>
              <p>
                <span class="pj-rev nova">{rotuloRev(vigente.fase, vigente.revisao)}</span> desde {dataBR(vigente.data)}
                {vigente.status ? ` · ${vigente.status}` : ''}
                <br />
                <span class="discreto">
                  {vigente.disciplina}
                  {vigente.pasta ? ` · ${vigente.pasta}` : ''}
                  {vigente.de !== vigente.ate ? ` · números ${vigente.de} a ${vigente.ate}` : ''}
                </span>
              </p>
              {gestor && <FormVigente vigente={vigente} aoSalvar={(d) => gravar({ tipo: 'vigente', alvo: folha!, dados: d }, 'Correção da prancha salva.')} />}
            </>
          ) : (
            <p class="discreto">Esta prancha não foi achada numa folha só da lista vigente. Confira o número.</p>
          )}
        </section>

        <section class="pj-bloco" data-testid="prancha-escritorio">
          <h2>Escritório</h2>
          {vigente ? (
            <>
              <p>
                pasta:{' '}
                {registro ? (
                  <>
                    <span class={`pj-rev ${escritorioAtrasado ? 'velha' : 'nova'}`}>{rotuloRev(registro.fase, registro.revisao)}</span> desde {dataBR(registro.data)}
                  </>
                ) : (
                  <span class="discreto">sem registro</span>
                )}
              </p>
              {escritorioAtrasado && <p class="erro">A pasta do escritório não tem a vigente.</p>}
              {gestor && (!registro || escritorioAtrasado || registro.revisao !== vigente.revisao || registro.fase !== vigente.fase) && (
                <button
                  type="button"
                  class="secundario"
                  onClick={() =>
                    gravar({ tipo: 'escritorio', alvo: folha!, dados: { fase: vigente.fase, revisao: vigente.revisao, data: dados.hoje } }, `Escritório atualizado: pasta com ${rotuloRev(vigente.fase, vigente.revisao)}.`)
                  }
                >
                  Atualizar: a pasta está com {rotuloRev(vigente.fase, vigente.revisao)}
                </button>
              )}
            </>
          ) : (
            <p class="discreto">Sem vigente, não há o que conferir na pasta.</p>
          )}
        </section>
      </div>

      <section class="pj-bloco">
        <h2>Quem está com esta prancha: {plural(emCampo.length, 'cópia', 'cópias')} em campo</h2>
        {emCampo.length === 0 && <p class="discreto">Nenhuma cópia em campo.</p>}
        <ul class="pj-lista-painel" data-testid="prancha-em-campo">
          {emCampo.map((x) => (
            <LinhaCopia key={x.copia.linha} x={x} gestor={gestor} empresas={empresas} hoje={dados.hoje} aoSalvar={(d, texto) => gravar({ tipo: 'copia', alvo: x.copia.linha, codigo: x.copia.codigo, dados: d }, texto)} />
          ))}
        </ul>
      </section>

      {outras.length > 0 && (
        <section class="pj-bloco">
          <h2>Fora da conta</h2>
          <ul class="pj-lista-painel" data-testid="prancha-fora">
            {outras.map((x) => (
              <LinhaCopia key={x.copia.linha} x={x} gestor={gestor} empresas={empresas} hoje={dados.hoje} aoSalvar={(d, texto) => gravar({ tipo: 'copia', alvo: x.copia.linha, codigo: x.copia.codigo, dados: d }, texto)} />
            ))}
          </ul>
        </section>
      )}

      <section class="pj-bloco">
        <h2>Histórico</h2>
        <p class="discreto pj-nota">Nada é apagado: cada correção entra como linha nova e a anterior fica aqui.</p>
        <ul class="pj-historico-base" data-testid="prancha-historico">
          {historico.map((e) => (
            <li key={e.id}>
              {dataBR(e.em)} · {e.usuario}: {textoDaEdicao(e)}
            </li>
          ))}
          {base?.vigentesImportadaEm && (
            <li>
              {dataBR(base.vigentesImportadaEm)} · importado da lista vigente{base.vigentesArquivo ? ` (${base.vigentesArquivo})` : ''}
            </li>
          )}
          {base?.copiasImportadaEm && (
            <li>
              {dataBR(base.copiasImportadaEm)} · importado da distribuição{base.copiasArquivo ? ` (${base.copiasArquivo})` : ''}
            </li>
          )}
        </ul>
      </section>
    </main>
  )
}

function textoDaEdicao(e: Edicao): string {
  if (e.tipo === 'vigente') return `prancha corrigida: vigente ${rotuloRev(e.dados.fase, e.dados.revisao)} desde ${dataBR(e.dados.data)}`
  if (e.tipo === 'escritorio') return `pasta do escritório com ${rotuloRev(e.dados.fase, e.dados.revisao)}`
  const d = e.dados
  return `linha ${e.alvo} corrigida: ${d.empresa}${d.colaborador ? ` · ${d.colaborador}` : ''}, ${rotuloRev(d.fase, d.revisao)}, entregue ${d.entrega ? dataBR(d.entrega) : '?'}${d.devolucao ? `, devolvida ${dataBR(d.devolucao)}` : ''}`
}

const FASES: Fase[] = ['EX', 'LO']

function FormVigente({ vigente, aoSalvar }: { vigente: Vigente; aoSalvar: (d: { titulo: string; fase: Fase; revisao: number; data: string }) => Promise<void> }) {
  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState(vigente.titulo)
  const [fase, setFase] = useState<Fase>(vigente.fase)
  const [revisao, setRevisao] = useState(String(vigente.revisao))
  const [data, setData] = useState(vigente.data)
  const [erro, setErro] = useState('')
  if (!aberto)
    return (
      <button type="button" class="secundario" onClick={() => setAberto(true)}>
        Corrigir a prancha
      </button>
    )
  const enviar = async (e: Event) => {
    e.preventDefault()
    const n = Number(revisao)
    if (!Number.isInteger(n) || n < 0 || !data) return setErro('Preencha a revisão (número) e a data.')
    await aoSalvar({ titulo: titulo.trim() || vigente.titulo, fase, revisao: n, data })
    setAberto(false)
  }
  return (
    <form class="pj-form pj-form-base" onSubmit={enviar} data-testid="form-vigente">
      <Campo rotulo="Título">
        <input value={titulo} onInput={(e) => setTitulo(e.currentTarget.value)} />
      </Campo>
      <div class="pj-campos-2">
        <Campo rotulo="Fase">
          <select value={fase} onChange={(e) => setFase(e.currentTarget.value)}>
            {FASES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Revisão (número)">
          <input type="number" min={0} inputMode="numeric" value={revisao} onInput={(e) => setRevisao(e.currentTarget.value)} />
        </Campo>
      </div>
      <Campo rotulo="Vigente desde">
        <input type="date" value={data} onInput={(e) => setData(e.currentTarget.value)} />
      </Campo>
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      <div class="pj-botoes-form">
        <button type="submit" class="principal">
          Salvar correção
        </button>
        <button type="button" class="secundario" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function LinhaCopia({
  x,
  gestor,
  empresas,
  hoje,
  aoSalvar,
}: {
  x: CopiaCruzada
  gestor: boolean
  empresas: string[]
  hoje: string
  aoSalvar: (d: CorrecaoCopia, texto: string) => Promise<void>
}) {
  const c = x.copia
  const selo = seloDe(x)
  const [modo, setModo] = useState<'' | 'corrigir' | 'devolver'>('')
  return (
    <li class="pj-linha-painel pj-linha-copia">
      <div>
        <span class={`pj-selo ${selo.classe}`}>{selo.texto}</span>
        <br />
        <b>{c.empresa}</b>
        {c.colaborador ? <span class="discreto"> · {c.colaborador}</span> : null}
        <br />
        <span class="pj-rev">{rotuloRev(c.fase, c.revisao)}</span> · {plural(c.copias, 'cópia', 'cópias')} · entregue {c.entrega ? dataBR(c.entrega) : `"${c.entregaTexto}"`}
        {c.devolucao ? ` · devolvida ${dataBR(c.devolucao)}` : ''}
        <div class="discreto">
          linha {c.linha} · {c.titulo}
        </div>
        {gestor && !modo && (
          <div class="pj-botoes-linha">
            <button type="button" class="secundario" onClick={() => setModo('corrigir')}>
              Corrigir
            </button>
            {!c.devolucao && (
              <button type="button" class="secundario" onClick={() => setModo('devolver')}>
                Registrar devolução
              </button>
            )}
          </div>
        )}
        {modo && (
          <FormCopia
            copia={c}
            empresas={empresas}
            devolucaoInicial={modo === 'devolver' ? hoje : c.devolucao}
            aoCancelar={() => setModo('')}
            aoSalvar={async (d) => {
              await aoSalvar(d, d.devolucao && !c.devolucao ? `Devolução registrada (linha ${c.linha}).` : `Correção salva (linha ${c.linha}).`)
              setModo('')
            }}
          />
        )}
      </div>
    </li>
  )
}

function FormCopia({
  copia: c,
  empresas,
  devolucaoInicial,
  aoSalvar,
  aoCancelar,
}: {
  copia: Copia
  empresas: string[]
  devolucaoInicial: string | null
  aoSalvar: (d: CorrecaoCopia) => Promise<void>
  aoCancelar: () => void
}) {
  const [empresa, setEmpresa] = useState(c.empresa)
  const [colaborador, setColaborador] = useState(c.colaborador)
  const [fase, setFase] = useState<Fase>(c.fase)
  const [revisao, setRevisao] = useState(c.revisao === null ? '' : String(c.revisao))
  const [entrega, setEntrega] = useState(c.entrega ?? '')
  const [devolucao, setDevolucao] = useState(devolucaoInicial ?? '')
  const [erro, setErro] = useState('')
  const lista = `empresas-${c.linha}`
  const enviar = async (e: Event) => {
    e.preventDefault()
    const n = revisao === '' ? null : Number(revisao)
    if (!empresa.trim()) return setErro('Diga a empresa.')
    if (n !== null && (!Number.isInteger(n) || n < 0)) return setErro('A revisão é um número (0, 1, 2...).')
    if (devolucao && entrega && devolucao < entrega) return setErro('A devolução não pode ser antes da entrega.')
    await aoSalvar({ empresa: empresa.trim(), colaborador: colaborador.trim(), fase, revisao: n, entrega: entrega || null, devolucao: devolucao || null })
  }
  return (
    <form class="pj-form pj-form-base" onSubmit={enviar} data-testid="form-copia">
      <Campo rotulo="Empresa">
        <input value={empresa} list={lista} onInput={(e) => setEmpresa(e.currentTarget.value)} />
        <datalist id={lista}>
          {empresas.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </Campo>
      <Campo rotulo="Colaborador">
        <input value={colaborador} onInput={(e) => setColaborador(e.currentTarget.value)} />
      </Campo>
      <div class="pj-campos-2">
        <Campo rotulo="Fase">
          <select value={fase} onChange={(e) => setFase(e.currentTarget.value)}>
            {FASES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Revisão entregue">
          <input type="number" min={0} inputMode="numeric" value={revisao} onInput={(e) => setRevisao(e.currentTarget.value)} />
        </Campo>
      </div>
      <div class="pj-campos-2 pj-datas">
        <Campo rotulo="Entregue em">
          <input type="date" value={entrega} onInput={(e) => setEntrega(e.currentTarget.value)} />
        </Campo>
        <Campo rotulo="Devolvida em" dica="Vazio = ainda em campo.">
          <input type="date" value={devolucao} onInput={(e) => setDevolucao(e.currentTarget.value)} />
        </Campo>
      </div>
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      <div class="pj-botoes-form">
        <button type="submit" class="principal">
          Salvar correção
        </button>
        <button type="button" class="secundario" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
