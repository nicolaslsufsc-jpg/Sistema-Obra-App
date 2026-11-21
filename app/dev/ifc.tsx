// Bancada do leitor de IFC (ver ifc.html): sem login e sem servidor, os arquivos são escolhidos no aparelho.
// Com ?obra=exe, mostra também a lista "IFCs da obra" com uma fonte de mentira na memória (obra fictícia
// EXE, a amostra escrita à mão já "enviada"), para ver baixar, abrir, apagar e enviar sem servidor.
import { render } from 'preact'
import '../src/style.css'
import { IfcSobDemanda } from '../src/ifc/telas/SobDemanda'
import { nomeDaParte, partirIfc, type FonteIfcs, type LinhaArquivo } from '../src/ifc/obra'
import { sha256Hex } from '../src/fvs/pacote'
import { amostraIfc } from '../testes/ifc/amostra'
import type { ContextoObraIfc } from '../src/ifc/telas/ModuloIfc'

const OBRA = '00000000-0000-4000-8000-0000000000e1'

async function fonteDeMentira(): Promise<FonteIfcs & { linhas: LinhaArquivo[]; conteudos: Map<string, Blob> }> {
  const linhas: LinhaArquivo[] = []
  const conteudos = new Map<string, Blob>()
  const guardar = async (conteudo: Blob, nome: string, criado: string) => {
    const id = crypto.randomUUID()
    conteudos.set(id, conteudo)
    linhas.push({ id, caminho: `${OBRA}/ifc/${id}`, nome_original: nome, hash: await sha256Hex(await conteudo.arrayBuffer()), tamanho: conteudo.size, criado_em_servidor: criado })
  }
  const [parte] = await partirIfc(new Blob([amostraIfc()]))
  await guardar(parte, nomeDaParte('EXE_amostra.ifc', 1, 1, 'e0e0e0e1'), '2026-11-20T12:00:00Z')
  return {
    linhas,
    conteudos,
    listar: async () => [...linhas],
    async bytesDaParte(p, aoBytes) {
      const b = conteudos.get(p.id)
      if (!b) throw new Error('parte não encontrada')
      // imita a internet: chega em 4 pedaços
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 150))
        aoBytes(Math.round((b.size * i) / 4))
      }
      return b
    },
    enviarParte: (conteudo, nome) => guardar(conteudo, nome, new Date().toISOString()),
  }
}

const params = new URLSearchParams(location.search)
const app = document.getElementById('app')!
if (params.get('obra') === 'exe') {
  void fonteDeMentira().then((fonte) => {
    ;(window as unknown as { __ifcFonte: typeof fonte }).__ifcFonte = fonte
    const obraIfc: ContextoObraIfc = { obraId: OBRA, fonte, podeEnviar: params.get('papel') !== 'campo', online: true, versao: 0 }
    render(<IfcSobDemanda obraIfc={obraIfc} />, app)
  })
} else {
  render(<IfcSobDemanda />, app)
}
