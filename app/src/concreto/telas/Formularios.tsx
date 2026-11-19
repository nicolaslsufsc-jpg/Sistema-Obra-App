import { useState } from 'preact/hooks'
import { dataLocal } from '../cps'
import { corrigir, registrar, type Caminhao, type Concretagem } from '../dados'
import type { Contexto } from './ModuloConcreto'
import { sistemaDaObra } from '../../integracoes/sistema_oficial'
import { dataBR, horaParaCampo, juntarDataHora, lerNumero, numBR, Topo } from './comum'
import { localLegivel, nomeDaConcretagem, ROTULO_FICHA } from '../exemplo'
import { avisosDeHorario, mensagemDeFalha } from '../horarios'

type Erros = Record<string, string>

function Campo({
  rotulo,
  erro,
  dica,
  children,
}: {
  rotulo: string
  erro?: string
  dica?: string
  children: preact.ComponentChildren
}) {
  return (
    <label class={`cc-campo${erro ? ' com-erro' : ''}`}>
      <span>{rotulo}</span>
      {children}
      {dica && !erro && <span class="discreto">{dica}</span>}
      {erro && <span class="erro">{erro}</span>}
    </label>
  )
}

function numeroOuErro(texto: string, rotulo: string, min: number, max: number, erros: Erros, chave: string, obrigatorio = false): number | null {
  const v = lerNumero(texto)
  if (v === null) {
    if (obrigatorio) erros[chave] = `Informe ${rotulo}.`
    return null
  }
  if (Number.isNaN(v) || v < min || v > max) {
    erros[chave] = `${rotulo[0].toUpperCase()}${rotulo.slice(1)}: número de ${numBR(min)} a ${numBR(max)}.`
    return null
  }
  return v
}

const txt = (v: number | null | undefined) => (v === null || v === undefined ? '' : numBR(v, 2))

