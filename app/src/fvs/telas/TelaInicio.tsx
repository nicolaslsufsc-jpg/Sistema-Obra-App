// Início da FVS: pavimentos com planta publicada. Em cada pavimento, primeiro os trechos da
// estrutura (planta de forma: pilares e vigas), depois a planta de ambientes (fichas por
// ambiente: alvenaria, reboco, pintura...). Cada planta mostra se já está no aparelho (abre sem
// internet) e o andamento das fichas.
import { resumoDasRegras } from '../regras_tela'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { resumoDasAreas } from '../areas'
import { baixarPlanta, ehDeAmbientes, ehDeArmadura, paraLancarDaObra, partesDoPilar, travasDaAreaNaObra, quemMarcou, registroNaFrente, relogioAntesDoPacote, relogioAtrasado, reprovacoesDaObra, situacaoDaObra, type Planta } from '../dados'
import { dataHoraCompleta, hojeNoAparelho, mb } from '../formato'
import { baixarTexto, planilhaDaSituacao } from '../planilha'
import { abrirPacoteOuAnterior, limparPacotes, pacotesNoAparelho, removerPacotes, soDetalheGuardado, textoDoErroDeDownload } from '../pacote'
import { pacotesAManter } from '../revisoes'
import { opcoesDosAmbientes, type OpcaoDosAmbientes } from '../opcoes_ambientes'
import { camadaDoTrecho, NOME_DA_CAMADA, type CamadaDeBarras } from '../barras'
import { resumoDaEstrutura, resumoDosAmbientes } from '../situacao'
import { SEM_FILTRO } from '../reprovacoes'
import { AvisoHora } from './AvisoHora'
import { BuscaNaObra } from './BuscaNaObra'
import { banco } from '../../nucleo/servicos'
import { dataDoPacoteGuardado } from '../../nucleo/pacote_obra'
import { avisoDoSistemaOficial } from '../../integracoes/sistema_oficial'
import type { ContextoFvs } from './ModuloFvs'
import { filtrarListaAoAbrir } from './TelaReprovacoes'

const OBRA_INTEIRA = 'obra-inteira'

