// Gerar cortes: planta de um pavimento, corte longitudinal ou transversal, ou por uma face tocada.
import { useState } from 'preact/hooks'
import { formatarMetros, type Sessao } from '../sessao'
import { IcBaixar, IcCorteH, IcCorteV, IcInverter, IcLixo, IcPlanta, IcSalvar, IcToque } from './icones'
import { numero } from './PainelModelos'

function NovoCorte({ sessao }: { sessao: Sessao }) {
  const pavimentos = sessao.pavimentos()
  const [escolhido, setPav] = useState('')
  const [altura, setAltura] = useState('1,20')
  // Pavimento do meio enquanto a pessoa não escolhe, ou se o modelo do escolhido foi fechado.
  // Calculado aqui, e não num efeito depois de desenhar: o efeito atrasado sobrescrevia a escolha
  // feita logo que a aba abre (aconteceu no teste do GitHub, máquina mais lenta).
  const pav = pavimentos.some((p) => p.nome === escolhido) ? escolhido : (pavimentos[Math.floor(pavimentos.length / 2)]?.nome ?? '')
  const num = Number(altura.replace(',', '.'))

  return (
    <div class="ifc-pilha">
      {pavimentos.length > 0 && (
        <form
          class="ifc-cartao ifc-pilha-curta"
          onSubmit={(e) => {
            e.preventDefault()
            sessao.novaPlanta(pav, Number.isFinite(num) ? num : 1.2)
          }}
        >
          <h3>Planta do pavimento</h3>
          <label class="ifc-campo">
            <span>Pavimento</span>
            <select value={pav} onChange={(e) => setPav((e.target as HTMLSelectElement).value)}>
              {pavimentos.map((p) => (
                <option key={p.nome} value={p.nome}>
                  {p.nome} ({formatarMetros(p.elevacao)})
                </option>
              ))}
            </select>
          </label>
          <label class="ifc-campo">
            <span>Altura do corte acima do piso (m)</span>
            <input type="text" inputMode="decimal" value={altura} onInput={(e) => setAltura((e.target as HTMLInputElement).value)} />
          </label>
          <button type="submit" class="ifc-botao ifc-botao-forte ifc-botao-largo">
            <IcPlanta />
            Gerar planta
          </button>
        </form>
      )}

      <div class="ifc-grade-botoes">
        <button type="button" class="ifc-botao ifc-botao-alto" onClick={() => sessao.novoCorteVertical('longitudinal')}>
          <IcCorteH />
          Corte longitudinal
        </button>
        <button type="button" class="ifc-botao ifc-botao-alto" onClick={() => sessao.novoCorteVertical('transversal')}>
          <IcCorteV />
          Corte transversal
        </button>
        <button type="button" class="ifc-botao ifc-botao-alto" onClick={() => sessao.esperarFace()}>
          <IcToque />
          Cortar por uma face
        </button>
      </div>
    </div>
  )
}

function CorteAtivo({ sessao, aoVer2D }: { sessao: Sessao; aoVer2D: () => void }) {
  const c = sessao.corte!
  const horizontal = Math.abs(c.plano.normal[1]) > 0.5
  const qtd = c.resultado?.pecas.length ?? 0
  const passo = (d: number) => sessao.moverCorte(c.deslocamento + d)
  return (
    <div class="ifc-pilha">
      <div class="ifc-cartao ifc-pilha-curta">
        <h3>{c.nome}</h3>
        <p class="ifc-discreto" aria-live="polite">
          {c.calculando ? 'Calculando...' : qtd ? `${numero(qtd)} peças cortadas` : 'Este plano não pega nenhuma peça visível.'}
        </p>
        <label class="ifc-regua ifc-regua-alta">
          <span>{horizontal ? 'Nível' : 'Posição'}</span>
          <input
            type="range"
            min={c.min}
            max={c.max}
            step="0.01"
            value={c.deslocamento}
            onInput={(e) => sessao.moverCorte(Number((e.target as HTMLInputElement).value))}
            aria-label="Mover o plano de corte"
            data-testid="ifc-regua-corte"
          />
          <output>{formatarMetros(horizontal ? sessao.nivelReal(c.plano.ponto[1]) : c.deslocamento)} m</output>
        </label>
        <div class="ifc-passos" role="group" aria-label="Mover o plano aos poucos">
          <button type="button" class="ifc-botao" onClick={() => passo(-1)}>
            −1 m
          </button>
          <button type="button" class="ifc-botao" onClick={() => passo(-0.1)}>
            −10 cm
          </button>
          <button type="button" class="ifc-botao" onClick={() => passo(0.1)}>
            +10 cm
          </button>
          <button type="button" class="ifc-botao" onClick={() => passo(1)}>
            +1 m
          </button>
        </div>
        <div class="ifc-acoes">
          {!c.vista2D ? (
            <button type="button" class="ifc-botao ifc-botao-forte" onClick={aoVer2D} disabled={!c.resultado} data-testid="ifc-ver-2d">
              Ver desenho 2D
            </button>
          ) : (
            <button type="button" class="ifc-botao ifc-botao-forte" onClick={() => sessao.fecharVista2D()}>
              Voltar ao 3D
            </button>
          )}
          <button type="button" class="ifc-botao" onClick={() => sessao.inverterCorte()}>
            <IcInverter />
            Ver o outro lado
          </button>
        </div>
      </div>

      <div class="ifc-cartao ifc-pilha-curta">
        <h3>Levar o desenho</h3>
        <div class="ifc-acoes">
          <button type="button" class="ifc-botao" disabled={!qtd} onClick={() => sessao.exportarCorte('dxf')} title="Abre no AutoCAD. 1 unidade = 1 metro">
            <IcBaixar />
            DXF
          </button>
          <button type="button" class="ifc-botao" disabled={!qtd} onClick={() => sessao.exportarCorte('svg')} title="Vetor, com as peças pintadas">
            <IcBaixar />
            SVG
          </button>
          <button type="button" class="ifc-botao" disabled={!qtd} onClick={() => sessao.exportarCorte('png')} title="Imagem do que está na tela">
            <IcBaixar />
            Imagem
          </button>
        </div>
      </div>

      <div class="ifc-acoes">
        <button type="button" class="ifc-botao" onClick={() => sessao.salvarCorte()}>
          <IcSalvar />
          Guardar este corte
        </button>
        <button type="button" class="ifc-botao" onClick={() => sessao.removerCorte()}>
          <IcLixo />
          Tirar o corte
        </button>
      </div>
    </div>
  )
}

export function PainelCortes({ sessao, aoVer2D }: { sessao: Sessao; aoVer2D: () => void }) {
  return (
    <div class="ifc-pilha">
      {sessao.corte ? <CorteAtivo sessao={sessao} aoVer2D={aoVer2D} /> : <NovoCorte sessao={sessao} />}
      {sessao.cortesSalvos.length > 0 && (
        <section>
          <h3>Cortes guardados</h3>
          <ul class="ifc-lista-limpa">
            {sessao.cortesSalvos.map((c) => (
              <li key={c.id} class="ifc-guardado">
                <button type="button" class="ifc-guardado-abrir" onClick={() => sessao.abrirCorteSalvo(c.id)}>
                  <strong>{c.nome}</strong>
                </button>
                <button type="button" class="ifc-icone" onClick={() => sessao.apagarCorteSalvo(c.id)} aria-label={`Apagar ${c.nome}`}>
                  <IcLixo />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
