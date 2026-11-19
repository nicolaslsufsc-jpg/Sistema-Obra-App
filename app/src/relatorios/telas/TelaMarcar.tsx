// Onde foi: marca na prancha de forma as peças, as áreas e os pontos de um serviço, ocorrência ou relatório.
// A tela responde na hora: a marca aparece primeiro e é gravada na fila, uma depois da outra.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { idDaRef, revisaoDaRef, type PlantaPavimento } from '../../concreto/planta'
import type { Ponto } from '../../concreto/geometria'
import { cancelar, pavimentoComPlanta, plantasDe, podeRegistrar, registrar } from '../dados'
import { campoDoAlvo, fotoDaRaiz, resumoDoDia, textoDoLocal, type Alvo, type DadosRelatorios, type Marca, pavimentoNoTexto } from '../regras'
import type { Contexto } from './ModuloRelatorios'
import { MapaPlanta, type MarcaDesenho, type Modo, type Toque } from './MapaPlanta'
import { erroEmTexto, plural, usarMensagem } from './comum'

const COR = '#1565c0'

// Último pavimento usado nesta obra: o próximo serviço costuma ser no mesmo. É só conveniência:
// sem o localStorage (modo privado, dados limpos), a tela abre no pavimento com planta.
function lerUltimoPavimento(obraId: string): string | null {
  try {
    return localStorage.getItem(`relatorios:pavimento:${obraId}`)
  } catch {
    return null
  }
}
function gravarUltimoPavimento(obraId: string, pavId: string) {
  try {
    localStorage.setItem(`relatorios:pavimento:${obraId}`, pavId)
  } catch {
    /* sem problema: só não lembra */
  }
}

function resumoDasMarcas(pecas: number, areas: number, pontos: number): string {
  const p: string[] = []
  if (pecas) p.push(plural(pecas, 'peça', 'peças'))
  if (areas) p.push(plural(areas, 'área', 'áreas'))
  if (pontos) p.push(plural(pontos, 'ponto', 'pontos'))
  return `Marcado aqui: ${p.join(', ') || 'nada neste trecho'}`
}

/** Data do diário a que o alvo pertence (relatório não fecha com o dia). */
function dataDoAlvo(d: DadosRelatorios, alvo: Alvo): string | null {
  if (alvo.tipo === 'foto') return fotoDaRaiz(d, alvo.raiz)?.data ?? null
  const mapa = alvo.tipo === 'servico' ? d.servicos : alvo.tipo === 'ocorrencia' ? d.ocorrencias : null
  if (!mapa) return null
  for (const [data, l] of mapa) if (l.some((x) => x.raiz === alvo.raiz)) return data
  return null
}