export function TelaInicio({ ctx, aviso }: { ctx: ContextoFvs; aviso: string }) {
  const { dados, props, online, ir, voltar, sistema } = ctx
  // sem conta, a planta vem do pacote da obra (.zip ou pasta), não da internet: o Baixar não espera a rede
  // (testador, 08/11: no aparelho do .zip a pergunta dizia "é só baixar de novo" e o Baixar pedia internet)
  const semRede = !online && !ctx.local
  const [noAparelho, setNoAparelho] = useState<Map<string, { tamanho: number }> | null>(null)
  /** download em andamento: planta atual, percentual dela e, no pavimento inteiro, quantas faltam */
  const [baixando, setBaixando] = useState<{ plantaId: string; pct: number; pavimentoId?: string; feitas: number; total: number } | null>(null)
  const [erro, setErro] = useState('')
  const dono = { obraId: props.obra.id, usuarioId: props.usuario.id }
  /** Data em que o pacote da obra (.zip ou pasta) foi gerado: o relógio não pode estar antes dela. */
  const [geradoEm, setGeradoEm] = useState<string | null>(null)
  useEffect(() => {
    dataDoPacoteGuardado(banco, props.obra.id).then(setGeradoEm, () => setGeradoEm(null))
  }, [props.obra.id])
  const naFrente = useMemo(() => registroNaFrente(dados), [dados])

  // O que está no aparelho. Sai o que esta pessoa não vê mais e a revisão anterior de uma planta cuja
  // revisão nova já chegou; a anterior fica até lá, para ela não ficar sem planta na obra.
  const atualizar = async () => {
    const agora = await pacotesNoAparelho()
    const saiu = await limparPacotes(dono, pacotesAManter(dados.plantaPorId.keys(), dados.anterioresDe, agora))
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
    const tamanho = tamanhoDe(p)
    return (
      <li key={p.id}>
        <div class="fv-trecho">
          <span>
            <strong>{p.trecho}</strong>
            <span class="discreto">
              {/* planta de ambientes: o número de ambientes já está no resumo acima (o da folha soma as esquadrias) */}
              {ehDeAmbientes(p) ? p.prancha : `${p.prancha} · ${p.elementos} peças`}
            </span>
            {antiga && <span class="fv-txt-rev">Revisão nova: no aparelho ainda está a {antiga.revisao}</span>}
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
              {antiga && (
                <button type="button" class="fv-abrir" onClick={() => ir({ nome: 'planta', plantaId: p.id })}>
                  Abrir {antiga.revisao}
                </button>
              )}
              <button
                type="button"
                class="fv-baixar"
                disabled={semRede || baixando !== null}
                onClick={() => baixar([p])}
                title={semRede ? 'Precisa de internet para baixar' : ''}
              >
                {baixando?.plantaId === p.id ? `Baixando ${baixando.pct}%` : `Baixar ${antiga ? `${p.revisao} ` : ''}${tamanho ? mb(tamanho) : ''}`}
              </button>
            </span>
          )}
        </div>
      </li>
    )
  }

  /** Botão grande de uma direção da armadura de laje (planta própria, 20/11/2026): abre se está no aparelho,
   *  senão baixa. A direção sai do nome do trecho ("Armadura longitudinal inferior"). */
  const botaoDaArmadura = (p: Planta) => {
    const guardado = noAparelho?.get(p.id)
    const antiga = !guardado && noAparelho ? dados.anterioresDe.get(p.id)?.find((a) => noAparelho.has(a.id)) : undefined
    const camada = camadaDoTrecho(p.trecho)
    const nome = camada ? NOME_DA_CAMADA[camada] : p.trecho
    const abre = !!guardado || !!antiga
    const tamanho = tamanhoDe(p)
    const acao = noAparelho === null ? '…' : abre ? (antiga ? `Abrir ${antiga.revisao}` : 'Abrir') : baixando?.plantaId === p.id ? `Baixando ${baixando.pct}%` : `Baixar ${tamanho ? mb(tamanho) : ''}`
    return (
      <button
        type="button"
        key={p.id}
        class="fv-bt-armadura"
        data-testid="fvs-armadura"
        data-camada={camada ?? ''}
        disabled={noAparelho === null || (!abre && (semRede || baixando !== null))}
        onClick={() => (abre ? ir({ nome: 'planta', plantaId: p.id }) : baixar([p]))}
        title={!abre && semRede ? 'Precisa de internet para baixar' : ''}
      >
        <IconeDaCamada camada={camada} />
        <span class="fv-bt-texto">
          <b>{nome}</b>
          <small>
            {p.elementos} {p.elementos === 1 ? 'barra' : 'barras'} · {p.prancha}
          </small>
          {antiga && <small class="fv-txt-rev">Revisão nova: no aparelho ainda está a {antiga.revisao}</small>}
        </span>
        <span class={abre ? 'fv-bt-acao' : 'fv-bt-acao fv-bt-baixar'}>{acao}</span>
      </button>
    )
  }

  const comPlanta = dados.pavimentos.filter((pv) => dados.plantasDe.has(pv.id))
  // no escritório, com internet boa, baixa tudo de uma vez antes de ir para a obra
  const faltamNaObra = noAparelho ? comPlanta.flatMap((pv) => dados.plantasDe.get(pv.id)!.filter((p) => !noAparelho.has(p.id))) : []
  const baixandoObra = baixando?.pavimentoId === OBRA_INTEIRA ? baixando : null
  const reprovacoes = useMemo(() => reprovacoesDaObra(dados), [dados])
  const abertas = reprovacoes.filter((r) => r.aberta).length
  const paraLancar = useMemo(() => paraLancarDaObra(dados, dados.lancados).length, [dados])
  const duplicadas = useMemo(() => [...dados.fichasCampoDe.values()].filter((f) => f.length > 1).length, [dados])
  const avisoSistema = avisoDoSistemaOficial(props.obra, dados.fichasCampoDe.size > 0 || dados.fichasCampoSemPeca.length > 0)
  // os resumos percorrem a obra inteira: só refaz quando os dados mudam, não a cada ponto do download
  const resumos = useMemo(() => {
    const eventosDe = (id: string) => dados.eventosDe.get(id) ?? []
    const campo = { fichasDe: (id: string) => dados.fichasCampoDe.get(id) ?? [], ficha: (id: string) => dados.fichaPorId.get(id), partesDe: partesDoPilar }
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
            ra: resumoDosAmbientes(locais, dados.fichas, eventosDe),
            lajes: resumoDasAreas(dados.areasDe.get(pv.id) ?? [], campo.ficha, eventosDe, undefined, (a) => travasDaAreaNaObra(dados, a).length > 0),
          },
        ] as const
      }),
    )
    // noAparelho: ler os pacotes diz quais peças são só detalhe (pacotesNoAparelho)
  }, [dados, noAparelho])
  const naObra = [...resumos.values()].reduce((s, { r }) => ({ total: s.total + r.total, liberadas: s.liberadas + r.liberadas }), { total: 0, liberadas: 0 })
  return (
    <main class="tela fv-inicio">
      <header class="fv-topo-inicio">
        {/* Primeira tela do módulo: o botão leva ao menu do app e diz isso (20/11/2026) */}
        <button type="button" class="fv-voltar" onClick={voltar} aria-label="Voltar ao menu">
          ‹ Menu
        </button>
        <div>
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
      {(dados.regras.prazos.length > 0 || dados.regras.ligacoes.length > 0 || !!dados.regras.fora) && (
        <button type="button" class="fv-entra-rep" data-testid="fvs-entra-regras" onClick={() => ir({ nome: 'regras' })}>
          <b>Regras da obra: {resumoDasRegras(dados.regras)}</b>
          <span>Ver os prazos e as ligações entre itens ›</span>
        </button>
      )}
      {dados.fichas.length === 0 && (
        <p class="aviso">Esta obra ainda não tem fichas (PVS). Quem cuida do cadastro publica pelo PC (pipeline/fvs/publicar_fichas.py).</p>
      )}

      {comPlanta.length === 0 && (
        <p class="discreto">
          Nenhuma planta publicada nesta obra ainda. As plantas são publicadas pelo PC (pipeline/fvs/publicar_planta.py).
        </p>
      )}

      {comPlanta.map((pv) => {
        const plantas = dados.plantasDe.get(pv.id)!
        const estrutura = plantas.filter((p) => !ehDeAmbientes(p) && !ehDeArmadura(p))
        // só as direções que o pavimento tem publicadas, na ordem do app
        const armadura = plantas.filter(ehDeArmadura).sort((a, b) => ordemDaCamada(a.trecho) - ordemDaCamada(b.trecho))
        const ambientes = plantas.filter(ehDeAmbientes)
        // disciplinas que vierem depois (instalações...) entram sozinhas, uma seção por disciplina
        const outras = [...agrupar(plantas.filter((p) => !ehDeAmbientes(p) && !ehDeArmadura(p) && p.disciplina !== 'estrutura'), (p) => p.disciplina)]
        const daEstrutura = estrutura.filter((p) => p.disciplina === 'estrutura')
        const { r, ra: resumoAmb, lajes } = resumos.get(pv.id)!
        const ra = ambientes.length ? resumoAmb : null
        const faltam = noAparelho ? plantas.filter((p) => !noAparelho.has(p.id)) : []
        const baixandoAqui = baixando?.pavimentoId === pv.id ? baixando : null
        // no aparelho: a planta ou a revisão anterior dela, que é o que abre até a nova chegar
        const pacoteDe = (p: Planta) => (noAparelho ? noAparelho.get(p.id) ?? (dados.anterioresDe.get(p.id) ?? []).map((a) => noAparelho.get(a.id)).find(Boolean) : undefined)
        const guardadas = plantas.filter((p) => pacoteDe(p))
        const tamanhoGuardado = guardadas.reduce((s, p) => s + (pacoteDe(p)?.tamanho ?? 0), 0)
        return (
          <section class="cartao fv-pavimento" key={pv.id} data-testid="fvs-pavimento">
            {/* obra com muitos pavimentos: no celular seriam metros de rolagem. Abre o que já está no aparelho. */}
            <details class="fv-pav-corpo" open={comPlanta.length <= 2 || guardadas.length > 0 || !!baixandoAqui}>
              <summary>
                <h2>{pv.nome}</h2>
                {estrutura.length > 0 && (
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
              </summary>
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
            {daEstrutura.length > 0 && (
              <div data-testid="fvs-secao-estrutura">
                {(ambientes.length > 0 || armadura.length > 0 || outras.length > 0) && <h3 class="fv-disciplina">Estrutura</h3>}
                {armadura.length > 0 && <p class="fv-subgrupo">Forma: pilares, vigas e lajes</p>}
                <ul class="lista fv-trechos">{daEstrutura.map(linhaDaPlanta)}</ul>
                {armadura.length > 0 && (
                  <div data-testid="fvs-grupo-armadura">
                    <p class="fv-subgrupo">Armadura de laje</p>
                    <div class="fv-grade-armadura">{armadura.map(botaoDaArmadura)}</div>
                  </div>
                )}
              </div>
            )}
            {daEstrutura.length === 0 && armadura.length > 0 && (
              <div data-testid="fvs-grupo-armadura">
                <h3 class="fv-disciplina">Armadura de laje</h3>
                <div class="fv-grade-armadura">{armadura.map(botaoDaArmadura)}</div>
              </div>
            )}
            {outras.map(([disc, lista]) => (
              <div key={disc} data-testid="fvs-secao-outra">
                <h3 class="fv-disciplina">{nomeDaDisciplina(disc)}</h3>
                <ul class="lista fv-trechos">{lista.map(linhaDaPlanta)}</ul>
              </div>
            ))}
            {ra && (
              <div data-testid="fvs-ambientes">
                <h3 class="fv-disciplina">Ambientes</h3>
                {ra.servicos.length === 0 ? (
                  <p class="discreto">{ra.total} ambientes · nenhuma ficha começada</p>
                ) : (
                  <ul class="fv-servicos">
                    {ra.servicos.map((s) => (
                      <li key={s.ficha.id}>
                        <b>{s.ficha.titulo}:</b> {s.liberados} de {ra.total} liberados
                        {s.comR > 0 && <span class="fv-txt-r"> · {s.comR} com NC</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <ul class="lista fv-trechos">{ambientes.map(linhaDaPlanta)}</ul>
                {ambientes.map((p) => {
                  const ops = opcoesAmb.get(p.id) ?? []
                  if (!ops.length) return null
                  return (
                    <div key={p.id} class="fv-grade-armadura" data-testid="fvs-opcoes-ambientes">
                      {ops.map((op) => (
                        <button
                          type="button"
                          key={op.id}
                          class="fv-bt-armadura"
                          data-testid="fvs-opcao-ambiente"
                          onClick={() => ir({ nome: 'planta', plantaId: p.id, servico: op.abre.servico, aba: op.abre.aba })}
                        >
                          <span class="fv-bt-texto">
                            <b>{op.titulo}</b>
                            {ambientes.length > 1 && <small>{p.trecho}</small>}
                          </span>
                          <span class="fv-bt-acao">Abrir</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
            {semRede && plantas.some((p) => !noAparelho?.has(p.id)) && (
              <p class="discreto">Planta que ainda não foi baixada precisa de internet uma vez.</p>
            )}
            {guardadas.length > 0 && !baixando && (
              // recolhido num "⋯ Mais": ao lado do Abrir, um toque errado apagava a planta (demonstração, 14/11)
              <details class="fv-mais-pav">
                <summary data-testid="fvs-mais-pavimento" aria-label={`Mais opções de ${pv.nome}`}>
                  ⋯ Mais
                </summary>
                <button
                  type="button"
                  class="fv-link-lan"
                  data-testid="fvs-tirar-pavimento"
                  onClick={() => tirarDoAparelho(pv.nome, guardadas, tamanhoGuardado)}
                >
                  Tirar do aparelho ({mb(tamanhoGuardado)})
                </button>
              </details>
            )}
            </details>
          </section>
        )
      })}

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

/** Título da seção de uma disciplina que o app ainda não conhece ("instalacoes" -> "Instalacoes"). */
function nomeDaDisciplina(d: string): string {
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : 'Outros'
}

function agrupar<T>(itens: readonly T[], chave: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const i of itens) m.set(chave(i), [...(m.get(chave(i)) ?? []), i])
  return m
}
