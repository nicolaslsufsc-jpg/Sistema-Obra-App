// Thread separada: ler um IFC grande leva dezenas de segundos e a tela não pode travar.
// Cada arquivo usa um worker novo, que é encerrado no fim: o WebAssembly só devolve a memória assim.
import { IfcAPI, LogLevel } from 'web-ifc'
import { mensagemDeErroDaLeitura } from './erro_leitura'
import wasmUrl from 'web-ifc/web-ifc.wasm?url'
import { lerModelo } from './leitor'
import { buffersDoModelo } from './tipos'

// Só existe dentro de worker; os tipos do navegador usados no projeto não trazem.
declare const FileReaderSync: { new (): { readAsArrayBuffer(b: Blob): ArrayBuffer } }

export interface PedidoLeitura {
  arquivo: File
  id: string
}

export type RespostaLeitura =
  | { tipo: 'progresso'; fase: string; fracao: number }
  | { tipo: 'pronto'; modelo: import('./tipos').ModeloIfc }
  | { tipo: 'erro'; mensagem: string }

const escopo = self as unknown as {
  postMessage(m: RespostaLeitura, t?: Transferable[]): void
  onmessage: ((e: MessageEvent<PedidoLeitura>) => void) | null
}

escopo.onmessage = async (e) => {
  const { arquivo, id } = e.data
  try {
    escopo.postMessage({ tipo: 'progresso', fase: 'Preparando o leitor', fracao: 0 })
    const api = new IfcAPI()
    // Uma thread só: não exige cabeçalhos especiais do servidor e cabe na memória do tablet.
    await api.Init((caminho) => (caminho.endsWith('.wasm') ? new URL(wasmUrl, self.location.href).href : caminho), true)
    api.SetLogLevel(LogLevel.LOG_LEVEL_OFF)

    escopo.postMessage({ tipo: 'progresso', fase: 'Abrindo o arquivo', fracao: 0.01 })
    // Entrega o arquivo aos pedaços: um IFC de 300 MB não precisa estar duas vezes na memória.
    const leitor = new FileReaderSync()
    const modeloId = api.OpenModelFromCallback(
      (inicio: number, tamanho: number) => new Uint8Array(leitor.readAsArrayBuffer(arquivo.slice(inicio, inicio + tamanho))),
      { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 12 },
    )
    if (modeloId < 0) throw new Error('O arquivo não parece ser um IFC válido.')

    const modelo = lerModelo({
      api,
      modeloId,
      nome: arquivo.name,
      tamanho: arquivo.size,
      id,
      aoProgresso: (fase, fracao) => escopo.postMessage({ tipo: 'progresso', fase, fracao }),
    })
    api.CloseModel(modeloId)
    if (modelo.tabela.expressIds.length === 0) throw new Error('O arquivo abriu, mas não tem nenhum elemento com geometria.')
    escopo.postMessage({ tipo: 'pronto', modelo }, buffersDoModelo(modelo))
  } catch (erro) {
    escopo.postMessage({ tipo: 'erro', mensagem: mensagemDeErroDaLeitura(erro, arquivo.size) })
  }
}
