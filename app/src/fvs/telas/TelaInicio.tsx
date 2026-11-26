// Início da FVS em 3 níveis (pedido do Nicolas, 21/11/2026; agrupamento em ../navegacao.ts):
//   1. os pavimentos com planta publicada, na ordem da obra, com o andamento de cada um;
//   2. ao tocar no pavimento, as disciplinas que ele tem (Estrutura, Alvenaria, Acabamentos, Instalações);
//   3. ao tocar na disciplina, as opções (Pilares, Vigas, Lajes, armadura de laje, furos...), cada uma abrindo a
//      planta que já existe. Cada planta mostra se já está no aparelho (abre sem internet) ou o Baixar.
// Os três níveis são esta mesma tela (o download continua ao trocar de nível); o voltar sobe um nível.
import { concretadaDe } from '../concretada'
import { resumoDasRegras } from '../regras_tela'
import { contagemDoEscoramento, listaDoEscoramento } from '../escoramento'
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { resumoDasAreas } from '../areas'
import { baixarPlanta, ehDeAmbientes, ehDeArmadura, ehDeFuracao, ehDeVedacao, paraLancarDaObra, partesDoPilar, quemMarcou, registroNaFrente, relogioAntesDoPacote, relogioAtrasado, reprovacoesDaObra, situacaoDaObra, type DadosFvs, type Planta } from '../dados'
import { dataHoraCompleta, hojeNoAparelho, mb } from '../formato'
import { baixarTexto, planilhaDaSituacao } from '../planilha'
import { abrirPacoteOuAnterior, limparPacotes, pacotesJaLidos, pacotesNoAparelho, removerPacotes, grupoDoAmbienteGuardado, semFichasGuardado, semTipoGuardado, soDetalheGuardado, daGradeGuardado, fichaDeGradeGuardada, textoDoErroDeDownload } from '../pacote'
import { avisoDasPlantas, manterNaLimpeza, textosDaRevisao } from '../revisoes'
import { opcoesDosAmbientes, type OpcaoDosAmbientes } from '../opcoes_ambientes'
import { camadaDoTrecho, NOME_DA_CAMADA, situacaoDaBarra, type CamadaDeBarras } from '../barras'
import { disciplinaDePontos, fichaDosPontos, fichasDoPonto, textoDoAvancoDosPontos } from '../pontos'
import { fichasPara, resumoDaEstrutura, resumoDosAmbientes } from '../situacao'
import { avancoDosFuros, ehDeCamadaDeFuros, furoDeOutraPlanta, temFuracaoUnica, textoDoAvancoDosFuros } from '../furos_laje'
import { IconeDoItem } from './icones'
import { andamentoPorApartamento, categoriaDoAcabamento, categoriasPresentes, ehDeAcabamento, textoDoAndamento, valeNoAcabamento, type AndamentoDaFicha } from '../acabamentos'
import { disciplinasDoPavimento, ehOpcaoDeAlvenaria, ehOpcaoDeInstalacoes, OPCOES_DA_FORMA } from '../navegacao'
import { SEM_FILTRO } from '../reprovacoes'
import { AvisoHora } from './AvisoHora'
import { BotaoExportarPdf } from '../../telas/ExportarPdf'
import { folhaDaFvs } from '../pdf'
import { BuscaNaObra } from './BuscaNaObra'
import { banco } from '../../nucleo/servicos'
import { dataDoPacoteGuardado } from '../../nucleo/pacote_obra'
import { avisoDoSistemaOficial } from '../../integracoes/sistema_oficial'
import type { ContextoFvs, TelaFvs } from './ModuloFvs'
import { filtrarListaAoAbrir } from './TelaReprovacoes'
import { quantosLocais } from '../locais'
import '../../telas/cabecalho.css'
import { Ajuda } from '../../telas/Ajuda'

const OBRA_INTEIRA = 'obra-inteira'
/** filtro por acabamento no menu do pavimento (sessão 5, 24/11/2026): a escolha, guardada na sessão */
const CHAVE_DO_ACABAMENTO = 'fvs-acabamento-escolhido'
const TODOS_OS_ACABAMENTOS = 'todos'
const CHAVE_DA_FICHA_DO_APTO = 'fvs-acabamento-ficha-do-apto'

/**
 * Contas da obra inteira (totais, reprovações, para lançar), guardadas junto dos dados: voltar ao início ou
 * abrir a FVS de novo com os mesmos dados não refaz (pedido do Nicolas, 21/11: "FVS demora 5s para abrir").
 */
const contasDe = new WeakMap<DadosFvs, Map<string, unknown>>()
function conta<T>(dados: DadosFvs, chave: string, fazer: () => T): T {
  let m = contasDe.get(dados)
  if (!m) contasDe.set(dados, (m = new Map()))
  if (!m.has(chave)) m.set(chave, fazer())
  return m.get(chave) as T
}

/** Onde a pessoa está: nada = lista de pavimentos; pavimentoId = as disciplinas dele; e disciplina = as opções dela. */
export interface NivelDoInicio {
  pavimentoId: string
  disciplina?: string
}

