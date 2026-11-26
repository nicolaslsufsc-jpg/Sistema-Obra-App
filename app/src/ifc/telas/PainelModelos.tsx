// Modelos abertos: ligar, deixar transparente, alinhar, levar para outro aparelho.
import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { qtdTriangulos } from '../motor/tipos'
import { ajusteEhNeutro } from '../motor/alinhamento'
import type { ModeloAberto, Sessao } from '../sessao'
import { IcAbrir, IcAlinhar, IcBaixar, IcFechar, IcLixo, IcOlho, IcOlhoFechado } from './icones'
import { Ajuda } from '../../telas/Ajuda'

export function numero(n: number): string {
  return n.toLocaleString('pt-BR')
}

export function milhoes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString('pt-BR')} mil`
  return numero(n)
}

export function tamanhoArquivo(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
  if (b >= 1e6) return `${Math.round(b / 1e6).toLocaleString('pt-BR')} MB`
  return `${Math.max(1, Math.round(b / 1e3)).toLocaleString('pt-BR')} kB`
}

function AjusteFino({ sessao, m }: { sessao: Sessao; m: ModeloAberto }) {
  const [v, setV] = useState({ dx: '0', dy: '0', dz: '0', giro: '0' })
  const num = (t: string) => {
    const n = Number(t.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  const campo = (rotulo: string, chave: keyof typeof v, unidade: string) => (
    <label class="ifc-campo-curto">
      <span>{rotulo}</span>
      <input type="text" inputMode="decimal" value={v[chave]} onInput={(e) => setV({ ...v, [chave]: (e.target as HTMLInputElement).value })} aria-label={`${rotulo} em ${unidade}`} />
    </label>
  )
  return (
    <form
      class="ifc-ajuste"
      onSubmit={(e) => {
        e.preventDefault()
        sessao.ajustarFino(m.chave, num(v.dx), num(v.dy), num(v.dz), num(v.giro))
        setV({ dx: '0', dy: '0', dz: '0', giro: '0' })
      }}
    >
      {campo('Leste (m)', 'dx', 'metros')}
      {campo('Altura (m)', 'dy', 'metros')}
      {campo('Sul (m)', 'dz', 'metros')}
      {campo('Giro (°)', 'giro', 'graus')}
      <button type="submit" class="ifc-botao">
        Aplicar
      </button>
    </form>
  )
}

function CartaoModelo({ sessao, m }: { sessao: Sessao; m: ModeloAberto }) {
  const [alinhar, setAlinhar] = useState(false)
  const tem = sessao.modelos.length > 1
  const n = m.flags.length
  return (
    <li class="ifc-modelo">
      <div class="ifc-modelo-topo">
        <span class="ifc-amostra" style={{ background: m.cor }} aria-hidden="true" />
        <div class="ifc-modelo-nome">
          <strong title={m.nome}>{m.nome}</strong>
          <small>
            {numero(n)} elementos · {milhoes(qtdTriangulos(m.modelo))} triângulos · {m.modelo.meta.schema}
          </small>
        </div>
        <button
          type="button"
          class="ifc-icone"
          aria-pressed={m.visivel}
          aria-label={m.visivel ? `Esconder ${m.nome}` : `Mostrar ${m.nome}`}
          title={m.visivel ? 'Esconder' : 'Mostrar'}
          onClick={() => sessao.definirVisivel(m.chave, !m.visivel)}
        >
          {m.visivel ? <IcOlho /> : <IcOlhoFechado />}
        </button>
      </div>

      <label class="ifc-regua">
        <span>Opacidade</span>
        <input
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={m.opacidade}
          onInput={(e) => sessao.definirOpacidade(m.chave, Number((e.target as HTMLInputElement).value))}
          aria-label={`Opacidade de ${m.nome}`}
        />
        <output>{Math.round(m.opacidade * 100)}%</output>
      </label>

      <div class="ifc-acoes">
        {tem && (
          <button type="button" class="ifc-botao" aria-expanded={alinhar} onClick={() => setAlinhar(!alinhar)}>
            <IcAlinhar />
            Alinhar
          </button>
        )}
        <button type="button" class="ifc-botao" onClick={() => void sessao.salvarPacote(m.chave)} title="Salva o modelo convertido num arquivo .obra3d, que abre no tablet sem ler o IFC de novo">
          <IcBaixar />
          Levar para outro aparelho
        </button>
        <button type="button" class="ifc-botao" onClick={() => sessao.fechar(m.chave)}>
          <IcFechar />
          Fechar
        </button>
      </div>

      {alinhar && tem && (
        <div class="ifc-alinhar">
          <p class="so-com-ajuda">
            Marque o mesmo ponto nos dois arquivos.
            <Ajuda>Quando os arquivos não vêm na mesma coordenada, um cai longe do outro. Marque o mesmo ponto nos dois (um canto de pilar, por exemplo).</Ajuda>
          </p>
          <div class="ifc-acoes">
            <button type="button" class="ifc-botao ifc-botao-forte" onClick={() => sessao.iniciarAlinhamento(m.chave)}>
              Marcar pontos
            </button>
            <button type="button" class="ifc-botao" onClick={() => sessao.encaixarPelaCaixa(m.chave)}>
              Encaixar pelo centro
            </button>
            {!ajusteEhNeutro(m.ajuste) && (
              <button type="button" class="ifc-botao" onClick={() => sessao.zerarAjuste(m.chave)}>
                Voltar à posição do arquivo
              </button>
            )}
          </div>
          <AjusteFino sessao={sessao} m={m} />
        </div>
      )}
    </li>
  )
}

export function PainelModelos({ sessao, aoEscolher, daObra }: { sessao: Sessao; aoEscolher: () => void; daObra?: ComponentChildren }) {
  useEffect(() => {
    void sessao.atualizarGuardados()
  }, [sessao])
  const abertos = new Set(sessao.modelos.map((m) => m.id))
  const fechados = sessao.guardados.filter((g) => !abertos.has(g.id))
  return (
    <div class="ifc-pilha">
      <button type="button" class="ifc-botao ifc-botao-forte ifc-botao-largo" onClick={aoEscolher}>
        <IcAbrir />
        Importar IFC
      </button>

      {daObra}

      {sessao.modelos.length > 0 && (
        <ul class="ifc-lista-limpa ifc-pilha" aria-label="Modelos abertos">
          {sessao.modelos.map((m) => (
            <CartaoModelo key={m.chave} sessao={sessao} m={m} />
          ))}
        </ul>
      )}

      {fechados.length > 0 && (
        <section>
          <h3>Guardados neste aparelho</h3>
          <ul class="ifc-lista-limpa">
            {fechados.map((g) => (
              <li key={g.id} class="ifc-guardado">
                <button type="button" class="ifc-guardado-abrir" onClick={() => void sessao.abrirDoAparelho(g.id)}>
                  <strong>{g.nome}</strong>
                  <small>
                    {numero(g.elementos)} elementos · {tamanhoArquivo(g.tamanho)}
                  </small>
                </button>
                <button type="button" class="ifc-icone" onClick={() => void sessao.apagarDoAparelho(g.id)} aria-label={`Apagar ${g.nome} deste aparelho`} title="Apagar deste aparelho">
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
