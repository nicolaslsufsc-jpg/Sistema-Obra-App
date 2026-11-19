import { useEffect, useState } from 'preact/hooks'
import { conta } from '../nucleo/servicos'
import { mensagemParaTela } from '../nucleo/erros'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import { PAPEL } from './rotulos'

export function Obras({
  usuario,
  aoEscolher,
  aoSair,
  local,
}: {
  usuario: UsuarioLocal
  aoEscolher: (obra: ObraLocal) => void
  aoSair?: () => void
  /** Modo sem conta: a lista vem só do aparelho e não há servidor para atualizar. */
  local?: boolean
}) {
  const [obras, setObras] = useState<ObraLocal[] | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  /** O servidor respondeu pelo menos uma vez: só então "lista vazia" quer dizer "sem acesso". */
  const [conferido, setConferido] = useState(false)

  async function atualizar() {
    if (!navigator.onLine) {
      setErro('Sem internet: mostrando a lista guardada no aparelho.')
      return
    }
    setAtualizando(true)
    const r = await conta.atualizarObras(usuario.id)
    setAtualizando(false)
    if (Array.isArray(r)) {
      setObras(r)
      setConferido(true)
      setErro(null)
    } else {
      setErro(`Não foi possível buscar a lista de obras (${mensagemParaTela(r)}). Toque em "Atualizar lista" para tentar de novo.`)
    }
  }

  useEffect(() => {
    conta.obrasLocais().then(setObras)
    if (!local) atualizar()
  }, [])

  return (
    <main class="tela tela-estreita">
      <h1>Escolha a obra</h1>
      <p class="discreto">{local ? 'Sem conta · tudo neste aparelho' : usuario.email}</p>
      {erro && <p class="aviso">{erro}</p>}
      {obras === null && <p>Carregando…</p>}
      {local && obras !== null && obras.length === 0 && <p>Nenhuma obra neste aparelho. Abra o app pela pasta da obra.</p>}
      {conferido && obras !== null && obras.length === 0 && !atualizando && (
        <div class="cartao">
          <p>
            <strong>Sua conta ainda não tem acesso a nenhuma obra.</strong>
          </p>
          <p>
            Peça ao administrador para liberar o acesso do e-mail <strong>{usuario.email}</strong>. Depois toque em
            "Atualizar lista".
          </p>
        </div>
      )}
      <ul class="lista">
        {(obras ?? []).map((o) => (
          <li key={o.id}>
            <button type="button" class="item-obra" onClick={() => aoEscolher(o)}>
              <span class="codigo-obra">{o.codigo}</span>
              <span>{o.nome}</span>
              <span class="discreto">{PAPEL[o.papel]}</span>
            </button>
          </li>
        ))}
      </ul>
      <div class="acoes">
        {!local && (
          <>
            <button type="button" onClick={atualizar} disabled={atualizando}>
              {atualizando ? 'Atualizando…' : 'Atualizar lista'}
            </button>
            <button type="button" onClick={aoSair}>
              Sair
            </button>
          </>
        )}
      </div>
    </main>
  )
}
