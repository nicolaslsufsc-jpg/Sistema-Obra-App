// Versão PC, página "Como conferir" (ideia 14, pendência 11, 25/11/2026): o administrador troca a unidade de
// conferência de uma ficha numa obra já publicada. Grava uma versão nova de fvs_regras (só inclusão, pela fila
// do núcleo, funciona sem internet); a anterior fica como histórico. A conta está em trocar_unidade.ts.
import { useEffect, useState } from 'preact/hooks'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import { sincronizador } from '../nucleo/servicos'
import { lerRegras, type Unidade } from '../fvs/regras'
import { UNIDADES } from './modelo'
import { dataBR, linhaVigente, nomeDaUnidade, regrasComTroca, unidadeNaoServe, unidadesDaObra, type FichaDaObra, type LinhaDeRegras, type UnidadeNaTela } from './trocar_unidade'
import './unidades.css'

function hojeLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

interface Lido {
  fichas: FichaDaObra[]
  linhas: LinhaDeRegras[]
}

async function ler(obraId: string): Promise<Lido> {
  const [fic, reg] = await Promise.all([sincronizador.linhas('fichas_modelo', obraId), sincronizador.linhas('fvs_regras', obraId)])
  return {
    fichas: fic.map((f) => ({ codigo: String(f.codigo ?? ''), titulo: String(f.titulo ?? ''), aplica_a: (f.aplica_a as string[]) ?? [], revisao: String(f.revisao ?? '0') })),
    linhas: reg as LinhaDeRegras[],
  }
}

