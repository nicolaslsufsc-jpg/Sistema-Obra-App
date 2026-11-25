// O diário de um dia: clima, mão de obra, equipamentos, serviços, materiais, ocorrências, fotos.
// Cada seção salva sozinha; várias pessoas podem escrever o mesmo dia, com ou sem internet.
import type { ComponentChildren } from 'preact'
import { SeloExemplo } from './TelaInicio'
import { useEffect, useState } from 'preact/hooks'
import { dataLocal } from '../../concreto/cps'
import { copiarDoDia, corrigir, doQueOAppSabe, fecharDia, podeFechar, podeRegistrar, reabrirDia, registrar, type DoApp } from '../dados'
import { dataBR, depoisDoFechamento, diasAntes, ehRelato, numeroAoFechar, resumoDoDia, textoDoLocal, TIPO_RELATO, ultimoDiaCom, type Registro, diaDeExemplo, diaTemExemplo, semExemplos } from '../regras'
import { PERIODOS, rotulo, SECOES, SITUACOES_EQUIPAMENTO, SITUACOES_SERVICO, TEMPOS, TIPOS_OCORRENCIA, type TabelaSecao } from '../tipos'
import type { Contexto } from './ModuloRelatorios'
import { Fotos } from './Fotos'
import { LinhaRelatorio } from './TelaInicio'
import { MAPA_DIA } from './TelaItem'
import { Chips, dataPorExtenso, erroEmTexto, numBR, plural, Selo, Topo, usarMensagem, type Tom } from './comum'

const CONDICOES = [
  { v: 'praticavel', t: 'Praticável' },
  { v: 'impraticavel', t: 'Impraticável' },
]

const TOM_SERVICO: Record<string, Tom> = { iniciado: 'neutro', em_andamento: 'info', concluido: 'bom', paralisado: 'ruim' }

type Seguro = (acao: () => Promise<void>) => void

