// Partes comuns das telas da base importada (Painel, Pranchas, Entregas, prancha): carregar a base com as
// correções por cima, o cabeçalho e as abas.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { lerBaseOuDoPacote, type BaseProjetos } from '../base'
import { aEntregar, gravarDestinatarios, lerDestinatarios, regrasAtuais, type DadosDestinatario, type Destinatario } from '../distribuicao'
import { aplicarEdicoes, gravarEdicao, lerEdicoes, resumirEscritorio, type Edicao, type NovaEdicao } from '../edicoes'
import { cruzar, resumir, type CopiaCruzada } from '../painel'
import { copiasDoApp, mesclarEscritorio, vigentesDoServidor } from '../canteiro'
import type { Contexto, TelaProjetos } from './ModuloProjetos'
import { dataBR, horaBR } from './comum'
import { FaixaAutodoc } from './FaixaAutodoc'
import '../../telas/cabecalho.css'

/** A base desta obra (só dela), com as correções aplicadas e o cruzamento feito. */
export function usarBase(ctx: Contexto) {
  const { obra, dados, usuario } = ctx
  // sem conta não há nome de usuário: o histórico diz "neste aparelho"
  const autor = ctx.semConta ? 'neste aparelho' : usuario.email || usuario.id
  // lista de distribuição sincronizada: quem não é este usuário aparece como "outra pessoa da obra"
  const nomeDe = (id: string) => (id === usuario.id ? autor : 'outra pessoa da obra')
  const [base, setBase] = useState<BaseProjetos | null | undefined>(undefined)
  const [edicoes, setEdicoes] = useState<Edicao[]>([])
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([])

  // A base é de uma obra só: ao trocar de obra, some a anterior e uma leitura atrasada não entra.
  useEffect(() => {
    let valendo = true
    setBase(undefined)
    Promise.all([lerBaseOuDoPacote(obra.id), lerEdicoes(obra.id), lerDestinatarios(obra.id, usuario.id, nomeDe)]).then(([b, e, d]) => {
      if (!valendo) return
      setEdicoes(e)
      setDestinatarios(d)
      setBase(b)
    })
    return () => {
      valendo = false
    }
  }, [obra.id])

  // Com conta, a revisão vigente vem do servidor (a lista do Autodoc publicada pelo PC): a lista em CSV não é
  // preciso importar. Sem conta (ou servidor ainda vazio), vale a lista importada.
  const vigServidor = useMemo(() => (!ctx.semConta && dados.vigentes.size ? vigentesDoServidor(dados) : null), [ctx.semConta, dados])
  // Com conta, as entregas registradas no app (com ou sem assinatura) entram no canteiro junto com a ficha
  // (achado do testador, 21/11): as 5 listas se cruzam. Sem a ficha importada, valem só elas.
  const doApp = useMemo(() => (ctx.semConta ? [] : copiasDoApp(dados)), [ctx.semConta, dados])
  const corrigida = useMemo(() => {
    const b = base ?? (vigServidor && doApp.length ? { vigentes: [], copias: [] } : null)
    if (!b) return null
    const c = aplicarEdicoes(vigServidor ? { ...b, vigentes: vigServidor } : b, edicoes)
    return { ...c, copias: [...c.copias, ...doApp], escritorio: mesclarEscritorio(b.escritorioIndice, c.escritorio) }
  }, [base, edicoes, vigServidor, doApp])
  const cruzadas = useMemo<CopiaCruzada[] | null>(
    () => (corrigida && corrigida.vigentes.length && corrigida.copias.length ? cruzar(corrigida.copias, corrigida.vigentes, dados.hoje) : null),
    [corrigida, dados.hoje],
  )
  const resumo = useMemo(() => (cruzadas ? resumir(cruzadas) : null), [cruzadas])
  const escritorio = useMemo(() => (corrigida ? resumirEscritorio(corrigida.vigentes, corrigida.escritorio, dados.hoje) : null), [corrigida, dados.hoje])

  const regras = useMemo(() => regrasAtuais(destinatarios), [destinatarios])
  const pendentes = useMemo(() => (corrigida && cruzadas ? aEntregar(corrigida.vigentes, cruzadas, regras) : null), [corrigida, cruzadas, regras])

  const salvar = async (nova: NovaEdicao) => setEdicoes(await gravarEdicao(obra.id, nova, autor))
  const salvarRegras = async (novas: (DadosDestinatario & { substitui_id?: string | null })[]) => setDestinatarios(await gravarDestinatarios(obra.id, novas, usuario.id, nomeDe))

  const fonteVigente = vigServidor ? 'servidor (lista do Autodoc publicada)' : base?.vigentesArquivo ? `lista importada (${base.vigentesArquivo})` : 'lista importada'
  return { base, setBase, edicoes, corrigida, cruzadas, resumo, escritorio, salvar, destinatarios, regras, pendentes, salvarRegras, vigServidor, fonteVigente }
}