export function TelaInicio({ ctx, aviso, nivel }: { ctx: ContextoFvs; aviso: string; nivel?: NivelDoInicio }) {
  const { dados, props, online, ir, voltar, sistema } = ctx
  // sem conta, a planta vem do pacote da obra (.zip ou pasta), não da internet: o Baixar não espera a rede
  // (testador, 08/11: no aparelho do .zip a pergunta dizia "é só baixar de novo" e o Baixar pedia internet)
  const semRede = !online && !ctx.local
  // já lida nesta página (ModuloFvs pede junto com os dados): a primeira conta já sai certa, sem refazer
  const [noAparelho, setNoAparelho] = useState<Map<string, { tamanho: number }> | null>(pacotesJaLidos)
  /** download em andamento: planta atual, percentual dela e, no pavimento inteiro, quantas faltam */
  const [baixando, setBaixando] = useState<{ plantaId: string; pct: number; pavimentoId?: string; feitas: number; total: number } | null>(null)
  const [erro, setErro] = useState('')
  const dono = { obraId: props.obra.id, usuarioId: props.usuario.id }
  /** Data em que o pacote da obra (.zip ou pasta) foi gerado: o relógio não pode estar antes dela. */
  const [geradoEm, setGeradoEm] = useState<string | null>(null)
  useEffect(() => {
    dataDoPacoteGuardado(banco, props.obra.id).then(setGeradoEm, () => setGeradoEm(null))
  }, [props.obra.id])
  const naFrente = useMemo(() => conta(dados, 'frente', () => registroNaFrente(dados)), [dados])
  // locais do sistema oficial que não são peça e têm ficha ou marcação (tela "Locais fora da planta")
  const locaisFora = useMemo(() => quantosLocais(dados), [dados])

  // O que está no aparelho. Sai o que esta pessoa não vê mais e a revisão anterior de uma planta cuja
  // revisão nova já chegou; a anterior fica até lá, para ela não ficar sem planta na obra.
  const atualizar = async () => {
    const agora = await pacotesNoAparelho()
    const saiu = await limparPacotes(dono, manterNaLimpeza(dados.plantaPorId, dados.anterioresDe, dados.vigenteDe, agora))
    setNoAparelho(saiu ? await pacotesNoAparelho() : agora)
  }
  useEffect(() => {
    atualizar()
  }, [dados])

  // Menu do pavimento (20/11): as opções dos ambientes (alvenaria, reboco, piso...) saem do pacote da planta de
  // ambientes que já está no aparelho (opcoes_ambientes.ts, da frente 05). Sem o pacote, fica só o Baixar.
  const [opcoesAmb, setOpcoesAmb] = useState<Map<string, OpcaoDosAmbientes[]>>(new Map())
  useEffect(() => {
    if (!noAparelho) return
    let vivo = true
    ;(async () => {
      const m = new Map<string, OpcaoDosAmbientes[]>()
      for (const pls of dados.plantasDe.values())
        for (const p of pls) {
          if (!ehDeAmbientes(p)) continue
          const pac = await abrirPacoteOuAnterior(p.id, (dados.anterioresDe.get(p.id) ?? []).map((a) => a.id)).catch(() => null)
          if (pac) m.set(p.id, opcoesDosAmbientes(pac.manifest, dados.fichas))
        }
      if (vivo) setOpcoesAmb(m)
    })()
    return () => {
      vivo = false
    }
  }, [noAparelho, dados])

  /** Baixa uma planta ou várias, uma depois da outra. Se uma falhar, o que já baixou fica no aparelho. */
  const baixar = async (lista: Planta[], pavimentoId?: string) => {
    setErro('')
    try {
      for (let i = 0; i < lista.length; i++) {
        const atual = lista[i]
        setBaixando({ plantaId: atual.id, pct: 0, pavimentoId, feitas: i, total: lista.length })
        let ultimo = 0
        await baixarPlanta(atual, dono, (f) => {
          // só redesenha quando muda o número inteiro: a conexão manda milhares de pedaços
          const pct = Math.floor(f * 100)
          if (pct !== ultimo) {
            ultimo = pct
            setBaixando((b) => b && { ...b, pct })
          }
        })
        await atualizar()
      }
    } catch (e) {
      setErro(textoDoErroDeDownload(e))
    } finally {
      setBaixando(null)
    }
  }

  const tamanhoDe = (p: Planta) => (p.manifest?.tamanho ?? 0) + (p.pacote?.tamanho ?? 0)

  /** Tira do aparelho as plantas de um pavimento, para liberar espaço. Marcações e fotos não são afetadas. */
  const tirarDoAparelho = async (nomePavimento: string, plantas: readonly Planta[], tamanho: number) => {
    const aviso = ctx.local
      ? 'Para abrir de novo, toque em Baixar; se o app foi fechado, abra antes o pacote da obra (.zip) no menu.'
      : online
        ? 'Depois, para abrir, é só baixar de novo.'
        : 'Você está sem internet: para abrir de novo, vai precisar de internet.'
    if (!confirm(`Tirar do aparelho as plantas de ${nomePavimento} (${mb(tamanho)})?\n\nAs marcações não são afetadas. ${aviso}`)) return
    const ids = plantas.flatMap((p) => [p.id, ...(dados.anterioresDe.get(p.id) ?? []).map((a) => a.id)])
    await removerPacotes(ids)
    await atualizar()
  }

  const linhaDaPlanta = (p: Planta) => {
    const guardado = noAparelho?.get(p.id)
    // revisão nova publicada e ainda não baixada: a anterior continua abrindo
    const antiga = !guardado && noAparelho ? dados.anterioresDe.get(p.id)?.find((a) => noAparelho.has(a.id)) : undefined
    // mesma revisão com id novo (prancha publicada de novo): "Planta atualizada", não "Revisão nova"
    const textos = antiga ? textosDaRevisao(p, antiga) : undefined
    const tamanho = tamanhoDe(p)
    return (
      <li key={p.id}>
        <div class="fv-trecho">
          <span>
            <strong>{p.trecho}</strong>
            <span class="discreto">
              {/* planta de ambientes: o número de ambientes já está no resumo acima (o da folha soma as esquadrias) */}
              {ehDeAmbientes(p) ? p.prancha : `${p.prancha} · ${p.elementos} ${ehDeVedacao(p) ? 'paredes' : p.disciplina in SECAO_DE_INSTALACOES ? 'pontos' : p.disciplina === 'furacao' ? (p.elementos === 1 ? 'furo' : 'furos') : 'peças'}`}
            </span>
            {textos && <span class="fv-txt-rev" data-testid="fvs-aviso-revisao">{textos.aviso}</span>}
          </span>
          {noAparelho === null ? (
            // ainda lendo o que está no aparelho: não oferece baixar o que pode já estar aqui
            <button type="button" class="fv-baixar" disabled>
              …
            </button>
          ) : guardado ? (
            <button type="button" class="fv-abrir" onClick={() => ir({ nome: 'planta', plantaId: p.id })}>
              Abrir
            </button>
          ) : (
            <span class="fv-trecho-acoes">
              {textos && (
                <button type="button" class="fv-abrir" onClick={() => ir({ nome: 'planta', plantaId: p.id })}>
                  {textos.abrir}
                </button>
              )}
              <button
                type="button"
                class="fv-baixar"
                disabled={semRede || baixando !== null}
                onClick={() => baixar([p])}
                title={semRede ? 'Precisa de internet para baixar' : ''}
              >
                {baixando?.plantaId === p.id ? `Baixando ${baixando.pct}%` : `${textos ? textos.baixar : 'Baixar'} ${tamanho ? mb(tamanho) : ''}`.trim()}
              </button>
            </span>
          )}
        </div>
      </li>
    )
  }

  /** Botão grande de uma planta (nível 3, 21/11/2026): abre se está no aparelho (ou a revisão anterior), senão baixa.
   *  `abrir` diz como abre (a aba da forma, por exemplo); sem ele, abre a planta como está. */
  const botaoDaPlanta = (
    p: Planta,
    o: { chave?: string; titulo: string; sub?: string | null; icone?: ComponentChildren; abrir?: TelaFvs; testid?: string; extra?: Record<string, string> },
  ) => {
    const guardado = noAparelho?.get(p.id)
    const antiga = !guardado && noAparelho ? dados.anterioresDe.get(p.id)?.find((a) => noAparelho.has(a.id)) : undefined
    const abre = !!guardado || !!antiga
    const textos = antiga ? textosDaRevisao(p, antiga) : undefined
    const tamanho = tamanhoDe(p)
    const acao = noAparelho === null ? '…' : abre ? (textos ? textos.abrir : 'Abrir') : baixando?.plantaId === p.id ? `Baixando ${baixando.pct}%` : `Baixar ${tamanho ? mb(tamanho).replace(' ', ' ') : ''}`
    return (
      <button
        type="button"
        key={o.chave ?? p.id}
        class="fv-bt-armadura"
        data-testid={o.testid ?? 'fvs-planta'}
        data-planta={p.id}
        {...(o.extra ?? {})}
        disabled={noAparelho === null || (!abre && (semRede || baixando !== null))}
        onClick={() => (abre ? ir(o.abrir ?? { nome: 'planta', plantaId: p.id }) : baixar([p]))}
        title={!abre && semRede ? 'Precisa de internet para baixar' : ''}
      >
        {o.icone}
        <span class="fv-bt-texto">
          <b>{o.titulo}</b>
          {o.sub && <small>{o.sub}</small>}
          {textos && <small class="fv-txt-rev">{textos.aviso}</small>}
        </span>
        <span class={abre ? 'fv-bt-acao' : 'fv-bt-acao fv-bt-baixar'}>{acao}</span>
      </button>
    )
  }

  /** Planta com revisão nova a baixar e a anterior no aparelho: a linha com os dois botões (Abrir R13 e Baixar R14). */
  const temRevisaoParaBaixar = (p: Planta) => !!noAparelho && !noAparelho.get(p.id) && !!dados.anterioresDe.get(p.id)?.some((a) => noAparelho.has(a.id))
  /** Botão da planta ou, com revisão nova a baixar, a linha de antes (com os dois botões). */
  const plantaNaLista = (p: Planta, titulo: string, sub: string | null, icone?: string) =>
    temRevisaoParaBaixar(p) ? (
      <ul key={p.id} class="lista fv-trechos">
        {linhaDaPlanta(p)}
      </ul>
    ) : (
      botaoDaPlanta(p, { titulo, sub, icone: icone ? <IconeDoItem qual={icone} /> : undefined })
    )

  /** Botão grande de uma direção da armadura de laje (planta própria, 20/11/2026). A direção sai do nome do
   *  trecho ("Armadura longitudinal inferior"). */
  const botaoDaArmadura = (p: Planta) => {
    const camada = camadaDoTrecho(p.trecho)
    return botaoDaPlanta(p, {
      titulo: camada ? NOME_DA_CAMADA[camada] : p.trecho,
      sub: `${p.elementos} ${p.elementos === 1 ? 'barra' : 'barras'} · ${p.prancha}`,
      icone: <IconeDaCamada camada={camada} />,
      testid: 'fvs-armadura',
      extra: { 'data-camada': camada ?? '' },
    })
  }

  const comPlanta = dados.pavimentos.filter((pv) => dados.plantasDe.has(pv.id))
  // no escritório, com internet boa, baixa tudo de uma vez antes de ir para a obra
  const faltamNaObra = noAparelho ? comPlanta.flatMap((pv) => dados.plantasDe.get(pv.id)!.filter((p) => !noAparelho.has(p.id))) : []
  const baixandoObra = baixando?.pavimentoId === OBRA_INTEIRA ? baixando : null
  const reprovacoes = useMemo(() => conta(dados, 'reprovacoes', () => reprovacoesDaObra(dados)), [dados])
  const abertas = reprovacoes.filter((r) => r.aberta).length
  const paraLancar = useMemo(() => conta(dados, 'lancar', () => paraLancarDaObra(dados, dados.lancados).length), [dados])
  // escoramento e desforma (3.6, 21/11): quantas peças já podem e quantas aguardam o prazo das regras
  const escoramento = useMemo(() => (dados.regras.prazos.length ? conta(dados, 'escoramento', () => contagemDoEscoramento(listaDoEscoramento(dados))) : null), [dados])
  const duplicadas = useMemo(() => [...dados.fichasCampoDe.values()].filter((f) => f.length > 1).length, [dados])
  const avisoSistema = avisoDoSistemaOficial(props.obra, dados.fichasCampoDe.size > 0 || dados.fichasCampoSemPeca.length > 0)
  // os resumos percorrem a obra inteira: só refaz quando os dados mudam, não a cada ponto do download
  // o que está no aparelho muda a conta (peça só de detalhe sai): entra na chave
  const chaveDosResumos = noAparelho ? 'resumos|' + [...noAparelho.keys()].sort().join(',') : 'resumos'
  const resumos = useMemo(() => conta(dados, chaveDosResumos, () => {
    const eventosDe = (id: string) => dados.eventosDe.get(id) ?? []
    const campo = {
      fichasDe: (id: string) => dados.fichasCampoDe.get(id) ?? [],
      ficha: (id: string) => dados.fichaPorId.get(id),
      partesDe: partesDoPilar,
      // pilar, viga e laje: verde só numa concretagem cadastrada (achado #2, 24/11)
      concretada: (id: string, tipo: string) => concretadaDe(dados.concretadas, id, tipo),
    }
    const locaisDe = new Map<string, Array<{ id: string; tipo: string }>>()
    for (const p of dados.pecaPorId.values()) {
      // área de laje tem resumo próprio: não é peça da forma
      if (dados.areaPorId.has(p.id)) continue
      // arranque do pilar de cima (só detalhe): não tem ficha aqui e a aba Pilares não mostra. Antes contava, e o
      // início dizia 844 liberáveis no Pilotis com 784 nas abas (rodada com a obra piloto, 20/11)
      if (soDetalheGuardado(p.id)) continue
      const l = locaisDe.get(p.pavimento_id)
      if (l) l.push(p)
      else locaisDe.set(p.pavimento_id, [p])
    }
    return new Map(
      dados.pavimentos.map((pv) => {
        const locais = locaisDe.get(pv.id) ?? []
        return [
          pv.id,
          {
            r: resumoDaEstrutura(locais, dados.fichas, eventosDe, campo),
            // quadrado da escavação (planta de fundação, 24/11) é local "A" mas não é cômodo: fora dos ambientes
            ra: resumoDosAmbientes(locais.filter((l) => !daGradeGuardado(l.id)), dados.fichas.filter((f) => !fichaDeGradeGuardada(f.codigo)), eventosDe, (id, codigo) => !semTipoGuardado(id) && !semFichasGuardado(id)?.includes(codigo)),
            rm: resumoDaEstrutura(locais, dados.fichas, eventosDe, campo, 'M'),
            rk: resumoDaEstrutura(locais, dados.fichas, eventosDe, campo, 'K'),
            lajes: resumoDasAreas(dados.areasDe.get(pv.id) ?? [], campo.ficha, eventosDe, undefined, (id) => campo.concretada(id, 'L')),
          },
        ] as const
      }),
    )
    // noAparelho: ler os pacotes diz quais peças são só detalhe (pacotesNoAparelho)
  }), [dados, chaveDosResumos])
  const naObra = [...resumos.values()].reduce((s, { r }) => ({ total: s.total + r.total, liberadas: s.liberadas + r.liberadas }), { total: 0, liberadas: 0 })

  // Nível da navegação (21/11/2026): pavimentos → disciplinas do pavimento → opções da disciplina.
  // Pavimento que sumiu (planta apagada, outra obra) volta à lista de pavimentos.
  const pvAberto = nivel ? comPlanta.find((pv) => pv.id === nivel.pavimentoId) : undefined
  const plantasDoPv = pvAberto ? dados.plantasDe.get(pvAberto.id)! : []
  const disciplinas = useMemo(() => disciplinasDoPavimento(plantasDoPv, opcoesAmb), [plantasDoPv, opcoesAmb])
  const discAberta = pvAberto && nivel?.disciplina ? disciplinas.find((d) => d.id === nivel.disciplina) : undefined

  // Estrutura com a forma no aparelho: uma opção por aba da forma (Pilares, Vigas, Lajes, Furos de viga),
  // lida do pacote (só as abas que a planta tem). Sem o pacote, a forma aparece como linha, com o Baixar.
  const [abasDaForma, setAbasDaForma] = useState<Map<string, Array<{ tipo: string; n: number; furos?: ReturnType<typeof avancoDosFuros> }>>>(new Map())
  const formasAbertas = discAberta?.id === 'estrutura' ? discAberta.plantas.filter((p) => p.disciplina === 'estrutura') : []
  // furos de laje e de viga por etapa (21/11/2026, "em etapas similares às barras de aço"): "x de y furos OK"
  // de cada planta de furação, lido do pacote no aparelho
  const [avancoDaFuracao, setAvancoDaFuracao] = useState<Map<string, ReturnType<typeof avancoDosFuros>>>(new Map())
  const furacaoAberta = discAberta?.id === 'estrutura' ? discAberta.plantas.filter(ehDeFuracao) : []
  // pontos de instalação (SPDA igual aos furos, 22/11/2026): "x de y pontos OK" de cada planta de pontos com
  // ficha (a de consulta, sem item de ficha, fica só com o número de pontos), lido do pacote no aparelho
  const [avancoDosPontos, setAvancoDosPontos] = useState<Map<string, { ok: number; errados: number; total: number }>>(new Map())
  const pontosAbertos =
    discAberta?.id === 'instalacoes'
      ? discAberta.plantas.filter((p) => {
          const d = disciplinaDePontos(p.disciplina)
          return !!d && !!fichaDosPontos(fichasPara('A', dados.fichas), d, fichasPara('L', dados.fichas))
        })
      : []
  useEffect(() => {
    if (!pontosAbertos.length || !noAparelho) return
    let vivo = true
    ;(async () => {
      const m = new Map<string, { ok: number; errados: number; total: number }>()
      for (const p of pontosAbertos) {
        const pac = await abrirPacoteOuAnterior(p.id, (dados.anterioresDe.get(p.id) ?? []).map((a) => a.id)).catch(() => null)
        if (!pac?.manifest.pontos) continue
        const a = { ok: 0, errados: 0, total: 0 }
        // só os pontos que marcam algum item de ficha (pelo tipo e pelo ambiente, 23/11/2026) contam
        const fa = fichasPara('A', dados.fichas)
        const fl = fichasPara('L', dados.fichas)
        for (const [id, pt] of Object.entries(pac.manifest.pontos)) {
          if (!fichasDoPonto(fa, pt, fl, (pt.ambiente && semFichasGuardado(pt.ambiente)) || []).length) continue
          a.total++
          const s = situacaoDaBarra(dados.eventosDe.get(id) ?? [])
          if (s === 'liberado') a.ok++
          else if (s === 'reprovado') a.errados++
        }
        m.set(p.id, a)
      }
      if (vivo) setAvancoDosPontos(m)
    })()
    return () => {
      vivo = false
    }
  }, [pontosAbertos.map((p) => p.id).join(','), noAparelho, dados])
  useEffect(() => {
    if (!furacaoAberta.length || !noAparelho) return
    let vivo = true
    ;(async () => {
      const m = new Map<string, ReturnType<typeof avancoDosFuros>>()
      for (const p of furacaoAberta) {
        const pac = await abrirPacoteOuAnterior(p.id, (dados.anterioresDe.get(p.id) ?? []).map((a) => a.id)).catch(() => null)
        if (pac) m.set(p.id, avancoDosFuros(pac.manifest, (id) => dados.eventosDe.get(id) ?? []))
      }
      if (vivo) setAvancoDaFuracao(m)
    })()
    return () => {
      vivo = false
    }
  }, [furacaoAberta.map((p) => p.id).join(','), noAparelho, dados])
  useEffect(() => {
    if (!formasAbertas.length || !noAparelho) return
    let vivo = true
    ;(async () => {
      const m = new Map<string, Array<{ tipo: string; n: number }>>()
      const temArmaduraPropria = plantasDoPv.some(ehDeArmadura)
      const temLaje = fichasPara('L', dados.fichas).length > 0 || (dados.areasDe.get(pvAberto!.id) ?? []).length > 0
      for (const p of formasAbertas) {
        const pac = await abrirPacoteOuAnterior(p.id, (dados.anterioresDe.get(p.id) ?? []).map((a) => a.id)).catch(() => null)
        if (!pac) continue
        const els = Object.values(pac.manifest.elementos)
        // com a planta "Furação" no pavimento, os furos da forma ficam só nela (sem "Furos de viga" aqui)
        const semFuros = temFuracaoUnica(plantasDoPv.filter(ehDeFuracao))
        const quantos = (t: string) => els.filter((e) => e.tipo === t && !(semFuros && t === 'F') && !furoDeOutraPlanta(e, pac.manifest) && !e.so_detalhe).length
        const nBarras = Object.keys(pac.manifest.barras ?? {}).length
        const abas = OPCOES_DA_FORMA.map(({ tipo }) => ({
          tipo,
          n: tipo === 'L' ? (dados.areasDe.get(pvAberto!.id) ?? []).length : tipo === 'B' ? (temArmaduraPropria ? 0 : nBarras) : quantos(tipo),
          furos: tipo === 'F' ? avancoDosFuros(pac.manifest, (id) => dados.eventosDe.get(id) ?? []) : undefined,
        })).filter(({ tipo, n }) => n > 0 || (tipo === 'L' && (temLaje || quantos('L') > 0)))
        m.set(p.id, abas)
      }
      if (vivo) setAbasDaForma(m)
    })()
    return () => {
      vivo = false
    }
  }, [formasAbertas.map((p) => p.id).join(','), noAparelho, dados])

  // Acabamentos por cômodo (sessão 5, 24/11/2026): na disciplina Acabamentos, um filtro por acabamento (reboco,
  // piso, pintura, drywall) em vez de tudo junto, e o andamento por apartamento ("Apto 305: Reboco Interno 3 de 8").
  // A escolha fica guardada na sessão do navegador (volta igual ao sair da planta).
  const [acabamento, setAcabamento] = useState<string>(() => {
    try {
      return sessionStorage.getItem(CHAVE_DO_ACABAMENTO) ?? ''
    } catch {
      return ''
    }
  })
  const escolherAcabamento = (id: string) => {
    setAcabamento(id)
    try {
      sessionStorage.setItem(CHAVE_DO_ACABAMENTO, id)
    } catch {
      // sem armazenamento (aba anônima): vale só enquanto a tela está aberta
    }
  }
  const fichaDoCodigo = useMemo(() => new Map(fichasPara('A', dados.fichas).map((f) => [f.codigo, f])), [dados])
  /** a categoria vem do título da ficha (o título da opção pode trazer o nome de um projeto); a opção de projeto
   * ("Impermeabilização") e a de esquadrias vão pelo próprio título, não pela ficha em que abrem */
  const tituloDaOpcao = (op: OpcaoDosAmbientes) => (op.id.startsWith('amb:ficha:') && fichaDoCodigo.get(op.abre.servico)?.titulo) || op.titulo
  const acabamentosAbertos = !!discAberta && discAberta.id !== 'alvenaria' && discAberta.id !== 'instalacoes' && discAberta.plantas.some(ehDeAmbientes)
  const opcoesDeAcabamento = acabamentosAbertos ? discAberta!.plantas.filter(ehDeAmbientes).flatMap((p) => (opcoesAmb.get(p.id) ?? []).filter((op) => ehDeAcabamento(op, fichaDeGradeGuardada))) : []
  const categoriasAcab = categoriasPresentes(opcoesDeAcabamento.map(tituloDaOpcao))
  // a escolha guardada pode não existir neste pavimento: fica a primeira (reboco, se houver)
  const acabEscolhido = acabamento === TODOS_OS_ACABAMENTOS || categoriasAcab.some((c) => c.id === acabamento) ? acabamento : categoriasAcab[0]?.id ?? TODOS_OS_ACABAMENTOS
  const daCategoria = (op: OpcaoDosAmbientes) => acabEscolhido === TODOS_OS_ACABAMENTOS || categoriaDoAcabamento(tituloDaOpcao(op)).id === acabEscolhido
  const fichasDoAcab =
    acabEscolhido === TODOS_OS_ACABAMENTOS
      ? []
      : fichasPara('A', dados.fichas).filter((f) => opcoesDeAcabamento.some((op) => op.abre.servico === f.codigo) && categoriaDoAcabamento(f.titulo).id === acabEscolhido)
  const chaveDoAcab = fichasDoAcab.map((f) => f.id).join(',')
  // acabamento com várias fichas (piso: cerâmico, contrapiso, vinílico...): por apartamento, uma ficha por vez
  // guardada como o acabamento: abrir a planta e voltar mantém a ficha escolhida
  const [fichaDoApto, setFichaDoAptoNoEstado] = useState<string>(() => {
    try {
      return sessionStorage.getItem(CHAVE_DA_FICHA_DO_APTO) ?? ''
    } catch {
      return ''
    }
  })
  const setFichaDoApto = (id: string) => {
    setFichaDoAptoNoEstado(id)
    try {
      sessionStorage.setItem(CHAVE_DA_FICHA_DO_APTO, id)
    } catch {
      // sem armazenamento: vale só enquanto a tela está aberta
    }
  }
  const fichaDoAptoVale = fichasDoAcab.find((f) => f.id === fichaDoApto) ?? fichasDoAcab[0]
  const porApartamento = useMemo(() => {
    if (!pvAberto || !chaveDoAcab) return []
    const ambientes = [...dados.pecaPorId.values()].filter((p) => p.pavimento_id === pvAberto.id && p.tipo === 'A' && !dados.areaPorId.has(p.id))
    return andamentoPorApartamento(
      ambientes,
      fichasDoAcab,
      (id) => dados.eventosDe.get(id) ?? [],
      grupoDoAmbienteGuardado,
      valeNoAcabamento(daGradeGuardado, fichaDeGradeGuardada, semFichasGuardado, semTipoGuardado),
      (id) => dados.fichaPorId.get(id),
    )
    // chaveDosResumos: ler os pacotes traz o apartamento e o "não se aplica" de cada cômodo
  }, [dados, pvAberto?.id, chaveDoAcab, chaveDosResumos])
  /** soma do pavimento por ficha do acabamento escolhido (conta também a que ninguém começou: "0 de 120") */
  const totaisDoAcab = fichasDoAcab
    .map((ficha) =>
      porApartamento.reduce<AndamentoDaFicha>(
        (t, l) => {
          const f = l.fichas.find((x) => x.ficha.id === ficha.id)
          return f ? { ficha, liberados: t.liberados + f.liberados, comR: t.comR + f.comR, total: t.total + f.total } : t
        },
        { ficha, liberados: 0, comR: 0, total: 0 },
      ),
    )
    .filter((t) => t.total > 0)

  // no aparelho: a planta ou a revisão anterior dela, que é o que abre até a nova chegar
  const pacoteDe = (p: Planta) => (noAparelho ? noAparelho.get(p.id) ?? (dados.anterioresDe.get(p.id) ?? []).map((a) => noAparelho.get(a.id)).find(Boolean) : undefined)

  /** Opções dos ambientes (alvenaria, reboco, piso...) de uma planta de ambientes, filtradas. */
  const opcoesDeAmbientes = (ambientes: readonly Planta[], filtro: (op: OpcaoDosAmbientes) => boolean) =>
    ambientes.map((p) => {
      const ops = (opcoesAmb.get(p.id) ?? []).filter(filtro)
      if (!ops.length) return null
      return (
        <div key={p.id} class="fv-grade-armadura" data-testid="fvs-opcoes-ambientes">
          {ops.map((op) =>
            botaoDaPlanta(p, { chave: op.id, titulo: op.titulo, sub: ambientes.length > 1 ? p.trecho : null, icone: <IconeDoItem qual={op.pontos?.length ? 'instalacoes' : ehOpcaoDeAlvenaria(op) ? 'paredes' : 'ambientes'} />, abrir: { nome: 'planta', plantaId: p.id, servico: op.abre.servico, aba: op.abre.aba }, testid: 'fvs-opcao-ambiente' }),
          )}
        </div>
      )
    })

  /** Topo dos níveis 2 e 3: o voltar sobe um nível (o voltar do Android também). */
  const topo = (voltarPara: string, titulo: string, sub: string) => (
    <header class="so-cabecalho fv-topo-inicio fv-topo-nivel">
      <button type="button" class="fv-voltar so-cab-voltar" onClick={voltar} aria-label={`Voltar para ${voltarPara}`}>
        <span aria-hidden="true">‹</span>
      </button>
      <div class="so-cab-titulo">
        <h1>{titulo}</h1>
        <p class="discreto">{sub}</p>
      </div>
    </header>
  )

  // ---------- nível 3: opções da disciplina ----------
  if (pvAberto && discAberta) {
    const pv = pvAberto
    const plantas = discAberta.plantas
    const { r, ra: resumoAmb, rm } = resumos.get(pv.id)!
    const daForma = plantas.filter((p) => p.disciplina === 'estrutura')
    const armadura = plantas.filter(ehDeArmadura).sort((a, b) => ordemDaCamada(a.trecho) - ordemDaCamada(b.trecho))
    const furacao = plantas.filter(ehDeFuracao).sort((a, b) => ordemDoFuro(a.trecho) - ordemDoFuro(b.trecho))
    const vedacao = plantas.filter(ehDeVedacao)
    const ambientes = plantas.filter(ehDeAmbientes)
    const conhecidas = (p: Planta) => p.disciplina === 'estrutura' || ehDeArmadura(p) || ehDeFuracao(p) || ehDeVedacao(p) || ehDeAmbientes(p)
    const outras = [...agrupar(plantas.filter((p) => !conhecidas(p)), (p) => p.disciplina)].sort(([a], [b]) => ordemDaSecao(a) - ordemDaSecao(b))
    // a forma vira opções só quando está no aparelho na revisão vigente (com revisão nova, a linha mostra o Abrir e o Baixar)
    const formaEmOpcoes = (p: Planta) => !!noAparelho?.get(p.id) && (abasDaForma.get(p.id)?.length ?? 0) > 0
    const sub = discAberta.id === 'estrutura' && r.total > 0 ? `${pv.nome} · ${r.liberadas} de ${r.total} peças liberadas` : pv.nome
    return (
      <main class="tela fv-inicio" data-testid="fvs-nivel-disciplina">
        {topo(pv.nome, discAberta.nome, sub)}
        {aviso && <p class="faixa-aviso">{aviso}</p>}
        {erro && <p class="erro" role="alert">{erro}</p>}
        <section class="cartao fv-pavimento fv-disciplina-aberta" data-testid="fvs-opcoes" data-disciplina={discAberta.id}>
          {daForma.length > 0 && (
            <div data-testid="fvs-secao-estrutura">
              {(armadura.length > 0 || furacao.length > 0) && <h3 class="fv-disciplina">Forma</h3>}
              {daForma.map((p) =>
                formaEmOpcoes(p) ? (
                  <div key={p.id} class="fv-grade-armadura" data-testid="fvs-opcoes-forma">
                    {abasDaForma.get(p.id)!.map(({ tipo, n, furos }) =>
                      botaoDaPlanta(p, {
                        chave: `${p.id}:${tipo}`,
                        titulo: OPCOES_DA_FORMA.find((o) => o.tipo === tipo)!.nome,
                        sub: [daForma.length > 1 ? p.trecho : '', tipo === 'L' ? (n ? `${n} ${n === 1 ? 'área desenhada' : 'áreas desenhadas'}` : 'Desenhe a área na planta') : tipo === 'F' ? (furos?.total ? textoDoAvancoDosFuros(furos) : `${n} ${n === 1 ? 'furo' : 'furos'}`) : tipo === 'B' ? `${n} ${n === 1 ? 'barra' : 'barras'}` : `${n} ${n === 1 ? 'peça' : 'peças'}`].filter(Boolean).join(' · '),
                        icone: <IconeDoItem qual={tipo} />,
                        abrir: { nome: 'planta', plantaId: p.id, tipo },
                        testid: 'fvs-opcao-forma',
                        extra: { 'data-tipo': tipo },
                      }),
                    )}
                  </div>
                ) : (
                  <div key={p.id} class="fv-grade-armadura">
                    {plantaNaLista(p, daForma.length > 1 ? `Forma · ${p.trecho}` : 'Forma: pilares, vigas e lajes', `${p.elementos} peças · ${p.prancha}`, 'forma')}
                  </div>
                ),
              )}
            </div>
          )}
          {armadura.length > 0 && (
            <div data-testid="fvs-grupo-armadura">
              <h3 class="fv-disciplina">Armadura de laje</h3>
              <div class="fv-grade-armadura">{armadura.map(botaoDaArmadura)}</div>
            </div>
          )}
          {furacao.length > 0 && (() => {
            // uma aba só, "Furos" (21/11/2026, "compilar as abas em uma só"): abre a planta de furação com todos
            // os furos (o filtro por tipo fica dentro dela); sem ela, a primeira por camada (as outras ficam no
            // seletor do topo da planta) e o avanço soma as camadas
            const unica = furacao.find((p) => !ehDeCamadaDeFuros(p.trecho))
            const abre = unica ?? furacao[0]
            const soma = (unica ? [unica] : furacao).map((p) => avancoDaFuracao.get(p.id))
            const a = soma.every(Boolean) ? soma.reduce<{ ok: number; errados: number; total: number }>((t, x) => ({ ok: t.ok + x!.ok, errados: t.errados + x!.errados, total: t.total + x!.total }), { ok: 0, errados: 0, total: 0 }) : undefined
            const n = (unica ? [unica] : furacao).reduce((t, p) => t + p.elementos, 0)
            return (
              <div data-testid="fvs-secao-outra">
                <h3 class="fv-disciplina">Furos</h3>
                <div class="fv-grade-armadura">{plantaNaLista(abre, 'Furos', `${a?.total ? textoDoAvancoDosFuros(a) : `${n} ${n === 1 ? 'furo' : 'furos'}`} · ${abre.prancha}`, 'furos')}</div>
              </div>
            )
          })()}
          {vedacao.length > 0 && (
            <div data-testid="fvs-secao-vedacao">
              <h3 class="fv-disciplina">Modulação de paredes</h3>
              {rm.total > 0 && (
                <p class="discreto" data-testid="fvs-resumo-paredes">
                  {rm.liberadas} de {rm.total} paredes liberadas
                  {rm.comR > 0 && <span class="fv-txt-r"> · {rm.comR} com NC</span>}
                </p>
              )}
              <div class="fv-grade-armadura">{vedacao.map((p) => plantaNaLista(p, vedacao.length > 1 ? p.trecho : 'Paredes do pavimento', `${p.elementos} paredes · ${p.prancha}`, 'paredes'))}</div>
            </div>
          )}
          {ambientes.length > 0 && discAberta.id === 'alvenaria' && (
            <div data-testid="fvs-ambientes-alvenaria">
              <h3 class="fv-disciplina">Por ambiente</h3>
              {opcoesDeAmbientes(ambientes, ehOpcaoDeAlvenaria)}
            </div>
          )}
          {ambientes.length > 0 && discAberta.id !== 'alvenaria' && discAberta.id !== 'instalacoes' && (
            <div data-testid="fvs-ambientes">
              <h3 class="fv-disciplina">Ambientes</h3>
              {categoriasAcab.length > 1 && (
                <div class="fv-filtro-acab" role="group" aria-label="Filtrar por acabamento" data-testid="fvs-filtro-acabamento">
                  {[...categoriasAcab, { id: TODOS_OS_ACABAMENTOS, nome: 'Todos' }].map((c) => (
                    <button key={c.id} type="button" class={`fv-chip-acab${acabEscolhido === c.id ? ' on' : ''}`} aria-pressed={acabEscolhido === c.id} data-categoria={c.id} onClick={() => escolherAcabamento(c.id)}>
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
              {categoriasAcab.length > 1 && acabEscolhido !== TODOS_OS_ACABAMENTOS && totaisDoAcab.length > 0 ? (
                <ul class="fv-servicos" data-testid="fvs-resumo-acabamento">
                  {totaisDoAcab.map((s) => (
                    <li key={s.ficha.id}>
                      <b>{s.ficha.titulo}:</b> {s.liberados} de {s.total} liberados
                      {s.comR > 0 && <span class="fv-txt-r"> · {s.comR} com NC</span>}
                    </li>
                  ))}
                </ul>
              ) : resumoAmb.servicos.length === 0 ? (
                <p class="discreto">{resumoAmb.total} ambientes · nenhuma ficha começada</p>
              ) : (
                <ul class="fv-servicos">
                  {resumoAmb.servicos.map((s) => (
                    <li key={s.ficha.id}>
                      <b>{s.ficha.titulo}:</b> {s.liberados} de {s.total} liberados
                      {s.comR > 0 && <span class="fv-txt-r"> · {s.comR} com NC</span>}
                    </li>
                  ))}
                </ul>
              )}
              {opcoesDeAmbientes(ambientes, (op) => ehDeAcabamento(op, fichaDeGradeGuardada) && daCategoria(op))}
              {porApartamento.length > 0 && (
                <details class="fv-por-apto" open data-testid="fvs-por-apartamento">
                  <summary>Por apartamento</summary>
                  {fichasDoAcab.length > 1 && (
                    <label class="fv-apto-ficha-escolha">
                      <span>Ficha</span>
                      <select value={fichaDoAptoVale?.id} onChange={(e) => setFichaDoApto((e.target as HTMLSelectElement).value)} data-testid="fvs-ficha-apartamento">
                        {fichasDoAcab.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.titulo}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <ul>
                    {porApartamento.flatMap((l) => {
                      const f = l.fichas.find((x) => x.ficha.id === fichaDoAptoVale?.id)
                      if (!f) return []
                      const classe = f.comR > 0 ? 'fv-txt-r' : f.liberados === f.total ? 'fv-apto-ok' : undefined
                      return [
                        <li key={l.grupo} data-testid="fvs-apartamento">
                          <b>{l.grupo}:</b> <span class={classe}>{textoDoAndamento(f)}</span>
                        </li>,
                      ]
                    })}
                  </ul>
                </details>
              )}
              {acabEscolhido === TODOS_OS_ACABAMENTOS && categoriasAcab.length > 1 && <p class="discreto">Escolha um acabamento para ver o andamento por apartamento.</p>}
              <p class="fv-subgrupo">Planta com todos os ambientes</p>
              <div class="fv-grade-armadura">{ambientes.map((p) => plantaNaLista(p, ambientes.length > 1 ? p.trecho : 'Todos os ambientes', p.prancha, 'ambientes'))}</div>
            </div>
          )}
          {/* instalações (hidro, sanitário, elétrico, SPDA) e disciplinas que o app não conhece: uma seção cada */}
          {outras.map(([disc, lista]) => {
            // pontos de instalação (SPDA igual aos furos, 22/11/2026): "x de y pontos OK", lido do pacote
            const sub = (ps: Planta[]) => {
              const as = ps.map((p) => avancoDosPontos.get(p.id))
              const a = as.every(Boolean) ? as.reduce<{ ok: number; errados: number; total: number }>((t, x) => ({ ok: t.ok + x!.ok, errados: t.errados + x!.errados, total: t.total + x!.total }), { ok: 0, errados: 0, total: 0 }) : undefined
              const n = ps.reduce((t, p) => t + p.elementos, 0)
              // planta de pontos sem ficha (o preventivo, decisão do Nicolas de 21/11): diz que é só consulta, em vez
              // de um "0 de 5 OK" que nunca anda (rodada 9, 24/11)
              // e a planta cuja disciplina tem ficha, mas nenhum ponto de um tipo que ela marca (o elétrico do pilotis
              // só tem caixas de passagem e quadros; a ficha marca as caixas de parede): também só consulta (25/11)
              const consulta = disc in SECAO_DE_INSTALACOES && (!ps.some((p) => pontosAbertos.some((q) => q.id === p.id)) || a?.total === 0)
              return `${a?.total ? textoDoAvancoDosPontos(a) : `${n} ${disc in SECAO_DE_INSTALACOES ? (n === 1 ? 'ponto' : 'pontos') : 'locais'}${consulta ? ' · só consulta' : ''}`} · ${ps[0].prancha}`
            }
            return (
              <div key={disc} data-testid="fvs-secao-outra">
                {(outras.length > 1 || discAberta.id === 'instalacoes') && <h3 class="fv-disciplina">{nomeDaDisciplina(disc)}</h3>}
                <div class="fv-grade-armadura">{lista.map((p) => plantaNaLista(p, p.trecho, sub([p]), disc))}</div>
              </div>
            )
          })}
          {/* fichas de ambiente com item de pontos (hidro, esgoto...): por ambiente, na planta de ambientes (21/11/2026) */}
          {ambientes.length > 0 && discAberta.id === 'instalacoes' && (
            <div data-testid="fvs-ambientes-instalacoes">
              <h3 class="fv-disciplina">Por ambiente</h3>
              {opcoesDeAmbientes(ambientes, ehOpcaoDeInstalacoes)}
            </div>
          )}
          {semRede && plantas.some((p) => !noAparelho?.has(p.id)) && <p class="discreto">Planta que ainda não foi baixada precisa de internet uma vez.</p>}
        </section>
      </main>
    )
  }

  // ---------- nível 2: disciplinas do pavimento ----------
  if (pvAberto) {
    const pv = pvAberto
    const plantas = plantasDoPv
    const { r, ra, rm, rk } = resumos.get(pv.id)!
    const faltam = noAparelho ? plantas.filter((p) => !noAparelho.has(p.id)) : []
    const baixandoAqui = baixando?.pavimentoId === pv.id ? baixando : null
    const guardadas = plantas.filter((p) => pacoteDe(p))
    const tamanhoGuardado = guardadas.reduce((s, p) => s + (pacoteDe(p)?.tamanho ?? 0), 0)
    /** O que a disciplina tem, numa linha, e o andamento dela. */
    const descricao = (d: (typeof disciplinas)[number]): { tem: string; andamento: string | null } => {
      const ps = d.plantas
      const ops = (f: (op: OpcaoDosAmbientes) => boolean) => ps.filter(ehDeAmbientes).flatMap((p) => (opcoesAmb.get(p.id) ?? []).filter(f).map((o) => o.titulo))
      if (d.id === 'estrutura') {
        const partes = [ps.some((p) => p.disciplina === 'estrutura') && 'Pilares, vigas e lajes', ps.some(ehDeArmadura) && 'armadura de laje', ps.some(ehDeFuracao) && 'furos'].filter(Boolean)
        return { tem: partes.join(', '), andamento: r.total > 0 ? `${r.liberadas} de ${r.total} peças liberadas${r.comR > 0 ? ` · ${r.comR} com NC` : ''}` : null }
      }
      if (d.id === 'fundacao') {
        return { tem: 'Blocos de fundação', andamento: rk.total > 0 ? `${rk.liberadas} de ${rk.total} blocos liberados${rk.comR > 0 ? ` · ${rk.comR} com NC` : ''}` : null }
      }
      if (d.id === 'alvenaria') {
        const partes = [ps.some(ehDeVedacao) ? 'Modulação de paredes' : '', ...ops(ehOpcaoDeAlvenaria)].filter(Boolean)
        return { tem: partes.join(', '), andamento: rm.total > 0 ? `${rm.liberadas} de ${rm.total} paredes liberadas` : null }
      }
      if (d.id === 'acabamentos') {
        // as categorias (Reboco, Piso e revestimento, Pintura...), não a lista de todas as fichas
        const partes = categoriasPresentes(ps.filter(ehDeAmbientes).flatMap((p) => (opcoesAmb.get(p.id) ?? []).filter((op) => ehDeAcabamento(op, fichaDeGradeGuardada)).map(tituloDaOpcao))).map((c) => c.nome)
        return { tem: partes.length ? partes.join(', ') : `${ra.total} ambientes`, andamento: null }
      }
      // na ordem do menu (hidráulica, esgoto, elétrico, preventivo, SPDA), e "por ambiente" no fim
      const secoes = [...new Set([...ps.filter((p) => !ehDeAmbientes(p))].sort((a, b) => ordemDaSecao(a.disciplina) - ordemDaSecao(b.disciplina)).map((p) => nomeDaDisciplina(p.disciplina)))]
      if (d.id === 'instalacoes' && ops(ehOpcaoDeInstalacoes).length) secoes.push('por ambiente')
      return { tem: secoes.join(', '), andamento: null }
    }
    return (
      <main class="tela fv-inicio" data-testid="fvs-nivel-pavimento">
        {topo('Pavimentos', pv.nome, `${props.obra.codigo} · escolha o que vai conferir`)}
        {aviso && <p class="faixa-aviso">{aviso}</p>}
        {erro && <p class="erro" role="alert">{erro}</p>}
        <div class="fv-grade-armadura fv-grade-disciplinas">
          {disciplinas.map((d) => {
            const { tem, andamento } = descricao(d)
            const avisoRev = noAparelho ? avisoDasPlantas(d.plantas, dados.anterioresDe, noAparelho) : null
            return (
              <button
                type="button"
                key={d.id}
                class="fv-bt-armadura fv-bt-disciplina"
                data-testid="fvs-disciplina"
                data-disciplina={d.id}
                onClick={() => ir({ nome: 'disciplina', pavimentoId: pv.id, disciplina: d.id })}
              >
                <IconeDoItem qual={d.id} />
                <span class="fv-bt-texto">
                  <b>{d.nome}</b>
                  {tem && <small>{tem}</small>}
                  {andamento && <small class="fv-txt-andamento">{andamento}</small>}
                  {avisoRev && (
                    <small class="fv-txt-rev" data-testid="fvs-aviso-revisao-disciplina">
                      {avisoRev}
                    </small>
                  )}
                </span>
                <span class="fv-seta" aria-hidden="true">
                  ›
                </span>
              </button>
            )
          })}
        </div>
        {/* andamento, fichas e NCs do pavimento em A4 (21/11/2026) */}
        <BotaoExportarPdf
          obra={props.obra}
          usuario={props.usuario}
          classe="so-bt-largo"
          testid="fvs-pdf-pavimento"
          rotulo="Exportar PDF do pavimento"
          montar={() =>
            folhaDaFvs({
              titulo: pv.nome,
              linhas: situacaoDaObra(dados).filter((l) => l.pavimento === pv.nome),
              reprovacoes: reprovacoes.filter((r) => r.pavimentoId === pv.id),
            })
          }
        />
        {(faltam.length > 1 || baixandoAqui) && (
          <div class="fv-baixar-pav">
            <button
              type="button"
              class="fv-baixar"
              data-testid="fvs-baixar-pavimento"
              disabled={semRede || baixando !== null}
              onClick={() => baixar(faltam, pv.id)}
              title={semRede ? 'Precisa de internet para baixar' : ''}
            >
              {baixandoAqui
                ? `Baixando ${baixandoAqui.feitas + 1} de ${baixandoAqui.total}…`
                : `Baixar o pavimento (${faltam.length} plantas, ${mb(faltam.reduce((s, p) => s + tamanhoDe(p), 0))})`}
            </button>
            {baixandoAqui && (
              <progress
                max={100}
                value={Math.round(((baixandoAqui.feitas + baixandoAqui.pct / 100) / baixandoAqui.total) * 100)}
                aria-label={`Download do pavimento ${pv.nome}`}
              />
            )}
          </div>
        )}
        {semRede && plantas.some((p) => !noAparelho?.has(p.id)) && <p class="discreto">Planta que ainda não foi baixada precisa de internet uma vez.</p>}
        {guardadas.length > 0 && !baixando && (
          // recolhido num "⋯ Mais": ao lado do Abrir, um toque errado apagava a planta (demonstração, 14/11)
          <details class="fv-mais-pav">
            <summary data-testid="fvs-mais-pavimento" aria-label={`Mais opções de ${pv.nome}`}>
              ⋯ Mais
            </summary>
            <button type="button" class="fv-link-lan" data-testid="fvs-tirar-pavimento" onClick={() => tirarDoAparelho(pv.nome, guardadas, tamanhoGuardado)}>
              Tirar do aparelho ({mb(tamanhoGuardado)})
            </button>
          </details>
        )}
      </main>
    )
  }

  // ---------- nível 1: pavimentos ----------
  return (
    <main class="tela fv-inicio">
      <header class="so-cabecalho fv-topo-inicio">
        {/* Primeira tela do módulo: o botão leva ao menu do app e diz isso (20/11/2026) */}
        <button type="button" class="fv-voltar so-cab-voltar" onClick={voltar} aria-label="Voltar ao menu">
          <span aria-hidden="true">‹</span>
        </button>
        <div class="so-cab-titulo">
          <h1>FVS</h1>
          <p class="discreto" data-testid="fvs-resumo-obra">
            {props.obra.codigo}
            {naObra.total > 0 ? ` · ${naObra.liberadas.toLocaleString('pt-BR')} de ${naObra.total.toLocaleString('pt-BR')} peças liberadas` : ' · fichas por clique na planta'}
          </p>
        </div>
      </header>
      {aviso && <p class="faixa-aviso">{aviso}</p>}
      {avisoSistema && (
        <p class="discreto" data-testid="fvs-aviso-sistema">
          {/* a opção do script não pode quebrar no hífen */}
          {avisoSistema.split(/(--sistema-oficial)/).map((t, i) => (i % 2 ? <code key={i} style={{ whiteSpace: 'nowrap' }}>{t}</code> : t))}
        </p>
      )}
      {(relogioAtrasado(Date.now(), dados.servidorMaisNovo) || relogioAntesDoPacote(Date.now(), geradoEm)) && (
        <AvisoHora
          testid="fvs-relogio"
          texto="A data e a hora deste aparelho estão atrasadas. Cada marcação guarda a hora do aparelho e vale a mais nova: com a hora atrasada, a sua pode não valer sobre a anterior."
        />
      )}
      {naFrente && (
        <AvisoHora
          testid="fvs-registro-na-frente"
          texto={`Há marcação de ${quemMarcou(naFrente, dados, props.usuario.id)} de ${dataHoraCompleta(naFrente.criado_em_dispositivo)}, depois da hora deste aparelho. O relógio de um dos dois aparelhos está errado: enquanto isso, nesse item, vale a marcação dessa pessoa.`}
        />
      )}
      {erro && <p class="erro" role="alert">{erro}</p>}
      {dados.pecaPorId.size > 0 && <BuscaNaObra ctx={ctx} />}
      {reprovacoes.length > 0 && (
        <button
          type="button"
          class="fv-entra-rep"
          data-testid="fvs-entra-reprovacoes"
          onClick={() => {
            // pelo início, a lista abre inteira; o filtro de antes só vale ao voltar da planta
            filtrarListaAoAbrir(props.obra.id, SEM_FILTRO)
            ir({ nome: 'reprovacoes' })
          }}
        >
          <b class={abertas > 0 ? 'fv-txt-r' : ''}>
            {abertas} {abertas === 1 ? 'reprovação aberta' : 'reprovações abertas'}
          </b>
          <span>Ver a lista e ir até a peça ›</span>
        </button>
      )}
      {sistema && paraLancar > 0 && (
        <button type="button" class="fv-entra-rep" data-testid="fvs-entra-lancamento" onClick={() => ir({ nome: 'lancamento' })}>
          <b>
            {paraLancar} {paraLancar === 1 ? 'marcação' : 'marcações'} para lançar no {sistema.nome}
          </b>
          <span>Ver ficha por ficha e baixar a planilha ›</span>
        </button>
      )}
      {sistema && duplicadas > 0 && (
        <button type="button" class="fv-entra-rep" data-testid="fvs-entra-duplicadas" onClick={() => ir({ nome: 'duplicadas' })}>
          <b>
            {duplicadas} {duplicadas === 1 ? 'peça' : 'peças'} com ficha duplicada no {sistema.nome}
          </b>
          <span>Ver as duas situações de cada uma ›</span>
        </button>
      )}
      {escoramento && escoramento.podem + escoramento.aguardam > 0 && (
        <button type="button" class="fv-entra-rep" data-testid="fvs-entra-escoramento" onClick={() => ir({ nome: 'escoramento' })}>
          <b>
            Escoramento e desforma: {escoramento.podem} {escoramento.podem === 1 ? 'pode retirar' : 'podem retirar'} · {escoramento.aguardam} aguardando
          </b>
          <span>Ver por pavimento ›</span>
        </button>
      )}
      {(dados.regras.prazos.length > 0 || dados.regras.ligacoes.length > 0 || !!dados.regras.fora) && (
        <button type="button" class="fv-entra-rep" data-testid="fvs-entra-regras" onClick={() => ir({ nome: 'regras' })}>
          <b>Regras da obra: {resumoDasRegras(dados.regras)}</b>
          <span>Ver os prazos e as ligações entre itens ›</span>
        </button>
      )}
      {locaisFora > 0 && (
        <button type="button" class="fv-entra-rep" data-testid="fvs-entra-locais" onClick={() => ir({ nome: 'locais' })}>
          <b>
            {locaisFora === 1 ? '1 local fora da planta' : `${locaisFora} locais fora da planta`}
          </b>
          <span>Blocos, cortinas, paredes e outros locais sem peça na prancha ›</span>
        </button>
      )}
      {dados.fichas.length === 0 && (
        <p class="aviso so-com-ajuda">
          Sem fichas (PVS)
          <Ajuda>Quem cuida do cadastro da obra publica as fichas pelo computador.</Ajuda>
        </p>
      )}

      {comPlanta.length === 0 && (
        <p class="discreto so-com-ajuda">
          Sem plantas publicadas
          <Ajuda>Quem cuida do cadastro da obra publica as plantas pelo computador.</Ajuda>
        </p>
      )}

      {comPlanta.length > 0 && <h2 class="fv-titulo-lista">Pavimentos</h2>}
      <div class="fv-lista-pavimentos">
        {comPlanta.map((pv) => {
          const plantas = dados.plantasDe.get(pv.id)!
          const temEstrutura = plantas.some((p) => p.disciplina === 'estrutura')
          const { r, lajes } = resumos.get(pv.id)!
          const guardadas = plantas.filter((p) => pacoteDe(p)).length
          const baixandoAqui = baixando?.pavimentoId === pv.id
          // revisão nova ou planta atualizada: aparece já aqui, antes de entrar no pavimento (rodada 9, 24/11)
          const avisoRev = noAparelho ? avisoDasPlantas(plantas, dados.anterioresDe, noAparelho) : null
          return (
            <button type="button" key={pv.id} class="cartao fv-pavimento fv-bt-pavimento" data-testid="fvs-pavimento" onClick={() => ir({ nome: 'pavimento', pavimentoId: pv.id })}>
              <span class="fv-bt-texto">
                <b class="fv-pav-nome">{pv.nome}</b>
                {temEstrutura && (
                  <span class="discreto">
                    {r.liberadas} de {r.total} peças liberadas
                    {r.paraConcretar > 0 && <span class="fv-txt-concretar"> · {r.paraConcretar} p/ concretar</span>}
                    {r.comR > 0 && <span class="fv-txt-r"> · {r.comR} com NC</span>}
                    {sistema && r.duplicadas > 0 && ` · ${r.duplicadas} com ficha duplicada`}
                  </span>
                )}
                {lajes.total > 0 && (
                  <span class="discreto" data-testid="fvs-resumo-lajes">
                    Laje: {Math.round(lajes.m2Liberados).toLocaleString('pt-BR')} de {Math.round(lajes.m2).toLocaleString('pt-BR')} m² desenhados liberados
                    {lajes.comR > 0 && <span class="fv-txt-r"> · {lajes.comR} com NC</span>}
                  </span>
                )}
                <small class="fv-no-aparelho">
                  {baixandoAqui ? 'Baixando…' : guardadas === plantas.length ? (avisoRev ? '' : 'No aparelho') : guardadas > 0 ? `${guardadas} de ${plantas.length} plantas no aparelho` : 'Ainda não baixado'}
                  {!baixandoAqui && avisoRev && (
                    <span class="fv-txt-rev" data-testid="fvs-aviso-revisao-pavimento">
                      {guardadas === plantas.length ? '' : ' · '}
                      {avisoRev}
                    </span>
                  )}
                </small>
              </span>
              <span class="fv-seta" aria-hidden="true">
                ›
              </span>
            </button>
          )
        })}
      </div>

      {((faltamNaObra.length > 1 && comPlanta.length > 1) || baixandoObra) && (
        <div class="fv-baixar-pav">
          <button
            type="button"
            class="fv-baixar"
            data-testid="fvs-baixar-obra"
            disabled={semRede || baixando !== null}
            onClick={() => baixar(faltamNaObra, OBRA_INTEIRA)}
            title={semRede ? 'Precisa de internet para baixar' : ''}
          >
            {baixandoObra
              ? `Baixando ${baixandoObra.feitas + 1} de ${baixandoObra.total}…`
              : `Baixar a obra inteira (${faltamNaObra.length} plantas, ${mb(faltamNaObra.reduce((s, p) => s + tamanhoDe(p), 0))})`}
          </button>
          {baixandoObra && (
            <progress
              max={100}
              value={Math.round(((baixandoObra.feitas + baixandoObra.pct / 100) / baixandoObra.total) * 100)}
              aria-label="Download da obra inteira"
            />
          )}
        </div>
      )}

      {dados.pecaPorId.size > 0 && (
        <button
          type="button"
          class="fv-entra-rep"
          data-testid="fvs-planilha-situacao"
          onClick={() => baixarTexto(`situacao_fvs_${props.obra.codigo}_${hojeNoAparelho()}.csv`, planilhaDaSituacao(situacaoDaObra(dados), sistema?.nome ?? null))}
        >
          <b>Baixar planilha da situação da obra</b>
          <span>Uma linha por peça e ficha, com o que falta, para abrir no Excel</span>
        </button>
      )}
      {dados.pecaPorId.size > 0 && (
        <BotaoExportarPdf
          obra={props.obra}
          usuario={props.usuario}
          classe="so-bt-largo"
          testid="fvs-pdf-obra"
          rotulo="Exportar PDF da obra"
          montar={() => {
            const nome = new Map(dados.pavimentos.map((p) => [p.id, p.nome]))
            return folhaDaFvs({ titulo: 'Obra inteira', linhas: situacaoDaObra(dados), reprovacoes, comPavimento: true, nomeDoPavimento: (id) => nome.get(id) ?? '' })
          }}
        />
      )}

      {dados.fichasCampoSemPeca.length > 0 && (
        <section class="cartao fv-pavimento" data-testid="fvs-sem-peca">
          <h2>Fichas sem peça na planta</h2>
          <p class="discreto">Fichas {sistema ? `do ${sistema.nome}` : 'do histórico'} em lajes, blocos, cortinas ou peças que não estão na prancha. Só para consulta.</p>
          <details class="fv-sem-peca">
            <summary>Ver as {dados.fichasCampoSemPeca.length} fichas</summary>
            <ul class="lista">
              {dados.fichasCampoSemPeca.map((f) => (
                <li key={f.id}>
                  <strong>{f.local}</strong>
                  <br />
                  {f.ficha_titulo ?? f.ficha_codigo} · {f.status}
                  <br />
                  <span class="discreto">
                    {f.codigo} · {f.qtd_a} C · {f.qtd_r} NC · {f.qtd_na} NA
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </main>
  )
}

/** Ordem da montagem na obra: a malha de baixo primeiro, depois a de cima. */
const MONTAGEM: readonly CamadaDeBarras[] = ['longitudinal_inferior', 'transversal_inferior', 'longitudinal_superior', 'transversal_superior']
const ordemDaCamada = (trecho: string) => {
  const c = camadaDoTrecho(trecho)
  return c ? MONTAGEM.indexOf(c) : MONTAGEM.length
}

/** Desenho simples da direção: traços deitados (longitudinal) ou em pé (transversal), embaixo ou em cima. */
function IconeDaCamada({ camada }: { camada?: CamadaDeBarras }) {
  const transv = camada?.startsWith('transversal')
  const sup = camada?.endsWith('superior')
  const tracos = transv ? 'M12 6v28M24 6v28M36 6v28' : sup ? 'M6 8h36M6 18h36M6 28h36' : 'M6 14h36M6 24h36M6 34h36'
  return (
    <svg class="fv-bt-icone" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3">
      <path d={tracos} />
      <text x="24" y="46" font-size="9" fill="currentColor" stroke="none" text-anchor="middle">
        {camada ? (sup ? 'SUP' : 'INF') : ''}
      </text>
    </svg>
  )
}

/** Seções das plantas de instalações (pontos, frente INSTALAÇÕES 20/11/2026), com acento, na ordem do menu
 *  (21/11/2026: hidráulica, esgoto, elétrico, preventivo, SPDA). */
const SECAO_DE_INSTALACOES: Record<string, string> = { hidro: 'Hidráulica', sanitario: 'Esgoto', eletrico: 'Elétrico', preventivo: 'Preventivo contra incêndio', spda: 'SPDA' }
/** Plantas de furos de laje na ordem da obra: esgoto, água, elétrica (o nome vem do pipeline/fvs/furos.py). */
const ordemDoFuro = (trecho: string) => { const t = trecho.toLowerCase(); return t.includes('esgoto') ? 0 : t.includes('água') || t.includes('agua') ? 1 : t.includes('elétrica') || t.includes('eletrica') ? 2 : 3 }
/** Seções depois da estrutura: os furos de laje por camada (21/11/2026), depois as instalações. */
const SECOES: Record<string, string> = { furacao: 'Furos', ...SECAO_DE_INSTALACOES }
/** Na ordem do menu (furação, hidro, esgoto, elétrico, preventivo, SPDA); disciplina que o app não conhece vem depois. */
const ordemDaSecao = (d: string) => { const i = Object.keys(SECOES).indexOf(d); return i < 0 ? 99 : i }

/** Título da seção de uma disciplina que o app ainda não conhece ("instalacoes" -> "Instalacoes"). */
function nomeDaDisciplina(d: string): string {
  return SECOES[d] ?? (d ? d.charAt(0).toUpperCase() + d.slice(1) : 'Outros')
}

function agrupar<T>(itens: readonly T[], chave: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const i of itens) m.set(chave(i), [...(m.get(chave(i)) ?? []), i])
  return m
}