export function TelaDia({ ctx, data }: { ctx: Contexto; data: string }) {
  const { dados, obra, usuario, ir, trocar, voltar, recarregar } = ctx
  const hoje = dataLocal(new Date())
  const resumo = resumoDoDia(dados, data)
  const pode = podeRegistrar(obra.papel) && !resumo.fechado
  const [msg, setMsg] = usarMensagem()
  const [app, setApp] = useState<DoApp | null>(null)

  useEffect(() => {
    let vivo = true
    doQueOAppSabe(obra.id, data).then((r) => {
      if (vivo) setApp(r)
    })
    return () => {
      vivo = false
    }
  }, [obra.id, data])

  const seguro: Seguro = (acao) => {
    acao().catch((e) => setMsg(`Não foi possível salvar: ${erroEmTexto(e)}`))
  }
  const diaSeguinte = diasAntes(data, -1)
  const relatoriosDoDia = dados.relatorios.filter((r) => r.data === data)
  const reais = semExemplos(dados)
  const temExemplo = diaTemExemplo(dados, data)

  return (
    <main class="tela rl-dia">
      <Topo titulo="Diário de obra" sub={dataPorExtenso(data)} aoVoltar={voltar}>
        <button type="button" data-testid="imprimir-dia" onClick={() => ir({ nome: 'imprimir-dia', data })}>
          Imprimir
        </button>
      </Topo>

      <div class="rl-navega-dia">
        <button type="button" data-testid="dia-anterior" onClick={() => trocar({ nome: 'dia', data: diasAntes(data, 1) })}>
          ‹ {dataBR(diasAntes(data, 1)).slice(0, 5)}
        </button>
        <span data-testid="situacao-dia">{diaDeExemplo(dados, reais, data) ? <SeloExemplo /> : resumo.fechado ? <Selo tom="bom">Fechado · RDO nº {resumo.numero}</Selo> : <Selo tom="neutro">Aberto</Selo>}</span>
        <button type="button" data-testid="dia-seguinte" disabled={diaSeguinte > hoje} onClick={() => trocar({ nome: 'dia', data: diaSeguinte })}>
          {dataBR(diaSeguinte).slice(0, 5)} ›
        </button>
      </div>

      {temExemplo && (
        <p class="rl-exemplos discreto" data-testid="aviso-dia-exemplo">
          <SeloExemplo /> Os registros de exemplo deste dia não saem na impressão. Tire todos no início do módulo.
        </p>
      )}

      {msg && (
        <p class="rl-ok" role="status" data-testid="msg-dia">
          {msg}
        </p>
      )}

      <Clima ctx={ctx} data={data} pode={pode} seguro={seguro} />

      <RelatoDoDia ctx={ctx} data={data} pode={pode} seguro={seguro} />

      <Secao ctx={ctx} tabela="diario_efetivo" data={data} pode={pode} rodape={resumo.pessoas ? `Total: ${plural(resumo.pessoas, 'pessoa', 'pessoas')}` : undefined} copia seguro={seguro} setMsg={setMsg}>
        {(l) => (
          <>
            <strong>
              {numBR(l.quantidade)} · {String(l.funcao)}
            </strong>
            {l.empresa ? <span class="discreto">{String(l.empresa)}</span> : null}
          </>
        )}
      </Secao>

      <Secao ctx={ctx} tabela="diario_equipamentos" data={data} pode={pode} copia seguro={seguro} setMsg={setMsg}>
        {(l) => (
          <>
            <strong>
              {numBR(l.quantidade)} · {String(l.nome)}
            </strong>
            <span class="discreto">{rotulo(SITUACOES_EQUIPAMENTO, l.situacao)}</span>
          </>
        )}
      </Secao>

      <Secao ctx={ctx} tabela="diario_servicos" data={data} pode={pode} seguro={seguro} setMsg={setMsg}>
        {(l) => {
          const marcas = dados.marcas.get(l.raiz) ?? []
          const fotos = dados.fotosDoAlvo.get(l.raiz)?.length ?? 0
          const extras = [l.empresa, l.avanco_pct !== null && l.avanco_pct !== undefined ? `${String(l.avanco_pct)}%` : null, fotos ? plural(fotos, 'foto', 'fotos') : null].filter(Boolean)
          return (
            <>
              <strong>{String(l.descricao)}</strong>
              {extras.length > 0 && <span class="discreto">{extras.join(' · ')}</span>}
              <span class="discreto" data-testid="local-servico">
                {marcas.length ? textoDoLocal(dados, marcas) : l.local_texto ? String(l.local_texto) : 'Sem local marcado'}
              </span>
              <span>
                <Selo tom={TOM_SERVICO[String(l.situacao)] ?? 'neutro'}>{rotulo(SITUACOES_SERVICO, l.situacao)}</Selo>
              </span>
            </>
          )
        }}
      </Secao>

      <Secao ctx={ctx} tabela="diario_materiais" data={data} pode={pode} seguro={seguro} setMsg={setMsg}>
        {(l) => {
          const qtd = l.quantidade !== null && l.quantidade !== undefined ? `${numBR(l.quantidade, 3)} ${String(l.unidade ?? '')}`.trim() : null
          return (
            <>
              <strong>{String(l.material)}</strong>
              <span class="discreto">{[qtd, l.fornecedor, l.nota_fiscal ? `NF ${String(l.nota_fiscal)}` : null].filter(Boolean).join(' · ')}</span>
            </>
          )
        }}
      </Secao>

      <Secao ctx={ctx} tabela="diario_ocorrencias" data={data} pode={pode} filtro={(l) => !ehRelato(l)} rodape={resumo.horasParadas ? `Horas paradas: ${numBR(resumo.horasParadas, 1)}` : undefined} seguro={seguro} setMsg={setMsg}>
        {(l) => {
          const marcas = dados.marcas.get(l.raiz) ?? []
          return (
            <>
              <strong>{rotulo(TIPOS_OCORRENCIA, l.tipo)}</strong>
              <span>{String(l.descricao)}</span>
              {(marcas.length > 0 || !!l.local_texto) && <span class="discreto">{marcas.length ? textoDoLocal(dados, marcas) : String(l.local_texto)}</span>}
            </>
          )
        }}
      </Secao>

      <section class="cartao rl-secao">
        <h2 class="sem-topo">Fotos do dia</h2>
        <Fotos ctx={ctx} data={data} alvo={null} pode={pode} />
      </section>

      <section class="cartao rl-secao" data-testid="relatorios-do-dia">
        <h2 class="sem-topo">Relatórios deste dia</h2>
        {relatoriosDoDia.length === 0 && <p class="discreto">Sem relatórios neste dia</p>}
        {relatoriosDoDia.length > 0 && (
          <ul class="lista">
            {relatoriosDoDia.map((r) => (
              <li key={r.raiz}>
                <LinhaRelatorio ctx={ctx} r={r} hoje={hoje} />
              </li>
            ))}
          </ul>
        )}
        {podeRegistrar(obra.papel) && (
          <button type="button" data-testid="novo-relatorio-dia" onClick={() => ir({ nome: 'novo-relatorio', data })}>
            Novo relatório neste dia
          </button>
        )}
      </section>

      <section class="cartao rl-secao" data-testid="do-app">
        <h2 class="sem-topo">Registrado em outros módulos</h2>
        {app === null && <p class="discreto">Lendo…</p>}
        {app && app.concretagens.length === 0 && app.fvs.pecas === 0 && <p class="discreto">Nada do Concreto nem da FVS neste dia.</p>}
        {app?.concretagens.map((c) => (
          <p key={c.raiz}>
            <strong>Concretagem:</strong> {c.local || 'sem local'}
            {c.fornecedor ? ` · ${c.fornecedor}` : ''} · {plural(c.caminhoes, 'caminhão', 'caminhões')}
            {c.volume ? ` · ${numBR(c.volume)} m³` : ''}
          </p>
        ))}
        {app && app.fvs.pecas > 0 && (
          <p>
            <strong>FVS:</strong> {plural(app.fvs.pecas, 'peça verificada', 'peças verificadas')} · {app.fvs.aprovados} C · {app.fvs.reprovados} NC · {app.fvs.naoAplica} NA
          </p>
        )}
      </section>

      {podeFechar(obra.papel) && (
        <div class="acoes nao-imprimir">
          {resumo.fechado ? (
            <button
              type="button"
              data-testid="reabrir-dia"
              onClick={() =>
                seguro(async () => {
                  if (!confirm(`Reabrir o diário de ${dataBR(data)}? O número do RDO continua o mesmo.`)) return
                  await reabrirDia(dados, obra.id, usuario.id, data, null)
                  await recarregar()
                })
              }
            >
              Reabrir o dia
            </button>
          ) : (
            <button
              type="button"
              class="principal"
              data-testid="fechar-dia"
              onClick={() =>
                seguro(async () => {
                  const n = numeroAoFechar(dados, data)
                  if (!confirm(`Fechar o diário de ${dataBR(data)} como RDO nº ${n}? Depois de fechado, ninguém altera sem reabrir.`)) return
                  await fecharDia(dados, obra.id, usuario.id, data, null)
                  await recarregar()
                  setMsg(`Dia fechado: RDO nº ${n}.`)
                })
              }
            >
              Fechar o dia
            </button>
          )}
        </div>
      )}
      {!podeFechar(obra.papel) && !resumo.fechado && <p class="discreto">Quem fecha o dia é o gestor da obra.</p>}
    </main>
  )
}

