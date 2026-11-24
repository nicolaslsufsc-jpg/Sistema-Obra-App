// Nova obra: cadastrar a obra, os pavimentos, as plantas, as fichas e quem tem acesso pela tela; no fim,
// publicar no servidor (publicar.ts) ou salvar o pacote (.zip). O rascunho fica neste navegador enquanto
// a pessoa monta (pode fechar e voltar).
import { useEffect, useState } from 'preact/hooks'
import {
  etapasDaFicha,
  fichaVazia,
  itensColados,
  nomeDoZip,
  normalizarCodigo,
  pavimentosPadrao,
  problemas,
  avisos,
  rascunhoVazio,
  PAPEIS,
  TIPOS_DE_PECA,
  zipDoRascunho,
  type EstadoPublicacao,
  type PessoaRascunho,
  type FichaRascunho,
  type ItemRascunho,
  type RascunhoObra,
} from './modelo'
import { PassoPlantas } from './TelaPlantas'
import { apagarTudo, lerTiles } from './guardados'
import type { Progresso } from './publicar'
import { Ajuda } from '../telas/Ajuda'

const CHAVE = 'nova_obra:rascunho'
type Passo = 'obra' | 'pavimentos' | 'plantas' | 'fichas' | 'pessoas' | 'salvar'
const PASSOS: Array<[Passo, string]> = [
  ['obra', '1. Obra'],
  ['pavimentos', '2. Pavimentos'],
  ['plantas', '3. Plantas'],
  ['fichas', '4. Fichas'],
  ['pessoas', '5. Pessoas'],
  ['salvar', '6. Salvar'],
]

function lerRascunho(): RascunhoObra {
  try {
    const t = localStorage.getItem(CHAVE)
    if (t) {
      const r = { ...rascunhoVazio(), ...(JSON.parse(t) as RascunhoObra) }
      return { ...r, plantas: r.plantas ?? [] }
    }
  } catch {
    /* navegador sem armazenamento: começa vazio */
  }
  return rascunhoVazio()
}

function guardarRascunho(r: RascunhoObra) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(r))
  } catch {
    /* sem armazenamento: o rascunho só vive enquanto a página está aberta */
  }
}

const valor = (e: Event) => (e.target as HTMLInputElement).value

export function NovaObra() {
  const [r, setR] = useState<RascunhoObra>(lerRascunho)
  const [passo, setPasso] = useState<Passo>('obra')
  useEffect(() => guardarRascunho(r), [r])
  const mudar = (parcial: Partial<RascunhoObra>) => setR((a) => ({ ...a, ...parcial }))

  return (
    <main class="tela no-tela">
      <h1>Nova obra</h1>
      <p class="discreto so-com-ajuda">
        Nada sai deste aparelho até publicar ou salvar o pacote.
        <Ajuda>
          No fim, publique no servidor (precisa de internet e da conta de administrador) ou salve o pacote (.zip) para abrir no tablet sem conta.
        </Ajuda>
      </p>
      <nav class="no-passos" aria-label="Passos">
        {PASSOS.map(([id, nome]) => (
          <button type="button" key={id} class={passo === id ? 'principal' : undefined} aria-current={passo === id ? 'step' : undefined} onClick={() => setPasso(id)}>
            {nome}
          </button>
        ))}
      </nav>
      {passo === 'obra' && <PassoObra r={r} mudar={mudar} seguir={() => setPasso('pavimentos')} />}
      {passo === 'pavimentos' && <PassoPavimentos r={r} mudar={mudar} seguir={() => setPasso('plantas')} />}
      {passo === 'plantas' && <PassoPlantas r={r} mudar={mudar} seguir={() => setPasso('fichas')} />}
      {passo === 'fichas' && <PassoFichas r={r} mudar={mudar} seguir={() => setPasso('pessoas')} />}
      {passo === 'pessoas' && <PassoPessoas r={r} mudar={mudar} seguir={() => setPasso('salvar')} />}
      {passo === 'salvar' && (
        <PassoSalvar
          r={r}
          mudar={mudar}
          irPara={setPasso}
          recomecar={() => {
            apagarTudo().catch(() => undefined)
            setR(rascunhoVazio())
            setPasso('obra')
          }}
        />
      )}
    </main>
  )
}

interface PropsPasso {
  r: RascunhoObra
  mudar: (p: Partial<RascunhoObra>) => void
  seguir: () => void
}

