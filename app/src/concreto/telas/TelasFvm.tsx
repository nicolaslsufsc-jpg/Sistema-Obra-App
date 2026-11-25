// FVM (recebimento de materiais controlados) dentro do Concreto: a seção do início, a lista de
// recebimentos com a importação da lista de materiais, a ficha de recebimento e o detalhe (onde o
// gestor tira do "retido"). Com ou sem conta desde a migração de 20/11 (tabelas.ts).
import { useEffect, useState } from 'preact/hooks'
import { dataLocal } from '../cps'
import { podeLancarLaudo, podeRegistrar } from '../dados'
import {
  errosDoMaterial,
  errosDoRecebimento,
  errosDoUso,
  formularioDoMaterial,
  lerListaDeMateriais,
  LIMITES,
  LIMITES_MATERIAL,
  LIMITES_USO,
  materialDoFormulario,
  podeMarcarUso,
  quantidadeUsada,
  resultadoDoValor,
  ROTULO_SITUACAO_RECEBIMENTO,
  situacaoSugerida,
  situacoesPossiveis,
  type ConferenciaDoItem,
  type FormMaterial,
  type Resposta,
  type SituacaoRecebimento,
} from '../fvm'
import {
  ACEITAR_FOTO,
  cancelarRecebimento,
  decidirRetido,
  desfazerUso,
  guardarFoto,
  importarLista,
  recusaDaFoto,
  registrarRecebimento,
  registrarUso,
  retirarMaterial,
  salvarMaterial,
  type DadosFvm,
  type MaterialNoAparelho,
  type Recebimento,
  type UsoDoLote,
} from '../fvm_dados'
import { mensagemDeFalha } from '../horarios'
import { urlDoLaudo } from '../laudo_arquivo'
import type { Contexto } from './ModuloConcreto'
import { dataBR, lerNumero, numBR, plural, Topo } from './comum'
import { Ajuda } from '../../telas/Ajuda'

const CLASSE: Record<SituacaoRecebimento, string> = { liberado: 'bom', liberado_ressalva: 'info', retido: 'ruim', devolvido: 'neutro' }
const MAX_FOTOS = 5

export function SeloRecebimento({ situacao }: { situacao: SituacaoRecebimento }) {
  return (
    <span class={`selo ${CLASSE[situacao]}`} data-situacao={situacao}>
      {ROTULO_SITUACAO_RECEBIMENTO[situacao]}
    </span>
  )
}

function LinhaRecebimento({ r, aoAbrir }: { r: Recebimento; aoAbrir: () => void }) {
  return (
    <button type="button" class="cc-linha" onClick={aoAbrir} data-testid="recebimento">
      <span>
        <strong>{r.material_nome}</strong>
        <span class="discreto">
          {dataBR(r.data)} · {numBR(r.quantidade, 2)} {r.unidade} · NF {r.nota_fiscal}
          {r.lote ? ` · lote ${r.lote}` : ''}
        </span>
      </span>
      <SeloRecebimento situacao={r.situacao} />
    </button>
  )
}

