// Faixa do modo sem conta no topo dos módulos: "N registros só neste aparelho · Salvar arquivo".
// Fica verde ("Salvo às hh:mm") quando o último .obra (botão ou pasta automática) é mais novo
// que o último registro. Sem registro nenhum, não aparece.
import { useEffect, useState } from 'preact/hooks'
import { banco } from '../nucleo/servicos'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import './faixa_local.css'
import { lerSituacao, salvarArquivoDaObra, textoDaFaixa, type SituacaoArquivo } from './faixa_local'

/** A pasta automática grava uns 3 s depois do registro: relê de tempos em tempos para a faixa acompanhar. */
const RELER_MS = 4000

export function FaixaLocal({ usuario, obra, gatilho }: { usuario: UsuarioLocal; obra: ObraLocal; gatilho?: unknown }) {
  const [sit, setSit] = useState<SituacaoArquivo | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const ler = () => lerSituacao(banco, usuario, obra).then((s) => vivo && setSit(s)).catch(() => {})
    ler()
    const t = setInterval(ler, RELER_MS)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [usuario.id, obra.id, gatilho])

  if (!sit) return null
  const { texto, salvo } = textoDaFaixa(sit)
  if (!texto) return null

  async function salvar() {
    setOcupado(true)
    setErro(null)
    try {
      const ultimo = await salvarArquivoDaObra(banco, usuario, obra)
      setSit((s) => (s ? { ...s, ultimo } : s))
    } catch (e) {
      setErro(`Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div class={`faixa-aviso faixa-local${salvo ? ' salvo' : ''}`} data-testid="faixa-local" aria-live="polite">
      <span>{erro ?? texto}</span>
      {!salvo && (
        // "Salvar arquivo", não "Salvar": no formulário do caminhão o "Salvar" de baixo grava o caminhão (B1 do Testador)
        <button type="button" class="principal" onClick={salvar} disabled={ocupado}>
          Salvar arquivo
        </button>
      )}
    </div>
  )
}
