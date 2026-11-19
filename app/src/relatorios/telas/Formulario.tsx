// Formulário genérico: as seções do diário e os dados da obra só descrevem os campos (tipos.ts).
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { lerNumero } from '../../concreto/telas/comum'
import type { Campo } from '../tipos'
import { Chips, erroEmTexto, numBR } from './comum'

export type Valores = Record<string, unknown>

/** A mesma data mínima das tabelas do banco. */
export const DATA_MINIMA = '2000-01-01'

function paraTexto(c: Campo, v: unknown): string {
  if (v === null || v === undefined) return c.padrao ?? ''
  if (c.tipo === 'numero') return numBR(v, 3).replace(/\./g, '')
  return String(v)
}

/** Confere e converte. Devolve os erros por campo (vazio = tudo certo). */
export function validar(campos: readonly Campo[], textos: Record<string, string>): { valores: Valores; erros: Record<string, string> } {
  const valores: Valores = {}
  const erros: Record<string, string> = {}
  for (const c of campos) {
    const t = (textos[c.nome] ?? '').trim()
    if (!t) {
      if (c.obrigatorio) erros[c.nome] = `Preencha: ${c.rotulo}.`
      valores[c.nome] = null
      continue
    }
    if (c.tipo === 'numero' || c.tipo === 'inteiro') {
      const n = lerNumero(t)
      const faixa = c.min !== undefined && c.max !== undefined ? ` de ${c.min} a ${c.max}` : c.min !== undefined ? ` a partir de ${c.min}` : ''
      if (n === null || Number.isNaN(n) || (c.tipo === 'inteiro' && !Number.isInteger(n)) || (c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) {
        erros[c.nome] = `${c.rotulo}: número${c.tipo === 'inteiro' ? ' inteiro' : ''}${faixa}.`
        continue
      }
      valores[c.nome] = n
    } else {
      if (c.max && t.length > c.max) erros[c.nome] = `${c.rotulo}: no máximo ${c.max} letras.`
      // ano digitado pela metade (0026) seria recusado pelo servidor só na hora do envio
      if (c.tipo === 'data' && t < DATA_MINIMA) erros[c.nome] = `${c.rotulo}: confira o ano.`
      valores[c.nome] = t
    }
  }
  return { valores, erros }
}

export interface BotaoForm {
  texto: string
  principal?: boolean
  aoSalvar: (v: Valores, limpar: () => void) => Promise<void>
}

export function Formulario({
  campos,
  inicial,
  sugestoes,
  botoes,
  desativado,
  antesDosBotoes,
}: {
  antesDosBotoes?: ComponentChildren
  campos: readonly Campo[]
  inicial?: Record<string, unknown>
  /** coluna → valores já usados na obra */
  sugestoes?: (coluna: string) => readonly string[]
  /** Cada botão salva e decide o que vem depois. */
  botoes: readonly BotaoForm[]
  desativado?: boolean
}) {
  const [textos, setTextos] = useState<Record<string, string>>(() => Object.fromEntries(campos.map((c) => [c.nome, paraTexto(c, inicial?.[c.nome])])))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [falha, setFalha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const mudar = (nome: string, v: string) => setTextos((t) => ({ ...t, [nome]: v }))

  const salvar = async (aoSalvar: BotaoForm['aoSalvar']) => {
    if (salvando) return
    const r = validar(campos, textos)
    setErros(r.erros)
    if (Object.keys(r.erros).length > 0) return
    setSalvando(true)
    setFalha('')
    try {
      await aoSalvar(r.valores, () => setTextos((t) => Object.fromEntries(campos.map((c) => [c.nome, c.repete ? (t[c.nome] ?? '') : (c.padrao ?? '')]))))
    } catch (e) {
      setFalha(`Não foi possível salvar: ${erroEmTexto(e)}`)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form
      class="rl-form"
      onSubmit={(e) => {
        e.preventDefault()
        const b = botoes.find((x) => x.principal) ?? botoes[0]
        salvar(b.aoSalvar)
      }}
    >
      {campos.map((c) => {
        const erro = erros[c.nome]
        const lista = c.sugere ? (sugestoes?.(c.nome) ?? []) : []
        const idLista = `rl-lista-${c.nome}`
        return (
          <div class={`rl-campo${erro ? ' com-erro' : ''}`} key={c.nome}>
            <label class="sem-margem" htmlFor={c.tipo === 'opcoes' ? undefined : `rl-${c.nome}`}>
              {c.rotulo}
              {c.obrigatorio ? ' *' : ''}
            </label>
            {c.tipo === 'opcoes' ? (
              <Chips opcoes={c.opcoes ?? []} valor={textos[c.nome]} rotulo={c.rotulo} limpavel={!c.obrigatorio} desativado={desativado} teste={`campo-${c.nome}`} aoEscolher={(v) => mudar(c.nome, v ?? '')} />
            ) : c.tipo === 'longo' ? (
              <textarea id={`rl-${c.nome}`} rows={4} maxLength={c.max} disabled={desativado} value={textos[c.nome]} onInput={(e) => mudar(c.nome, e.currentTarget.value)} />
            ) : (
              <input
                id={`rl-${c.nome}`}
                type={c.tipo === 'data' ? 'date' : 'text'}
                inputMode={c.tipo === 'inteiro' ? 'numeric' : c.tipo === 'numero' ? 'decimal' : undefined}
                maxLength={c.max}
                disabled={desativado}
                value={textos[c.nome]}
                list={lista.length ? idLista : undefined}
                autoComplete="off"
                onInput={(e) => mudar(c.nome, e.currentTarget.value)}
              />
            )}
            {lista.length > 0 && (
              <datalist id={idLista}>
                {lista.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
            {erro && <p class="erro">{erro}</p>}
          </div>
        )
      })}
      {antesDosBotoes}
      {falha && <p class="erro">{falha}</p>}
      {!desativado && (
        <div class="rl-botoes">
          {botoes.map((b) => (
            <button type="button" key={b.texto} class={b.principal ? 'principal' : ''} disabled={salvando} onClick={() => salvar(b.aoSalvar)}>
              {b.texto}
            </button>
          ))}
        </div>
      )}
    </form>
  )
}