function PassoObra({ r, mudar, seguir }: PropsPasso) {
  return (
    <section class="cartao" aria-labelledby="t-obra">
      <h2 id="t-obra">Obra</h2>
      <label for="no-codigo">Código da obra</label>
      <input id="no-codigo" value={r.codigo} autoCapitalize="characters" placeholder="ex.: EX2" maxLength={30} onInput={(e) => mudar({ codigo: normalizarCodigo(valor(e)) })} />
      <p class="discreto">Curto, sem espaço: letras, números, - ou _. Identifica a obra em todos os aparelhos.</p>
      <label for="no-nome">Nome da obra</label>
      <input id="no-nome" value={r.nome} placeholder="ex.: Obra Exemplo 2" onInput={(e) => mudar({ nome: valor(e) })} />
      <label for="no-empresa">Empresa (opcional)</label>
      <input id="no-empresa" value={r.empresa} placeholder="ex.: Construtora Exemplo" onInput={(e) => mudar({ empresa: valor(e) })} />
      <div class="acoes">
        <button type="button" class="principal" onClick={seguir}>
          Seguir para os pavimentos
        </button>
      </div>
    </section>
  )
}

function PassoPavimentos({ r, mudar, seguir }: PropsPasso) {
  const [subsolos, setSubsolos] = useState(0)
  const [tipos, setTipos] = useState(4)
  const [cobertura, setCobertura] = useState(true)
  const pavs = r.pavimentos
  const trocar = (i: number, j: number) => {
    const l = [...pavs]
    ;[l[i], l[j]] = [l[j], l[i]]
    mudar({ pavimentos: l })
  }
  // na tela, de cima para baixo como no prédio; guardado de baixo para cima (ordem do banco)
  const indices = pavs.map((_, i) => i).reverse()
  return (
    <section class="cartao" aria-labelledby="t-pav">
      <h2 id="t-pav">Pavimentos</h2>
      {!pavs.length && (
        <div class="no-atalho">
          <p>Preencha rápido e ajuste depois:</p>
          <div class="no-linha">
            <label>
              Subsolos
              <input type="number" min={0} max={9} value={subsolos} onInput={(e) => setSubsolos(Math.max(0, Math.min(9, Number(valor(e)) || 0)))} />
            </label>
            <label>
              Pavimentos acima do térreo
              <input type="number" min={0} max={80} value={tipos} onInput={(e) => setTipos(Math.max(0, Math.min(80, Number(valor(e)) || 0)))} />
            </label>
          </div>
          <label class="no-marcar">
            <input type="checkbox" checked={cobertura} onChange={(e) => setCobertura((e.target as HTMLInputElement).checked)} /> Cobertura
          </label>
          <button type="button" onClick={() => mudar({ pavimentos: pavimentosPadrao(subsolos, tipos, cobertura) })}>
            Preencher a lista
          </button>
        </div>
      )}
      {pavs.length > 0 && <p class="discreto">De cima para baixo, como no prédio. Toque no nome para mudar.</p>}
      <ol class="no-lista" reversed>
        {indices.map((i) => (
          <li key={i} class="no-pav">
            <input aria-label={`Pavimento ${i + 1}`} value={pavs[i]} onInput={(e) => mudar({ pavimentos: pavs.map((p, k) => (k === i ? valor(e) : p)) })} />
            <button type="button" aria-label={`Subir ${pavs[i]}`} disabled={i === pavs.length - 1} onClick={() => trocar(i, i + 1)}>
              ↑
            </button>
            <button type="button" aria-label={`Descer ${pavs[i]}`} disabled={i === 0} onClick={() => trocar(i, i - 1)}>
              ↓
            </button>
            <button type="button" aria-label={`Tirar ${pavs[i]}`} onClick={() => mudar({ pavimentos: pavs.filter((_, k) => k !== i) })}>
              ✕
            </button>
          </li>
        ))}
      </ol>
      <div class="acoes">
        <button type="button" onClick={() => mudar({ pavimentos: [...pavs, ''] })}>
          + Pavimento no alto
        </button>
        <button type="button" class="principal" onClick={seguir}>
          Seguir para as plantas
        </button>
      </div>
    </section>
  )
}

