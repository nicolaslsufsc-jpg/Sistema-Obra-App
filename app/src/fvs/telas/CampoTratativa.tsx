// Tratativa de um NC (25/11/2026, ideia 1; PBQP-H): quem resolve, prazo (só avisa), causa, casos parecidos,
// concessão com quem decidiu e, depois da reinspeção, a eficácia. Fica logo abaixo do "O que fazer?", no painel
// da planta e na tela do local do sistema. Grava sozinha como o "O que fazer?": texto 1 s depois de parar de
// digitar e ao sair do campo; botões, data e caixa na hora. Cada gravação é uma linha nova (só inclusão).
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  AVISO_ACAO_CORRETIVA,
  CAUSAS,
  camposLimpos,
  hojeLocal,
  resumoDaTratativa,
  rotuloDoPrazo,
  situacaoDoPrazo,
  TRATATIVA_VAZIA,
  tratativaMudou,
  type CamposDaTratativa,
} from '../tratativas'

export interface PropsDaTratativa {
  /** a tratativa que vale para a rodada (null: ainda nenhuma) */
  atual: CamposDaTratativa | null
  pode: boolean
  /** NC ainda aberto (sem reinspeção C); fechado, só a eficácia se mexe */
  aberta: boolean
  /** o NC foi reinspecionado com C: pergunta se a correção resolveu */
  reinspecionada: boolean
  /** o mesmo item já teve NC 3 vezes: aviso de ação corretiva (só avisa) */
  repetido?: boolean
  /** quem já resolveu outros NC da obra, para sugerir */
  sugestoes?: readonly string[]
  salvar: (c: CamposDaTratativa) => unknown
  /** abre já aberto (vindo da lista para este item) */
  aberto?: boolean
}

type Texto = 'responsavel' | 'causa_obs' | 'casos_parecidos' | 'concessao_por' | 'eficacia_obs'

