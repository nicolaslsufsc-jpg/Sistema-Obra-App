import { useState } from 'preact/hooks'
import { textoPrazo } from '../cps'
import { cancelar, concretagemDe, dataMoldagem, idadesDoCaminhao, podeLancarLaudo, podeRegistrar, registrar, registrarPecas } from '../dados'
import { percentual } from '../relatorio'
import type { Contexto } from './ModuloConcreto'
import { corDoCaminhao, dataBR, horaBR, lerNumero, numBR, plural, Selo, Topo } from './comum'
import { nomeDaConcretagem } from '../exemplo'
import { mensagemDeFalha } from '../horarios'
import { erroDaDataDeEnsaio, ultimaDataDeEnsaio } from '../laudo'

export function TelaCaminhao({ ctx, raiz }: { ctx: Contexto; raiz: string }) {
  const { dados, obra, usuario, ir, voltar, recarregar } = ctx
  const c = dados.caminhoes.find((x) => x.raiz === raiz)
  const conc = c && concretagemDe(dados, c)
  const [lancando, setLancando] = useState<number | null>(null)
  if (!c || !conc) {
    return (
      <main class="tela">
        <Topo titulo="Caminhão" aoVoltar={voltar} />
        <p>Este caminhão foi apagado.</p>
      </main>
    )
  }
  const pav = dados.pavimentos.find((p) => p.id === conc.pavimento_id)
  const idades = idadesDoCaminhao(dados, c, conc)
  const pecas = [...(dados.pecasDe.get(c.raiz)?.values() ?? [])]
    .filter((e) => e.incluido)
    .map((e) => ({ e, peca: dados.pecaPorId.get(e.elemento_id) }))
    .sort((a, b) => (a.peca?.nome ?? '').localeCompare(b.peca?.nome ?? '', 'pt-BR', { numeric: true }))
  const pode = podeRegistrar(obra.papel)

  const apagar = async () => {
    if (!confirm(`Apagar o caminhão ${c.sequencia} (NF ${c.nota_fiscal || '—'})?\n\nO registro continua no histórico.`)) return
    await cancelar('caminhoes', obra.id, usuario.id, c)
    await recarregar()
    voltar()
  }

  const tirarPeca = async (elementoId: string, nome: string) => {
    if (!confirm(`Tirar ${nome} deste caminhão?`)) return
    await registrarPecas(obra.id, usuario.id, c.raiz, [{ elemento_id: elementoId, incluido: false, fracao: 0 }], 'manual')
    await recarregar()
  }

  return (
    <main class="tela">
      <Topo
        titulo={`Caminhão ${c.sequencia} · NF ${c.nota_fiscal || '—'}`}
        sub={`${pav?.nome ?? ''} · ${dataBR(conc.data)} · ${nomeDaConcretagem(conc)}`}
        aoVoltar={voltar}
      >
        <span class="cc-bolinha grande" style={{ background: corDoCaminhao(c.sequencia) }}>
          {c.sequencia}
        </span>
      </Topo>

      <section class="cartao">
        <h2 class="sem-topo">Corpos de prova</h2>
        <p class="discreto">
          Moldagem {dataBR(dataMoldagem(c, conc))}
          {c.cps_moldados !== null ? ` · ${plural(c.cps_moldados, 'CP moldado', 'CPs moldados')}` : ''} · fck {numBR(conc.fck_mpa)} MPa
        </p>
        <ul class="lista cc-idades">
          {idades.map((i) => (
            <li key={i.idade} class="cc-idade" data-testid={`idade-${i.idade}`}>
              <div class="cc-idade-cab">
                <strong>{i.idade} dias</strong>
                <span>{dataBR(i.dataPrevista)}</span>
                <Selo situacao={i.situacao} />
              </div>
              {i.resultados.length > 0 ? (
                <p>
                  {i.resultados.map((r) => `CP${r.numero_cp}: ${numBR(r.resistencia_mpa)}`).join(' · ')} MPa · exemplar{' '}
                  <strong>{numBR(i.exemplar)} MPa</strong>
                  {i.controle ? '' : ' (informativo)'}
                </p>
              ) : (
                <p class="discreto">{textoPrazo(i)}</p>
              )}
              {podeLancarLaudo(obra.papel) &&
                (lancando === i.idade ? (
                  <FormResultado
                    idade={i.idade}
                    moldagem={dataMoldagem(c, conc)}
                    proximo={(i.resultados.at(-1)?.numero_cp ?? 0) + 1}
                    aoSalvar={async (numero_cp, resistencia_mpa, data_ensaio) => {
                      await registrar('cp_resultados', obra.id, usuario.id, {
                        caminhao_id: c.raiz,
                        idade_dias: i.idade,
                        numero_cp,
                        resistencia_mpa,
                        data_ensaio: data_ensaio || null,
                        origem: 'manual',
                      })
                      await recarregar()
                    }}
                    aoFechar={() => setLancando(null)}
                  />
                ) : (
                  <button type="button" class="cc-pequeno" onClick={() => setLancando(i.idade)}>
                    Lançar resultado
                  </button>
                ))}
            </li>
          ))}
        </ul>
      </section>

      <section class="cartao">
        <h2 class="sem-topo">Onde foi</h2>
        {pecas.length === 0 ? (
          <p class="discreto">Sem peças desenhadas</p>
        ) : (
          <ul class="cc-pecas">
            {pecas.map(({ e, peca }) => (
              <li key={e.elemento_id}>
                <span>
                  <strong>{peca?.nome ?? '(peça fora do cadastro)'}</strong>
                  <span class="discreto">
                    {e.origem === 'manual'
                      ? ' marcada no toque'
                      : e.fracao === null
                        ? ' entrou com a área'
                        : ` ${percentual(e.fracao)} dentro${e.parcial ? ' · parcial' : ''}`}
                  </span>
                </span>
                {pode && (
                  <button type="button" class="cc-pequeno" onClick={() => tirarPeca(e.elemento_id, peca?.nome ?? 'a peça')}>
                    Tirar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button type="button" class="principal cc-largo" onClick={() => ir({ nome: 'mapa', pavimentoId: conc.pavimento_id, concretagemRaiz: conc.raiz, caminhaoRaiz: c.raiz })}>
          {pode ? 'Desenhar onde foi' : 'Ver na planta'}
        </button>
      </section>

      <section class="cartao">
        <h2 class="sem-topo">Recebimento</h2>
        <dl class="cc-dados">
          <dt>Volume</dt>
          <dd>{c.volume_m3 !== null ? `${numBR(c.volume_m3, 2)} m³` : '—'}</dd>
          <dt>Saída da usina</dt>
          <dd>{horaBR(c.saida_usina) || '—'}</dd>
          <dt>Chegada na obra</dt>
          <dd>{horaBR(c.chegada_obra) || '—'}</dd>
          <dt>Descarga</dt>
          <dd>
            {horaBR(c.inicio_descarga) || '—'} até {horaBR(c.fim_descarga) || '—'}
          </dd>
          <dt>Slump medido</dt>
          <dd>{c.slump_medido_cm !== null ? `${numBR(c.slump_medido_cm)} cm` : '—'}</dd>
          <dt>Água adicionada</dt>
          <dd>{c.agua_adicionada_l !== null ? `${numBR(c.agua_adicionada_l)} L` : 'não'}</dd>
        </dl>
        {c.observacao && <p>{c.observacao}</p>}
      </section>

      {pode && (
        <div class="acoes">
          <button type="button" onClick={() => ir({ nome: 'corrigir-caminhao', raiz: c.raiz })}>
            Corrigir dados
          </button>
          <button type="button" class="perigo" onClick={apagar}>
            Apagar caminhão
          </button>
        </div>
      )}
    </main>
  )
}

function FormResultado({
  idade,
  moldagem,
  proximo,
  aoSalvar,
  aoFechar,
}: {
  idade: number
  /** AAAA-MM-DD: o ensaio não pode ser antes disso nem depois de hoje. */
  moldagem: string
  proximo: number
  aoSalvar: (numero: number, mpa: number, data: string) => Promise<void>
  aoFechar: () => void
}) {
  const [numero, setNumero] = useState(String(proximo))
  const [mpa, setMpa] = useState('')
  const [data, setData] = useState('')
  const [erro, setErro] = useState('')
  const [erroData, setErroData] = useState('')
  return (
    <form
      class="cc-form-resultado"
      noValidate
      onSubmit={async (ev) => {
        ev.preventDefault()
        const n = Number(numero)
        const v = lerNumero(mpa)
        if (!Number.isInteger(n) || n < 1 || n > 24) return setErro('Número do CP de 1 a 24.')
        if (v === null || Number.isNaN(v) || v < 0 || v > 200) return setErro('Resistência em MPa, de 0 a 200.')
        const ed = erroDaDataDeEnsaio(data || null, moldagem)
        setErroData(ed ?? '')
        if (ed) return setErro('')
        setErro('')
        try {
          await aoSalvar(n, v, data)
        } catch (err) {
          return setErro(mensagemDeFalha(err))
        }
        setNumero(String(n + 1))
        setMpa('')
      }}
    >
      <div class="cc-campos">
        <label>
          CP nº
          <input inputMode="numeric" value={numero} onInput={(e) => setNumero(e.currentTarget.value)} />
        </label>
        <label>
          MPa ({idade} dias)
          <input inputMode="decimal" value={mpa} onInput={(e) => setMpa(e.currentTarget.value)} autoFocus />
        </label>
        <label>
          Data do ensaio
          <input
            type="date"
            value={data}
            min={moldagem}
            max={ultimaDataDeEnsaio()}
            aria-invalid={erroData ? true : undefined}
            onInput={(e) => {
              setData(e.currentTarget.value)
              setErroData('')
            }}
          />
          {erroData && (
            <span class="erro" role="alert" data-testid="erro-data-ensaio">
              {erroData}
            </span>
          )}
        </label>
      </div>
      {erro && <p class="erro">{erro}</p>}
      <div class="acoes-linha">
        <button type="submit" class="principal">
          Salvar resultado
        </button>
        <button type="button" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </form>
  )
}
