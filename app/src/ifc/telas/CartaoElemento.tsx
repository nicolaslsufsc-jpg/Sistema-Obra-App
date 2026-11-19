// Ficha da peça tocada: o que ela é, onde está e todas as propriedades do IFC.
import { useState } from 'preact/hooks'
import { CATEGORIAS } from '../motor/categorias'
import { nomeDaClasse, tituloDoElemento } from '../motor/indice'
import type { Sessao } from '../sessao'
import { IcFechar, IcFoco, IcOlhoFechado, IcSeta } from './icones'

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  if (!valor) return null
  return (
    <div class="ifc-dado">
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  )
}

function Conjunto({ nome, props }: { nome: string; props: Array<[string, string]> }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div class="ifc-faceta">
      <button type="button" class="ifc-faceta-topo" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <IcSeta aberta={aberto} />
        <span>{nome}</span>
        <span class="ifc-contagem">{props.length}</span>
      </button>
      {aberto && (
        <dl class="ifc-dados">
          {props.map(([k, v], i) => (
            <Linha key={`${k}-${i}`} rotulo={k} valor={v} />
          ))}
        </dl>
      )}
    </div>
  )
}

export function CartaoElemento({ sessao }: { sessao: Sessao }) {
  const s = sessao.selecao
  const m = s ? sessao.modelo(s.chave) : undefined
  if (!s || !m) return null
  const { meta, tabela } = m.modelo
  const i = s.elemento
  const cat = CATEGORIAS[m.indice.categoria[i]]
  const pav = tabela.pavimento[i]
  const psets = Array.from(tabela.psetsLista.subarray(tabela.psetsInicio[i], tabela.psetsInicio[i + 1])).map((p) => meta.psets[p])
  return (
    <aside class="ifc-elemento" aria-label="Peça selecionada" data-testid="ifc-elemento">
      <header class="ifc-elemento-topo">
        <span class="ifc-amostra" style={{ background: cat.cor }} aria-hidden="true" />
        <div>
          <h2>{tituloDoElemento(m.indice, i)}</h2>
          <small>
            {cat.nome}
            {pav >= 0 ? ` · ${meta.pavimentos[pav].nome}` : ''}
          </small>
        </div>
        <button type="button" class="ifc-icone" onClick={() => sessao.selecionar(null)} aria-label="Fechar ficha da peça">
          <IcFechar />
        </button>
      </header>

      <div class="ifc-elemento-corpo">
        <div class="ifc-acoes">
          <button type="button" class="ifc-botao" onClick={() => sessao.visor?.focarElemento(s.chave, s.elemento)}>
            <IcFoco />
            Aproximar
          </button>
          <button type="button" class="ifc-botao" onClick={() => sessao.isolarSelecao()}>
            Só esta
          </button>
          <button type="button" class="ifc-botao" onClick={() => sessao.ocultarSelecao()}>
            <IcOlhoFechado />
            Ocultar
          </button>
        </div>

        <dl class="ifc-dados">
          <Linha rotulo="Parte de" valor={meta.pais[i]} />
          <Linha rotulo="Tipo" valor={tabela.tipo[i] >= 0 ? meta.tipos[tabela.tipo[i]] : ''} />
          <Linha rotulo="Material" valor={tabela.material[i] >= 0 ? meta.materiais[tabela.material[i]] : ''} />
          <Linha rotulo="Camada" valor={tabela.camada[i] >= 0 ? meta.camadas[tabela.camada[i]] : ''} />
          <Linha rotulo="Classe IFC" valor={tabela.classe[i] >= 0 ? nomeDaClasse(meta.classes[tabela.classe[i]]) : ''} />
          <Linha rotulo="Tag" valor={meta.tags[i]} />
          <Linha rotulo="Modelo" valor={m.nome} />
          <Linha rotulo="GUID" valor={meta.guids[i]} />
        </dl>

        {psets.map((p, k) => (
          <Conjunto key={k} nome={p.nome} props={p.props} />
        ))}
      </div>
    </aside>
  )
}