/** Hora do relógio do aparelho no formato do campo de hora ("07:05"). */
export function horaAgora(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Campo de hora com o botão "Agora": na obra a hora é quase sempre a de agora (1 toque em vez do relógio). */
function CampoHora({ rotulo, valor, aoMudar, comAgora = true }: { rotulo: string; valor: string; aoMudar: (v: string) => void; comAgora?: boolean }) {
  return (
    // continua um label.cc-campo (o roteiro do Testador acha a hora pelo rótulo); o botão dentro do label não ativa o campo
    <label class="cc-campo cc-campo-hora">
      <span>{rotulo}</span>
      <span class="cc-hora">
        <input type="time" aria-label={rotulo} value={valor} onInput={(e) => aoMudar((e.currentTarget as HTMLInputElement).value)} />
        {comAgora && (
          <button type="button" class="cc-agora" data-testid="agora" onClick={() => aoMudar(horaAgora())}>
            Agora
          </button>
        )}
      </span>
    </label>
  )
}

// ---------------------------------------------------------------------
// Concretagem
// ---------------------------------------------------------------------

export function FormConcretagem({ ctx, pavimentoId, raiz }: { ctx: Contexto; pavimentoId?: string; raiz?: string }) {
  const { dados, obra, usuario, voltar, trocar, recarregar } = ctx
  const sistema = sistemaDaObra(obra)
  const atual = raiz ? dados.concretagens.find((c) => c.raiz === raiz) : undefined
  // nova concretagem: começa com os valores da última da obra (fck, slump, fornecedor, CPs)
  const base: Partial<Concretagem> = atual ?? dados.concretagens[0] ?? {}
  const pavId = atual?.pavimento_id ?? pavimentoId!
  const pav = dados.pavimentos.find((p) => p.id === pavId)

  const [data, setData] = useState(atual?.data ?? dataLocal(new Date()))
  const [local, setLocal] = useState(atual?.local_descricao ?? '')
  const [codigo, setCodigo] = useState(atual?.codigo_construpoint ?? '')
  const [fornecedor, setFornecedor] = useState(base.fornecedor ?? '')
  const [fck, setFck] = useState(txt(base.fck_mpa))
  const [slump, setSlump] = useState(txt(base.slump_cm))
  const [tol, setTol] = useState(txt(base.slump_tolerancia_cm))
  const [idades, setIdades] = useState((base.idades_dias ?? [7, 28]).join(', '))
  const [cps, setCps] = useState(String(base.cps_por_idade ?? 2))
  const [obs, setObs] = useState(atual?.observacao ?? '')
  const [erros, setErros] = useState<Erros>({})
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState('')

  const salvar = async (ev: Event) => {
    ev.preventDefault()
    const e: Erros = {}
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) e.data = 'Informe a data.'
    // sem local, a concretagem vira "sem local" nas listas e no mapa e não dá para distinguir duas do mesmo dia
    if (!local.trim()) e.local = 'Informe o local (pavimento, trecho e peças).'
    const fckN = numeroOuErro(fck, 'o fck (MPa)', 1, 150, e, 'fck', true)
    const slumpN = numeroOuErro(slump, 'o slump (cm)', 0, 30, e, 'slump')
    const tolN = numeroOuErro(tol, 'a tolerância (cm)', 0, 10, e, 'tol')
    const idadesN = idades
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map(Number)
    if (idadesN.length === 0 || idadesN.length > 6 || idadesN.some((i) => !Number.isInteger(i) || i < 1 || i > 365)) {
      e.idades = 'Idades em dias, separadas por vírgula (ex.: 7, 28).'
    }
    const cpsN = Number(cps)
    if (!Number.isInteger(cpsN) || cpsN < 1 || cpsN > 6) e.cps = 'De 1 a 6 CPs por idade.'
    setErros(e)
    if (Object.keys(e).length > 0) return
    setSalvando(true)
    const campos = {
      pavimento_id: pavId,
      data,
      local_descricao: local.trim(),
      codigo_construpoint: codigo.trim() || null,
      fornecedor: fornecedor.trim() || null,
      fck_mpa: fckN,
      slump_cm: slumpN,
      slump_tolerancia_cm: tolN,
      idades_dias: [...new Set(idadesN)].sort((a, b) => a - b),
      cps_por_idade: cpsN,
      observacao: obs.trim() || null,
    }
    setFalha('')
    try {
      if (atual) {
        await corrigir('concretagens', obra.id, usuario.id, atual, campos)
        await recarregar()
        voltar()
      } else {
        const linha = await registrar('concretagens', obra.id, usuario.id, campos)
        await recarregar()
        trocar({ nome: 'concretagem', raiz: linha.id })
      }
    } catch (err) {
      // sem isto o botão ficava travado em "salvando" e ninguém sabia que não gravou
      setSalvando(false)
      setFalha(mensagemDeFalha(err))
    }
  }

  return (
    <main class="tela">
      <Topo titulo={atual ? 'Corrigir concretagem' : 'Nova concretagem'} sub={pav?.nome} aoVoltar={voltar} />
      <form onSubmit={salvar} class="cc-form" noValidate>
        <div class="cc-campos">
          <Campo rotulo="Data" erro={erros.data}>
            <input type="date" value={data} onInput={(e) => setData(e.currentTarget.value)} required />
          </Campo>
          <Campo rotulo="Local" erro={erros.local} dica={sistema?.dicaLocal ? `ex.: ${localLegivel(sistema.dicaLocal)}` : undefined}>
            <input value={local} onInput={(e) => setLocal(e.currentTarget.value)} maxLength={300} />
          </Campo>
          {sistema && (
            <Campo rotulo={ROTULO_FICHA} dica={sistema.dicaCodigoFicha ? `ex.: ${sistema.dicaCodigoFicha}` : undefined}>
              <input value={codigo} onInput={(e) => setCodigo(e.currentTarget.value)} maxLength={100} />
            </Campo>
          )}
          <Campo rotulo="Fornecedor (usina)">
            <input value={fornecedor} onInput={(e) => setFornecedor(e.currentTarget.value)} maxLength={200} />
          </Campo>
          <Campo rotulo="fck (MPa)" erro={erros.fck}>
            <input inputMode="decimal" value={fck} onInput={(e) => setFck(e.currentTarget.value)} />
          </Campo>
          <Campo rotulo="Slump esperado (cm)" erro={erros.slump}>
            <input inputMode="decimal" value={slump} onInput={(e) => setSlump(e.currentTarget.value)} />
          </Campo>
          <Campo rotulo="Tolerância do slump (± cm)" erro={erros.tol}>
            <input inputMode="decimal" value={tol} onInput={(e) => setTol(e.currentTarget.value)} />
          </Campo>
          <Campo rotulo="Idades dos CPs (dias)" erro={erros.idades}>
            <input inputMode="numeric" value={idades} onInput={(e) => setIdades(e.currentTarget.value)} />
          </Campo>
          <Campo rotulo="CPs por idade, por caminhão" erro={erros.cps}>
            <input inputMode="numeric" value={cps} onInput={(e) => setCps(e.currentTarget.value)} />
          </Campo>
        </div>
        <Campo rotulo="Observação">
          <textarea value={obs} onInput={(e) => setObs(e.currentTarget.value)} maxLength={2000} rows={3} />
        </Campo>
        {falha && (
          <p class="aviso" role="alert">
            {falha}
          </p>
        )}
        <button type="submit" class="principal" disabled={salvando}>
          {atual ? 'Salvar correção' : 'Salvar concretagem'}
        </button>
      </form>
    </main>
  )
}

