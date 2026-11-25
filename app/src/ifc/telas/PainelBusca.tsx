// Busca por texto e lista de filtros. O número ao lado de cada opção diz quantas peças ela traria.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { CATEGORIAS } from '../motor/categorias'
import { FACETAS, SEM_VALOR, filtroAtivo, tituloDoElemento, type Faceta } from '../motor/indice'
import type { ModoFiltro, Sessao } from '../sessao'
import { IcBuscar, IcFechar, IcSeta } from './icones'
import { numero } from './PainelModelos'

const MODOS: Array<{ id: ModoFiltro; nome: string; dica: string }> = [
  { id: 'destacar', nome: 'Destacar', dica: 'O resto fica transparente' },
  { id: 'isolar', nome: 'Isolar', dica: 'O resto some' },
  { id: 'lista', nome: 'Só lista', dica: 'Não mexe no modelo' },
]

const LIMITE_INICIAL = 10
const CORES_CATEGORIA = new Map(CATEGORIAS.map((c) => [c.nome, c.cor]))

function BlocoFaceta({ sessao, faceta, nome, inicial }: { sessao: Sessao; faceta: Faceta; nome: string; inicial: boolean }) {
  const [aberto, setAberto] = useState(inicial)
  const [todos, setTodos] = useState(false)
  const contagens = sessao.resultado?.contagens[faceta]
  const marcados = sessao.filtro.marcados[faceta]
  const qtdMarcados = marcados?.size ?? 0

  const valores = useMemo(() => {
    const lista: Array<[string, number]> = contagens ? [...contagens.entries()] : []
    // Marcado continua na lista mesmo quando outro filtro zera a contagem dele.
    if (marcados) for (const v of marcados) if (!contagens?.has(v)) lista.push([v, 0])
    if (faceta === 'pavimento') {
      const ordem = new Map(sessao.pavimentos().map((p, i) => [p.nome, i]))
      return lista.sort((a, b) => (ordem.get(a[0]) ?? 999) - (ordem.get(b[0]) ?? 999))
    }
    return lista.sort((a, b) => {
      if (a[0] === SEM_VALOR) return 1
      if (b[0] === SEM_VALOR) return -1
      return b[1] - a[1]
    })
  }, [contagens, marcados, faceta, sessao])

  // Um valor só e nada marcado: esta lista não ajudaria a escolher nada.
  if (valores.length <= 1 && qtdMarcados === 0) return null
  const visiveis = todos ? valores : valores.slice(0, LIMITE_INICIAL)

  return (
    <div class="ifc-faceta">
      <button type="button" class="ifc-faceta-topo" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <IcSeta aberta={aberto} />
        <span>{nome}</span>
        {qtdMarcados > 0 && <span class="ifc-selo">{qtdMarcados}</span>}
      </button>
      {aberto && (
        <ul class="ifc-lista-limpa">
          {visiveis.map(([valor, qtd]) => {
            const cor = faceta === 'categoria' ? CORES_CATEGORIA.get(valor) : undefined
            return (
              <li key={valor}>
                <label class="ifc-opcao">
                  <input type="checkbox" checked={marcados?.has(valor) ?? false} onChange={() => sessao.alternarMarcado(faceta, valor)} />
                  {cor && <span class="ifc-amostra ifc-amostra-pequena" style={{ background: cor }} aria-hidden="true" />}
                  <span class="ifc-opcao-nome" title={valor}>
                    {valor}
                  </span>
                  <span class="ifc-contagem">{numero(qtd)}</span>
                </label>
              </li>
            )
          })}
          {valores.length > LIMITE_INICIAL && (
            <li>
              <button type="button" class="ifc-link" onClick={() => setTodos(!todos)}>
                {todos ? 'Mostrar menos' : `Ver todos (${numero(valores.length)})`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

const ALTURA_LINHA = 58

/** Lista de resultados: só desenha as linhas que aparecem. São dezenas de milhares no prédio inteiro. */
function ListaResultados({ sessao }: { sessao: Sessao }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [topo, setTopo] = useState(0)
  const [alturaVista, setAlturaVista] = useState(400)
  const r = sessao.resultado

  const linhas = useMemo(() => {
    if (!r) return new Int32Array(0)
    const pares = new Int32Array(r.total * 2)
    let n = 0
    r.passa.forEach((p, k) => {
      for (let i = 0; i < p.length; i++) {
        if (p[i]) {
          pares[n++] = k
          pares[n++] = i
        }
      }
    })
    // Em ordem natural ("P2" antes de "P10"). Com muitas linhas a ordenação pesaria: fica na ordem do arquivo.
    if (r.total <= 5000) {
      const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
      const titulos = Array.from({ length: r.total }, (_, j) => tituloDoElemento(sessao.modelos[pares[j * 2]].indice, pares[j * 2 + 1]))
      const ordem = titulos.map((_, j) => j).sort((a, b) => col.compare(titulos[a], titulos[b]))
      const saida = new Int32Array(r.total * 2)
      ordem.forEach((o, j) => {
        saida[j * 2] = pares[o * 2]
        saida[j * 2 + 1] = pares[o * 2 + 1]
      })
      return saida
    }
    return pares
  }, [r, sessao])

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const ro = new ResizeObserver(() => setAlturaVista(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const total = linhas.length / 2
  const primeira = Math.max(0, Math.floor(topo / ALTURA_LINHA) - 4)
  const ultima = Math.min(total, Math.ceil((topo + alturaVista) / ALTURA_LINHA) + 4)
  const itens = []
  for (let j = primeira; j < ultima; j++) {
    const m = sessao.modelos[linhas[j * 2]]
    if (!m) continue
    const el = linhas[j * 2 + 1]
    const pav = m.modelo.tabela.pavimento[el]
    const nomePav = pav >= 0 ? m.modelo.meta.pavimentos[pav].nome : ''
    const cat = CATEGORIAS[m.indice.categoria[el]]
    const sel = sessao.selecao?.chave === m.chave && sessao.selecao.elemento === el
    const pai = m.modelo.meta.pais[el]
    itens.push(
      <button
        key={`${m.chave}-${el}`}
        type="button"
        class="ifc-resultado"
        aria-current={sel}
        style={{ top: `${j * ALTURA_LINHA}px`, height: `${ALTURA_LINHA}px` }}
        onClick={() => sessao.selecionar({ chave: m.chave, elemento: el }, true)}
      >
        <span class="ifc-amostra ifc-amostra-pequena" style={{ background: cat.cor }} aria-hidden="true" />
        <span class="ifc-resultado-textos">
          <strong>{tituloDoElemento(m.indice, el)}</strong>
          <small>{[cat.nome, nomePav, pai].filter(Boolean).join(' · ')}</small>
        </span>
      </button>,
    )
  }
  return (
    <div ref={caixa} class="ifc-resultados" onScroll={(e) => setTopo((e.target as HTMLDivElement).scrollTop)} data-testid="ifc-resultados">
      {total === 0 ? (
        <p class="ifc-nada">Sem peças com estes filtros</p>
      ) : (
        <div style={{ height: `${total * ALTURA_LINHA}px`, position: 'relative' }}>{itens}</div>
      )}
    </div>
  )
}

export function PainelBusca({ sessao }: { sessao: Sessao }) {
  const [aba, setAba] = useState<'filtros' | 'lista'>('filtros')
  const ativo = filtroAtivo(sessao.filtro)
  const r = sessao.resultado
  const totalGeral = sessao.modelos.reduce((s, m) => s + m.flags.length, 0)
  const ocultos = sessao.qtdOcultos()
  return (
    <div class="ifc-busca">
      <div class="ifc-busca-fixo">
        <div class="ifc-campo-busca">
          <IcBuscar />
          <input
            type="search"
            placeholder="Nome, tag, material, propriedade..."
            value={sessao.filtro.texto}
            onInput={(e) => sessao.definirTexto((e.target as HTMLInputElement).value)}
            aria-label="Buscar elementos"
            data-testid="ifc-busca"
          />
          {sessao.filtro.texto && (
            <button type="button" class="ifc-icone" onClick={() => sessao.definirTexto('')} aria-label="Limpar busca">
              <IcFechar />
            </button>
          )}
        </div>

        <div class="ifc-segmentos" role="radiogroup" aria-label="O que fazer com o resto do modelo">
          {MODOS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={sessao.modoFiltro === m.id} title={m.dica} onClick={() => sessao.definirModoFiltro(m.id)}>
              {m.nome}
            </button>
          ))}
        </div>

        <div class="ifc-resumo">
          <span data-testid="ifc-total">
            <strong>{numero(r?.total ?? 0)}</strong> de {numero(totalGeral)} peças
          </span>
          {ativo && (
            <button type="button" class="ifc-link" onClick={() => sessao.limparFiltro()}>
              Limpar filtros
            </button>
          )}
        </div>

        {ocultos > 0 && (
          <div class="ifc-resumo">
            <span>{numero(ocultos)} ocultas</span>
            <button type="button" class="ifc-link" onClick={() => sessao.mostrarTudo()}>
              Mostrar todas
            </button>
          </div>
        )}

        <div class="ifc-segmentos ifc-segmentos-abas" role="tablist">
          <button type="button" role="tab" aria-selected={aba === 'filtros'} onClick={() => setAba('filtros')}>
            Filtros
          </button>
          <button type="button" role="tab" aria-selected={aba === 'lista'} onClick={() => setAba('lista')} data-testid="ifc-aba-lista">
            Lista ({numero(r?.total ?? 0)})
          </button>
        </div>
      </div>

      {aba === 'filtros' ? (
        <div class="ifc-facetas">
          {FACETAS.map((f, i) => (
            <BlocoFaceta key={f.id} sessao={sessao} faceta={f.id} nome={f.nome} inicial={i < 2} />
          ))}
        </div>
      ) : (
        <>
          {ativo && (r?.total ?? 0) > 0 && (
            <div class="ifc-acoes ifc-lista-acoes">
              <button type="button" class="ifc-botao" onClick={() => sessao.enquadrarResultado()}>
                Enquadrar estas
              </button>
              <button type="button" class="ifc-botao" onClick={() => sessao.ocultarResultado()}>
                Ocultar estas
              </button>
            </div>
          )}
          <ListaResultados sessao={sessao} />
        </>
      )}
    </div>
  )
}
