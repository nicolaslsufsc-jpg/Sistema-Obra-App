// Ver na planta o que aconteceu onde: serviços, ocorrências e relatórios de um período.
// Tocar numa peça, ponto ou área mostra o que foi registrado ali e leva ao registro.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { dataLocal } from '../../concreto/cps'
import { pontoNoPoligono, type Ponto } from '../../concreto/geometria'
import { idDaRef, type PlantaPavimento } from '../../concreto/planta'
import { pavimentoComPlanta, plantasDe } from '../dados'
import { categoriaDaPeca, COR_CATEGORIA, dataBR, diasAntes, entradasDoMapa, type Alvo, type CategoriaMapa, type EntradaMapa } from '../regras'
import { TIPOS_OCORRENCIA, rotulo } from '../tipos'
import type { Contexto } from './ModuloRelatorios'
import { MapaPlanta, type MarcaDesenho, type Toque } from './MapaPlanta'
import { Chips, plural } from './comum'

const PERIODOS = [
  { v: 'hoje', t: 'Hoje' },
  { v: '7', t: '7 dias' },
  { v: '30', t: '30 dias' },
  { v: 'tudo', t: 'Tudo' },
]

const TIPOS = [
  { v: 'servico', t: 'Serviços' },
  { v: 'ocorrencia', t: 'Ocorrências' },
  { v: 'relatorio', t: 'Relatórios' },
  { v: 'foto', t: 'Fotos' },
]

const LEGENDA: ReadonlyArray<[CategoriaMapa, string]> = [
  ['servico', 'Serviço em andamento'],
  ['servico_concluido', 'Serviço concluído'],
  ['ocorrencia', 'Ocorrência'],
  ['problema', 'Relatório em aberto'],
  ['resolvido', 'Relatório resolvido'],
  ['foto', 'Foto tirada aqui'],
]