// ---------------------------------------------------------------------
// Caminhão
// ---------------------------------------------------------------------

export function FormCaminhao({ ctx, concretagemRaiz, raiz }: { ctx: Contexto; concretagemRaiz?: string; raiz?: string }) {
  const { dados, obra, usuario, voltar, trocar, recarregar } = ctx
  const atual = raiz ? dados.caminhoes.find((c) => c.raiz === raiz) : undefined
  const concRaiz = atual?.concretagem_id ?? concretagemRaiz!
  const conc = dados.concretagens.find((c) => c.raiz === concRaiz)
  const outros = (dados.caminhoesDe.get(concRaiz) ?? []).filter((c) => c.raiz !== atual?.raiz)
  const anterior: Caminhao | undefined = outros[outros.length - 1]

  const estadoInicial = () => ({
    sequencia: String(atual?.sequencia ?? (anterior ? anterior.sequencia + 1 : 1)),
    nf: atual?.nota_fiscal ?? '',
    volume: txt(atual?.volume_m3 ?? anterior?.volume_m3),
    saida: horaParaCampo(atual?.saida_usina),
    chegada: horaParaCampo(atual?.chegada_obra),
    inicio: horaParaCampo(atual?.inicio_descarga),
    fim: horaParaCampo(atual?.fim_descarga),
    slump: txt(atual?.slump_medido_cm),
    agua: txt(atual?.agua_adicionada_l),
    cps: atual?.cps_moldados !== undefined && atual?.cps_moldados !== null ? String(atual.cps_moldados) : conc ? String(conc.cps_por_idade * conc.idades_dias.length) : '',
    obs: atual?.observacao ?? '',
  })
  const [f, setF] = useState(estadoInicial)
  const [erros, setErros] = useState<Erros>({})
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState('')
  const mudar = (k: keyof ReturnType<typeof estadoInicial>) => (e: Event) => setF({ ...f, [k]: (e.currentTarget as HTMLInputElement).value })

  if (!conc) {
    return (
      <main class="tela">
        <Topo titulo="Caminhão" aoVoltar={voltar} />
        <p>A concretagem deste caminhão foi apagada.</p>
      </main>
    )
  }

  // avisos que não impedem salvar (a ficha de papel pode estar certa)
  const avisos: string[] = []
  const nfNum = /^\d+$/.test(f.nf.trim()) ? Number(f.nf.trim()) : null
  if (f.nf.trim() && outros.some((c) => (c.nota_fiscal ?? '').trim() === f.nf.trim())) avisos.push('Já existe caminhão com esta NF nesta concretagem.')
  const nfAnterior = anterior?.nota_fiscal && /^\d+$/.test(anterior.nota_fiscal) ? Number(anterior.nota_fiscal) : null
  if (!atual && nfNum !== null && nfAnterior !== null && Math.abs(nfNum - nfAnterior) > 30) avisos.push(`NF fora da sequência do caminhão anterior (${anterior!.nota_fiscal}). Confira.`)
  avisos.push(...avisosDeHorario(f))

  const salvar = async (proximo: boolean) => {
    const e: Erros = {}
    const seq = Number(f.sequencia)
    if (!Number.isInteger(seq) || seq < 1 || seq > 200) e.sequencia = 'Sequência de 1 a 200.'
    const volume = numeroOuErro(f.volume, 'o volume (m³)', 0.01, 20, e, 'volume')
    const slump = numeroOuErro(f.slump, 'o slump (cm)', 0, 30, e, 'slump')
    const agua = numeroOuErro(f.agua, 'a água (L)', 0, 1000, e, 'agua')
    const cps = numeroOuErro(f.cps, 'os CPs moldados', 0, 24, e, 'cps')
    if (cps !== null && !Number.isInteger(cps)) e.cps = 'CPs moldados: número inteiro.'
    setErros(e)
    if (Object.keys(e).length > 0) return
    setSalvando(true)
    const campos = {
      concretagem_id: conc.raiz,
      sequencia: seq,
      nota_fiscal: f.nf.trim() || null,
      volume_m3: volume,
      saida_usina: juntarDataHora(conc.data, f.saida),
      chegada_obra: juntarDataHora(conc.data, f.chegada),
      inicio_descarga: juntarDataHora(conc.data, f.inicio),
      fim_descarga: juntarDataHora(conc.data, f.fim),
      slump_medido_cm: slump,
      agua_adicionada_l: agua,
      cps_moldados: cps,
      observacao: f.obs.trim() || null,
    }
    if (atual) {
      try {
        await corrigir('caminhoes', obra.id, usuario.id, atual, campos)
      } catch (err) {
        setSalvando(false)
        setSalvo(mensagemDeFalha(err))
        return
      }
      await recarregar()
      voltar()
      return
    }
    if (proximo) {
      // Limpa o formulário já no toque, antes de gravar: o que a pessoa digitar enquanto o
      // caminhão anterior grava fica no próximo. Antes, a limpeza vinha depois da gravação e
      // apagava a NF e o slump do caminhão seguinte (rodada de 09/11).
      const preenchido = f
      setF({ ...estadoInicial(), sequencia: String(seq + 1), volume: f.volume, cps: f.cps })
      setSalvo(`Salvando caminhão ${seq}…`)
      window.scrollTo(0, 0)
      try {
        await registrar('caminhoes', obra.id, usuario.id, campos)
      } catch {
        setF(preenchido)
        setSalvo(`O caminhão ${seq} não foi salvo. Confira e toque em Salvar de novo.`)
        setSalvando(false)
        return
      }
      setSalvo(`Caminhão ${seq} salvo.`)
      setSalvando(false)
      await recarregar()
      return
    }
    let linha
    try {
      linha = await registrar('caminhoes', obra.id, usuario.id, campos)
    } catch (err) {
      setSalvando(false)
      setSalvo(mensagemDeFalha(err))
      return
    }
    await recarregar()
    trocar({ nome: 'caminhao', raiz: linha.id })
  }

  return (
    <main class="tela">
      <Topo titulo={atual ? `Corrigir caminhão ${atual.sequencia}` : 'Novo caminhão'} sub={`${dataBR(conc.data)} · ${nomeDaConcretagem(conc)}`} aoVoltar={voltar} />
      {salvo && (
        <div class={`faixa-mensagem ${/não (foi )?salvo|Não salvou/i.test(salvo) ? 'erro' : 'ok'}`} role="status">
          <p>{salvo}</p>
        </div>
      )}
      <form
        class="cc-form"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault()
          salvar(false)
        }}
      >
        <div class="cc-campos">
          <Campo rotulo="Sequência" erro={erros.sequencia}>
            <input inputMode="numeric" value={f.sequencia} onInput={mudar('sequencia')} />
          </Campo>
          <Campo rotulo="Nota fiscal">
            <input inputMode="numeric" value={f.nf} onInput={mudar('nf')} maxLength={40} />
          </Campo>
          <Campo rotulo="Volume (m³)" erro={erros.volume}>
            <input inputMode="decimal" value={f.volume} onInput={mudar('volume')} />
          </Campo>
          {/* sem "Agora": a saída da usina vem da nota fiscal; o botão convidaria a gravar a chegada como saída (Revisor, 08/11) */}
          <CampoHora rotulo="Saída da usina" valor={f.saida} aoMudar={(v) => setF((x) => ({ ...x, saida: v }))} comAgora={false} />
          <CampoHora rotulo="Chegada na obra" valor={f.chegada} aoMudar={(v) => setF((x) => ({ ...x, chegada: v }))} />
          <CampoHora rotulo="Início da descarga" valor={f.inicio} aoMudar={(v) => setF((x) => ({ ...x, inicio: v }))} />
          <CampoHora rotulo="Fim da descarga" valor={f.fim} aoMudar={(v) => setF((x) => ({ ...x, fim: v }))} />
          <Campo rotulo="Slump medido (cm)" erro={erros.slump}>
            <input inputMode="decimal" value={f.slump} onInput={mudar('slump')} />
          </Campo>
          <Campo rotulo="Água adicionada (L)" erro={erros.agua} dica="Vazio se não houve">
            <input inputMode="decimal" value={f.agua} onInput={mudar('agua')} />
          </Campo>
          <Campo rotulo="CPs moldados" erro={erros.cps}>
            <input inputMode="numeric" value={f.cps} onInput={mudar('cps')} />
          </Campo>
        </div>
        <Campo rotulo="Observação">
          <textarea value={f.obs} onInput={mudar('obs')} maxLength={2000} rows={2} />
        </Campo>
        {avisos.map((a) => (
          <p key={a} class="aviso">
            ⚠ {a}
          </p>
        ))}
        <div class="acoes">
          <button type="submit" class="principal" disabled={salvando}>
            {atual ? 'Salvar correção' : 'Salvar'}
          </button>
          {!atual && (
            <button type="button" disabled={salvando} onClick={() => salvar(true)}>
              Salvar e próximo caminhão
            </button>
          )}
        </div>
      </form>
    </main>
  )
}
