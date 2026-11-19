// Diário e relatório prontos para imprimir ou salvar em PDF (Imprimir do navegador).
// A planta sai em desenho leve (contorno das peças), sem as imagens da prancha.
import { useEffect, useState } from 'preact/hooks'
import { dataLocal } from '../../concreto/cps'
import { caixaDe } from '../../concreto/geometria'
import { idDaRef, type PlantaPavimento } from '../../concreto/planta'
import { doQueOAppSabe, plantasDe, type DoApp } from '../dados'
import { COR_CATEGORIA, dataBR, diasEntre, ehRelato, resumoDoDia, situacaoDoRelatorio, textoDoLocal, type Foto, type Marca, semExemplos } from '../regras'
import { GRAVIDADES, PERIODOS, RESULTADOS_ITEM, rotulo, SITUACOES_EQUIPAMENTO, SITUACOES_RELATORIO, SITUACOES_SERVICO, TEMPOS, tipoRelatorio, TIPOS_OCORRENCIA } from '../tipos'
import type { Contexto } from './ModuloRelatorios'
import { Miniatura } from './Fotos'
import { dataPorExtenso, numBR, plural, Topo } from './comum'

/** Cabeçalho do documento: dados da obra e prazo. */
function Cabecalho({ ctx, data, titulo, numero }: { ctx: Contexto; data: string; titulo: string; numero?: string }) {
  const { obra, dados } = ctx
  const c = dados.cadastro
  const inicio = c?.data_inicio as string | null | undefined
  const fim = c?.prazo_fim as string | null | undefined
  return (
    <header class="rl-doc-cab">
      <h1>{titulo}</h1>
      <div class="rl-doc-rolagem">
      <table class="rl-doc-tabela">
        <tbody>
          <tr>
            <th>Obra</th>
            <td>
              {obra.codigo} · {obra.nome}
            </td>
            <th>Data</th>
            <td>{dataPorExtenso(data)}</td>
          </tr>
          <tr>
            <th>Empresa</th>
            <td>{obra.empresa ?? ''}</td>
            <th>Número</th>
            <td>{numero ?? ''}</td>
          </tr>
          {c && (
            <>
              <tr>
                <th>Endereço</th>
                <td>{String(c.endereco ?? '')}</td>
                <th>Contratante</th>
                <td>{String(c.contratante ?? '')}</td>
              </tr>
              <tr>
                <th>Resp. técnico</th>
                <td>{String(c.responsavel_tecnico ?? '')}</td>
                <th>ART</th>
                <td>{String(c.art ?? '')}</td>
              </tr>
              {(inicio || fim) && (
                <tr>
                  <th>Prazo</th>
                  <td>
                    {dataBR(inicio)} a {dataBR(fim)}
                  </td>
                  <th>Decorrido</th>
                  <td>
                    {inicio ? plural(diasEntre(inicio, data), 'dia', 'dias') : ''}
                    {fim ? ` · restam ${plural(diasEntre(data, fim), 'dia', 'dias')}` : ''}
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
      </div>
    </header>
  )
}

interface MarcaColorida {
  marca: Marca
  cor: string
}

/** Desenho de uma prancha com as marcas. Só as pranchas que estão no aparelho. */
function Plantas({ ctx, marcas }: { ctx: Contexto; marcas: readonly MarcaColorida[] }) {
  const { dados, obra } = ctx
  const [plantas, setPlantas] = useState<Array<{ pavNome: string; pavId: string; planta: PlantaPavimento }> | null>(null)
  const chave = marcas.map((m) => m.marca.id).join()
  useEffect(() => {
    let vivo = true
    const pavs = [...new Set(marcas.map((m) => m.marca.pavimento_id))]
    Promise.all(
      pavs.map(async (id) => {
        const p = dados.pavimentos.find((x) => x.id === id)
        if (!p) return []
        const l = await plantasDe(obra, p, dados.pecasDoPavimento.get(id) ?? [])
        return l.map((planta) => ({ pavNome: p.nome, pavId: id, planta }))
      }),
    ).then((l) => {
      if (vivo) setPlantas(l.flat())
    })
    return () => {
      vivo = false
    }
  }, [chave])
  if (!plantas) return null
  const desenhos = plantas.flatMap(({ pavNome, pavId, planta }) => {
    const aqui = marcas.filter(({ marca: m }) => m.pavimento_id === pavId && (m.forma === 'peca' ? planta.elementos.some((e) => e.id === m.elemento_id) : !!m.planta_ref && idDaRef(m.planta_ref) === planta.id))
    return aqui.length ? [{ pavNome, planta, aqui }] : []
  })
  if (desenhos.length === 0) return null
  return (
    <div class="rl-doc-plantas" data-testid="plantas-impressas">
      {desenhos.map(({ pavNome, planta, aqui }) => (
        <figure key={`${pavNome}${planta.id}`}>
          <Desenho planta={planta} marcas={aqui} />
          <figcaption>
            {pavNome} · {planta.trecho}
            {planta.revisao ? ` · rev. ${planta.revisao}` : ''}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

const caminho = (p: ReadonlyArray<readonly [number, number]>) => `M${p.map(([x, y]) => `${x} ${y}`).join('L')}Z`

function Desenho({ planta, marcas }: { planta: PlantaPavimento; marcas: readonly MarcaColorida[] }) {
  const pontos = planta.elementos.flatMap((e) => e.polys.flat())
  const c = pontos.length ? caixaDe(pontos) : { x0: 0, y0: 0, x1: planta.largura, y1: planta.altura }
  const f = Math.max(c.x1 - c.x0, c.y1 - c.y0) * 0.02
  const raio = Math.max(c.x1 - c.x0, c.y1 - c.y0) * 0.012
  const base = planta.elementos.flatMap((e) => e.polys.map(caminho)).join('')
  const porId = new Map(planta.elementos.map((e) => [e.id, e]))
  return (
    <svg viewBox={`${c.x0 - f} ${c.y0 - f} ${c.x1 - c.x0 + 2 * f} ${c.y1 - c.y0 + 2 * f}`} role="img" aria-label={`Planta do ${planta.trecho}`}>
      <path d={base} fill="none" stroke="#9aa3ad" stroke-width={raio * 0.12} />
      {marcas.map(({ marca: m, cor }) => {
        if (m.forma === 'peca') {
          const e = porId.get(m.elemento_id ?? '')
          if (!e) return null
          const pts = e.polys.flat()
          const k = pts.length ? caixaDe(pts) : null
          return (
            <g key={m.id}>
              <path d={e.polys.map(caminho).join('')} fill={cor} fill-opacity={0.75} stroke={cor} stroke-width={raio * 0.2} />
              {/* no desenho pequeno o pilar some: o anel mostra onde ele está */}
              {k && <circle cx={(k.x0 + k.x1) / 2} cy={(k.y0 + k.y1) / 2} r={raio * 1.2} fill="none" stroke={cor} stroke-width={raio * 0.25} />}
            </g>
          )
        }
        if (m.forma === 'area' && m.contorno) return <path key={m.id} d={caminho(m.contorno)} fill={cor} fill-opacity={0.2} stroke={cor} stroke-width={raio * 0.25} />
        if (m.forma === 'ponto' && m.contorno?.[0]) return <circle key={m.id} cx={m.contorno[0][0]} cy={m.contorno[0][1]} r={raio} fill={cor} stroke="#fff" stroke-width={raio * 0.25} />
        return null
      })}
    </svg>
  )
}

function FotosImpressas({ ctx, fotos }: { ctx: Contexto; fotos: readonly Foto[] }) {
  if (fotos.length === 0) return null
  return (
    <div class="rl-doc-fotos">
      {fotos.map((f) => (
        <Miniatura key={f.raiz} dados={ctx.dados} foto={f} />
      ))}
    </div>
  )
}

function Tabela({ titulo, colunas, linhas, vazio = 'Nada registrado.' }: { titulo: string; colunas: readonly string[]; linhas: ReadonlyArray<ReadonlyArray<string>>; vazio?: string }) {
  return (
    <section class="rl-doc-secao">
      <h2>{titulo}</h2>
      {linhas.length === 0 ? (
        <p class="discreto">{vazio}</p>
      ) : (
        <div class="rl-doc-rolagem">
        <table class="rl-doc-tabela">
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                {l.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  )
}

const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export function TelaImprimirDia({ ctx: comExemplos, data }: { ctx: Contexto; data: string }) {
  // os exemplos da apresentação não saem no RDO (nem ocupam o número dele)
  const ctx = { ...comExemplos, dados: semExemplos(comExemplos.dados) }
  const { dados, obra, voltar } = ctx
  const r = resumoDoDia(dados, data)
  const clima = dados.clima.get(data)
  const servicos = dados.servicos.get(data) ?? []
  // o relato do dia é gravado como ocorrência, mas sai na folha como seção própria (não na tabela de ocorrências)
  const doDia = dados.ocorrencias.get(data) ?? []
  const relato = doDia.find(ehRelato)
  const ocorrencias = doDia.filter((l) => !ehRelato(l))
  const relatorios = dados.relatorios.filter((x) => x.data === data)
  const [app, setApp] = useState<DoApp | null>(null)
  useEffect(() => {
    doQueOAppSabe(obra.id, data).then(setApp)
  }, [obra.id, data])

  const marcas: MarcaColorida[] = [
    ...servicos.flatMap((s) => (dados.marcas.get(s.raiz) ?? []).map((marca) => ({ marca, cor: s.situacao === 'concluido' ? COR_CATEGORIA.servico_concluido : COR_CATEGORIA.servico }))),
    ...ocorrencias.flatMap((o) => (dados.marcas.get(o.raiz) ?? []).map((marca) => ({ marca, cor: COR_CATEGORIA.ocorrencia }))),
    ...relatorios.flatMap((x) => (dados.marcas.get(x.raiz) ?? []).map((marca) => ({ marca, cor: situacaoDoRelatorio(x, dados.andamentos.get(x.raiz)) === 'resolvido' ? COR_CATEGORIA.resolvido : COR_CATEGORIA.problema }))),
  ]
  const fotos: Foto[] = [...(dados.fotosDoDia.get(data) ?? []), ...[...servicos, ...ocorrencias, ...relatorios].flatMap((l) => dados.fotosDoAlvo.get(l.raiz) ?? [])]

  return (
    <main class="tela rl-doc">
      <Topo titulo="Diário para imprimir" sub={dataBR(data)} aoVoltar={voltar}>
        <button type="button" class="principal" onClick={() => window.print()}>
          Imprimir
        </button>
      </Topo>
      {!r.fechado && (
        <p class="rl-doc-rascunho" data-testid="rascunho">
          RASCUNHO: este dia ainda não foi fechado.
        </p>
      )}
      <Cabecalho ctx={ctx} data={data} titulo="Relatório Diário de Obra" numero={r.numero ? `RDO nº ${r.numero}` : 'sem número até fechar'} />

      <section class="rl-doc-secao" data-testid="relato-impresso">
        <h2>Relato do dia</h2>
        {relato ? <p class="rl-relato">{txt(relato.descricao)}</p> : <p class="discreto">Nada escrito.</p>}
      </section>
      <Tabela
        titulo="Clima"
        colunas={['Período', 'Tempo', 'Condição']}
        linhas={PERIODOS.flatMap((p) => {
          const c = clima?.get(p.v)
          return c?.tempo ? [[p.t, rotulo(TEMPOS, c.tempo), c.condicao === 'impraticavel' ? 'Impraticável' : 'Praticável']] : []
        })}
      />
      <Tabela
        titulo={`Mão de obra${r.pessoas ? ` (total: ${r.pessoas})` : ''}`}
        colunas={['Empresa', 'Função', 'Qtd.', 'Observação']}
        linhas={(dados.efetivo.get(data) ?? []).map((l) => [txt(l.empresa), txt(l.funcao), numBR(l.quantidade), txt(l.observacao)])}
      />
      <Tabela
        titulo="Equipamentos"
        colunas={['Equipamento', 'Qtd.', 'Situação', 'Observação']}
        linhas={(dados.equipamentos.get(data) ?? []).map((l) => [txt(l.nome), numBR(l.quantidade), rotulo(SITUACOES_EQUIPAMENTO, l.situacao), txt(l.observacao)])}
      />
      <Tabela
        titulo="Serviços executados"
        colunas={['Serviço', 'Empresa', 'Situação', 'Avanço', 'Onde']}
        linhas={servicos.map((l) => {
          const m = dados.marcas.get(l.raiz) ?? []
          return [txt(l.descricao), txt(l.empresa), rotulo(SITUACOES_SERVICO, l.situacao), l.avanco_pct === null || l.avanco_pct === undefined ? '' : `${txt(l.avanco_pct)}%`, [m.length ? textoDoLocal(dados, m) : '', txt(l.local_texto)].filter(Boolean).join(' · ')]
        })}
      />
      <Tabela
        titulo="Materiais recebidos"
        colunas={['Material', 'Quantidade', 'Fornecedor', 'NF']}
        linhas={(dados.materiais.get(data) ?? []).map((l) => [txt(l.material), `${numBR(l.quantidade, 3)} ${txt(l.unidade)}`.trim(), txt(l.fornecedor), txt(l.nota_fiscal)])}
      />
      <Tabela
        titulo={`Ocorrências${r.horasParadas ? ` (horas paradas: ${numBR(r.horasParadas, 1)})` : ''}`}
        colunas={['Tipo', 'O que aconteceu', 'Horas paradas', 'Onde']}
        linhas={ocorrencias.map((l) => {
          const m = dados.marcas.get(l.raiz) ?? []
          return [rotulo(TIPOS_OCORRENCIA, l.tipo), txt(l.descricao), numBR(l.horas_paradas, 1), [m.length ? textoDoLocal(dados, m) : '', txt(l.local_texto)].filter(Boolean).join(' · ')]
        })}
      />
      {relatorios.length > 0 && (
        <Tabela
          titulo="Relatórios do dia"
          colunas={['Tipo', 'Título', 'Situação', 'Onde']}
          linhas={relatorios.map((x) => {
            const m = dados.marcas.get(x.raiz) ?? []
            return [tipoRelatorio(x.tipo).t, x.titulo, rotulo(SITUACOES_RELATORIO, situacaoDoRelatorio(x, dados.andamentos.get(x.raiz))), m.length ? textoDoLocal(dados, m) : txt(x.local_texto)]
          })}
        />
      )}
      {app && (app.concretagens.length > 0 || app.fvs.pecas > 0) && (
        <section class="rl-doc-secao">
          <h2>Registrado em outros módulos</h2>
          {app.concretagens.map((c) => (
            <p key={c.raiz}>
              Concretagem: {c.local || 'sem local'}
              {c.fornecedor ? ` · ${c.fornecedor}` : ''} · {plural(c.caminhoes, 'caminhão', 'caminhões')}
              {c.volume ? ` · ${numBR(c.volume)} m³` : ''}
            </p>
          ))}
          {app.fvs.pecas > 0 && (
            <p>
              FVS: {plural(app.fvs.pecas, 'peça verificada', 'peças verificadas')} ({app.fvs.aprovados} A, {app.fvs.reprovados} R, {app.fvs.naoAplica} NA)
            </p>
          )}
        </section>
      )}
      {marcas.length > 0 && (
        <section class="rl-doc-secao">
          <h2>Onde foi, nas pranchas</h2>
          <Plantas ctx={ctx} marcas={marcas} />
        </section>
      )}
      {fotos.length > 0 && (
        <section class="rl-doc-secao">
          <h2>Fotos</h2>
          <FotosImpressas ctx={ctx} fotos={fotos} />
        </section>
      )}
      <Assinaturas titulos={['Responsável técnico', 'Fiscal / Contratante']} />
    </main>
  )
}

export function TelaImprimirRelatorio({ ctx: comExemplos, raiz }: { ctx: Contexto; raiz: string }) {
  const ctx = { ...comExemplos, dados: semExemplos(comExemplos.dados) }
  const { dados, voltar } = ctx
  const r = dados.relatorios.find((x) => x.raiz === raiz)
  if (!r) {
    return (
      <main class="tela">
        <Topo titulo="Relatório" aoVoltar={voltar} />
        <p data-testid="imprimir-sem-relatorio">{comExemplos.dados.exemplos.has(raiz) ? 'Relatório de exemplo: não sai na impressão.' : 'Este relatório foi apagado.'}</p>
      </main>
    )
  }
  const andamentos = dados.andamentos.get(raiz) ?? []
  const sit = situacaoDoRelatorio(r, andamentos)
  const marcas = dados.marcas.get(raiz) ?? []
  const cor = sit === 'resolvido' ? COR_CATEGORIA.resolvido : COR_CATEGORIA.problema
  return (
    <main class="tela rl-doc">
      <Topo titulo="Relatório para imprimir" sub={r.titulo} aoVoltar={voltar}>
        <button type="button" class="principal" onClick={() => window.print()}>
          Imprimir
        </button>
      </Topo>
      <Cabecalho ctx={ctx} data={r.data} titulo={`Relatório: ${tipoRelatorio(r.tipo).t}`} />
      <section class="rl-doc-secao">
        <h2>{r.titulo}</h2>
        <div class="rl-doc-rolagem">
        <table class="rl-doc-tabela">
          <tbody>
            <tr>
              <th>Situação</th>
              <td>{rotulo(SITUACOES_RELATORIO, sit)}</td>
              <th>Gravidade</th>
              <td>{rotulo(GRAVIDADES, r.gravidade)}</td>
            </tr>
            <tr>
              <th>Quem resolve</th>
              <td>{r.responsavel ?? ''}</td>
              <th>Prazo</th>
              <td>{dataBR(r.prazo)}</td>
            </tr>
            <tr>
              <th>Onde</th>
              <td colSpan={3}>{[marcas.length ? textoDoLocal(dados, marcas) : '', r.local_texto ?? ''].filter(Boolean).join(' · ')}</td>
            </tr>
          </tbody>
        </table>
        </div>
        {r.descricao && <p class="rl-texto">{r.descricao}</p>}
      </section>
      {r.itens.length > 0 && <Tabela titulo="Conferência" colunas={['Item', 'Resultado']} linhas={r.itens.map((i) => [i.item, rotulo(RESULTADOS_ITEM, i.resultado)])} />}
      {andamentos.length > 0 && (
        <Tabela titulo="Andamento" colunas={['Data', 'Situação', 'Comentário']} linhas={andamentos.map((a) => [dataBR(dataLocal(a.criado_em_dispositivo)), rotulo(SITUACOES_RELATORIO, a.situacao), txt(a.comentario)])} />
      )}
      {marcas.length > 0 && (
        <section class="rl-doc-secao">
          <h2>Onde foi, nas pranchas</h2>
          <Plantas ctx={ctx} marcas={marcas.map((marca) => ({ marca, cor }))} />
        </section>
      )}
      {(dados.fotosDoAlvo.get(raiz)?.length ?? 0) > 0 && (
        <section class="rl-doc-secao">
          <h2>Fotos</h2>
          <FotosImpressas ctx={ctx} fotos={dados.fotosDoAlvo.get(raiz)!} />
        </section>
      )}
      <Assinaturas titulos={['Responsável pelo relatório', 'Responsável técnico']} />
    </main>
  )
}

function Assinaturas({ titulos }: { titulos: readonly string[] }) {
  return (
    <div class="rl-doc-assinaturas">
      {titulos.map((t) => (
        <div key={t}>
          <span />
          <p>{t}</p>
        </div>
      ))}
    </div>
  )
}