export function TelaUnidades({ obra, usuario, versao = 0 }: { obra: ObraLocal; usuario: UsuarioLocal; versao?: number }) {
  const [lido, setLido] = useState<Lido | null>(null)
  const [erroLer, setErroLer] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [gravada, setGravada] = useState('')
  const [releitura, setReleitura] = useState(0)
  const hoje = hojeLocal()
  const admin = obra.papel === 'admin'

  useEffect(() => {
    let vivo = true
    ler(obra.id)
      .then((l) => vivo && setLido(l))
      .catch((e) => vivo && setErroLer(e instanceof Error ? e.message : String(e)))
    return () => {
      vivo = false
    }
  }, [obra.id, versao, releitura])

  const linhas = lido ? unidadesDaObra(lido.fichas, lerRegras(linhaVigente(lido.linhas)?.regras), hoje) : []

  return (
    <main class="tela pc-pagina un-pagina" data-testid="pc-pagina-unidades">
      <div class="pc-titulo">
        <h1>Como conferir cada ficha</h1>
        <p>Por peça, parede, ambiente, trecho, área ou pavimento. Trocar no meio da obra não apaga nada: o que já foi conferido continua guardado em cada local, e a troca vale a partir da data escolhida.</p>
      </div>
      {!admin && (
        <p class="un-aviso" data-testid="un-so-admin">
          Só o administrador troca a forma de conferir. Aqui você vê como cada ficha está.
        </p>
      )}
      {gravada && (
        <p class="un-ok" role="status" data-testid="un-gravada">
          {gravada}
        </p>
      )}
      {erroLer && <p role="alert">Não deu para ler a obra neste aparelho: {erroLer}</p>}
      {!lido && !erroLer && <p aria-busy="true">Lendo as fichas…</p>}
      {lido && !linhas.length && <p data-testid="un-sem-fichas">Esta obra ainda não tem ficha publicada.</p>}
      <ul class="un-lista">
        {linhas.map((l) => (
          <li key={l.ficha.codigo} class="un-ficha" data-testid={`un-ficha-${l.ficha.codigo}`}>
            <div class="un-cabeca">
              <div>
                <b>{l.ficha.codigo}</b> <span>{l.ficha.titulo}</span>
              </div>
              <p class="un-hoje" data-testid="un-hoje">
                Hoje: <b>{nomeDaUnidade(l.hoje)}</b>
                {l.padrao && ' (padrão)'}
                {l.depois && (
                  <>
                    {' '}
                    · a partir de {dataBR(l.depois.desde)}: <b>{nomeDaUnidade(l.depois.unidade)}</b>
                  </>
                )}
              </p>
              {admin && aberta !== l.ficha.codigo && (
                <button type="button" class="pc-bt" data-testid="un-trocar" onClick={() => (setAberta(l.ficha.codigo), setGravada(''))}>
                  Trocar
                </button>
              )}
            </div>
            {l.historico.length > 0 && (
              <p class="un-historico">
                Histórico: {l.historico.map((u) => `${nomeDaUnidade(u.unidade)} desde ${dataBR(u.desde)}`).join(' · ')}
              </p>
            )}
            {admin && aberta === l.ficha.codigo && lido && (
              <Troca
                linha={l}
                linhas={lido.linhas}
                hoje={hoje}
                aoCancelar={() => setAberta(null)}
                aoGravar={async (regras, texto) => {
                  await sincronizador.registrar('fvs_regras', obra.id, usuario.id, { regras })
                  setAberta(null)
                  setGravada(texto)
                  setReleitura((n) => n + 1)
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}

function Troca({
  linha,
  linhas,
  hoje,
  aoCancelar,
  aoGravar,
}: {
  linha: UnidadeNaTela
  linhas: readonly LinhaDeRegras[]
  hoje: string
  aoCancelar: () => void
  aoGravar: (regras: Record<string, unknown>, texto: string) => Promise<void>
}) {
  const [unidade, setUnidade] = useState<Unidade | ''>('')
  const [desde, setDesde] = useState(linha.depois?.desde ?? hoje)
  const [erro, setErro] = useState('')
  const [gravando, setGravando] = useState(false)
  const escolhida = UNIDADES.find((u) => u.id === unidade)

  const gravar = async () => {
    if (!unidade) return setErro('Escolha como conferir.')
    const r = regrasComTroca(linhas, linha.ficha, unidade, desde, hoje)
    if (!r.ok) return setErro(r.erro)
    setGravando(true)
    try {
      await aoGravar(r.regras, `Ficha ${linha.ficha.codigo}: ${nomeDaUnidade(unidade).toLowerCase()} a partir de ${dataBR(desde)}. Vai para o servidor na próxima sincronização.`)
    } catch (e) {
      setErro(`Não deu para gravar: ${e instanceof Error ? e.message : String(e)}`)
      setGravando(false)
    }
  }

  return (
    <div class="un-troca" data-testid="un-troca">
      <label>
        Como conferir
        <select value={unidade} data-testid="un-unidade" onChange={(e) => (setUnidade((e.target as HTMLSelectElement).value as Unidade), setErro(''))}>
          <option value="">Escolha…</option>
          {UNIDADES.map((u) => (
            <option key={u.id} value={u.id} disabled={!!unidadeNaoServe(linha.ficha, u.id)}>
              {u.nome}
            </option>
          ))}
        </select>
      </label>
      {escolhida && <p class="un-ajuda">{escolhida.ajuda}.</p>}
      <label>
        A partir de
        <input type="date" value={desde} min={hoje} data-testid="un-desde" onInput={(e) => (setDesde((e.target as HTMLInputElement).value), setErro(''))} />
      </label>
      <p class="un-ajuda">
        Antes dessa data vale {nomeDaUnidade(linha.depois?.unidade ?? linha.hoje).toLowerCase()}. O que já foi conferido continua guardado em cada local; nada é apagado.
      </p>
      {erro && (
        <p role="alert" class="un-erro" data-testid="un-erro">
          {erro}
        </p>
      )}
      <div class="un-acoes">
        <button type="button" class="pc-bt pc-principal" data-testid="un-gravar" disabled={gravando} onClick={gravar}>
          {gravando ? 'Gravando…' : 'Gravar troca'}
        </button>
        <button type="button" class="pc-bt" data-testid="un-cancelar" disabled={gravando} onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
