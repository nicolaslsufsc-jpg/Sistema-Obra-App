import { useState } from 'preact/hooks'
import { podeGerir, registrarEmpresa } from '../dados'
import type { Contexto } from './ModuloProjetos'
import { Campo, dataBR, plural, rotuloRevisao, Selo, SeloSituacao, Topo } from './comum'

export function TelaEmpresas({ ctx }: { ctx: Contexto }) {
  const { dados, obra, usuario, ir, voltar, recarregar, avisar } = ctx
  const [nome, setNome] = useState('')
  const [contato, setContato] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const salvar = async (ev: Event) => {
    ev.preventDefault()
    const n = nome.trim()
    if (!n) {
      setErro('Informe o nome da empresa.')
      return
    }
    if (dados.empresas.some((e) => e.nome.trim().toLowerCase() === n.toLowerCase())) {
      setErro('Já existe empresa com esse nome nesta obra.')
      return
    }
    setErro('')
    setSalvando(true)
    await registrarEmpresa(obra.id, usuario.id, { nome: n, contato })
    await recarregar()
    setNome('')
    setContato('')
    setSalvando(false)
    avisar(`Empresa ${n} cadastrada.`)
  }

  return (
    <main class="tela">
      <Topo titulo="Empresas" sub={plural(dados.empresas.length, 'empresa que recebe cópias', 'empresas que recebem cópias')} aoVoltar={voltar} />
      {dados.empresas.length === 0 ? (
        <p class="pj-vazio">Nenhuma empresa cadastrada ainda.</p>
      ) : (
        <ul class="pj-historico" data-testid="empresas">
          {dados.empresas.map((e) => {
            const sits = dados.situacoes.filter((s) => s.empresa_id === e.id)
            const emCampo = sits.filter((s) => s.situacao !== 'DEVOLVIDO').length
            const recolher = sits.filter((s) => s.situacao === 'RECOLHER').length
            const abertas = sits.filter((s) => s.situacao !== 'DEVOLVIDO').sort((a, b) => (dados.documentoPorId.get(a.documento_id)?.codigo ?? '').localeCompare(dados.documentoPorId.get(b.documento_id)?.codigo ?? ''))
            return (
              <li key={e.id}>
                <strong>{e.nome}</strong>
                {!e.ativa && <Selo classe="neutro">inativa</Selo>}
                <span class="discreto">
                  {e.contato ? `${e.contato} · ` : ''}
                  {emCampo === 0 ? 'nenhuma cópia em campo' : plural(emCampo, 'prancha em campo', 'pranchas em campo')}
                </span>
                {recolher > 0 && <Selo classe="ruim">{recolher} a recolher</Selo>}
                {abertas.length > 0 && (
                  <details class="pj-detalhe">
                    <summary>O que está com {e.nome}</summary>
                    <ul class="lista">
                      {abertas.map((s) => (
                        <li key={s.documento_id}>
                          <button type="button" class="pj-linha" onClick={() => ir({ nome: 'prancha', documentoId: s.documento_id })}>
                            <span>
                              <span class="codigo">{dados.documentoPorId.get(s.documento_id)?.codigo ?? s.documento_id}</span>
                              <span class="discreto">
                                tem {rotuloRevisao(s.revisao_em_campo_id ? dados.revisaoPorId.get(s.revisao_em_campo_id) : null)}
                                {s.ultimo_evento ? ` · ${dataBR(s.ultimo_evento)}` : ''}
                              </span>
                            </span>
                            <span class="pj-selos">
                              <SeloSituacao situacao={s.situacao} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {podeGerir(obra.papel) ? (
        <form onSubmit={salvar} class="pj-form cartao" noValidate>
          <h2 class="sem-topo">Cadastrar empresa</h2>
          <Campo rotulo="Nome" erro={erro}>
            <input value={nome} onInput={(e) => setNome(e.currentTarget.value)} maxLength={120} />
          </Campo>
          <Campo rotulo="Contato (telefone, e-mail ou responsável)">
            <input value={contato} onInput={(e) => setContato(e.currentTarget.value)} maxLength={200} />
          </Campo>
          <button type="submit" class="principal" disabled={salvando}>
            Cadastrar
          </button>
          <p class="discreto">Para tirar uma empresa da lista, peça ao administrador (o cadastro não é apagado, só marcado como inativo).</p>
        </form>
      ) : (
        <p class="discreto">Só o gestor cadastra empresas.</p>
      )}
    </main>
  )
}
