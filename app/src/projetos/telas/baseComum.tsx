// Partes comuns das telas da base importada (Painel, Pranchas, Entregas, prancha): carregar a base com as
// correções por cima, o cabeçalho e as abas.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { lerBaseOuDoPacote, type BaseProjetos } from '../base'
import { aplicarEdicoes, gravarEdicao, lerEdicoes, resumirEscritorio, type Edicao, type NovaEdicao } from '../edicoes'
import { cruzar, resumir, type CopiaCruzada } from '../painel'
import type { Contexto, TelaProjetos } from './ModuloProjetos'
import { dataBR } from './comum'

/** A base desta obra (só dela), com as correções aplicadas e o cruzamento feito. */
export function usarBase(ctx: Contexto) {
  const { obra, dados, usuario } = ctx
  const [base, setBase] = useState<BaseProjetos | null | undefined>(undefined)
  const [edicoes, setEdicoes] = useState<Edicao[]>([])

  // A base é de uma obra só: ao trocar de obra, some a anterior e uma leitura atrasada não entra.
  useEffect(() => {
    let valendo = true
    setBase(undefined)
    Promise.all([lerBaseOuDoPacote(obra.id), lerEdicoes(obra.id)]).then(([b, e]) => {
      if (!valendo) return
      setEdicoes(e)
      setBase(b)
    })
    return () => {
      valendo = false
    }
  }, [obra.id])

  const corrigida = useMemo(() => (base ? aplicarEdicoes(base, edicoes) : null), [base, edicoes])
  const cruzadas = useMemo<CopiaCruzada[] | null>(
    () => (corrigida && corrigida.vigentes.length && corrigida.copias.length ? cruzar(corrigida.copias, corrigida.vigentes, dados.hoje) : null),
    [corrigida, dados.hoje],
  )
  const resumo = useMemo(() => (cruzadas ? resumir(cruzadas) : null), [cruzadas])
  const escritorio = useMemo(() => (corrigida ? resumirEscritorio(corrigida.vigentes, corrigida.escritorio, dados.hoje) : null), [corrigida, dados.hoje])

  // sem conta não há nome de usuário: o histórico diz "neste aparelho"
  const autor = ctx.semConta ? 'neste aparelho' : usuario.email || usuario.id
  const salvar = async (nova: NovaEdicao) => setEdicoes(await gravarEdicao(obra.id, nova, autor))

  return { base, setBase, edicoes, corrigida, cruzadas, resumo, escritorio, salvar }
}

export type AbaBase = 'painel' | 'pranchas' | 'entregas' | 'importar'

const ABAS: { aba: AbaBase; rotulo: string; tela: TelaProjetos }[] = [
  { aba: 'painel', rotulo: 'Painel', tela: { nome: 'painel' } },
  { aba: 'pranchas', rotulo: 'Pranchas', tela: { nome: 'pranchas-base' } },
  { aba: 'entregas', rotulo: 'Entregas', tela: { nome: 'entregas-base' } },
]

/** Cabeçalho das abas da base: título, datas da base e as abas. As abas trocam a tela sem empilhar. */
export function CabecalhoBase({ ctx, aba, aoSair, base, temCruzamento }: { ctx: Contexto; aba: AbaBase; aoSair: () => void; base: BaseProjetos | null; temCruzamento: boolean }) {
  const { obra, ir, trocar } = ctx
  return (
    <>
      <header class="pj-topo">
        <button type="button" class="pj-voltar" onClick={aoSair} aria-label="Voltar">
          ‹ Voltar
        </button>
        <div class="pj-titulo">
          <h1>
            Projetos <span class="selo-beta">beta</span>
          </h1>
          <p class="discreto">{obra.codigo} · painel das cópias em campo</p>
        </div>
      </header>

      {base && (base.vigentesImportadaEm || base.copiasImportadaEm) && (
        <p class="pj-aviso-base" data-testid="painel-datas">
          {base.vigentesImportadaEm ? `Lista vigente importada em ${dataBR(base.vigentesImportadaEm)}.` : 'Falta a lista vigente.'}{' '}
          {base.copias.length ? `Distribuição com entregas até ${dataBR(ultimaEntrega(base))}.` : 'Falta a distribuição.'}
        </p>
      )}

      <nav class="pj-abas" aria-label="Partes do módulo">
        {ABAS.map((a) => (
          <button key={a.aba} type="button" class={aba === a.aba ? 'ativa' : ''} aria-current={aba === a.aba ? 'page' : undefined} disabled={!temCruzamento} onClick={() => trocar(a.tela)}>
            {a.rotulo}
          </button>
        ))}
        <button type="button" onClick={() => ir({ nome: 'inicio' })}>
          Empresas
        </button>
        <button type="button" class={aba === 'importar' ? 'ativa' : ''} aria-current={aba === 'importar' ? 'page' : undefined} onClick={() => trocar({ nome: 'painel', importar: true })}>
          Importar base
        </button>
      </nav>
    </>
  )
}

function ultimaEntrega(b: BaseProjetos): string {
  let m = ''
  for (const c of b.copias) if (c.entrega && c.entrega > m) m = c.entrega
  return m
}

/** Linha que abre a prancha: toque, Enter ou espaço. */
export function tocavel(abrir: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: abrir,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        abrir()
      }
    },
  }
}
