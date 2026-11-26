// Relatório avulso: problema na obra, limpeza, segurança etc. Uma tela para preencher e outra para acompanhar.
import { useState } from 'preact/hooks'
import { dataLocal } from '../../concreto/cps'
import { horaBR } from '../../concreto/telas/comum'
import { cancelar, corrigir, podeRegistrar, registrar } from '../dados'
import { atrasado, dataBR, situacaoDoRelatorio, textoDoLocal, type ItemRelatorio, ehDeExemplo } from '../regras'
import { GRAVIDADES, RESULTADOS_ITEM, rotulo, SITUACOES_RELATORIO, tipoRelatorio, TIPOS_RELATORIO, type Campo, type TipoRelatorio } from '../tipos'
import type { Contexto } from './ModuloRelatorios'
import { Fotos } from './Fotos'
import { Formulario } from './Formulario'
import { tomDaSituacao, SeloExemplo } from './TelaInicio'
import { Chips, erroEmTexto, Selo, Topo, usarMensagem, type Tom } from './comum'

function camposDo(t: TipoRelatorio, data: string): Campo[] {
  return [
    { nome: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true, max: 200, padrao: t.titulo },
    { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, padrao: data },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'longo', max: 4000 },
    { nome: 'local_texto', rotulo: 'Local por escrito (opcional, além da planta)', tipo: 'texto', max: 300 },
    ...(t.acompanha
      ? ([
          { nome: 'gravidade', rotulo: 'Gravidade', tipo: 'opcoes', opcoes: GRAVIDADES },
          { nome: 'responsavel', rotulo: 'Quem resolve', tipo: 'texto', max: 200 },
          { nome: 'prazo', rotulo: 'Prazo', tipo: 'data' },
        ] as Campo[])
      : []),
  ]
}

