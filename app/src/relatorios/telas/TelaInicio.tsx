// Início do módulo: duas abas, Diário de obra e Relatórios (problema, limpeza etc.).
import { useState } from 'preact/hooks'
import { dataLocal } from '../../concreto/cps'
import { banco } from '../../nucleo/servicos'
import { podeFechar, podeRegistrar } from '../dados'
import { tirarExemplos } from '../exemplos'
import { atrasado, dataBR, diaDeExemplo, diasImpraticaveisNoMes, ehDeExemplo, quantosExemplos, resumoDoDia, semExemplos, situacaoDoRelatorio, textoDoLocal, type Relatorio, type ResumoDia } from '../regras'
import { GRAVIDADES, rotulo, SITUACOES_RELATORIO, tipoRelatorio, TIPOS_RELATORIO } from '../tipos'
import type { Aba, Contexto } from './ModuloRelatorios'
import { DATA_MINIMA } from './Formulario'
import { Chips, dataPorExtenso, plural, Selo, Topo, type Tom } from './comum'

const POR_VEZ = 30

export function TelaInicio({ ctx, aba, aoSair }: { ctx: Contexto; aba: Aba; aoSair: () => void }) {
  const { trocar, ir, obra } = ctx
  return (
    <main class="tela">
      <Topo titulo="Relatórios" sub={`${obra.codigo} · Diário de obra e relatórios`} aoVoltar={aoSair} />
      <div class="rl-abas" role="tablist">
        <button type="button" role="tab" aria-selected={aba === 'diario'} class={aba === 'diario' ? 'on' : ''} data-testid="aba-diario" onClick={() => trocar({ nome: 'inicio', aba: 'diario' })}>
          Diário de obra
        </button>
        <button type="button" role="tab" aria-selected={aba === 'relatorios'} class={aba === 'relatorios' ? 'on' : ''} data-testid="aba-relatorios" onClick={() => trocar({ nome: 'inicio', aba: 'relatorios' })}>
          Relatórios
        </button>
      </div>
      {aba === 'diario' ? <AbaDiario ctx={ctx} /> : <AbaRelatorios ctx={ctx} />}
      <div class="acoes">
        <button type="button" data-testid="abrir-mapa" onClick={() => ir({ nome: 'mapa' })}>
          Ver tudo na planta
        </button>
        {aba === 'diario' && (
          <button type="button" data-testid="abrir-cadastro" onClick={() => ir({ nome: 'cadastro' })}>
            {podeFechar(obra.papel) ? 'Dados da obra no diário' : 'Ver dados da obra no diário'}
          </button>
        )}
      </div>
      {/* no fim e pequeno: o principal da tela é escrever o diário (demo de 14/11) */}
      <AvisoExemplos ctx={ctx} />
    </main>
  )
}

/** Selo dos registros da apresentação: aparecem nas telas, mas não saem na impressão nem contam. */
export function SeloExemplo() {
  return (
    <span class="rl-selo neutro rl-exemplo" data-testid="selo-exemplo">
      EXEMPLO
    </span>
  )
}

function AvisoExemplos({ ctx }: { ctx: Contexto }) {
  const { dados, obra, recarregar } = ctx
  const [tirando, setTirando] = useState(false)
  if (quantosExemplos(dados) === 0) return null
  return (
    <div class="rl-exemplos" data-testid="aviso-exemplos">
      <p class="discreto">
        Registros com o selo EXEMPLO são da apresentação: não saem na impressão nem entram nas contagens.
      </p>
      {podeFechar(obra.papel) && (
        <button
          type="button"
          data-testid="tirar-exemplos"
          disabled={tirando}
          onClick={async () => {
            if (!confirm('Tirar todos os exemplos deste aparelho (diário, relatórios, concretagem, laje e documentos)? Eles não voltam.')) return
            setTirando(true)
            try {
              await tirarExemplos(banco, obra.id)
              await recarregar()
            } finally {
              setTirando(false)
            }
          }}
        >
          Tirar os exemplos
        </button>
      )}
    </div>
  )
}