export function CampoTratativa(p: PropsDaTratativa) {
  const [c, setC] = useState<CamposDaTratativa>({ ...TRATATIVA_VAZIA, ...(p.atual ?? {}) })
  // a tratativa de outro aparelho chegou (ou a gravação voltou) sem a pessoa estar digitando: mostra a nova
  const gravado = useRef<CamposDaTratativa>(camposLimpos(p.atual ?? {}))
  const espera = useRef<number | undefined>(undefined)
  const atual = useRef(c)
  atual.current = c
  useEffect(() => {
    const novo = camposLimpos(p.atual ?? {})
    if (espera.current === undefined && tratativaMudou(gravado.current, novo)) {
      gravado.current = novo
      setC({ ...TRATATIVA_VAZIA, ...(p.atual ?? {}) })
    }
  }, [p.atual])

  const gravarAgora = (campos = atual.current) => {
    window.clearTimeout(espera.current)
    espera.current = undefined
    const limpos = camposLimpos(campos)
    if (!tratativaMudou(gravado.current, limpos)) return
    gravado.current = limpos
    p.salvar(limpos)
  }
  // saiu da tela com texto ainda não gravado
  useEffect(() => () => {
    if (espera.current !== undefined) gravarAgora()
  }, [])
  // foi para outro app: o Android pode fechar este sem avisar
  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden' && espera.current !== undefined) gravarAgora()
    }
    document.addEventListener('visibilitychange', aoEsconder)
    return () => document.removeEventListener('visibilitychange', aoEsconder)
  }, [])

  /** botão, data, caixa: grava na hora */
  const mudar = (parte: Partial<CamposDaTratativa>) => {
    const novo = { ...atual.current, ...parte }
    atual.current = novo
    setC(novo)
    gravarAgora(novo)
  }
  /** texto: grava 1 s depois de parar de digitar ou ao sair do campo */
  const digitar = (k: Texto, v: string) => {
    const novo = { ...atual.current, [k]: v }
    atual.current = novo
    setC(novo)
    window.clearTimeout(espera.current)
    espera.current = window.setTimeout(() => gravarAgora(), 1000)
  }
  const sair = () => {
    if (espera.current !== undefined) gravarAgora()
  }
  const campoTexto = (k: Texto, rotulo: string, dica: string, max: number) => (
    <label class="fv-trat-campo">
      {rotulo}
      <input
        type="text"
        maxLength={max}
        disabled={!p.pode || (!p.aberta && k !== 'eficacia_obs')}
        value={c[k] ?? ''}
        placeholder={dica}
        list={k === 'responsavel' && p.sugestoes?.length ? 'fv-trat-sugestoes' : undefined}
        data-testid={`fvs-trat-${k}`}
        onInput={(ev) => digitar(k, (ev.target as HTMLInputElement).value)}
        onBlur={sair}
      />
    </label>
  )

  const prazo = situacaoDoPrazo(c.prazo, p.aberta && !c.concessao, hojeLocal())
  const resumo = resumoDaTratativa(camposLimpos(c), p.aberta)
  const mexe = p.pode && p.aberta
  const semQuem = c.concessao && !(c.concessao_por ?? '').trim()

  return (
    <details class="fv-trat" data-testid="fvs-trat" open={p.aberto || (p.reinspecionada && !c.eficacia && p.pode)}>
      <summary>
        <b>Tratativa</b>
        <span class={`fv-trat-resumo${prazo === 'atrasado' ? ' atrasado' : ''}`} data-testid="fvs-trat-resumo">
          {resumo || (p.aberta ? 'quem resolve, prazo, causa' : 'sem tratativa')}
        </span>
      </summary>
      {p.repetido && (
        <div class="fv-trat-acao" data-testid="fvs-trat-acao">
          {AVISO_ACAO_CORRETIVA}
        </div>
      )}
      {campoTexto('responsavel', 'Quem resolve', 'Empreiteiro ou equipe', 120)}
      {p.sugestoes?.length ? (
        <datalist id="fv-trat-sugestoes">
          {p.sugestoes.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
      <label class="fv-trat-campo">
        Prazo (só avisa)
        <input
          type="date"
          disabled={!mexe}
          value={c.prazo ?? ''}
          data-testid="fvs-trat-prazo"
          onChange={(ev) => mudar({ prazo: (ev.target as HTMLInputElement).value || null })}
        />
      </label>
      {c.prazo && prazo && (
        <div class={`fv-trat-prazo p-${prazo}`} data-testid="fvs-trat-aviso-prazo">
          {rotuloDoPrazo(c.prazo, prazo)}
        </div>
      )}
      <div class="fv-trat-campo" role="group" aria-label="Causa">
        Causa
        <div class="fv-trat-causas">
          {CAUSAS.map((x) => (
            <button
              type="button"
              key={x.valor}
              class={c.causa === x.valor ? 'sel' : ''}
              aria-pressed={c.causa === x.valor}
              disabled={!mexe}
              data-testid={`fvs-trat-causa-${x.valor}`}
              onClick={() => mudar({ causa: c.causa === x.valor ? null : x.valor })}
            >
              {x.rotulo}
            </button>
          ))}
        </div>
      </div>
      {(c.causa === 'outro' || c.causa_obs) && campoTexto('causa_obs', 'Qual causa?', 'Descreva a causa', 500)}
      {campoTexto('casos_parecidos', 'Há casos parecidos?', 'Onde mais pode ter acontecido', 500)}
      <label class="fv-trat-caixa">
        <input
          type="checkbox"
          disabled={!p.pode || (!p.aberta && !c.concessao)}
          checked={c.concessao}
          data-testid="fvs-trat-concessao"
          onChange={(ev) => mudar({ concessao: (ev.target as HTMLInputElement).checked })}
        />
        Aceito sob concessão (fica como está, sem reinspeção)
      </label>
      {c.concessao && campoTexto('concessao_por', 'Quem decidiu', 'Nome de quem autorizou', 120)}
      {semQuem && (
        <div class="fv-trat-falta" data-testid="fvs-trat-falta-quem">
          Escreva quem decidiu: sem o nome, a concessão não vale.
        </div>
      )}
      {p.reinspecionada && (
        <div class="fv-trat-campo" role="group" aria-label="Eficácia">
          A correção resolveu?
          <div class="fv-trat-causas">
            {(['eficaz', 'nao_eficaz'] as const).map((v) => (
              <button
                type="button"
                key={v}
                class={c.eficacia === v ? 'sel' : ''}
                aria-pressed={c.eficacia === v}
                disabled={!p.pode}
                data-testid={`fvs-trat-eficacia-${v}`}
                onClick={() => mudar({ eficacia: c.eficacia === v ? null : v })}
              >
                {v === 'eficaz' ? 'Eficaz' : 'Não eficaz'}
              </button>
            ))}
          </div>
        </div>
      )}
      {p.reinspecionada && c.eficacia === 'nao_eficaz' && campoTexto('eficacia_obs', 'O que voltou a acontecer?', 'Se o problema voltou, marque NC de novo', 500)}
    </details>
  )
}
