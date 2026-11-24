// Painel da obra (versão PC): os números principais de cada módulo numa tela só, com atalho para o
// módulo e para os relatórios. Só leitura.
import type { ComponentChildren } from 'preact'
import { reprovacoesDaObra, situacaoDaObra } from '../fvs/dados'
import { entregasDaObra } from '../projetos/entregas'
import { IconeModulo } from '../telas/icones'
import type { IdModulo } from '../modulos'
import type { DestinoPc } from './CascaPc'
import { dataBR, hojeLocal, type DadosPc } from './dados_pc'

interface Numero {
  rotulo: string
  valor: number | string
  alerta?: boolean
}

function Bloco({ id, nome, numeros, erro, aoIr, children }: { id: IdModulo; nome: string; numeros: Numero[]; erro?: string; aoIr: (d: DestinoPc) => void; children?: ComponentChildren }) {
  return (
    <section class="pc-bloco" data-testid={`pc-bloco-${id}`}>
      <h2>
        <IconeModulo id={id} />
        {nome}
      </h2>
      {erro ? (
        <p class="pc-msg pc-erro">Não deu para ler o {nome} neste aparelho: {erro}</p>
      ) : (
        <dl class="pc-numeros">
          {numeros.map((n) => (
            <div key={n.rotulo} class={n.alerta ? 'pc-alerta' : undefined}>
              <dt>{n.rotulo}</dt>
              <dd>{n.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      <button type="button" class="pc-bt" onClick={() => aoIr({ tipo: 'modulo', id })}>
        Abrir {nome} ›
      </button>
    </section>
  )
}

const somar = (ns: ReadonlyArray<number | null | undefined>) => ns.reduce<number>((s, n) => s + (n ?? 0), 0)
const m3 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function PaginaPainel({ dados, aoIr }: { dados: DadosPc; aoIr: (d: DestinoPc) => void }) {
  const hoje = hojeLocal()
  const em30 = hojeLocal(new Date(Date.now() + 30 * 86400000))

  // FVS
  const f = dados.fvs
  const linhasFvs = f ? situacaoDaObra(f) : []
  const ncsAbertas = f ? reprovacoesDaObra(f).filter((r) => r.aberta).length : 0
  const plantas = f ? somar([...f.plantasDe.values()].map((l) => l.length)) : 0
  const comMarcacao = linhasFvs.filter((l) => l.a + l.r + l.na > 0).length

  // Concreto (a concretagem de exemplo da apresentação não conta)
  const c = dados.concreto
  const concretagens = c ? c.concretagens.filter((x) => !x.exemplo) : []
  const caminhoes = c ? concretagens.flatMap((x) => c.caminhoesDe.get(x.raiz) ?? []) : []
  const ultima = concretagens.map((x) => x.data).sort().at(-1)

  // Projetos
  const p = dados.projetos
  const entregas = p ? entregasDaObra(p) : []
  const emCampo = somar(entregas.map((e) => e.copias - e.devolvidas))

  // Documentos (os de exemplo não contam)
  const d = dados.documentos
  const docs = d ? d.documentos.filter((x) => !x.exemplo) : []
  const vencidos = docs.filter((x) => x.atual.validade && x.atual.validade < hoje).length
  const vencendo = docs.filter((x) => x.atual.validade && x.atual.validade >= hoje && x.atual.validade <= em30).length

  return (
    <main class="tela pc-pagina" data-testid="pc-pagina-painel">
      <div class="pc-titulo">
        <h1>Painel da obra</h1>
        <p>O que está guardado neste aparelho hoje ({dataBR(hoje)}). Sincronize para ver o que os outros registraram.</p>
      </div>
      <div class="pc-blocos">
        <Bloco
          id="fvs"
          nome="FVS"
          erro={dados.erros.fvs}
          aoIr={aoIr}
          numeros={[
            { rotulo: 'fichas de peças e ambientes', valor: linhasFvs.length },
            { rotulo: 'com alguma marcação', valor: comMarcacao },
            { rotulo: 'não conformidades abertas', valor: ncsAbertas, alerta: ncsAbertas > 0 },
            { rotulo: f?.pavimentos.length === 1 ? 'plantas em 1 pavimento' : `plantas em ${f?.pavimentos.length ?? 0} pavimentos`, valor: plantas },
          ]}
        />
        <Bloco
          id="concreto"
          nome="Concreto"
          erro={dados.erros.concreto}
          aoIr={aoIr}
          numeros={[
            { rotulo: 'concretagens', valor: concretagens.length },
            { rotulo: 'caminhões', valor: caminhoes.length },
            { rotulo: 'volume (m³)', valor: m3(somar(caminhoes.map((k) => k.volume_m3))) },
            { rotulo: 'última concretagem', valor: dataBR(ultima) },
          ]}
        >
          {c && c.concretagens.some((x) => x.exemplo) && <p class="pc-nota">A concretagem de exemplo da apresentação não entra na conta.</p>}
        </Bloco>
        <Bloco
          id="projetos"
          nome="Projetos"
          erro={dados.erros.projetos}
          aoIr={aoIr}
          numeros={[
            { rotulo: 'pranchas cadastradas', valor: p?.documentos.length ?? 0 },
            { rotulo: 'revisões novas (7 dias)', valor: p?.novas.length ?? 0 },
            { rotulo: 'na lista vigente importada', valor: dados.base?.vigentes.length ?? 0 },
            { rotulo: 'cópias em campo', valor: emCampo },
          ]}
        />
        <Bloco
          id="documentos"
          nome="Documentos"
          erro={dados.erros.documentos}
          aoIr={aoIr}
          numeros={[
            { rotulo: 'documentos na lista mestra', valor: docs.length },
            { rotulo: 'com arquivo', valor: docs.filter((x) => x.atual.arquivo_id).length },
            { rotulo: 'validade vencida', valor: vencidos, alerta: vencidos > 0 },
            { rotulo: 'vencem em 30 dias', valor: vencendo },
          ]}
        />
      </div>
      <div class="pc-acoes pc-acoes-fim">
        <button type="button" class="pc-bt pc-principal" onClick={() => aoIr({ tipo: 'pagina', pagina: 'relatorios' })}>
          Gerar relatórios ›
        </button>
        <button type="button" class="pc-bt" onClick={() => aoIr({ tipo: 'pagina', pagina: 'pranchas' })}>
          Procurar prancha ou PDF ›
        </button>
      </div>
    </main>
  )
}