export function FormRelatorio({ ctx, data, raiz }: { ctx: Contexto; data?: string; raiz?: string }) {
  const { dados, obra, usuario, ir, trocar, voltar, recarregar } = ctx
  const atual = raiz ? dados.relatorios.find((r) => r.raiz === raiz) : undefined
  const [tipoEscolhido, setTipo] = useState<string | null>(atual?.tipo ?? null)
  const [itens, setItens] = useState<ItemRelatorio[] | null>(atual?.itens.length ? atual.itens : null)
  const hoje = dataLocal(new Date())

  if (!tipoEscolhido) {
    return (
      <main class="tela">
        <Topo titulo="Novo relatório" sub="Que tipo de relatório?" aoVoltar={voltar} />
        <ul class="lista" data-testid="tipos-relatorio">
          {TIPOS_RELATORIO.map((t) => (
            <li key={t.v}>
              <button
                type="button"
                class="rl-linha"
                data-testid={`tipo-${t.v}`}
                onClick={() => {
                  setTipo(t.v)
                  setItens(t.itens ? t.itens.map((item) => ({ item, resultado: null })) : null)
                }}
              >
                <span class="rl-linha-texto">
                  <strong>{t.t}</strong>
                  <span class="discreto">{t.ajuda}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    )
  }

  const tipo = tipoRelatorio(tipoEscolhido)
  return (
    <main class="tela">
      <Topo titulo={atual ? 'Editar relatório' : tipo.t} sub={atual ? tipo.t : undefined} aoVoltar={voltar} />
      <Formulario
        key={tipoEscolhido}
        campos={camposDo(tipo, data ?? hoje)}
        inicial={atual}
        botoes={[
          {
            texto: atual ? 'Salvar' : 'Salvar e marcar na planta',
            principal: true,
            aoSalvar: async (v) => {
              const campos = { ...v, tipo: tipoEscolhido, itens: itens ?? [] }
              if (atual) {
                await corrigir('relatorios', obra.id, usuario.id, atual, campos)
                await recarregar()
                voltar()
              } else {
                const l = await registrar('relatorios', obra.id, usuario.id, campos)
                await recarregar()
                // o voltar da planta cai na tela do relatório
                trocar({ nome: 'relatorio', raiz: l.id })
                ir({ nome: 'marcar', alvo: { tipo: 'relatorio', raiz: l.id }, titulo: String(v.titulo).slice(0, 60) })
              }
            },
          },
          ...(atual
            ? []
            : [
                {
                  texto: 'Só salvar',
                  aoSalvar: async (v: Record<string, unknown>) => {
                    const l = await registrar('relatorios', obra.id, usuario.id, { ...v, tipo: tipoEscolhido, itens: itens ?? [] })
                    await recarregar()
                    trocar({ nome: 'relatorio', raiz: l.id })
                  },
                },
              ]),
        ]}
        antesDosBotoes={
          itens && (
            <section class="rl-campo" data-testid="conferencia">
              <p class="rl-rotulo-campo">Conferência</p>
              <ul class="rl-conferencia">
                {itens.map((it, i) => (
                  <li key={it.item}>
                    <span>{it.item}</span>
                    <Chips
                      opcoes={RESULTADOS_ITEM}
                      valor={it.resultado}
                      rotulo={it.item}
                      aoEscolher={(r) => setItens(itens.map((x, j) => (j === i ? { ...x, resultado: r as ItemRelatorio['resultado'] } : x)))}
                    />
                  </li>
                ))}
              </ul>
              <p class="discreto">Lista toda respondida e sem "Ruim": o relatório já nasce resolvido.</p>
            </section>
          )
        }
      />
    </main>
  )
}

const TOM_ITEM: Record<string, Tom> = { ok: 'bom', atencao: 'info', ruim: 'ruim' }

export function TelaRelatorio({ ctx, raiz }: { ctx: Contexto; raiz: string }) {
  const { dados, obra, usuario, ir, voltar, recarregar } = ctx
  const r = dados.relatorios.find((x) => x.raiz === raiz)
  const [comentario, setComentario] = useState('')
  const [nova, setNova] = useState<string | null>(null)
  const [msg, setMsg] = usarMensagem()
  if (!r) {
    return (
      <main class="tela">
        <Topo titulo="Relatório" aoVoltar={voltar} />
        <p>Este relatório foi apagado.</p>
      </main>
    )
  }
  const pode = podeRegistrar(obra.papel)
  const andamentos = dados.andamentos.get(raiz) ?? []
  const sit = situacaoDoRelatorio(r, andamentos)
  const marcas = dados.marcas.get(raiz) ?? []
  const hoje = dataLocal(new Date())
  const titulo = r.titulo.slice(0, 60)
  return (
    <main class="tela">
      <Topo titulo={r.titulo} sub={`${tipoRelatorio(r.tipo).t} · ${dataBR(r.data)}`} aoVoltar={voltar}>
        <button type="button" data-testid="imprimir-relatorio" onClick={() => ir({ nome: 'imprimir-relatorio', raiz })}>
          Imprimir
        </button>
      </Topo>
      {msg && (
        <p class="rl-ok" role="status">
          {msg}
        </p>
      )}
      <p class="rl-selos" data-testid="situacao-relatorio">
        <Selo tom={tomDaSituacao(sit)}>{rotulo(SITUACOES_RELATORIO, sit)}</Selo>
        {r.gravidade && <Selo tom={r.gravidade === 'alta' ? 'ruim' : r.gravidade === 'media' ? 'info' : 'neutro'}>Gravidade {rotulo(GRAVIDADES, r.gravidade).toLowerCase()}</Selo>}
        {ehDeExemplo(dados, r) ? <SeloExemplo /> : atrasado(r, sit, hoje) && <Selo tom="ruim">Atrasado</Selo>}
      </p>

      <section class="cartao">
        {r.descricao && <p class="rl-texto">{r.descricao}</p>}
        {r.responsavel && (
          <p>
            <strong>Quem resolve:</strong> {r.responsavel}
          </p>
        )}
        {r.prazo && (
          <p>
            <strong>Prazo:</strong> {dataBR(r.prazo)}
          </p>
        )}
        {r.local_texto && (
          <p>
            <strong>Local:</strong> {r.local_texto}
          </p>
        )}
        {r.itens.length > 0 && (
          <ul class="rl-conferencia lida" data-testid="itens-lidos">
            {r.itens.map((it) => (
              <li key={it.item}>
                <span>{it.item}</span>
                {it.resultado ? <Selo tom={TOM_ITEM[it.resultado]}>{rotulo(RESULTADOS_ITEM, it.resultado)}</Selo> : <span class="discreto">sem resposta</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="cartao">
        <h2 class="sem-topo">Onde foi</h2>
        <p data-testid="local-relatorio">{marcas.length ? textoDoLocal(dados, marcas) : 'Ainda não marcado na planta.'}</p>
        <button type="button" data-testid="marcar-relatorio" onClick={() => ir({ nome: 'marcar', alvo: { tipo: 'relatorio', raiz }, titulo })}>
          {pode ? 'Marcar na planta' : 'Ver na planta'}
        </button>
      </section>

      <section class="cartao">
        <h2 class="sem-topo">Fotos</h2>
        <Fotos ctx={ctx} data={r.data} alvo={{ tipo: 'relatorio', raiz }} pode={pode} />
      </section>

      <section class="cartao" data-testid="andamento">
        <h2 class="sem-topo">Andamento</h2>
        {andamentos.length === 0 && <p class="discreto">Sem andamentos</p>}
        {andamentos.length > 0 && (
          <ul class="rl-andamentos">
            {andamentos.map((a) => (
              <li key={a.id}>
                <strong>{rotulo(SITUACOES_RELATORIO, a.situacao)}</strong>
                <span class="discreto">
                  {' '}
                  · {dataBR(dataLocal(a.criado_em_dispositivo))} {horaBR(a.criado_em_dispositivo)}
                </span>
                {a.comentario ? <p>{String(a.comentario)}</p> : null}
              </li>
            ))}
          </ul>
        )}
        {pode && (
          <>
            <label htmlFor="rl-comentario">Registrar andamento</label>
            <Chips opcoes={SITUACOES_RELATORIO} valor={nova ?? sit} rotulo="Nova situação" limpavel={false} teste="nova-situacao" aoEscolher={setNova} />
            <textarea id="rl-comentario" rows={3} maxLength={2000} placeholder="Comentário (opcional)" value={comentario} onInput={(e) => setComentario(e.currentTarget.value)} />
            <button
              type="button"
              class="principal"
              data-testid="salvar-andamento"
              onClick={async () => {
                try {
                  await registrar('relatorio_andamentos', obra.id, usuario.id, { relatorio_id: raiz, situacao: nova ?? sit, comentario: comentario.trim() || null })
                  await recarregar()
                  setComentario('')
                  setNova(null)
                  setMsg('Andamento registrado.')
                } catch (e) {
                  setMsg(`Não foi possível salvar: ${erroEmTexto(e)}`)
                }
              }}
            >
              Salvar andamento
            </button>
          </>
        )}
      </section>

      {pode && (
        <div class="acoes">
          <button type="button" data-testid="editar-relatorio" onClick={() => ir({ nome: 'editar-relatorio', raiz })}>
            Editar
          </button>
          <button
            type="button"
            class="rl-perigo"
            data-testid="apagar-relatorio"
            onClick={async () => {
              if (!confirm('Apagar este relatório?')) return
              await cancelar('relatorios', obra.id, usuario.id, r)
              await recarregar()
              voltar()
            }}
          >
            Apagar
          </button>
        </div>
      )}
    </main>
  )
}