function resumoEmTexto(r: ResumoDia): string {
  const p: string[] = []
  if (r.pessoas) p.push(plural(r.pessoas, 'pessoa', 'pessoas'))
  if (r.servicos) p.push(plural(r.servicos, 'serviço', 'serviços'))
  if (r.ocorrencias) p.push(plural(r.ocorrencias, 'ocorrência', 'ocorrências'))
  if (r.relatorios) p.push(plural(r.relatorios, 'relatório', 'relatórios'))
  if (r.fotos) p.push(plural(r.fotos, 'foto', 'fotos'))
  return p.join(' · ') || 'Só o clima'
}

function AbaDiario({ ctx }: { ctx: Contexto }) {
  const { dados, ir } = ctx
  const hoje = dataLocal(new Date())
  const [quantos, setQuantos] = useState(POR_VEZ)
  const [outra, setOutra] = useState('')
  const dias = dados.dias.filter((d) => d !== hoje)
  const temHoje = dados.dias.includes(hoje)
  const impraticaveis = diasImpraticaveisNoMes(dados, hoje)
  const reais = semExemplos(dados)
  return (
    <>
      <button type="button" class="principal rl-hoje" data-testid="abrir-hoje" onClick={() => ir({ nome: 'dia', data: hoje })}>
        <strong>{temHoje ? 'Continuar o diário de hoje' : 'Escrever o diário de hoje'}</strong>
        <span>{dataPorExtenso(hoje)}</span>
        {temHoje && <span>{resumoEmTexto(resumoDoDia(dados, hoje))}</span>}
      </button>

      <div class="rl-outro-dia">
        <div>
          <label class="sem-margem" htmlFor="rl-outro-dia">
            Outro dia
          </label>
          <input id="rl-outro-dia" type="date" min={DATA_MINIMA} max={hoje} value={outra} onInput={(e) => setOutra(e.currentTarget.value)} />
        </div>
        <button type="button" data-testid="abrir-outro-dia" disabled={!outra || outra > hoje || outra < DATA_MINIMA} onClick={() => ir({ nome: 'dia', data: outra })}>
          Abrir
        </button>
      </div>

      {impraticaveis > 0 && (
        <p class="discreto" data-testid="dias-impraticaveis">
          Neste mês: {plural(impraticaveis, 'dia com período impraticável', 'dias com período impraticável')}.
        </p>
      )}

      <h2>Dias anteriores</h2>
      {dias.length === 0 && <p class="discreto">Sem dias anteriores</p>}
      <ul class="lista" data-testid="lista-dias">
        {dias.slice(0, quantos).map((d) => {
          const r = resumoDoDia(dados, d)
          return (
            <li key={d}>
              <button type="button" class="rl-linha" onClick={() => ir({ nome: 'dia', data: d })}>
                <span class="rl-linha-texto">
                  <strong>{dataPorExtenso(d)}</strong>
                  <span class="discreto">{resumoEmTexto(r)}</span>
                </span>
                {diaDeExemplo(dados, reais, d) ? (
                  <SeloExemplo />
                ) : (
                  <>
                    {r.impraticavel && <Selo tom="info">Impraticável</Selo>}
                    {r.fechado ? <Selo tom="bom">Nº {r.numero}</Selo> : <Selo tom="neutro">Aberto</Selo>}
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {dias.length > quantos && (
        <button type="button" onClick={() => setQuantos(quantos + POR_VEZ)}>
          Ver mais dias
        </button>
      )}
    </>
  )
}

const TOM_SITUACAO: Record<string, Tom> = { aberto: 'ruim', em_andamento: 'info', resolvido: 'bom' }
export const tomDaSituacao = (s: string): Tom => TOM_SITUACAO[s] ?? 'neutro'

export function LinhaRelatorio({ ctx, r, hoje }: { ctx: Contexto; r: Relatorio; hoje: string }) {
  const { dados, ir } = ctx
  const sit = situacaoDoRelatorio(r, dados.andamentos.get(r.raiz))
  const marcas = dados.marcas.get(r.raiz) ?? []
  const local = marcas.length ? textoDoLocal(dados, marcas) : (r.local_texto ?? '')
  const fotos = dados.fotosDoAlvo.get(r.raiz)?.length ?? 0
  const exemplo = ehDeExemplo(dados, r)
  return (
    <button type="button" class="rl-linha" onClick={() => ir({ nome: 'relatorio', raiz: r.raiz })}>
      <span class="rl-linha-texto">
        <strong>{r.titulo}</strong>
        <span class="discreto">
          {tipoRelatorio(r.tipo).t} · {dataBR(r.data)}
          {r.gravidade ? ` · gravidade ${rotulo(GRAVIDADES, r.gravidade).toLowerCase()}` : ''}
          {fotos ? ` · ${plural(fotos, 'foto', 'fotos')}` : ''}
        </span>
        {local && <span class="discreto">{local}</span>}
      </span>
      {exemplo && <SeloExemplo />}
      {!exemplo && atrasado(r, sit, hoje) && <Selo tom="ruim">Atrasado</Selo>}
      <Selo tom={tomDaSituacao(sit)}>{rotulo(SITUACOES_RELATORIO, sit)}</Selo>
    </button>
  )
}

function AbaRelatorios({ ctx }: { ctx: Contexto }) {
  const { dados, ir, obra } = ctx
  const hoje = dataLocal(new Date())
  const [tipo, setTipo] = useState<string | null>(null)
  const [situacao, setSituacao] = useState<string | null>(null)
  const [quantos, setQuantos] = useState(POR_VEZ)
  const lista = dados.relatorios.filter((r) => (!tipo || r.tipo === tipo) && (!situacao || situacaoDoRelatorio(r, dados.andamentos.get(r.raiz)) === situacao))
  // a contagem é só dos relatórios de verdade (os de exemplo aparecem na lista, com o selo)
  const reais = semExemplos(dados)
  const abertos = reais.relatorios.filter((r) => situacaoDoRelatorio(r, reais.andamentos.get(r.raiz)) !== 'resolvido').length
  const deExemplo = dados.relatorios.length - reais.relatorios.length
  return (
    <>
      {podeRegistrar(obra.papel) && (
        <button type="button" class="principal rl-largo" data-testid="novo-relatorio" onClick={() => ir({ nome: 'novo-relatorio' })}>
          Novo relatório
        </button>
      )}
      <p class="discreto" data-testid="contagem-relatorios">
        {plural(reais.relatorios.length, 'relatório', 'relatórios')}, {abertos} em aberto.
        {deExemplo > 0 && ` Mais ${deExemplo} de exemplo.`}
      </p>
      <Chips opcoes={TIPOS_RELATORIO} valor={tipo} rotulo="Filtrar por tipo" aoEscolher={setTipo} teste="filtro-tipo" />
      <Chips opcoes={SITUACOES_RELATORIO} valor={situacao} rotulo="Filtrar por situação" aoEscolher={setSituacao} teste="filtro-situacao" />
      {lista.length === 0 && <p class="discreto">{dados.relatorios.length === 0 ? 'Sem relatórios' : 'Sem relatórios com este filtro'}</p>}
      <ul class="lista" data-testid="lista-relatorios">
        {lista.slice(0, quantos).map((r) => (
          <li key={r.raiz}>
            <LinhaRelatorio ctx={ctx} r={r} hoje={hoje} />
          </li>
        ))}
      </ul>
      {lista.length > quantos && (
        <button type="button" onClick={() => setQuantos(quantos + POR_VEZ)}>
          Ver mais
        </button>
      )}
    </>
  )
}