/** O texto corrido do dia. Gravado como ocorrência do tipo "relato": corrigir = linha nova, como tudo no diário. */
function RelatoDoDia({ ctx, data, pode, seguro }: { ctx: Contexto; data: string; pode: boolean; seguro: Seguro }) {
  const { dados, obra, usuario, recarregar } = ctx
  // o aviso fica dentro do relato: preso no alto da tela, ele cobria o clima da noite (Testador, 09/11/2026)
  const [msg, setMsg] = usarMensagem()
  const atual = (dados.ocorrencias.get(data) ?? []).find(ehRelato)
  const [texto, setTexto] = useState(String(atual?.descricao ?? ''))
  const [editando, setEditando] = useState(false)
  useEffect(() => {
    if (!editando) setTexto(String(atual?.descricao ?? ''))
  }, [atual?.id])
  const salvar = () =>
    seguro(async () => {
      const descricao = texto.trim()
      if (!descricao) return
      if (atual) await corrigir('diario_ocorrencias', obra.id, usuario.id, atual, { descricao })
      else await registrar('diario_ocorrencias', obra.id, usuario.id, { data, tipo: TIPO_RELATO, descricao, horas_paradas: null, local_texto: null })
      await recarregar()
      setEditando(false)
      setMsg('Relato salvo.')
    })
  return (
    <section class="cartao rl-secao" data-testid="relato-dia">
      <h2 class="sem-topo">Relato do dia</h2>
      {msg && (
        <p class="rl-ok rl-ok-junto" role="status" data-testid="msg-relato">
          {msg}
        </p>
      )}
      {!editando && atual && <p class="rl-relato">{String(atual.descricao)}</p>}
      {!editando && !atual && <p class="discreto">Nada escrito ainda.</p>}
      {editando && (
        <textarea
          class="rl-relato-texto"
          rows={6}
          maxLength={2000}
          value={texto}
          aria-label="Relato do dia"
          placeholder="Como foi o dia: o que avançou, o que parou, o que precisa de atenção."
          onInput={(e) => setTexto((e.target as HTMLTextAreaElement).value)}
        />
      )}
      {pode && (
        <div class="rl-botoes">
          {editando ? (
            <>
              <button type="button" class="principal" data-testid="salvar-relato" disabled={!texto.trim()} onClick={salvar}>
                Salvar relato
              </button>
              <button type="button" onClick={() => setEditando(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" data-testid="escrever-relato" onClick={() => setEditando(true)}>
              {atual ? 'Alterar o relato' : 'Escrever o relato'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function Clima({ ctx, data, pode, seguro }: { ctx: Contexto; data: string; pode: boolean; seguro: Seguro }) {
  const { dados, obra, usuario, recarregar } = ctx
  const doDia = dados.clima.get(data)
  const gravar = (periodo: string, tempo: string | null, condicao: string | null) =>
    seguro(async () => {
      await registrar('diario_clima', obra.id, usuario.id, { data, periodo, tempo, condicao })
      await recarregar()
    })
  return (
    <section class="cartao rl-secao" data-testid="clima">
      <h2 class="sem-topo">Clima</h2>
      {PERIODOS.map((p) => {
        const c = doDia?.get(p.v)
        const tempo = (c?.tempo as string | null) ?? null
        const condicao = tempo ? ((c?.condicao as string | null) ?? null) : null
        return (
          <div class="rl-clima" key={p.v}>
            <strong>{p.t}</strong>
            <Chips
              opcoes={TEMPOS}
              valor={tempo}
              rotulo={`Tempo: ${p.t}`}
              desativado={!pode}
              teste={`tempo-${p.v}`}
              aoEscolher={(t) => gravar(p.v, t, t ? (condicao ?? (t === 'chuva_forte' ? 'impraticavel' : 'praticavel')) : null)}
            />
            {tempo && <Chips opcoes={CONDICOES} valor={condicao} rotulo={`Condição: ${p.t}`} limpavel={false} desativado={!pode} teste={`condicao-${p.v}`} aoEscolher={(v) => gravar(p.v, tempo, v)} />}
          </div>
        )
      })}
    </section>
  )
}

function Secao({
  ctx,
  tabela,
  data,
  pode,
  rodape,
  copia,
  filtro,
  seguro,
  setMsg,
  children,
}: {
  ctx: Contexto
  tabela: TabelaSecao
  data: string
  pode: boolean
  rodape?: string
  copia?: boolean
  /** Linhas da seção que aparecem aqui (o relato do dia tem seção própria). */
  filtro?: (l: Registro) => boolean
  seguro: Seguro
  setMsg: (m: string) => void
  children: (l: Registro) => ComponentChildren
}) {
  const { dados, obra, usuario, ir, recarregar } = ctx
  const secao = SECOES[tabela]
  const mapa = dados[MAPA_DIA[tabela]]
  const linhas = (mapa.get(data) ?? []).filter((l) => !filtro || filtro(l))
  const origem = copia && linhas.length === 0 ? ultimoDiaCom(mapa, data) : undefined
  return (
    <section class="cartao rl-secao" data-testid={`secao-${tabela}`}>
      <h2 class="sem-topo">{secao.titulo}</h2>
      {linhas.length === 0 && <p class="discreto">Nada registrado.</p>}
      {linhas.length > 0 && (
        <ul class="rl-itens">
          {linhas.map((l) => (
            <li key={l.raiz}>
              <button type="button" class="rl-item" onClick={() => ir({ nome: 'item', tabela, data, raiz: l.raiz })}>
                {children(l)}
                {depoisDoFechamento(dados, data, l) && <span class="aviso">Registrado depois de o dia ser fechado</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {rodape && <p class="rl-rodape">{rodape}</p>}
      {pode && (
        <div class="rl-botoes">
          <button type="button" data-testid={`novo-${tabela}`} onClick={() => ir({ nome: 'item', tabela, data })}>
            {secao.novo}
          </button>
          {origem && (
            <button
              type="button"
              data-testid={`copiar-${tabela}`}
              onClick={() =>
                seguro(async () => {
                  const n = mapa.get(origem)!.length
                  await copiarDoDia(tabela as 'diario_efetivo' | 'diario_equipamentos', obra.id, usuario.id, mapa.get(origem)!, data)
                  await recarregar()
                  setMsg(`${plural(n, 'linha copiada', 'linhas copiadas')} de ${dataBR(origem)}. Ajuste o que mudou.`)
                })
              }
            >
              Copiar de {dataBR(origem).slice(0, 5)}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