export function TelaMarcar({ ctx, alvo, titulo, aviso }: { ctx: Contexto; alvo: Alvo; titulo: string; aviso: string }) {
  const { dados, obra, usuario, voltar, recarregar } = ctx
  const data = useMemo(() => dataDoAlvo(dados, alvo), [])
  const pode = podeRegistrar(obra.papel) && !(data && resumoDoDia(dados, data).fechado)
  const [marcas, setMarcas] = useState<Marca[]>(() => dados.marcas.get(alvo.raiz) ?? [])
  // Sem marca nem pavimento lembrado, espera descobrir qual tem planta antes de abrir.
  const lembrado = useMemo(() => {
    const id = lerUltimoPavimento(obra.id)
    return id && dados.pavimentos.some((p) => p.id === id) ? id : null
  }, [])
  // Sem marca: o pavimento que o próprio serviço ou ocorrência cita ("...do 2º pavimento") vem antes do
  // último usado. Antes abria no último pavimento, e o serviço do 2º caía no 4º (Testador, 09/11/2026).
  const doTexto = useMemo(() => {
    const mapa = alvo.tipo === 'servico' ? dados.servicos : alvo.tipo === 'ocorrencia' ? dados.ocorrencias : null
    const l = data && mapa ? mapa.get(data)?.find((x) => x.raiz === alvo.raiz) : undefined
    return l ? pavimentoNoTexto([l.descricao, l.local_texto, l.observacao].filter(Boolean).join(' '), dados.pavimentos) : null
  }, [])
  const [pavId, setPavId] = useState<string | null>(() => marcas[0]?.pavimento_id ?? doTexto ?? lembrado)
  const [plantas, setPlantas] = useState<PlantaPavimento[] | null>(null)
  const [plantaSel, setPlantaSel] = useState<string | null>(null)
  // foto: o normal é "pingar" o ponto de onde ela foi tirada
  const [modo, setModo] = useState<Modo>(alvo.tipo === 'foto' ? 'ponto' : 'tocar')
  const [msg, setMsg] = usarMensagem()
  const pav = dados.pavimentos.find((p) => p.id === pavId)
  const pecas = pavId ? (dados.pecasDoPavimento.get(pavId) ?? []) : []
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
    if (!pav) {
      setPlantas([])
      return
    }
    plantasDe(obra, pav, pecas).then((l) => {
      if (!vivo) return
      setPlantas(l)
      // abre no trecho onde já tem marca
      const comMarca = l.find((p) => marcas.some((m) => m.pavimento_id === pav.id && m.planta_ref && idDaRef(m.planta_ref) === p.id))
      setPlantaSel(comMarca?.id ?? l[0]?.id ?? null)
    })
    return () => {
      vivo = false
    }
  }, [pavId])

  // Gravações uma depois da outra. Ao sair da tela, o módulo relê o banco do aparelho.
  const fila = useRef<Promise<unknown>>(Promise.resolve())
  const gravar = (tarefa: () => Promise<unknown>) => {
    fila.current = fila.current.then(tarefa).catch((e) => setMsg(`Não foi possível salvar: ${erroEmTexto(e)}`))
  }
  useEffect(
    () => () => {
      fila.current.then(() => recarregar())
    },
    [],
  )

  const adicionar = (campos: Pick<Marca, 'forma'> & Partial<Pick<Marca, 'elemento_id' | 'contorno' | 'planta_ref'>>) => {
    const id = crypto.randomUUID()
    const colunas = { ...campoDoAlvo(alvo), pavimento_id: pavId, planta_ref: null, elemento_id: null, contorno: null, ...campos }
    const nova = { id, raiz: id, obra_id: obra.id, usuario_id: usuario.id, dispositivo_id: '', criado_em_dispositivo: new Date().toISOString(), apagado: false, ...colunas } as unknown as Marca
    if (pavId) gravarUltimoPavimento(obra.id, pavId)
    setMarcas((l) => [...l, nova])
    gravar(() => registrar('rel_marcas', obra.id, usuario.id, { id, ...colunas }))
  }

  const tirar = (m: Marca) => {
    setMarcas((l) => l.filter((x) => x.raiz !== m.raiz))
    gravar(() => cancelar('rel_marcas', obra.id, usuario.id, m))
  }

  const alternarPeca = (elementoId: string, nome: string, plantaRef: string | null) => {
    const ja = marcas.find((m) => m.forma === 'peca' && m.elemento_id === elementoId)
    if (ja) {
      tirar(ja)
      setMsg(`${nome} desmarcada.`)
    } else {
      adicionar({ forma: 'peca', elemento_id: elementoId, planta_ref: plantaRef })
      setMsg(`${nome} marcada.`)
    }
  }

  const aoTocar = ({ x, y, peca }: Toque) => {
    if (!planta) return
    if (!pode) {
      if (peca) setMsg(peca.nome)
      return
    }
    if (modo === 'ponto') {
      adicionar({ forma: 'ponto', planta_ref: planta.ref, contorno: [[Math.round(x * 10) / 10, Math.round(y * 10) / 10]] })
      setMsg('Ponto marcado.')
      return
    }
    if (peca) alternarPeca(peca.id, peca.nome, planta.ref)
    else setMsg('Toque numa peça. Para marcar outro lugar, use Ponto ou Área.')
  }

  const aoArea = (contorno: Ponto[]) => {
    if (!planta || !pode) return
    adicionar({ forma: 'area', planta_ref: planta.ref, contorno: contorno as Array<[number, number]> })
    setMsg('Área marcada.')
  }

  const desenho: MarcaDesenho[] = useMemo(
    () =>
      marcas
        .filter((m) => m.pavimento_id === pavId && (m.forma === 'peca' || (!!planta && !!m.planta_ref && idDaRef(m.planta_ref) === planta.id)))
        .map((m) => ({ id: m.id, forma: m.forma, elemento_id: m.elemento_id, contorno: m.contorno, cor: COR })),
    [marcas, pavId, planta],
  )

  const marcasAqui = marcas.filter((m) => m.pavimento_id === pavId)
  const pecasAqui = marcasAqui.filter((m) => m.forma === 'peca')
  const areasAqui = planta ? marcasAqui.filter((m) => m.forma === 'area' && m.planta_ref && idDaRef(m.planta_ref) === planta.id) : []
  const pontosAqui = planta ? marcasAqui.filter((m) => m.forma === 'ponto' && m.planta_ref && idDaRef(m.planta_ref) === planta.id) : []
  const outrosTrechos = marcasAqui.filter((m) => m.forma !== 'peca' && planta && m.planta_ref && idDaRef(m.planta_ref) !== planta.id)
  const deOutroPavimento = marcas.filter((m) => m.pavimento_id !== pavId)
  const revisaoAntiga = planta ? [...areasAqui, ...pontosAqui].filter((m) => revisaoDaRef(m.planta_ref!) !== planta.revisao) : []
  const ordem = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
  const nomeDa = (id: string | null) => dados.pecaPorId.get(id ?? '')?.nome ?? '?'

  return (
    <div class="rl-mapa-tela com-painel">
      <header class="rl-mapa-topo">
        <div class="rl-mapa-linha">
          <button type="button" class="rl-voltar" onClick={voltar} data-testid="pronto">
            ‹ Pronto
          </button>
          <div class="rl-titulo">
            <h1>Onde foi</h1>
            <p class="discreto">
              {titulo}
              {aviso && <span data-testid="aviso-sync"> · {aviso}</span>}
            </p>
          </div>
          {pode && marcas.length > 0 && (
            <button type="button" data-testid="desfazer" onClick={() => tirar(marcas[marcas.length - 1])}>
              Desfazer
            </button>
          )}
        </div>
        <div class="rl-filtros">
          <select
            value={pavId ?? ''}
            aria-label="Pavimento"
            data-testid="pavimento"
            onChange={(e) => {
              setPavId(e.currentTarget.value)
              setPlantaSel(null)
            }}
          >
            {dados.pavimentos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          {plantas && plantas.length > 1 && planta && (
            <select value={planta.id} aria-label="Trecho (prancha)" data-testid="trecho" onChange={(e) => setPlantaSel(e.currentTarget.value)}>
              {plantas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.trecho}
                </option>
              ))}
            </select>
          )}
          {pode && planta && (
            <div class="rl-modos" role="group" aria-label="O que o toque marca">
              {(
                [
                  ['tocar', 'Peça'],
                  ['ponto', 'Ponto'],
                  ['area', 'Área'],
                ] as const
              ).map(([v, t]) => (
                <button type="button" key={v} class={`rl-chip${modo === v ? ' on' : ''}`} aria-pressed={modo === v} data-testid={`modo-${v}`} onClick={() => setModo(v)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {planta ? (
        <MapaPlanta planta={planta} marcas={desenho} modo={modo} desenha={pode} cor={COR} aoTocar={aoTocar} aoArea={aoArea} aoAreaPequena={() => setMsg('Traço pequeno demais. Faça uma volta em torno do lugar.')}>
          {msg && (
            <p class="rl-toast" role="status" data-testid="toast">
              {msg}
            </p>
          )}
        </MapaPlanta>
      ) : plantas === null ? (
        <p class="tela discreto">Carregando a planta…</p>
      ) : (
        <div class="tela rl-sem-planta" data-testid="sem-planta">
          <p class="cartao">
            {pav ? `${pav.nome} não tem planta neste aparelho.` : 'A obra ainda não tem pavimentos.'} As plantas são baixadas na tela inicial do módulo FVS, uma por trecho.
            {pecas.length > 0 ? ' Enquanto isso, marque as peças na lista.' : ''}
          </p>
          {pecas.length > 0 && (
            <ul class="rl-lista-pecas">
              {[...pecas]
                .sort((a, b) => a.tipo.localeCompare(b.tipo) || ordem.compare(a.nome, b.nome))
                .map((p) => (
                  <li key={p.id}>
                    <label class="sem-margem">
                      <input type="checkbox" checked={marcas.some((m) => m.forma === 'peca' && m.elemento_id === p.id)} disabled={!pode} onChange={() => alternarPeca(p.id, p.nome, null)} /> {p.nome}
                    </label>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {planta && (
        <aside class="rl-painel aberto" data-testid="painel">
          <div class="rl-painel-corpo">
            <p class="discreto rl-dica">
              {!pode
                ? 'Só para ver: dia fechado ou acesso de leitura.'
                : modo === 'ponto'
                  ? alvo.tipo === 'foto'
                    ? 'Toque na planta no lugar de onde a foto foi tirada.'
                    : 'Toque na planta para pôr um ponto.'
                  : modo === 'area'
                    ? 'Desenhe em volta do lugar. Para mover a planta, volte para Peça.'
                    : 'Toque nas peças. A caneta desenha uma área; o dedo move a planta.'}{' '}
              Prancha {planta.revisao ? `rev. ${planta.revisao}` : ''}.
            </p>
            {marcas.length === 0 && <p>Nada marcado ainda.</p>}
            {marcasAqui.length > 0 && <h3>{resumoDasMarcas(pecasAqui.length, areasAqui.length, pontosAqui.length)}</h3>}
            <ul class="rl-marcas" data-testid="marcas">
              {[...pecasAqui]
                .sort((a, b) => ordem.compare(nomeDa(a.elemento_id), nomeDa(b.elemento_id)))
                .map((m) => (
                  <li key={m.raiz}>
                    <span>{nomeDa(m.elemento_id)}</span>
                    {pode && (
                      <button type="button" aria-label={`Tirar ${nomeDa(m.elemento_id)}`} onClick={() => tirar(m)}>
                        ×
                      </button>
                    )}
                  </li>
                ))}
              {areasAqui.map((m, i) => (
                <li key={m.raiz}>
                  <span>Área {i + 1}</span>
                  {pode && (
                    <button type="button" aria-label={`Tirar área ${i + 1}`} onClick={() => tirar(m)}>
                      ×
                    </button>
                  )}
                </li>
              ))}
              {pontosAqui.map((m, i) => (
                <li key={m.raiz}>
                  <span>Ponto {i + 1}</span>
                  {pode && (
                    <button type="button" aria-label={`Tirar ponto ${i + 1}`} onClick={() => tirar(m)}>
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {revisaoAntiga.length > 0 && (
              <p class="aviso" data-testid="aviso-revisao">
                {plural(revisaoAntiga.length, 'marca foi feita', 'marcas foram feitas')} em outra revisão da prancha ({[...new Set(revisaoAntiga.map((m) => revisaoDaRef(m.planta_ref!)))].join(', ')}). A prancha agora é a {planta.revisao}: confira.
              </p>
            )}
            {outrosTrechos.length > 0 && <p class="discreto">Mais {plural(outrosTrechos.length, 'marca', 'marcas')} em outro trecho deste pavimento.</p>}
            {deOutroPavimento.length > 0 && <p class="discreto">Em outros pavimentos: {textoDoLocal(dados, deOutroPavimento)}</p>}
          </div>
        </aside>
      )}
    </div>
  )
}