export function TelaMapa({ ctx, aviso }: { ctx: Contexto; aviso: string }) {
  const { dados, obra, voltar, ir } = ctx
  const hoje = dataLocal(new Date())
  const [periodo, setPeriodo] = useState<string>('30')
  const [tipo, setTipo] = useState<string | null>(null)
  const desde = periodo === 'hoje' ? hoje : periodo === 'tudo' ? '' : diasAntes(hoje, Number(periodo) - 1)
  const entradas = useMemo(() => entradasDoMapa(dados, desde, '').filter((e) => !tipo || e.alvo.tipo === tipo), [dados, desde, tipo])

  const contagem = (pavId: string) => entradas.filter((e) => e.marcas.some((m) => m.pavimento_id === pavId)).length
  // Abre onde há registros no período; sem nenhum, no pavimento com planta no aparelho.
  const [pavId, setPavId] = useState<string | null>(() => dados.pavimentos.find((p) => contagem(p.id) > 0)?.id ?? null)
  const pav = dados.pavimentos.find((p) => p.id === pavId)
  const pecas = pavId ? (dados.pecasDoPavimento.get(pavId) ?? []) : []
  const [plantas, setPlantas] = useState<PlantaPavimento[] | null>(null)
  const [plantaSel, setPlantaSel] = useState<string | null>(null)
  const [sel, setSel] = useState<{ peca?: string; titulo: string; entradas: EntradaMapa[] } | null>(null)
  const planta = plantas?.find((p) => p.id === plantaSel) ?? plantas?.[0] ?? null

  useEffect(() => {
    if (pavId !== null) return
    let vivo = true
    pavimentoComPlanta(obra.id, dados.pavimentos)
      .catch(() => null)
      .then((id) => {
        if (vivo) setPavId(id ?? dados.pavimentos[0]?.id ?? '')
      })
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    if (pavId === null) return
    let vivo = true
    setPlantas(null)
    setSel(null)
    if (!pav) {
      setPlantas([])
      return
    }
    plantasDe(obra, pav, pecas).then((l) => {
      if (vivo) {
        setPlantas(l)
        setPlantaSel(l[0]?.id ?? null)
      }
    })
    return () => {
      vivo = false
    }
  }, [pavId])

  const doPavimento = entradas.filter((e) => e.marcas.some((m) => m.pavimento_id === pavId))

  const desenho: MarcaDesenho[] = useMemo(() => {
    const porPeca = new Map<string, EntradaMapa[]>()
    const saida: MarcaDesenho[] = []
    for (const e of doPavimento) {
      for (const m of e.marcas) {
        if (m.pavimento_id !== pavId) continue
        if (m.forma === 'peca') {
          const id = m.elemento_id ?? ''
          porPeca.set(id, [...(porPeca.get(id) ?? []), e])
        } else if (planta && m.planta_ref && idDaRef(m.planta_ref) === planta.id) {
          saida.push({ id: m.id, forma: m.forma, contorno: m.contorno, cor: COR_CATEGORIA[e.categoria] })
        }
      }
    }
    for (const [id, l] of porPeca) saida.push({ id, forma: 'peca', elemento_id: id, cor: COR_CATEGORIA[categoriaDaPeca(l)!] })
    return saida
  }, [doPavimento.length, entradas, pavId, planta])

  const aoTocar = ({ x, y, peca, escala }: Toque) => {
    const aqui = (e: EntradaMapa) =>
      e.marcas.some((m) => {
        if (m.pavimento_id !== pavId) return false
        if (m.forma === 'peca') return !!peca && m.elemento_id === peca.id
        if (!planta || !m.planta_ref || idDaRef(m.planta_ref) !== planta.id || !m.contorno) return false
        if (m.forma === 'ponto') return Math.hypot(m.contorno[0][0] - x, m.contorno[0][1] - y) <= 16 / escala
        return pontoNoPoligono(x, y, m.contorno as Ponto[])
      })
    const achadas = doPavimento.filter(aqui)
    if (peca || achadas.length > 0) setSel({ peca: peca?.id, titulo: peca?.nome ?? 'Neste lugar', entradas: achadas })
    else setSel(null)
  }

  const abrir = (e: EntradaMapa) => {
    if (e.alvo.tipo === 'relatorio') ir({ nome: 'relatorio', raiz: e.alvo.raiz })
    else if (e.alvo.tipo === 'foto') ir({ nome: 'dia', data: e.data })
    else ir({ nome: 'item', tabela: e.alvo.tipo === 'servico' ? 'diario_servicos' : 'diario_ocorrencias', data: e.data, raiz: e.alvo.raiz })
  }

  return (
    <div class="rl-mapa-tela com-painel">
      <header class="rl-mapa-topo">
        <div class="rl-mapa-linha">
          <button type="button" class="rl-voltar" onClick={voltar}>
            ‹ Voltar
          </button>
          <div class="rl-titulo">
            <h1>Na planta</h1>
            <p class="discreto">
              {plural(doPavimento.length, 'registro', 'registros')} neste pavimento
              {aviso && <span data-testid="aviso-sync"> · {aviso}</span>}
            </p>
          </div>
        </div>
        <div class="rl-filtros">
          <select value={pavId ?? ''} aria-label="Pavimento" data-testid="pavimento" onChange={(e) => setPavId(e.currentTarget.value)}>
            {dados.pavimentos.map((p) => {
              const n = contagem(p.id)
              return (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {n ? ` (${n})` : ''}
                </option>
              )
            })}
          </select>
          {plantas && plantas.length > 1 && planta && (
            <select
              value={planta.id}
              aria-label="Trecho (prancha)"
              data-testid="trecho"
              onChange={(e) => {
                setPlantaSel(e.currentTarget.value)
                setSel(null)
              }}
            >
              {plantas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.trecho}
                </option>
              ))}
            </select>
          )}
          <Chips opcoes={PERIODOS} valor={periodo} rotulo="Período" limpavel={false} teste="periodo" aoEscolher={(v) => setPeriodo(v ?? 'tudo')} />
          <Chips opcoes={TIPOS} valor={tipo} rotulo="Filtrar" teste="tipo-mapa" aoEscolher={setTipo} />
        </div>
      </header>

      {planta ? (
        <MapaPlanta planta={planta} marcas={desenho} destaque={sel?.peca} aoTocar={aoTocar} />
      ) : plantas === null ? (
        <p class="tela discreto">Carregando a planta…</p>
      ) : (
        <div class="tela rl-sem-planta" data-testid="sem-planta">
          <p class="cartao">{pav ? `${pav.nome} não tem planta neste aparelho.` : 'A obra ainda não tem pavimentos.'} As plantas são baixadas na tela inicial do módulo FVS, uma por trecho. Abaixo, o que foi marcado neste pavimento.</p>
          <ListaEntradas ctx={ctx} entradas={doPavimento} abrir={abrir} />
        </div>
      )}

      {planta && (
        <aside class="rl-painel aberto" data-testid="painel">
          <div class="rl-painel-corpo">
            {sel ? (
              <>
                <h2 class="sem-topo">{sel.titulo}</h2>
                {sel.entradas.length === 0 && <p class="discreto">Nada registrado aqui neste período.</p>}
                <ListaEntradas ctx={ctx} entradas={sel.entradas} abrir={abrir} />
              </>
            ) : (
              <>
                <p class="discreto rl-dica">Toque numa peça, ponto ou área para ver o que foi registrado ali.</p>
                <ul class="rl-legenda">
                  {LEGENDA.map(([c, t]) => (
                    <li key={c}>
                      <i style={{ background: COR_CATEGORIA[c] }} /> {t}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

function descricaoDoAlvo(ctx: Contexto, alvo: Alvo, e: EntradaMapa): string {
  if (alvo.tipo === 'servico') return 'Serviço'
  if (alvo.tipo === 'foto') return 'Foto'
  if (alvo.tipo === 'ocorrencia') {
    const o = ctx.dados.ocorrencias.get(e.data)?.find((x) => x.raiz === alvo.raiz)
    return rotulo(TIPOS_OCORRENCIA, o?.tipo) || 'Ocorrência'
  }
  return 'Relatório'
}

function ListaEntradas({ ctx, entradas, abrir }: { ctx: Contexto; entradas: readonly EntradaMapa[]; abrir: (e: EntradaMapa) => void }) {
  if (entradas.length === 0) return null
  return (
    <ul class="lista" data-testid="entradas">
      {[...entradas]
        .sort((a, b) => b.data.localeCompare(a.data))
        .map((e) => (
          <li key={e.alvo.raiz}>
            <button type="button" class="rl-linha" onClick={() => abrir(e)}>
              <i class="rl-bolinha" style={{ background: COR_CATEGORIA[e.categoria] }} />
              <span class="rl-linha-texto">
                <strong>{e.titulo}</strong>
                <span class="discreto">
                  {descricaoDoAlvo(ctx, e.alvo, e)} · {dataBR(e.data)}
                </span>
              </span>
            </button>
          </li>
        ))}
    </ul>
  )
}
