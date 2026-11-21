// Botões de "Baixar para usar offline" e "Apagar do aparelho", para um documento ou uma pasta.
// Só aparecem com conta, para arquivo que está no servidor (ou já baixado). Nada baixa sozinho.
import { useState } from 'preact/hooks'
import { apagarDocumentosDoAparelho, baixados, baixarDocumentos, paraBaixar, type ArquivoDoc } from '../dados'
import { textoDoResultado } from '../offline'
import { tamanhoEmTexto } from '../regras'

const soma = (l: readonly ArquivoDoc[]) => l.reduce((t, a) => t + a.tamanho, 0)
const arquivosEmTexto = (n: number) => `${n} ${n === 1 ? 'arquivo' : 'arquivos'}`

export function BotoesOffline({
  arquivos,
  recarregar,
  pasta = false,
  testid,
}: {
  arquivos: readonly (ArquivoDoc | undefined)[]
  recarregar: () => Promise<void>
  /** pasta: o texto diz quantos arquivos e quanto pesam */
  pasta?: boolean
  testid: string
}) {
  const [andando, setAndando] = useState('')
  const [msg, setMsg] = useState('')
  const faltam = paraBaixar(arquivos)
  const guardados = baixados(arquivos)
  if (faltam.length === 0 && guardados.length === 0 && !msg) return null

  const baixar = async () => {
    if (!navigator.onLine) {
      setMsg('Sem internet agora. Baixe quando tiver sinal.')
      return
    }
    setMsg('')
    setAndando(`Baixando 0 de ${faltam.length}…`)
    const r = await baixarDocumentos(faltam, (feitos, total) => setAndando(`Baixando ${feitos} de ${total}…`))
    setAndando('')
    setMsg(textoDoResultado(r))
    await recarregar()
  }
  const apagar = async () => {
    const texto = pasta
      ? `Apagar ${arquivosEmTexto(guardados.length)} desta pasta do aparelho? Eles continuam no servidor e dá para baixar de novo.`
      : 'Apagar este arquivo do aparelho? Ele continua no servidor e dá para baixar de novo.'
    if (!confirm(texto)) return
    const n = await apagarDocumentosDoAparelho(guardados)
    setMsg(`${arquivosEmTexto(n)} ${n === 1 ? 'apagado' : 'apagados'} do aparelho.`)
    await recarregar()
  }

  return (
    <div class={pasta ? 'doc-offline doc-offline-pasta' : 'doc-offline'} data-testid={testid}>
      {andando ? (
        <p class="discreto" data-testid={`${testid}-andando`}>
          {andando}
        </p>
      ) : (
        <div class="doc-offline-botoes">
          {faltam.length > 0 && (
            <button type="button" data-testid={`${testid}-baixar`} onClick={baixar}>
              {pasta ? `Baixar a pasta para usar offline · ${arquivosEmTexto(faltam.length)}, ${tamanhoEmTexto(soma(faltam))}` : `Baixar para usar offline (${tamanhoEmTexto(soma(faltam))})`}
            </button>
          )}
          {guardados.length > 0 && (
            <button type="button" data-testid={`${testid}-apagar`} onClick={apagar}>
              {pasta ? `Apagar a pasta do aparelho · ${tamanhoEmTexto(soma(guardados))}` : 'Apagar do aparelho'}
            </button>
          )}
        </div>
      )}
      {msg && (
        <p class="discreto" data-testid={`${testid}-msg`} role="status">
          {msg}
        </p>
      )}
    </div>
  )
}
