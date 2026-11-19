import { useEffect, useRef, useState } from 'preact/hooks'
import { pessoas } from '../nucleo/servicos'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import type { ContasSemAcesso, PapelDeAcesso, PessoaDaObra } from '../nucleo/pessoas'
import { PAPEL } from './rotulos'

const PAPEIS: PapelDeAcesso[] = ['campo', 'gestor', 'leitura']

const AVISO_TIRAR =
  'Registros já enviados continuam na obra. O que a pessoa fez sem internet e ainda não sincronizou fica preso no celular dela enquanto estiver sem acesso: peça para ela abrir o app com internet antes.'

type Mensagem = { tipo: 'ok' | 'erro'; texto: string } | null

/** Só para o admin: quem tem acesso à obra, quem entrou no app e ainda não tem acesso. */
export function Pessoas({ obra, usuario, aoVoltar }: { obra: ObraLocal; usuario: UsuarioLocal; aoVoltar: () => void }) {
  const [lista, setLista] = useState<PessoaDaObra[] | null>(null)
  const [semAcesso, setSemAcesso] = useState<ContasSemAcesso | null>(null)
  const [erroSemAcesso, setErroSemAcesso] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<Mensagem>(null)
  const [ocupado, setOcupado] = useState(false)
  const [email, setEmail] = useState('')
  const [papelNovo, setPapelNovo] = useState<PapelDeAcesso>('campo')
  const [filtro, setFiltro] = useState('')
  const [papelPorConta, setPapelPorConta] = useState<Record<string, PapelDeAcesso>>({})
  const faixa = useRef<HTMLDivElement>(null)

  async function carregar() {
    if (!navigator.onLine) {
      setMensagem({ tipo: 'erro', texto: 'Sem internet: a lista de pessoas precisa de conexão.' })
      return
    }
    const [a, b] = await Promise.all([pessoas.daObra(obra.id), pessoas.semAcesso(obra.id)])
    if (typeof a === 'string') {
      setMensagem({ tipo: 'erro', texto: `Não foi possível buscar a lista de pessoas (${a})` })
    } else {
      setLista(a)
    }
    if (typeof b === 'string') {
      setErroSemAcesso(b)
    } else {
      setSemAcesso(b)
      setErroSemAcesso(null)
    }
  }

  useEffect(() => {
    carregar()
  }, [obra.id])

  /** Roda uma ação, mostra o resultado onde a pessoa vê e recarrega a lista. true = deu certo. */
  async function executar(oQue: string, acao: () => Promise<string | null>, sucesso: string): Promise<boolean> {
    if (!navigator.onLine) {
      setMensagem({ tipo: 'erro', texto: `Sem internet: ${oQue} precisa de conexão. Nada foi alterado.` })
      faixa.current?.scrollIntoView({ block: 'nearest' })
      return false
    }
    setOcupado(true)
    setMensagem(null)
    try {
      const falha = await acao()
      if (falha) {
        setMensagem({ tipo: 'erro', texto: `Não foi possível ${oQue}: ${falha}` })
        return false
      }
      setMensagem({ tipo: 'ok', texto: sucesso })
      await carregar()
      return true
    } finally {
      setOcupado(false)
      faixa.current?.scrollIntoView({ block: 'nearest' })
    }
  }

  async function darAcesso(alvo: string, papel: PapelDeAcesso): Promise<boolean> {
    if (!confirm(`Dar acesso de ${PAPEL[papel]} à obra ${obra.codigo} para ${alvo}?`)) return false
    const ok = await executar(
      `dar acesso a ${alvo}`,
      () => pessoas.darAcesso(alvo, obra.id, papel),
      `${alvo} agora é ${PAPEL[papel]} na ${obra.codigo}.`,
    )
    return ok
  }

  async function mudarPapel(p: PessoaDaObra, novo: PapelDeAcesso) {
    const reverter = () => setLista((l) => (l ? [...l] : l)) // o select volta ao valor guardado
    if (p.papel === novo) return
    const aviso = novo === 'leitura' && p.papel !== 'leitura' ? `\n\n${AVISO_TIRAR}` : ''
    if (!confirm(`Mudar o papel de ${p.email} na obra ${obra.codigo} de ${PAPEL[p.papel]} para ${PAPEL[novo]}?${aviso}`)) {
      reverter()
      return
    }
    // Mostra o papel novo já (estado otimista); volta ao antigo se falhar.
    setLista((l) => (l ? l.map((x) => (x.usuario_id === p.usuario_id ? { ...x, papel: novo } : x)) : l))
    const ok = await executar(
      `mudar o papel de ${p.email}`,
      () => pessoas.mudarPapel(p.usuario_id, obra.id, novo),
      `${p.email} agora é ${PAPEL[novo]}.`,
    )
    if (!ok) setLista((l) => (l ? l.map((x) => (x.usuario_id === p.usuario_id ? { ...x, papel: p.papel } : x)) : l))
  }

  async function tirarAcesso(p: PessoaDaObra) {
    if (!confirm(`Tirar o acesso de ${p.email} à obra ${obra.codigo}?\n\n${AVISO_TIRAR}`)) return
    await executar(
      `tirar o acesso de ${p.email}`,
      () => pessoas.tirarAcesso(p.usuario_id, obra.id),
      `${p.email} não tem mais acesso à ${obra.codigo}.`,
    )
  }

  const contasFiltradas = (semAcesso?.contas ?? []).filter((c) => c.email.includes(filtro.trim().toLowerCase()))

  return (
    <main class="tela">
      <h1>Pessoas da obra {obra.codigo}</h1>
      <p class="discreto">
        Quem tem acesso a esta obra e com que papel. Campo registra em campo; gestor também cadastra; somente
        leitura só consulta. Precisa de internet.
      </p>

      <div ref={faixa} class={`faixa-mensagem ${mensagem ? mensagem.tipo : 'vazia'}`}>
        {mensagem && (
          <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} data-testid="mensagem">
            {mensagem.texto}
          </p>
        )}
      </div>

      <section>
        <h2>Com acesso</h2>
        {lista === null && <p>Carregando…</p>}
        <ul class="lista">
          {(lista ?? []).map((p) => (
            <li key={p.usuario_id} class="cartao pessoa" data-testid="com-acesso">
              <span>
                <strong>{p.email}</strong>
                {p.nome && p.nome !== p.email.split('@')[0] && <span class="discreto"> · {p.nome}</span>}
              </span>
              {p.papel === 'admin' ? (
                <span class="discreto">Administrador (vê todas as obras)</span>
              ) : (
                <span class="acoes-linha">
                  <label class="sem-margem">
                    <span class="discreto">Papel </span>
                    <select
                      aria-label={`Papel de ${p.email}`}
                      value={p.papel}
                      disabled={ocupado}
                      onChange={(e) => mudarPapel(p, (e.target as HTMLSelectElement).value as PapelDeAcesso)}
                    >
                      {PAPEIS.map((x) => (
                        <option key={x} value={x}>
                          {PAPEL[x]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={`Tirar acesso de ${p.email}`}
                    disabled={ocupado || p.usuario_id === usuario.id}
                    onClick={() => tirarAcesso(p)}
                  >
                    Tirar acesso
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Dar acesso</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            darAcesso(email.trim().toLowerCase(), papelNovo).then((ok) => ok && setEmail(''))
          }}
        >
          <label for="email-acesso">E-mail da pessoa (ela precisa ter entrado no app uma vez)</label>
          <input
            id="email-acesso"
            type="email"
            inputMode="email"
            required
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          />
          <label for="papel-novo">Papel</label>
          <select
            id="papel-novo"
            value={papelNovo}
            onChange={(e) => setPapelNovo((e.target as HTMLSelectElement).value as PapelDeAcesso)}
          >
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {PAPEL[p]}
              </option>
            ))}
          </select>
          <button type="submit" class="principal" disabled={ocupado || !email.includes('@')}>
            Dar acesso
          </button>
        </form>
      </section>

      <section>
        <h2>Entraram no app e não têm acesso a esta obra</h2>
        {erroSemAcesso && (
          <p class="erro" role="alert">
            Não foi possível buscar quem entrou sem acesso ({erroSemAcesso}). Toque em "Atualizar".
          </p>
        )}
        {semAcesso && semAcesso.total === 0 && <p class="discreto">Ninguém esperando acesso.</p>}
        {semAcesso && semAcesso.total > 0 && (
          <details data-testid="sem-acesso-lista">
            <summary>
              {semAcesso.total} {semAcesso.total === 1 ? 'conta' : 'contas'}
              {semAcesso.total > semAcesso.contas.length ? ` (mostrando as ${semAcesso.contas.length} mais recentes)` : ''}
            </summary>
            {semAcesso.total > semAcesso.contas.length && (
              <p class="discreto">Para as outras, digite o e-mail em "Dar acesso".</p>
            )}
            {semAcesso.contas.length > 5 && (
              <>
                <label for="filtro-contas">Procurar por e-mail</label>
                <input id="filtro-contas" type="search" value={filtro} onInput={(e) => setFiltro((e.target as HTMLInputElement).value)} />
              </>
            )}
            <ul class="lista">
              {contasFiltradas.map((c) => (
                <li key={c.usuario_id} class="cartao pessoa" data-testid="sem-acesso">
                  <span>
                    <strong>{c.email}</strong>
                    <span class="discreto">
                      {' '}
                      desde {new Date(c.criada_em).toLocaleDateString('pt-BR')}
                      {c.em_outra_obra ? ' · já está em outra obra' : ''}
                    </span>
                  </span>
                  <span class="acoes-linha">
                    <label class="sem-margem">
                      <span class="discreto">Papel </span>
                      <select
                        aria-label={`Papel para ${c.email}`}
                        value={papelPorConta[c.usuario_id] ?? 'campo'}
                        disabled={ocupado}
                        onChange={(e) =>
                          setPapelPorConta((m) => ({ ...m, [c.usuario_id]: (e.target as HTMLSelectElement).value as PapelDeAcesso }))
                        }
                      >
                        {PAPEIS.map((x) => (
                          <option key={x} value={x}>
                            {PAPEL[x]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      aria-label={`Dar acesso a ${c.email}`}
                      disabled={ocupado}
                      onClick={() => darAcesso(c.email, papelPorConta[c.usuario_id] ?? 'campo')}
                    >
                      Dar acesso
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <div class="acoes">
        <button type="button" onClick={aoVoltar}>
          Voltar para a obra
        </button>
        <button type="button" onClick={carregar} disabled={ocupado}>
          Atualizar
        </button>
      </div>
    </main>
  )
}
