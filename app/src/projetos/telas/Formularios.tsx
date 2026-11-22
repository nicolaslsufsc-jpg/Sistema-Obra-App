import { useRef, useState } from 'preact/hooks'
import type { Linha } from '../../nucleo/banco_local'
import { guardarAssinatura } from '../assinatura'
import { registrarDevolucao, registrarEntrega } from '../dados'
import { normalizar } from '../regras'
import { QuadroAssinatura, type PegarAssinatura } from './Assinatura'
import type { Contexto } from './ModuloProjetos'
import { Campo, dataBR, rotuloRevisao, Topo } from './comum'

type Erros = Record<string, string>

function CampoFoto({ foto, setFoto }: { foto: File | null; setFoto: (f: File | null) => void }) {
  return (
    <Campo rotulo="Foto do formulário assinado" dica={foto ? `${foto.name} · ${Math.round(foto.size / 1024)} KB` : 'Opcional. Fica guardada no aparelho e sobe com a internet.'}>
      <input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.currentTarget.files?.[0] ?? null)} />
    </Campo>
  )
}

// ---------------------------------------------------------------------
// Entrega
// ---------------------------------------------------------------------

export function FormEntrega({ ctx, documentoId, empresaId }: { ctx: Contexto; documentoId: string; empresaId?: string }) {
  const { dados, obra, usuario, voltar, trocar, recarregar, avisar } = ctx
  const doc = dados.documentoPorId.get(documentoId)
  const vigente = dados.vigentes.get(documentoId)
  const revisoes = (dados.revisoesDe.get(documentoId) ?? []).filter((r) => !r.obsoleta)
  const empresas = dados.empresas.filter((e) => e.ativa)

  const [empresa, setEmpresa] = useState(empresaId ?? (empresas.length === 1 ? empresas[0].id : ''))
  const [colaborador, setColaborador] = useState('')
  const [revisao, setRevisao] = useState(vigente?.id ?? '')
  const [data, setData] = useState(dados.hoje)
  const [foto, setFoto] = useState<File | null>(null)
  const [obs, setObs] = useState('')
  const [erros, setErros] = useState<Erros>({})
  const [salvando, setSalvando] = useState(false)
  // mais pranchas na mesma entrega (a pessoa leva várias de uma vez e assina uma vez só)
  const [outras, setOutras] = useState<string[]>([])
  const [buscaOutras, setBuscaOutras] = useState('')
  const pegar = useRef<PegarAssinatura | null>(null)
  const [assinado, setAssinado] = useState(false)

  if (!doc) {
    return (
      <main class="tela">
        <Topo titulo="Entregar cópia" aoVoltar={voltar} />
        <p>Este projeto não está mais no aparelho.</p>
      </main>
    )
  }

  const salvar = async (ev: Event) => {
    ev.preventDefault()
    const e: Erros = {}
    if (!empresa) e.empresa = 'Escolha a empresa.'
    if (!revisao) e.revisao = 'Escolha a revisão.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) e.data = 'Informe a data.'
    setErros(e)
    if (Object.keys(e).length > 0) return
    const rev = dados.revisaoPorId.get(revisao)
    const nomeEmpresa = dados.empresaPorId.get(empresa)?.nome ?? ''
    const alerta = rev && vigente && rev.id !== vigente.id ? `\n\nATENÇÃO: ${rotuloRevisao(rev)} não é a vigente (${rotuloRevisao(vigente)}). Só registre se for isso mesmo.` : ''
    // as outras pranchas vão na revisão vigente de cada uma
    const extras = outras.flatMap((id) => {
      const v = dados.vigentes.get(id)
      return v ? [{ documento_id: id, revisao_id: v.id }] : []
    })
    const semAssinatura = assinado ? '' : '\n\n⚠ Sem assinatura de quem retira. É opcional, mas sem ela não há comprovante assinado.'
    const mais = extras.length ? ` e mais ${extras.length} ${extras.length === 1 ? 'prancha' : 'pranchas'}` : ''
    if (!confirm(`Registrar a entrega de ${doc.codigo} ${rotuloRevisao(rev)}${mais} para ${nomeEmpresa}${colaborador.trim() ? ` (${colaborador.trim()})` : ''} em ${dataBR(data)}?${alerta}${semAssinatura}`)) return
    setSalvando(true)
    // A empresa ainda tem outra cópia desta prancha? Lembrar de recolher (senão fica em CONFERIR).
    // Só revisão anterior: a vigente (ou a que está sendo entregue) em campo não é para recolher (achado de 22/11).
    const antigas = (dados.situacoesDe.get(doc.id) ?? [])
      .filter((s) => s.empresa_id === empresa)
      .flatMap((s) => s.entregas_abertas)
      .filter((a) => String(a.revisao_id) !== revisao && String(a.revisao_id) !== vigente?.id)
    try {
      // UMA assinatura por entrega: o mesmo arquivo vale para todas as pranchas
      const png = assinado ? await pegar.current?.() : null
      const assinatura_id = png ? await guardarAssinatura(obra.id, usuario.id, png) : null
      const base = { empresa_id: empresa, colaborador, data_evento: data, observacao: obs, assinatura_id }
      await registrarEntrega(obra.id, usuario.id, { ...base, documento_id: doc.id, revisao_id: revisao }, foto)
      for (const x of extras) await registrarEntrega(obra.id, usuario.id, { ...base, ...x })
      await recarregar()
      const lembrete = antigas.length > 0 ? ` Falta recolher ${antigas.map((a) => rotuloRevisao(dados.revisaoPorId.get(String(a.revisao_id)))).join(', ')} de ${nomeEmpresa}.` : ''
      avisar(`Entrega registrada: ${doc.codigo} ${rotuloRevisao(rev)}${mais} para ${nomeEmpresa}${assinatura_id ? ', com assinatura' : ''}.${lembrete}`)
      if (assinatura_id) trocar({ nome: 'comprovante', assinaturaId: assinatura_id })
      else trocar({ nome: 'prancha', documentoId: doc.id })
    } catch (err) {
      setSalvando(false)
      avisar(`Não foi possível registrar: ${err instanceof Error ? err.message : String(err)}`, 'erro')
    }
  }

  return (
    <main class="tela">
      <Topo titulo="Entregar cópia" sub={`${doc.codigo} · ${doc.titulo}`} aoVoltar={voltar} />
      {empresas.length === 0 && (
        <p class="aviso">⚠ Nenhuma empresa cadastrada. Peça ao gestor para cadastrar em "Empresas".</p>
      )}
      <form onSubmit={salvar} class="pj-form" noValidate>
        <div class="pj-campos">
          <Campo rotulo="Empresa" erro={erros.empresa}>
            <select value={empresa} onChange={(e) => setEmpresa(e.currentTarget.value)}>
              <option value="">Escolha…</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Quem recebeu (colaborador)">
            <input value={colaborador} onInput={(e) => setColaborador(e.currentTarget.value)} maxLength={120} />
          </Campo>
          <Campo rotulo="Revisão entregue" erro={erros.revisao} dica={vigente ? `Vigente: ${rotuloRevisao(vigente)}` : undefined}>
            <select value={revisao} onChange={(e) => setRevisao(e.currentTarget.value)}>
              <option value="">Escolha…</option>
              {revisoes.map((r) => (
                <option key={r.id} value={r.id}>
                  {rotuloRevisao(r)}
                  {r.id === vigente?.id ? ' (vigente)' : ''}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Data da entrega" erro={erros.data}>
            <input type="date" value={data} onInput={(e) => setData(e.currentTarget.value)} required />
          </Campo>
        </div>
        <MaisPranchas ctx={ctx} principal={doc.id} outras={outras} setOutras={setOutras} busca={buscaOutras} setBusca={setBuscaOutras} />
        {/* fora de <label> (Campo): dentro dele, tocar no quadro "clicava" no Limpar */}
        <div class="pj-campo" role="group" aria-label="Assinatura de quem retira">
          <span>Assinatura de quem retira</span>
          <QuadroAssinatura pegar={pegar} aoMudar={setAssinado} />
          <span class="discreto">Opcional. Uma assinatura vale para todas as pranchas desta entrega; data e hora ficam guardadas.</span>
        </div>
        {!assinado && <p class="discreto" data-testid="entrega-sem-assinatura">⚠ Sem assinatura: a entrega fica registrada, mas sem comprovante assinado.</p>}
        <CampoFoto foto={foto} setFoto={setFoto} />
        <Campo rotulo="Observação">
          <textarea value={obs} onInput={(e) => setObs(e.currentTarget.value)} maxLength={2000} rows={2} />
        </Campo>
        <button type="submit" class="principal" disabled={salvando || empresas.length === 0}>
          {outras.length ? `Registrar entrega (${outras.length + 1} pranchas)` : 'Registrar entrega'}
        </button>
      </form>
    </main>
  )
}

/** Outras pranchas que vão na mesma entrega (na revisão vigente de cada uma). */
function MaisPranchas({
  ctx,
  principal,
  outras,
  setOutras,
  busca,
  setBusca,
}: {
  ctx: Contexto
  principal: string
  outras: string[]
  setOutras: (v: string[]) => void
  busca: string
  setBusca: (v: string) => void
}) {
  const { dados } = ctx
  const q = normalizar(busca.trim())
  const marcadas = new Set(outras)
  const candidatas = dados.documentos.filter((d) => d.id !== principal && dados.vigentes.has(d.id))
  // as marcadas sempre aparecem; as outras só com a busca (a lista inteira é grande demais no celular)
  const visiveis = candidatas.filter((d) => marcadas.has(d.id) || (q.length >= 2 && d.busca.includes(q))).slice(0, 40)
  const alternar = (id: string) => setOutras(marcadas.has(id) ? outras.filter((x) => x !== id) : [...outras, id])
  return (
    <details class="pj-disc" open={outras.length > 0} data-testid="entrega-mais-pranchas">
      <summary>
        <b>Mais pranchas nesta entrega</b> {outras.length > 0 && <span class="pj-selo rec">{outras.length}</span>}
      </summary>
      <input type="search" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} placeholder="Buscar código ou título" aria-label="Buscar outra prancha" />
      <ul class="pj-mais-pranchas">
        {visiveis.map((d) => (
          <li key={d.id}>
            <label>
              <input type="checkbox" checked={marcadas.has(d.id)} onChange={() => alternar(d.id)} />
              <span>
                <b>{d.codigo}</b> <span class="discreto">{d.titulo}</span> <span class="pj-selo ok">{rotuloRevisao(dados.vigentes.get(d.id))}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {q.length < 2 && outras.length === 0 && <p class="discreto">Digite parte do código ou do título para achar a prancha. Vai a revisão vigente.</p>}
    </details>
  )
}

// ---------------------------------------------------------------------
// Devolução (recolhimento)
// ---------------------------------------------------------------------

export function FormDevolucao({ ctx, documentoId, entregaId }: { ctx: Contexto; documentoId: string; entregaId?: string }) {
  const { dados, obra, usuario, voltar, trocar, recarregar, avisar } = ctx
  const doc = dados.documentoPorId.get(documentoId)
  const abertas: Linha[] = (dados.situacoesDe.get(documentoId) ?? []).flatMap((s) => s.entregas_abertas)
  const [entrega, setEntrega] = useState(entregaId ?? (abertas.length === 1 ? abertas[0].id : ''))
  const [data, setData] = useState(dados.hoje)
  const [foto, setFoto] = useState<File | null>(null)
  const [obs, setObs] = useState('')
  const [erros, setErros] = useState<Erros>({})
  const [salvando, setSalvando] = useState(false)

  if (!doc) {
    return (
      <main class="tela">
        <Topo titulo="Recolher cópia" aoVoltar={voltar} />
        <p>Este projeto não está mais no aparelho.</p>
      </main>
    )
  }
  const descrever = (e: Linha) => {
    const emp = dados.empresaPorId.get(String(e.empresa_id))?.nome ?? 'empresa?'
    const rev = rotuloRevisao(dados.revisaoPorId.get(String(e.revisao_id)))
    return `${emp} · ${rev} · entregue em ${dataBR(String(e.data_evento))}${e.colaborador ? ` a ${String(e.colaborador)}` : ''}`
  }

  const salvar = async (ev: Event) => {
    ev.preventDefault()
    const e: Erros = {}
    const alvo = abertas.find((x) => x.id === entrega)
    if (!alvo) e.entrega = 'Escolha qual cópia foi devolvida.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) e.data = 'Informe a data.'
    setErros(e)
    if (!alvo || Object.keys(e).length > 0) return
    if (!confirm(`Registrar a devolução de ${doc.codigo}: ${descrever(alvo)}, em ${dataBR(data)}?`)) return
    setSalvando(true)
    try {
      await registrarDevolucao(obra.id, usuario.id, alvo, { data_evento: data, observacao: obs }, foto)
      await recarregar()
      avisar(`Devolução registrada: ${doc.codigo} (${dados.empresaPorId.get(String(alvo.empresa_id))?.nome ?? ''}).`)
      trocar({ nome: 'prancha', documentoId: doc.id })
    } catch (err) {
      setSalvando(false)
      avisar(`Não foi possível registrar: ${err instanceof Error ? err.message : String(err)}`, 'erro')
    }
  }

  return (
    <main class="tela">
      <Topo titulo="Recolher cópia" sub={`${doc.codigo} · ${doc.titulo}`} aoVoltar={voltar} />
      {abertas.length === 0 ? (
        <p class="pj-vazio">Nenhuma cópia desta prancha está em campo.</p>
      ) : (
        <form onSubmit={salvar} class="pj-form" noValidate>
          <Campo rotulo="Qual cópia foi devolvida" erro={erros.entrega}>
            <select value={entrega} onChange={(e) => setEntrega(e.currentTarget.value)}>
              <option value="">Escolha…</option>
              {abertas.map((e) => (
                <option key={e.id} value={e.id}>
                  {descrever(e)}
                </option>
              ))}
            </select>
          </Campo>
          <div class="pj-campos">
            <Campo rotulo="Data da devolução" erro={erros.data}>
              <input type="date" value={data} onInput={(e) => setData(e.currentTarget.value)} required />
            </Campo>
          </div>
          <CampoFoto foto={foto} setFoto={setFoto} />
          <Campo rotulo="Observação">
            <textarea value={obs} onInput={(e) => setObs(e.currentTarget.value)} maxLength={2000} rows={2} />
          </Campo>
          <button type="submit" class="principal" disabled={salvando}>
            Registrar devolução
          </button>
        </form>
      )}
    </main>
  )
}