/** Seção no início do Concreto. */
export function SecaoFvm({ ctx, fvm }: { ctx: Contexto; fvm: DadosFvm }) {
  const retidos = fvm.recebimentos.filter((r) => r.situacao === 'retido')
  return (
    <section data-testid="fvm-inicio">
      <h2>Recebimento de materiais</h2>
      {retidos.length > 0 && (
        <p class="faixa-aviso fvm-retidos" data-testid="fvm-retidos">
          <strong>{plural(retidos.length, 'material retido', 'materiais retidos')} — não usar</strong> até o gestor liberar.
        </p>
      )}
      <ul class="lista">
        <li>
          <button type="button" class="cc-linha" onClick={() => ctx.ir({ nome: 'materiais' })} data-testid="abrir-fvm">
            <span>
              <strong>Materiais controlados</strong>
              <span class="discreto">
                {fvm.materiais.length === 0
                  ? 'importe a lista de materiais da obra para começar'
                  : `${plural(fvm.materiais.length, 'material', 'materiais')} · ${plural(fvm.recebimentos.length, 'recebimento', 'recebimentos')}`}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------
// Lista de recebimentos + importação
// ---------------------------------------------------------------------

export function TelaMateriais({ ctx, fvm }: { ctx: Contexto; fvm: DadosFvm }) {
  const { obra, usuario, ir, voltar, recarregar } = ctx
  const [resumo, setResumo] = useState('')
  const [errosLista, setErrosLista] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)
  const gestor = podeLancarLaudo(obra.papel)
  const retidos = fvm.recebimentos.filter((r) => r.situacao === 'retido')
  const outros = fvm.recebimentos.filter((r) => r.situacao !== 'retido')

  const importar = async (input: HTMLInputElement) => {
    const arquivo = input.files?.[0]
    input.value = ''
    if (!arquivo) return
    setResumo('')
    setErrosLista([])
    if (arquivo.size > 1024 * 1024) return setErrosLista(['Arquivo grande demais para uma lista de materiais (máximo 1 MB).'])
    const { materiais, erros } = lerListaDeMateriais(await arquivo.text())
    setErrosLista(erros)
    if (materiais.length === 0) return setResumo('Nada importado.')
    setOcupado(true)
    try {
      const r = await importarLista(obra.id, usuario.id, fvm.materiais, materiais)
      await recarregar()
      setResumo(
        r.incluidos + r.corrigidos + r.cancelados === 0
          ? 'A lista já estava igual. Nada mudou.'
          : `Lista importada: ${r.incluidos} novo(s), ${r.corrigidos} alterado(s), ${r.cancelados} retirado(s).`,
      )
    } catch (err) {
      setResumo(mensagemDeFalha(err))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <main class="tela">
      <Topo titulo="Recebimento de materiais" sub={`${obra.codigo} · materiais controlados`} aoVoltar={voltar} />

      {podeRegistrar(obra.papel) && fvm.materiais.length > 0 && (
        <button type="button" class="principal cc-largo" onClick={() => ir({ nome: 'receber' })} data-testid="receber-material">
          Receber material
        </button>
      )}

      {retidos.length > 0 && (
        <section class="cartao cc-alertas" data-testid="lista-retidos">
          <h2>Retidos — não usar ({retidos.length})</h2>
          <p class="discreto">Ficam separados até o gestor liberar ou devolver.</p>
          <ul class="lista">
            {retidos.map((r) => (
              <li key={r.raiz}>
                <LinhaRecebimento r={r} aoAbrir={() => ir({ nome: 'recebimento', raiz: r.raiz })} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2>Recebimentos</h2>
      {outros.length === 0 ? (
        <p class="discreto">Sem recebimentos{retidos.length > 0 ? ' além dos retidos' : ''}</p>
      ) : (
        <ul class="lista">
          {outros.slice(0, 100).map((r) => (
            <li key={r.raiz}>
              <LinhaRecebimento r={r} aoAbrir={() => ir({ nome: 'recebimento', raiz: r.raiz })} />
            </li>
          ))}
        </ul>
      )}

      <h2>Lista de materiais controlados</h2>
      {fvm.materiais.length === 0 ? (
        <p class="discreto so-com-ajuda">
          Sem lista de materiais
          <Ajuda>A lista vem num arquivo materiais.json (o mesmo que vai no pacote da obra) ou é montada aqui, material por material.</Ajuda>
        </p>
      ) : gestor ? (
        <ul class="lista" data-testid="lista-materiais">
          {fvm.materiais.map((m) => (
            <li key={m.codigo}>
              <button type="button" class="cc-linha" onClick={() => ir({ nome: 'material', codigo: m.codigo })} data-testid="editar-material">
                <span>
                  <strong>{m.nome}</strong>
                  <span class="discreto">
                    {m.codigo} · {m.via === 'concreto' ? 'pela concretagem' : plural(m.itens.length, 'item', 'itens')}
                    {m.estrutural ? ' · estrutural' : ''}
                    {m.exige_ensaio ? ' · ensaio' : ''}
                  </span>
                </span>
                <span class="discreto fvm-editar">Editar</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p class="discreto" data-testid="lista-materiais">
          {fvm.materiais.map((m) => m.nome).join(' · ')}
        </p>
      )}
      {gestor && (
        <button type="button" class="cc-largo" onClick={() => ir({ nome: 'material' })} data-testid="novo-material">
          Novo material
        </button>
      )}
      {gestor ? (
        <label class="cc-campo">
          <span>{fvm.materiais.length === 0 ? 'Importar lista de materiais (.json)' : 'Trocar a lista de materiais (.json)'}</span>
          <input type="file" accept=".json,application/json" disabled={ocupado} data-testid="importar-materiais" onChange={(e) => importar(e.currentTarget)} />
          <span class="discreto">Material que sair da lista não apaga os recebimentos dele.</span>
        </label>
      ) : (
        <p class="discreto">Só gestor ou admin troca a lista de materiais.</p>
      )}
      {resumo && (
        <p class="aviso" role="status" data-testid="resumo-importacao">
          {resumo}
        </p>
      )}
      {errosLista.length > 0 && (
        <ul class="erro" data-testid="erros-importacao">
          {errosLista.slice(0, 20).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------
// Ficha de recebimento
// ---------------------------------------------------------------------

export function TelaReceber({ ctx, fvm, codigo }: { ctx: Contexto; fvm: DadosFvm; codigo?: string }) {
  const material = codigo ? fvm.materiais.find((m) => m.codigo === codigo) : undefined
  if (!material) {
    return (
      <main class="tela">
        <Topo titulo="Receber material" sub="Qual material chegou?" aoVoltar={ctx.voltar} />
        <ul class="lista" data-testid="escolher-material">
          {fvm.materiais.map((m) =>
            m.via === 'concreto' ? (
              <li key={m.codigo} class="cc-linha fvm-via">
                <span>
                  <strong>{m.nome}</strong>
                  <span class="discreto">Recebido pela concretagem: registre cada caminhão no Concreto.</span>
                </span>
              </li>
            ) : (
              <li key={m.codigo}>
                <button type="button" class="cc-linha" onClick={() => ctx.trocar({ nome: 'receber', codigo: m.codigo })}>
                  <span>
                    <strong>{m.nome}</strong>
                    <span class="discreto">
                      {plural(m.itens.length, 'item', 'itens')} a conferir
                      {m.estrutural ? ' · estrutural (pede lote)' : ''}
                      {m.exige_ensaio ? ' · fica retido até o ensaio' : ''}
                    </span>
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      </main>
    )
  }
  return <FormRecebimento ctx={ctx} material={material} />
}

const RESPOSTAS: Resposta[] = ['C', 'NC', 'NA']

function FormRecebimento({ ctx, material }: { ctx: Contexto; material: MaterialNoAparelho }) {
  const { obra, usuario, voltar, trocar, recarregar } = ctx
  const hoje = dataLocal(new Date())
  const [data, setData] = useState(hoje)
  const [fornecedor, setFornecedor] = useState('')
  const [nf, setNf] = useState('')
  const [lote, setLote] = useState('')
  const [qtd, setQtd] = useState('')
  const [respostas, setRespostas] = useState<Record<string, { resultado?: Resposta; valor: string; observacao: string }>>({})
  const [docs, setDocs] = useState<Record<string, boolean>>(() => Object.fromEntries(material.documentos.map((d) => [d, true])))
  const [fotos, setFotos] = useState<File[]>([])
  const [erroFoto, setErroFoto] = useState('')
  const [escolhida, setEscolhida] = useState<SituacaoRecebimento | null>(null)
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState('')

  const conferencia: ConferenciaDoItem[] = material.itens.flatMap((item) => {
    const r = respostas[item.codigo]
    const valor = r ? lerNumero(r.valor) : null
    // item medido: o número decide; sem número, vale o que a pessoa marcou
    const resultado = resultadoDoValor(item, valor) ?? r?.resultado
    return resultado ? [{ codigo: item.codigo, texto: item.texto, resultado, valor: valor !== null && !Number.isNaN(valor) ? valor : null, observacao: r?.observacao.trim() || null }] : []
  })
  const faltaDoc = material.documentos.some((d) => !docs[d])
  const sugerida = situacaoSugerida(material, conferencia, faltaDoc)
  const possiveis = situacoesPossiveis(conferencia, material)
  // até a pessoa escolher, vale a sugestão; se a escolha deixou de ser possível (marcou NC), volta para a sugestão
  const situacao = escolhida && possiveis.includes(escolhida) ? escolhida : sugerida

  const mudar = (codigo: string, m: Partial<{ resultado: Resposta; valor: string; observacao: string }>) =>
    setRespostas((a) => ({ ...a, [codigo]: { ...(a[codigo] ?? { valor: '', observacao: '' }), ...m } }))

  const escolherFotos = (input: HTMLInputElement) => {
    const novas = [...(input.files ?? [])]
    input.value = ''
    setErroFoto('')
    for (const f of novas) {
      const recusa = recusaDaFoto(f)
      if (recusa) return setErroFoto(`${f.name}: ${recusa}`)
    }
    setFotos((a) => {
      const todas = [...a, ...novas]
      if (todas.length > MAX_FOTOS) setErroFoto(`No máximo ${MAX_FOTOS} fotos por recebimento.`)
      return todas.slice(0, MAX_FOTOS)
    })
  }

  const salvar = async (ev: Event) => {
    ev.preventDefault()
    const quantidade = lerNumero(qtd)
    const e = errosDoRecebimento(material, { data, fornecedor, nota_fiscal: nf, lote, quantidade, conferencia, situacao, motivo }, hoje)
    setErros(e)
    if (Object.keys(e).length > 0) {
      setFalha('Falta preencher: veja os campos em vermelho.')
      return
    }
    setFalha('')
    setSalvando(true)
    try {
      const ids: string[] = []
      for (const f of fotos) ids.push(await guardarFoto(obra.id, usuario.id, f))
      const linha = await registrarRecebimento(obra.id, usuario.id, {
        material_codigo: material.codigo,
        material_nome: material.nome,
        unidade: material.unidade,
        data,
        fornecedor: fornecedor.trim(),
        nota_fiscal: nf.trim(),
        lote: lote.trim() || null,
        quantidade: quantidade!,
        itens: conferencia,
        documentos: material.documentos.map((nome) => ({ nome, veio: !!docs[nome] })),
        fotos: ids,
        situacao,
        motivo: situacao === 'liberado' ? null : motivo.trim(),
        observacao: obs.trim() || null,
      })
      await recarregar()
      trocar({ nome: 'recebimento', raiz: linha.id })
    } catch (err) {
      setSalvando(false)
      setFalha(mensagemDeFalha(err))
    }
  }

  return (
    <main class="tela">
      <Topo titulo={`Receber: ${material.nome}`} sub={`unidade: ${material.unidade}`} aoVoltar={voltar} />
      <form onSubmit={salvar} class="cc-form" noValidate data-testid="form-recebimento">
        <div class="cc-campos">
          <Campo rotulo="Data do recebimento" erro={erros.data}>
            <input type="date" value={data} max={hoje} onInput={(e) => setData(e.currentTarget.value)} />
          </Campo>
          <Campo rotulo="Fornecedor" erro={erros.fornecedor}>
            <input value={fornecedor} maxLength={LIMITES.fornecedor} onInput={(e) => setFornecedor(e.currentTarget.value)} />
          </Campo>
          <Campo rotulo="Nota fiscal" erro={erros.nota_fiscal}>
            <input value={nf} maxLength={LIMITES.nota_fiscal} onInput={(e) => setNf(e.currentTarget.value)} />
          </Campo>
          <Campo rotulo={material.estrutural ? 'Lote / corrida (obrigatório)' : 'Lote (se tiver)'} erro={erros.lote}>
            <input value={lote} maxLength={LIMITES.lote} onInput={(e) => setLote(e.currentTarget.value)} />
          </Campo>
          <Campo rotulo={`Quantidade (${material.unidade})`} erro={erros.quantidade}>
            <input inputMode="decimal" value={qtd} onInput={(e) => setQtd(e.currentTarget.value)} />
          </Campo>
        </div>

        {material.documentos.length > 0 && (
          <fieldset class="fvm-bloco" data-testid="documentos">
            <legend>Documentos que vieram com a entrega</legend>
            {material.documentos.map((d) => (
              <label key={d} class="fvm-check">
                <input type="checkbox" checked={!!docs[d]} onChange={(e) => setDocs((a) => ({ ...a, [d]: e.currentTarget.checked }))} />
                <span>{d}</span>
              </label>
            ))}
            {faltaDoc && <p class="aviso">Documento faltando: o material fica retido até chegar.</p>}
          </fieldset>
        )}

        <fieldset class="fvm-bloco" data-testid="conferencia">
          <legend>Conferência</legend>
          <p class="discreto">C = conforme · NC = não conforme · NA = não se aplica</p>
          {material.itens.map((item) => {
            const r = respostas[item.codigo]
            const atual = conferencia.find((c) => c.codigo === item.codigo)
            const erro = erros[`item:${item.codigo}`]
            return (
              <div key={item.codigo} class={`fvm-item${erro ? ' com-erro' : ''}`} data-testid={`item-${item.codigo}`}>
                <p class="fvm-item-texto">{item.texto}</p>
                {item.valor ? (
                  <label class="cc-campo">
                    <span>
                      Medido (aceita de {numBR(item.valor.min, 3)} a {numBR(item.valor.max, 3)})
                    </span>
                    <input inputMode="decimal" value={r?.valor ?? ''} onInput={(e) => mudar(item.codigo, { valor: e.currentTarget.value })} />
                  </label>
                ) : null}
                <div class="cc-seg fvm-resposta" role="group" aria-label={item.texto}>
                  {RESPOSTAS.map((x) => (
                    <button
                      key={x}
                      type="button"
                      class={atual?.resultado === x ? `on fvm-${x}` : ''}
                      aria-pressed={atual?.resultado === x}
                      onClick={() => mudar(item.codigo, { resultado: x, valor: item.valor && x !== 'NA' ? (r?.valor ?? '') : '' })}
                    >
                      {x}
                    </button>
                  ))}
                </div>
                {atual?.resultado === 'NC' && (
                  <label class="cc-campo">
                    <span>O que estava errado</span>
                    <textarea rows={2} maxLength={500} value={r?.observacao ?? ''} onInput={(e) => mudar(item.codigo, { observacao: e.currentTarget.value })} />
                  </label>
                )}
                {erro && <span class="erro">{erro}</span>}
              </div>
            )
          })}
        </fieldset>

        <fieldset class="fvm-bloco">
          <legend>Fotos (opcional, até {MAX_FOTOS})</legend>
          <input type="file" accept={ACEITAR_FOTO} capture="environment" multiple data-testid="fotos" onChange={(e) => escolherFotos(e.currentTarget)} />
          {fotos.length > 0 && (
            <p class="discreto" data-testid="fotos-escolhidas">
              {plural(fotos.length, 'foto escolhida', 'fotos escolhidas')}{' '}
              <button type="button" class="cc-pequeno" onClick={() => setFotos([])}>
                Tirar as fotos
              </button>
            </p>
          )}
          {erroFoto && <p class="erro">{erroFoto}</p>}
        </fieldset>

        <fieldset class="fvm-bloco" data-testid="resultado">
          <legend>Resultado</legend>
          <p class="discreto">Sugestão do app: {ROTULO_SITUACAO_RECEBIMENTO[sugerida]}.</p>
          <div class="fvm-situacoes" role="group" aria-label="Resultado do recebimento">
            {possiveis.map((s) => (
              <button key={s} type="button" class={situacao === s ? `on fvm-sit-${s}` : ''} aria-pressed={situacao === s} onClick={() => setEscolhida(s)}>
                {ROTULO_SITUACAO_RECEBIMENTO[s]}
              </button>
            ))}
          </div>
          {erros.situacao && <span class="erro">{erros.situacao}</span>}
          {situacao !== 'liberado' && (
            <Campo rotulo={situacao === 'liberado_ressalva' ? 'Ressalva (onde pode usar, quem autorizou)' : 'Motivo e o que fazer com o material'} erro={erros.motivo}>
              <textarea rows={2} maxLength={LIMITES.motivo} value={motivo} onInput={(e) => setMotivo(e.currentTarget.value)} />
            </Campo>
          )}
        </fieldset>

        <Campo rotulo="Observação">
          <textarea rows={2} maxLength={LIMITES.observacao} value={obs} onInput={(e) => setObs(e.currentTarget.value)} />
        </Campo>
        {falha && (
          <p class="aviso" role="alert">
            {falha}
          </p>
        )}
        <button type="submit" class="principal" disabled={salvando} data-testid="salvar-recebimento">
          Salvar recebimento
        </button>
      </form>
    </main>
  )
}

function Campo({ rotulo, erro, children }: { rotulo: string; erro?: string; children: preact.ComponentChildren }) {
  return (
    <label class={`cc-campo${erro ? ' com-erro' : ''}`}>
      <span>{rotulo}</span>
      {children}
      {erro && <span class="erro">{erro}</span>}
    </label>
  )
}

// ---------------------------------------------------------------------
// Detalhe do recebimento
// ---------------------------------------------------------------------

function Foto({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let feito: string | null = null
    let vivo = true
    urlDoLaudo(id).then((r) => {
      feito = r && r.foto ? r.url : null
      if (r && !r.foto) URL.revokeObjectURL(r.url)
      if (vivo) setUrl(feito)
      else if (feito) URL.revokeObjectURL(feito)
    })
    return () => {
      vivo = false
      if (feito) URL.revokeObjectURL(feito)
    }
  }, [id])
  if (url === undefined) return null
  if (url === null) return <span class="discreto">foto já enviada (não está neste aparelho)</span>
  return (
    <a href={url} target="_blank" rel="noopener">
      <img src={url} alt="Foto do recebimento" class="fvm-foto" />
    </a>
  )
}

export function TelaRecebimento({ ctx, fvm, raiz }: { ctx: Contexto; fvm: DadosFvm; raiz: string }) {
  const { obra, usuario, voltar, recarregar } = ctx
  const r = fvm.recebimentos.find((x) => x.raiz === raiz)
  const [decisao, setDecisao] = useState<Exclude<SituacaoRecebimento, 'retido'> | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  if (!r) {
    return (
      <main class="tela">
        <Topo titulo="Recebimento" aoVoltar={voltar} />
        <p class="discreto">Este recebimento foi apagado.</p>
      </main>
    )
  }
  const temNc = r.itens.some((i) => i.resultado === 'NC')
  const opcoes: Exclude<SituacaoRecebimento, 'retido'>[] = temNc ? ['liberado_ressalva', 'devolvido'] : ['liberado', 'liberado_ressalva', 'devolvido']

  const decidir = async () => {
    if (!decisao) return setErro('Escolha liberar ou devolver.')
    if (!motivo.trim()) return setErro('Escreva o motivo (ex.: ensaio do lote aprovado, laudo nº...).')
    setErro('')
    setSalvando(true)
    try {
      await decidirRetido(obra.id, usuario.id, r, decisao, motivo.trim().slice(0, LIMITES.motivo))
      await recarregar()
      setSalvando(false)
      setDecisao(null)
      setMotivo('')
    } catch (err) {
      setSalvando(false)
      setErro(mensagemDeFalha(err))
    }
  }

  const apagar = async () => {
    if (!confirm('Apagar este recebimento? Use só se foi registrado por engano.')) return
    try {
      await cancelarRecebimento(obra.id, usuario.id, r)
      await recarregar()
      voltar()
    } catch (err) {
      setErro(mensagemDeFalha(err))
    }
  }

  return (
    <main class="tela">
      <Topo titulo={r.material_nome} sub={`Recebido em ${dataBR(r.data)}`} aoVoltar={voltar} />
      <div class="cc-selos">
        <SeloRecebimento situacao={r.situacao} />
      </div>
      {r.situacao === 'retido' && (
        <p class="faixa-aviso fvm-retidos" data-testid="aviso-retido">
          <strong>Não usar.</strong> O material fica separado e identificado até o gestor liberar ou devolver.
        </p>
      )}
      <dl class="cc-dados">
        <dt>Fornecedor</dt>
        <dd>{r.fornecedor}</dd>
        <dt>Nota fiscal</dt>
        <dd>{r.nota_fiscal}</dd>
        <dt>Lote</dt>
        <dd>{r.lote ?? '—'}</dd>
        <dt>Quantidade</dt>
        <dd>
          {numBR(r.quantidade, 2)} {r.unidade}
        </dd>
        {r.motivo && (
          <>
            <dt>{r.situacao === 'liberado_ressalva' ? 'Ressalva' : 'Motivo'}</dt>
            <dd data-testid="motivo">{r.motivo}</dd>
          </>
        )}
        {r.liberado_em && (
          <>
            <dt>Decidido em</dt>
            <dd>{dataBR(dataLocal(new Date(r.liberado_em)))}</dd>
          </>
        )}
        {r.observacao && (
          <>
            <dt>Observação</dt>
            <dd>{r.observacao}</dd>
          </>
        )}
      </dl>

      <h2>Conferência</h2>
      <ul class="fvm-conferencia">
        {r.itens.map((i) => (
          <li key={i.codigo}>
            <span class={`selo ${i.resultado === 'NC' ? 'ruim' : i.resultado === 'C' ? 'bom' : 'neutro'}`}>{i.resultado}</span>
            <span>
              {i.texto}
              {i.valor !== null ? ` — medido ${numBR(i.valor, 3)}` : ''}
              {i.observacao ? <span class="discreto"> · {i.observacao}</span> : null}
            </span>
          </li>
        ))}
      </ul>

      {r.documentos.length > 0 && (
        <>
          <h2>Documentos</h2>
          <ul class="fvm-conferencia">
            {r.documentos.map((d) => (
              <li key={d.nome}>
                <span class={`selo ${d.veio ? 'bom' : 'ruim'}`}>{d.veio ? 'veio' : 'não veio'}</span>
                <span>{d.nome}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {r.fotos.length > 0 && (
        <>
          <h2>Fotos</h2>
          <div class="fvm-fotos">
            {r.fotos.map((id) => (
              <Foto key={id} id={id} />
            ))}
          </div>
        </>
      )}

      <SecaoOndeFoiUsado ctx={ctx} r={r} usos={fvm.usos.filter((u) => u.recebimento_id === r.raiz)} />

      {r.situacao === 'retido' &&
        (podeLancarLaudo(obra.papel) ? (
          <section class="cartao" data-testid="decidir-retido">
            <h2 class="sem-topo">Tirar do retido</h2>
            <div class="fvm-situacoes" role="group" aria-label="Decisão">
              {opcoes.map((s) => (
                <button key={s} type="button" class={decisao === s ? `on fvm-sit-${s}` : ''} aria-pressed={decisao === s} onClick={() => setDecisao(s)}>
                  {ROTULO_SITUACAO_RECEBIMENTO[s]}
                </button>
              ))}
            </div>
            <Campo rotulo="Motivo (ex.: ensaio aprovado, laudo nº...)">
              <textarea rows={2} maxLength={LIMITES.motivo} value={motivo} onInput={(e) => setMotivo(e.currentTarget.value)} />
            </Campo>
            <button type="button" class="principal cc-largo" disabled={salvando} onClick={decidir} data-testid="confirmar-decisao">
              Confirmar
            </button>
          </section>
        ) : (
          <p class="discreto">Só gestor ou admin tira um material do retido.</p>
        ))}
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}

      {podeRegistrar(obra.papel) && (
        <button type="button" class="perigo cc-largo" onClick={apagar}>
          Apagar este recebimento
        </button>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------
// Editor do modelo de material (gestor, 25/11)
// ---------------------------------------------------------------------

/** Material novo (sem código) ou edição de um que já está na lista. Só gestor e admin. */
export function TelaMaterial({ ctx, fvm, codigo }: { ctx: Contexto; fvm: DadosFvm; codigo?: string }) {
  const { obra, usuario, voltar, recarregar } = ctx
  const atual = codigo ? (fvm.materiais.find((m) => m.codigo === codigo) ?? null) : null
  const [f, setF] = useState<FormMaterial>(() => formularioDoMaterial(atual))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [falha, setFalha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmarRetirar, setConfirmarRetirar] = useState(false)
  // depois de "+ Item" ou "+ Documento", o cursor vai para a linha nova (senão o texto cai na de antes)
  const [focar, setFocar] = useState<'material-itens' | 'material-documentos' | null>(null)
  useEffect(() => {
    if (!focar) return
    const campos = document.querySelectorAll<HTMLInputElement>(`[data-testid="${focar}"] .fvm-linha-editor input`)
    campos[campos.length - 1]?.focus()
    setFocar(null)
  }, [focar, f.itens.length, f.documentos.length])

  if (!podeLancarLaudo(obra.papel)) {
    return (
      <main class="tela">
        <Topo titulo="Material" aoVoltar={voltar} />
        <p class="discreto">Só gestor ou admin mexe na lista de materiais.</p>
      </main>
    )
  }
  if (codigo && !atual) {
    return (
      <main class="tela">
        <Topo titulo="Material" aoVoltar={voltar} />
        <p class="discreto">Esse material não está mais na lista.</p>
      </main>
    )
  }

  const mudar = (m: Partial<FormMaterial>) => setF((a) => ({ ...a, ...m }))
  const mudarItem = (n: number, texto: string) => mudar({ itens: f.itens.map((i, k) => (k === n ? { ...i, texto } : i)) })
  const mudarDoc = (n: number, texto: string) => mudar({ documentos: f.documentos.map((d, k) => (k === n ? texto : d)) })
  const via = atual?.via ?? null

  const salvar = async (ev: Event) => {
    ev.preventDefault()
    const outros = fvm.materiais.filter((m) => m.codigo !== atual?.codigo).map((m) => m.codigo)
    const e = errosDoMaterial(f, outros, via)
    setErros(e)
    if (Object.keys(e).length > 0) return setFalha('Falta preencher: veja os campos em vermelho.')
    setFalha('')
    setSalvando(true)
    try {
      const ordemNova = fvm.materiais.reduce((mx, m) => Math.max(mx, m.ordem + 1), 0)
      await salvarMaterial(obra.id, usuario.id, materialDoFormulario(f, atual, ordemNova), atual)
      await recarregar()
      voltar()
    } catch (err) {
      setSalvando(false)
      setFalha(mensagemDeFalha(err))
    }
  }

  const retirar = async () => {
    if (!atual) return
    setSalvando(true)
    try {
      await retirarMaterial(obra.id, usuario.id, atual)
      await recarregar()
      voltar()
    } catch (err) {
      setSalvando(false)
      setFalha(mensagemDeFalha(err))
    }
  }

  return (
    <main class="tela">
      <Topo titulo={atual ? `Editar: ${atual.nome}` : 'Novo material'} sub="modelo da ficha de recebimento" aoVoltar={voltar} />
      <form onSubmit={salvar} class="cc-form" noValidate data-testid="form-material">
        <div class="cc-campos">
          <Campo rotulo="Código" erro={erros.codigo}>
            <input
              value={f.codigo}
              maxLength={LIMITES_MATERIAL.codigo}
              readOnly={!!atual}
              placeholder="ex.: ACO-CA50"
              data-testid="material-codigo"
              onInput={(e) => mudar({ codigo: e.currentTarget.value })}
            />
          </Campo>
          <Campo rotulo="Nome" erro={erros.nome}>
            <input value={f.nome} maxLength={LIMITES_MATERIAL.nome} placeholder="ex.: Aço CA-50" data-testid="material-nome" onInput={(e) => mudar({ nome: e.currentTarget.value })} />
          </Campo>
          <Campo rotulo="Unidade" erro={erros.unidade}>
            <input value={f.unidade} maxLength={LIMITES_MATERIAL.unidade} placeholder="kg, un, saco, m²" onInput={(e) => mudar({ unidade: e.currentTarget.value })} />
          </Campo>
        </div>
        {atual && <p class="discreto">O código não muda: os recebimentos já feitos usam ele.</p>}

        <fieldset class="fvm-bloco">
          <legend>Regras do recebimento</legend>
          <label class="fvm-check">
            <input type="checkbox" checked={f.estrutural} data-testid="material-estrutural" onChange={(e) => mudar({ estrutural: e.currentTarget.checked })} />
            <span>Estrutural: o lote (ou a corrida) é obrigatório</span>
          </label>
          <label class="fvm-check">
            <input type="checkbox" checked={f.exige_ensaio} onChange={(e) => mudar({ exige_ensaio: e.currentTarget.checked })} />
            <span>Precisa de ensaio: chega retido até o gestor liberar</span>
          </label>
        </fieldset>

        {via === 'concreto' ? (
          <p class="discreto">Recebido pela concretagem: os itens ficam na ficha de cada caminhão.</p>
        ) : (
          <fieldset class="fvm-bloco" data-testid="material-itens">
            <legend>Itens a conferir (C, NC ou NA no portão)</legend>
            {f.itens.map((i, n) => (
              <div class="fvm-linha-editor" key={n}>
                <input
                  value={i.texto}
                  maxLength={LIMITES_MATERIAL.item}
                  placeholder="ex.: Bitola conforme o pedido"
                  aria-label={`Item ${n + 1}`}
                  data-testid="material-item"
                  onInput={(e) => mudarItem(n, e.currentTarget.value)}
                />
                <button type="button" class="cc-pequeno" aria-label={`Tirar o item ${n + 1}`} onClick={() => mudar({ itens: f.itens.filter((_, k) => k !== n) })}>
                  Tirar
                </button>
                {erros[`item:${n}`] && <span class="erro">{erros[`item:${n}`]}</span>}
              </div>
            ))}
            {erros.itens && <p class="erro">{erros.itens}</p>}
            <button
              type="button"
              class="cc-pequeno"
              data-testid="material-mais-item"
              onClick={() => {
                mudar({ itens: [...f.itens, { codigo: '', texto: '' }] })
                setFocar('material-itens')
              }}
            >
              + Item
            </button>
          </fieldset>
        )}

        <fieldset class="fvm-bloco" data-testid="material-documentos">
          <legend>Documentos que vêm com a entrega</legend>
          {f.documentos.length === 0 && <p class="discreto">Nenhum (a nota fiscal já é pedida em todo recebimento).</p>}
          {f.documentos.map((d, n) => (
            <div class="fvm-linha-editor" key={n}>
              <input
                value={d}
                maxLength={LIMITES_MATERIAL.documento}
                placeholder="ex.: Certificado de qualidade do lote"
                aria-label={`Documento ${n + 1}`}
                onInput={(e) => mudarDoc(n, e.currentTarget.value)}
              />
              <button type="button" class="cc-pequeno" aria-label={`Tirar o documento ${n + 1}`} onClick={() => mudar({ documentos: f.documentos.filter((_, k) => k !== n) })}>
                Tirar
              </button>
              {erros[`doc:${n}`] && <span class="erro">{erros[`doc:${n}`]}</span>}
            </div>
          ))}
          {erros.documentos && <p class="erro">{erros.documentos}</p>}
          <button
            type="button"
            class="cc-pequeno"
            data-testid="material-mais-documento"
            onClick={() => {
              mudar({ documentos: [...f.documentos, ''] })
              setFocar('material-documentos')
            }}
          >
            + Documento
          </button>
        </fieldset>

        {falha && (
          <p class="aviso" role="alert">
            {falha}
          </p>
        )}
        <button type="submit" class="principal" disabled={salvando} data-testid="salvar-material">
          {atual ? 'Salvar alterações' : 'Incluir na lista'}
        </button>
      </form>

      {atual && (
        <section class="fvm-bloco">
          {confirmarRetirar ? (
            <>
              <p>
                Tirar <strong>{atual.nome}</strong> da lista? Os recebimentos já feitos continuam.
              </p>
              <div class="fvm-linha-editor">
                <button type="button" disabled={salvando} data-testid="confirmar-retirar" onClick={retirar}>
                  Sim, tirar da lista
                </button>
                <button type="button" class="cc-pequeno" onClick={() => setConfirmarRetirar(false)}>
                  Não
                </button>
              </div>
            </>
          ) : (
            <button type="button" class="cc-pequeno" data-testid="retirar-material" onClick={() => setConfirmarRetirar(true)}>
              Tirar da lista
            </button>
          )}
        </section>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------
// Onde o lote foi usado (25/11): no recebimento, marcar; no pavimento, "lotes usados aqui"
// ---------------------------------------------------------------------

function nomeDoLocalDoUso(ctx: Contexto, u: UsoDoLote, comPavimento: boolean): string {
  const partes: string[] = []
  if (comPavimento) partes.push(ctx.dados.pavimentos.find((p) => p.id === u.pavimento_id)?.nome ?? 'pavimento apagado')
  if (u.elemento_id) partes.push(ctx.dados.pecaPorId.get(u.elemento_id)?.nome ?? 'peça apagada')
  if (u.local_texto) partes.push(u.local_texto)
  return partes.join(' · ') || 'pavimento inteiro'
}

/** Seção do recebimento: os usos já marcados e o formulário para marcar mais um. */
function SecaoOndeFoiUsado({ ctx, r, usos }: { ctx: Contexto; r: Recebimento; usos: UsoDoLote[] }) {
  const { obra, usuario, dados, recarregar } = ctx
  const hoje = dataLocal(new Date())
  const [aberto, setAberto] = useState(false)
  const [pavimentoId, setPavimentoId] = useState('')
  const [peca, setPeca] = useState('')
  const [local, setLocal] = useState('')
  const [qtd, setQtd] = useState('')
  const [data, setData] = useState(hoje)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [falha, setFalha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const pecas = pavimentoId ? (dados.pecasDoPavimento.get(pavimentoId) ?? []) : []
  const pecaEscolhida = peca.trim() ? pecas.find((p) => p.nome.toLowerCase() === peca.trim().toLowerCase()) : undefined
  const usada = quantidadeUsada(usos)
  const pode = podeRegistrar(obra.papel)

  const salvar = async (ev: Event) => {
    ev.preventDefault()
    const quantidade = qtd.trim() ? lerNumero(qtd) : null
    const e = errosDoUso({ pavimento_id: pavimentoId, elemento_id: pecaEscolhida?.id ?? null, local_texto: local, quantidade, data }, r, hoje)
    if (peca.trim() && !pecaEscolhida) e.peca = 'Peça não encontrada neste pavimento (escolha da lista ou deixe em branco).'
    setErros(e)
    if (Object.keys(e).length > 0) return setFalha('Falta preencher: veja os campos em vermelho.')
    setFalha('')
    setSalvando(true)
    try {
      await registrarUso(obra.id, usuario.id, {
        recebimento_id: r.raiz,
        pavimento_id: pavimentoId,
        elemento_id: pecaEscolhida?.id ?? null,
        local_texto: local.trim() || null,
        quantidade,
        data,
        observacao: null,
      })
      await recarregar()
      setPeca('')
      setLocal('')
      setQtd('')
      setAberto(false)
    } catch (err) {
      setFalha(mensagemDeFalha(err))
    } finally {
      setSalvando(false)
    }
  }

  const desfazer = async (u: UsoDoLote) => {
    if (!confirm('Desfazer este uso? Use só se foi marcado por engano.')) return
    try {
      await desfazerUso(obra.id, usuario.id, u)
      await recarregar()
    } catch (err) {
      setFalha(mensagemDeFalha(err))
    }
  }

  return (
    <section data-testid="onde-foi-usado">
      <h2>Onde foi usado</h2>
      {usos.length === 0 ? (
        <p class="discreto">Nenhum uso marcado ainda.</p>
      ) : (
        <>
          <ul class="lista fvm-usos" data-testid="usos-do-lote">
            {usos.map((u) => (
              <li key={u.raiz} class="cc-linha fvm-uso">
                <span>
                  <strong>{nomeDoLocalDoUso(ctx, u, true)}</strong>
                  <span class="discreto">
                    {dataBR(u.data)}
                    {u.quantidade !== null ? ` · ${numBR(u.quantidade, 2)} ${r.unidade}` : ''}
                  </span>
                </span>
                {pode && (
                  <button type="button" class="cc-pequeno" onClick={() => desfazer(u)}>
                    Desfazer
                  </button>
                )}
              </li>
            ))}
          </ul>
          {usada > 0 && (
            <p class="discreto" data-testid="quantidade-usada">
              Marcado: {numBR(usada, 2)} de {numBR(r.quantidade, 2)} {r.unidade}
              {usada > r.quantidade ? ' (mais do que o recebido: confira)' : ''}
            </p>
          )}
        </>
      )}

      {!podeMarcarUso(r.situacao) ? (
        <p class="discreto">{r.situacao === 'retido' ? 'Retido: só marque o uso depois que o gestor liberar.' : 'Devolvido: não foi usado na obra.'}</p>
      ) : !pode ? null : !aberto ? (
        <button type="button" class="cc-largo" data-testid="marcar-uso" onClick={() => setAberto(true)}>
          Marcar onde foi usado
        </button>
      ) : (
        <form onSubmit={salvar} class="fvm-bloco cc-form" noValidate data-testid="form-uso">
          <div class="cc-campos">
            <Campo rotulo="Pavimento" erro={erros.pavimento_id}>
              <select
                value={pavimentoId}
                data-testid="uso-pavimento"
                onChange={(e) => {
                  setPavimentoId(e.currentTarget.value)
                  setPeca('')
                }}
              >
                <option value="">Escolha…</option>
                {dados.pavimentos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Peça (se quiser)" erro={erros.peca}>
              <input
                value={peca}
                list="fvm-pecas-do-pavimento"
                disabled={!pavimentoId || pecas.length === 0}
                placeholder={!pavimentoId ? 'escolha o pavimento antes' : pecas.length === 0 ? 'sem peças cadastradas' : 'ex.: P12'}
                data-testid="uso-peca"
                onInput={(e) => setPeca(e.currentTarget.value)}
              />
              <datalist id="fvm-pecas-do-pavimento">
                {pecas.map((p) => (
                  <option key={p.id} value={p.nome} />
                ))}
              </datalist>
            </Campo>
            <Campo rotulo="Local (se quiser)" erro={erros.local_texto}>
              <input value={local} maxLength={LIMITES_USO.local_texto} placeholder="ex.: alvenaria do eixo 3" onInput={(e) => setLocal(e.currentTarget.value)} />
            </Campo>
            <Campo rotulo={`Quantidade (${r.unidade}, se souber)`} erro={erros.quantidade}>
              <input inputMode="decimal" value={qtd} data-testid="uso-quantidade" onInput={(e) => setQtd(e.currentTarget.value)} />
            </Campo>
            <Campo rotulo="Data do uso" erro={erros.data}>
              <input type="date" value={data} min={r.data} max={hoje} onInput={(e) => setData(e.currentTarget.value)} />
            </Campo>
          </div>
          {falha && (
            <p class="aviso" role="alert">
              {falha}
            </p>
          )}
          <div class="fvm-linha-editor">
            <button type="submit" class="principal" disabled={salvando} data-testid="salvar-uso">
              Salvar uso
            </button>
            <button type="button" class="cc-pequeno" onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

/** Seção do pavimento: que lotes de material foram usados aqui (e em que peça). */
export function LotesUsadosAqui({ ctx, pavimentoId }: { ctx: Contexto; pavimentoId: string }) {
  const fvm = ctx.fvm
  if (!fvm) return null
  const usos = fvm.usos.filter((u) => u.pavimento_id === pavimentoId)
  if (usos.length === 0) return null
  const recebimento = new Map(fvm.recebimentos.map((r) => [r.raiz, r]))
  return (
    <section data-testid="lotes-usados-aqui">
      <h2>Lotes de material usados aqui ({usos.length})</h2>
      <ul class="lista">
        {usos.map((u) => {
          const r = recebimento.get(u.recebimento_id)
          return (
            <li key={u.raiz}>
              <button
                type="button"
                class="cc-linha"
                disabled={!r}
                data-testid="lote-usado"
                onClick={() => r && ctx.ir({ nome: 'recebimento', raiz: r.raiz })}
              >
                <span>
                  <strong>{r ? r.material_nome : 'Recebimento apagado'}</strong>
                  <span class="discreto">
                    {nomeDoLocalDoUso(ctx, u, false)} · {dataBR(u.data)}
                    {r ? ` · NF ${r.nota_fiscal}${r.lote ? ` · lote ${r.lote}` : ''}` : ''}
                    {u.quantidade !== null && r ? ` · ${numBR(u.quantidade, 2)} ${r.unidade}` : ''}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