export type AbaBase = 'painel' | 'agora' | 'pessoas' | 'pranchas' | 'entregas' | 'a-entregar' | 'distribuicao' | 'importar'

const ABAS: { aba: AbaBase; rotulo: string; tela: TelaProjetos }[] = [
  { aba: 'painel', rotulo: 'Painel', tela: { nome: 'painel' } },
  { aba: 'agora', rotulo: 'Fazer agora', tela: { nome: 'agora' } },
  { aba: 'pessoas', rotulo: 'Pessoas', tela: { nome: 'pessoas' } },
  { aba: 'pranchas', rotulo: 'Pranchas', tela: { nome: 'pranchas-base' } },
  { aba: 'entregas', rotulo: 'Entregas', tela: { nome: 'entregas-base' } },
  { aba: 'a-entregar', rotulo: 'A entregar', tela: { nome: 'a-entregar' } },
  { aba: 'distribuicao', rotulo: 'Distribuição', tela: { nome: 'distribuicao' } },
]

/** Cabeçalho das abas da base: título, datas da base e as abas. As abas trocam a tela sem empilhar. */
export function CabecalhoBase({ ctx, aba, aoSair, base, temCruzamento }: { ctx: Contexto; aba: AbaBase; aoSair: () => void; base: BaseProjetos | null; temCruzamento: boolean }) {
  const { obra, ir, trocar } = ctx
  const vigenteDoServidor = !ctx.semConta && ctx.dados.vigentes.size > 0
  // a data vale também para as entregas registradas no app (achado do testador, 22/11)
  const doApp = useMemo(() => (ctx.semConta ? [] : copiasDoApp(ctx.dados)), [ctx.semConta, ctx.dados])
  const todasCopias = [...(base?.copias ?? []), ...doApp]
  // no celular as abas não cabem: a ativa rola para dentro da tela
  const abas = useRef<HTMLElement>(null)
  useEffect(() => {
    const ativa = abas.current?.querySelector<HTMLElement>('.ativa')
    if (ativa && abas.current) abas.current.scrollLeft = Math.max(0, ativa.offsetLeft - abas.current.offsetLeft - 16)
  }, [aba])
  return (
    <>
      <header class="so-cabecalho pj-topo">
        <button type="button" class="pj-voltar so-cab-voltar" onClick={aoSair} aria-label="Voltar">
          <span aria-hidden="true">‹</span>
        </button>
        <div class="pj-titulo so-cab-titulo">
          <h1>
            Projetos <span class="selo-beta">beta</span>
          </h1>
          <p class="discreto">{obra.codigo} · painel das cópias em campo</p>
        </div>
      </header>

      {base && (base.vigentesImportadaEm || base.copiasImportadaEm || vigenteDoServidor) && (
        <p class="pj-aviso-base" data-testid="painel-datas">
          {vigenteDoServidor
            ? 'Revisão vigente do servidor (lista do Autodoc).'
            : base.vigentesImportadaEm
              ? `Revisão vigente da lista importada em ${horaBR(base.vigentesImportadaEm)} (última atualização manual).`
              : 'Falta a lista vigente.'}{' '}
          {todasCopias.length ? `Distribuição com entregas até ${dataBR(ultimaEntrega(todasCopias))}.` : 'Falta a distribuição.'}
        </p>
      )}

      {/* com conta: quando o Autodoc foi puxado, em todas as abas (pedido do Nicolas, 21/11) */}
      {!ctx.semConta && <FaixaAutodoc obraId={obra.id} />}

      <nav class="pj-abas" aria-label="Partes do módulo" ref={abas}>
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

function ultimaEntrega(copias: readonly { entrega: string | null }[]): string {
  let m = ''
  for (const c of copias) if (c.entrega && c.entrega > m) m = c.entrega
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