function PassoFichas({ r, mudar, seguir }: PropsPasso) {
  const [editando, setEditando] = useState<number | null>(null)
  const mudarFicha = (i: number, f: FichaRascunho) => mudar({ fichas: r.fichas.map((x, k) => (k === i ? f : x)) })
  if (editando !== null && r.fichas[editando])
    return (
      <EditorFicha
        ficha={r.fichas[editando]}
        mudar={(f) => mudarFicha(editando, f)}
        fechar={() => setEditando(null)}
        tirar={() => {
          if (!confirm(`Tirar a ficha ${r.fichas[editando].codigo || 'sem código'}?`)) return
          mudar({ fichas: r.fichas.filter((_, k) => k !== editando) })
          setEditando(null)
        }}
      />
    )
  return (
    <section class="cartao" aria-labelledby="t-fichas">
      <h2 id="t-fichas">Fichas de verificação</h2>
      {!r.fichas.length && <p class="discreto">Sem fichas</p>}
      <ul class="no-lista">
        {r.fichas.map((f, i) => (
          <li key={i}>
            <button type="button" class="no-ficha" onClick={() => setEditando(i)}>
              <strong>{f.codigo || 'Sem código'}</strong> {f.titulo || 'Sem título'}
              <span class="discreto">
                {f.itens.length} {f.itens.length === 1 ? 'item' : 'itens'} · {f.aplica_a.map((a) => TIPOS_DE_PECA.find((t) => t.id === a)?.nome).join(', ') || 'não diz a que se aplica'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div class="acoes">
        <button
          type="button"
          onClick={() => {
            mudar({ fichas: [...r.fichas, fichaVazia()] })
            setEditando(r.fichas.length)
          }}
        >
          + Nova ficha
        </button>
        <button type="button" class="principal" onClick={seguir}>
          Seguir para as pessoas
        </button>
      </div>
    </section>
  )
}

function EditorFicha({ ficha: f, mudar, fechar, tirar }: { ficha: FichaRascunho; mudar: (f: FichaRascunho) => void; fechar: () => void; tirar: () => void }) {
  const [colado, setColado] = useState('')
  const [avisoColar, setAvisoColar] = useState<string | null>(null)
  const etapas = etapasDaFicha(f)
  const mudarItem = (i: number, parcial: Partial<ItemRascunho>) => mudar({ ...f, itens: f.itens.map((it, k) => (k === i ? { ...it, ...parcial } : it)) })
  const valorConcretagem = f.concretagem.modo === 'etapa' ? `etapa:${f.concretagem.etapa}` : f.concretagem.modo

  function acrescentar() {
    const { itens, ignoradas } = itensColados(colado)
    if (!itens.length) {
      setAvisoColar('Não achei itens no texto colado. Copie as colunas da planilha (com o título de cada item) e cole aqui.')
      return
    }
    mudar({ ...f, itens: [...f.itens, ...itens] })
    setColado('')
    setAvisoColar(`${itens.length} ${itens.length === 1 ? 'item acrescentado' : 'itens acrescentados'}${ignoradas ? `; ${ignoradas} linha(s) sem título ficaram de fora` : ''}.`)
  }

  return (
    <section class="cartao" aria-labelledby="t-ficha">
      <h2 id="t-ficha">Ficha {f.codigo}</h2>
      <div class="no-linha">
        <label>
          Código
          <input value={f.codigo} placeholder="ex.: EX2-PVS-01" onInput={(e) => mudar({ ...f, codigo: valor(e) })} />
        </label>
        <label class="no-curto">
          Revisão
          <input value={f.revisao} onInput={(e) => mudar({ ...f, revisao: valor(e) })} />
        </label>
      </div>
      <label>
        Título
        <input value={f.titulo} placeholder="ex.: Execução de pilares" onInput={(e) => mudar({ ...f, titulo: valor(e) })} />
      </label>
      <fieldset class="no-aplica">
        <legend>Vale para</legend>
        {TIPOS_DE_PECA.map((t) => (
          <label key={t.id} class="no-marcar">
            <input
              type="checkbox"
              checked={f.aplica_a.includes(t.id)}
              onChange={(e) => {
                const sim = (e.target as HTMLInputElement).checked
                mudar({ ...f, aplica_a: sim ? [...f.aplica_a, t.id] : f.aplica_a.filter((a) => a !== t.id) })
              }}
            />{' '}
            {t.nome}
          </label>
        ))}
      </fieldset>

      <h3>Itens ({f.itens.length})</h3>
      <details class="no-colar" open={!f.itens.length}>
        <summary>Colar do Excel</summary>
        <p class="discreto so-com-ajuda">
          Colunas: Etapa, Título, Descrição, Dispositivo, Tolerância.
          <Ajuda>Na planilha, selecione as colunas, copie e cole aqui. Com a linha de títulos, as colunas podem vir em qualquer ordem.</Ajuda>
        </p>
        <textarea aria-label="Itens colados do Excel" rows={5} value={colado} onInput={(e) => setColado((e.target as HTMLTextAreaElement).value)} />
        <button type="button" onClick={acrescentar} disabled={!colado.trim()}>
          Acrescentar os itens colados
        </button>
      </details>
      {/* fora da caixa: ela fecha sozinha quando a ficha passa a ter itens */}
      {avisoColar && <p role="status">{avisoColar}</p>}
      <ol class="no-lista">
        {f.itens.map((it, i) => (
          <li key={i} class="no-item">
            <div class="no-linha">
              <label class="no-curto">
                Etapa
                <input value={it.etapa} onInput={(e) => mudarItem(i, { etapa: valor(e) })} />
              </label>
              <label>
                {`Item ${i + 1}`}
                <input value={it.titulo} onInput={(e) => mudarItem(i, { titulo: valor(e) })} />
              </label>
            </div>
            <label>
              Descrição
              <input value={it.descricao} onInput={(e) => mudarItem(i, { descricao: valor(e) })} />
            </label>
            <div class="no-linha">
              <label>
                Dispositivo
                <input value={it.dispositivo} onInput={(e) => mudarItem(i, { dispositivo: valor(e) })} />
              </label>
              <label>
                Tolerância
                <input value={it.tolerancia} onInput={(e) => mudarItem(i, { tolerancia: valor(e) })} />
              </label>
            </div>
            <button type="button" onClick={() => mudar({ ...f, itens: f.itens.filter((_, k) => k !== i) })}>
              Tirar item {i + 1}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => mudar({ ...f, itens: [...f.itens, { etapa: f.itens[f.itens.length - 1]?.etapa ?? '', titulo: '', descricao: '', dispositivo: '', tolerancia: '' }] })}>
        + Item
      </button>

      <label for="no-concretagem">Etapa da concretagem</label>
      <select
        id="no-concretagem"
        value={valorConcretagem}
        onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value
          mudar({ ...f, concretagem: v.startsWith('etapa:') ? { modo: 'etapa', etapa: v.slice(6) } : v === 'nenhuma' ? { modo: 'nenhuma' } : { modo: 'pelo_nome' } })
        }}
      >
        <option value="pelo_nome">Descobrir pelo nome (etapa com "concret")</option>
        <option value="nenhuma">Esta ficha não tem concretagem</option>
        {etapas.filter(Boolean).map((e) => (
          <option key={e} value={`etapa:${e}`}>
            {e}
          </option>
        ))}
      </select>
      <p class="discreto">A peça fica azul ("liberada para concretar") quando tudo antes desta etapa está conforme.</p>

      <div class="acoes">
        <button type="button" class="principal" onClick={fechar}>
          Pronto
        </button>
        <button type="button" onClick={tirar}>
          Tirar esta ficha
        </button>
      </div>
    </section>
  )
}

function PassoPessoas({ r, mudar, seguir }: PropsPasso) {
  const lista = r.pessoas ?? []
  const publicada = r.publicacao?.codigo === r.codigo ? r.publicacao : undefined
  const mudarPessoa = (i: number, parcial: Partial<PessoaRascunho>) =>
    mudar({
      pessoas: lista.map((p, k) => (k === i ? { ...p, ...parcial } : p)),
    })
  function tirar(i: number) {
    const pessoas = lista.filter((_, k) => k !== i)
    // a publicação guarda as pessoas já convidadas pela posição na lista: acompanha a troca
    if (!r.publicacao) return mudar({ pessoas })
    const convidadas = r.publicacao.convidadas.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k))
    mudar({ pessoas, publicacao: { ...r.publicacao, convidadas } })
  }
  return (
    <section class="cartao" aria-labelledby="t-pessoas">
      <h2 id="t-pessoas">Quem tem acesso</h2>
      <p class="discreto">
        Só vale ao publicar no servidor (o .zip não tem conta). Com e-mail: quem já tem conta ganha o acesso na hora; quem não tem ganha quando entrar no app a primeira vez com
        esse e-mail. Sem e-mail: fica um convite esperando, e o e-mail entra depois na tela Pessoas do app. O administrador já vê todas as obras e não precisa estar aqui.
      </p>
      {lista.length === 0 && <p class="discreto">Ninguém ainda. Dá para publicar assim e dar acesso depois pela tela Pessoas do app.</p>}
      <ul class="no-lista">
        {lista.map((p, i) => {
          const feito = !!publicada?.convidadas.includes(i)
          const quem = p.nome.trim() || `pessoa ${i + 1}`
          return (
            <li key={i} class="no-peca">
              <div class="no-linha">
                <label>
                  Nome
                  <input value={p.nome} disabled={feito} placeholder="ex.: Maria Exemplo" onInput={(e) => mudarPessoa(i, { nome: valor(e) })} />
                </label>
                <label>
                  E-mail (pode ficar vazio)
                  <input
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    value={p.email}
                    disabled={feito}
                    placeholder="ex.: maria@exemplo.com"
                    onInput={(e) => mudarPessoa(i, { email: valor(e).trim() })}
                  />
                </label>
                <label class="no-curto">
                  Papel
                  <select
                    value={p.papel}
                    disabled={feito}
                    onChange={(e) =>
                      mudarPessoa(i, {
                        papel: (e.target as HTMLSelectElement).value as PessoaRascunho['papel'],
                      })
                    }
                  >
                    {PAPEIS.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p class="discreto">{PAPEIS.find((x) => x.id === p.papel)?.ajuda}</p>
              {feito ? (
                <p class="no-ok">Já tem acesso (ou convite) no servidor. Para mudar, use a tela Pessoas do app.</p>
              ) : (
                <button type="button" onClick={() => tirar(i)}>
                  Tirar {quem}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <div class="acoes">
        <button
          type="button"
          onClick={() =>
            mudar({
              pessoas: [...lista, { nome: '', email: '', papel: 'campo' }],
            })
          }
        >
          Pôr pessoa
        </button>
        <button type="button" class="principal" onClick={seguir}>
          Seguir para salvar
        </button>
      </div>
    </section>
  )
}

/** Publicar no servidor. O servidor do app (servidor.ts) só carrega ao tocar, para o .zip seguir sem conta. */
function Publicar({ r, mudar, bloqueado }: { r: RascunhoObra; mudar: (p: Partial<RascunhoObra>) => void; bloqueado: boolean }) {
  const [andando, setAndando] = useState<Progresso | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [avisosFim, setAvisosFim] = useState<string[] | null>(null)
  const publicada = r.publicacao?.codigo === r.codigo ? r.publicacao : undefined
  const pessoas = r.pessoas ?? []
  const faltam = publicada ? pessoas.filter((_, i) => !publicada.convidadas.includes(i)).length : pessoas.length
  const tudoFeito = !!publicada?.enviada && faltam === 0
  async function publicar() {
    setErro(null)
    setAvisosFim(null)
    setAndando({ etapa: 'conferir', texto: 'Abrindo a conexão…' })
    try {
      const [{ publicarObra }, { servidorDoApp }] = await Promise.all([import('./publicar'), import('./servidor')])
      const guardar = (e: EstadoPublicacao) => mudar({ publicacao: e })
      const res = await publicarObra(r, servidorDoApp, lerTiles, guardar, setAndando)
      if (res.ok) setAvisosFim(res.avisos)
      else setErro(res.erro)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setAndando(null)
    }
  }
  return (
    <section class="cartao" aria-labelledby="t-publicar">
      <h2 id="t-publicar">Publicar no servidor</h2>
      <p class="discreto">
        A obra vai para o servidor com pavimentos, plantas, peças e fichas, e as pessoas do passo 5 ganham acesso. Precisa de internet e de ter entrado no app, neste navegador, com
        a conta de administrador. Nada que já está no servidor é apagado ou trocado.
      </p>
      {publicada && !avisosFim && (
        <p class={publicada.enviada ? 'no-ok' : 'discreto'} role="status">
          {publicada.enviada
            ? `A obra ${publicada.codigo} está no servidor${faltam ? `; falta dar acesso a ${faltam} ${faltam === 1 ? 'pessoa' : 'pessoas'}` : ''}.`
            : `A publicação de ${publicada.codigo} começou e não terminou. Toque em "Continuar a publicação".`}
        </p>
      )}
      <div class="acoes">
        <button type="button" class="principal" disabled={bloqueado || !!andando || tudoFeito} onClick={publicar}>
          {andando ? andando.texto : tudoFeito ? 'Publicada' : publicada ? 'Continuar a publicação' : 'Publicar no servidor'}
        </button>
        <a class="botao" href="./" target="_blank" rel="noopener">
          Abrir o app
        </a>
      </div>
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      {avisosFim && (
        <div role="status">
          <p class="no-ok">Obra {r.codigo} publicada. No app, escolha a obra na lista para conferir.</p>
          {avisosFim.length > 0 && (
            <div class="barra atencao">
              <p>Ficaram sem acesso (corrija no passo 5 e toque em "Continuar a publicação", ou dê pela tela Pessoas do app):</p>
              <ul>
                {avisosFim.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function PassoSalvar({ r, mudar, irPara, recomecar }: { r: RascunhoObra; mudar: (p: Partial<RascunhoObra>) => void; irPara: (p: Passo) => void; recomecar: () => void }) {
  const lista = problemas(r)
  const atencao = avisos(r)
  const [salvo, setSalvo] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  async function salvar() {
    const agora = new Date()
    const nome = nomeDoZip(r, agora)
    setSalvando(true)
    setErro(null)
    let zip: Blob
    try {
      zip = await zipDoRascunho(r, agora, lerTiles)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      return
    } finally {
      setSalvando(false)
    }
    const url = URL.createObjectURL(zip)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setSalvo(`${nome} (${(zip.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB)`)
  }
  const plantas = r.plantas ?? []
  return (
    <>
      <section class="cartao" aria-labelledby="t-salvar">
      <h2 id="t-salvar">Conferir e salvar o pacote (.zip)</h2>
      <ul class="no-resumo">
        <li>
          Obra: <strong>{r.codigo || '—'}</strong> {r.nome}
        </li>
        <li>
          {r.pavimentos.length} {r.pavimentos.length === 1 ? 'pavimento' : 'pavimentos'}
        </li>
        <li>
          {r.fichas.length} {r.fichas.length === 1 ? 'ficha' : 'fichas'}, {r.fichas.reduce((s, f) => s + f.itens.length, 0)} itens
        </li>
        <li>
          {plantas.length} {plantas.length === 1 ? 'planta' : 'plantas'}, {plantas.reduce((s, p) => s + p.pecas.length, 0)} peças marcadas
        </li>
        <li>
          {(r.pessoas ?? []).length} {(r.pessoas ?? []).length === 1 ? 'pessoa' : 'pessoas'} com acesso
        </li>
      </ul>
      {lista.length > 0 ? (
        <div class="barra atencao" role="alert">
          <p>Falta acertar antes de salvar:</p>
          <ul>
            {lista.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div class="acoes">
            <button type="button" onClick={() => irPara('obra')}>
              Obra
            </button>
            <button type="button" onClick={() => irPara('pavimentos')}>
              Pavimentos
            </button>
            <button type="button" onClick={() => irPara('plantas')}>
              Plantas
            </button>
            <button type="button" onClick={() => irPara('fichas')}>
              Fichas
            </button>
            <button type="button" onClick={() => irPara('pessoas')}>
              Pessoas
            </button>
          </div>
        </div>
      ) : atencao.length ? (
        <div class="barra atencao" role="status">
          <p>Dá para salvar, mas confira:</p>
          <ul>
            {atencao.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div class="acoes">
            <button type="button" onClick={() => irPara('plantas')}>
              Plantas
            </button>
            <button type="button" onClick={() => irPara('fichas')}>
              Fichas
            </button>
          </div>
        </div>
      ) : (
        <p class="no-ok">Tudo certo para salvar.</p>
      )}
      <div class="acoes">
        <button type="button" class="principal" disabled={lista.length > 0 || salvando} onClick={salvar}>
          {salvando ? 'Montando o pacote…' : 'Salvar pacote da obra (.zip)'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm('Apagar este rascunho e começar outra obra? O que não foi salvo no .zip se perde.')) recomecar()
          }}
        >
          Começar outra obra
        </button>
      </div>
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      {salvo && (
        <p role="status" class="no-ok">
          Salvo: {salvo}. Leve este arquivo ao tablet e abra pelo botão "Trocar de obra / abrir pacote (.zip)".
        </p>
      )}
      </section>
      <Publicar r={r} mudar={mudar} bloqueado={lista.length > 0} />
    </>
  )
}
