import { useState } from 'preact/hooks'
import type { Linha } from '../../nucleo/banco_local'
import { registrarDevolucao, registrarEntrega } from '../dados'
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
    if (!confirm(`Registrar a entrega de ${doc.codigo} ${rotuloRevisao(rev)} para ${nomeEmpresa}${colaborador.trim() ? ` (${colaborador.trim()})` : ''} em ${dataBR(data)}?${alerta}`)) return
    setSalvando(true)
    // A empresa ainda tem outra cópia desta prancha? Lembrar de recolher (senão fica em CONFERIR).
    const antigas = (dados.situacoesDe.get(doc.id) ?? []).filter((s) => s.empresa_id === empresa).flatMap((s) => s.entregas_abertas)
    try {
      await registrarEntrega(obra.id, usuario.id, { empresa_id: empresa, colaborador, documento_id: doc.id, revisao_id: revisao, data_evento: data, observacao: obs }, foto)
      await recarregar()
      const lembrete = antigas.length > 0 ? ` Falta recolher ${antigas.map((a) => rotuloRevisao(dados.revisaoPorId.get(String(a.revisao_id)))).join(', ')} de ${nomeEmpresa}.` : ''
      avisar(`Entrega registrada: ${doc.codigo} ${rotuloRevisao(rev)} para ${nomeEmpresa}.${lembrete}`)
      trocar({ nome: 'prancha', documentoId: doc.id })
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
        <CampoFoto foto={foto} setFoto={setFoto} />
        <Campo rotulo="Observação">
          <textarea value={obs} onInput={(e) => setObs(e.currentTarget.value)} maxLength={2000} rows={2} />
        </Campo>
        <button type="submit" class="principal" disabled={salvando || empresas.length === 0}>
          Registrar entrega
        </button>
      </form>
    </main>
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
