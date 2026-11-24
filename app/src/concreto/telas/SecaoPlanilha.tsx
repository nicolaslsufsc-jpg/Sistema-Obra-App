// Seção "Planilha de controle" do início do Concreto: baixa a planilha preenchida (planilha_controle.ts).
// Obra com modelo guardado (planilha_modelo.ts, 23/11/2026): um clique. Sem modelo: escolhe o .xlsx a
// cada vez, e o gestor pode guardá-lo como modelo da obra. Sempre dá para baixar o de exemplo (obra EXE).
import { useEffect, useState } from 'preact/hooks'
import type { Linha } from '../../nucleo/banco_local'
import { sincronizador } from '../../nucleo/servicos'
import { podeLancarLaudo } from '../dados'
import { bytesDoModelo, guardarModelo, modeloDaObra } from '../planilha_modelo'
import { LAYOUT_PADRAO, linhasDaPlanilha, preencherModelo } from '../planilha_controle'
import { itensDaPlanilha } from '../planilha_controle_dados'
import { LAYOUT_EXE, modeloExe } from '../modelo_exe'
import { abrirXlsx, montarXlsx } from '../xlsx'
import type { Contexto } from './ModuloConcreto'
import { plural } from './comum'
import { BotaoArquivo } from '../../telas/BotaoArquivo'
import { Ajuda } from '../../telas/Ajuda'

function baixar(bytes: Uint8Array<ArrayBuffer>, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const nomeLimpo = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')

export function SecaoPlanilha({ ctx }: { ctx: Contexto }) {
  const { dados, obra, usuario } = ctx
  const [modelo, setModelo] = useState<File | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [gerando, setGerando] = useState(false)
  // undefined = ainda lendo o aparelho
  const [modeloObra, setModeloObra] = useState<Linha | null | undefined>(undefined)
  const [trocando, setTrocando] = useState(false)
  const gestor = podeLancarLaudo(obra.papel)
  const lerModelo = () =>
    sincronizador
      .linhas('arquivos', obra.id)
      .then((a) => setModeloObra(modeloDaObra(a)))
      .catch(() => setModeloObra(null))
  useEffect(() => {
    void lerModelo()
  }, [obra.id])
  const linhas = linhasDaPlanilha(itensDaPlanilha(dados))
  // a concretagem de exemplo não entra na planilha (é da obra); diz isso, para a conta não parecer errada
  const doExemplo = dados.concretagens.filter((c) => c.exemplo).reduce((n, c) => n + (dados.caminhoesDe.get(c.raiz)?.length ?? 0), 0)

  const gerar = async (daObra: boolean) => {
    if (!daObra && !modelo) return
    setGerando(true)
    setMensagem(null)
    try {
      const bytes = daObra && modeloObra ? await bytesDoModelo(modeloObra) : new Uint8Array(await modelo!.arrayBuffer())
      const arquivos = await abrirXlsx(bytes)
      const r = preencherModelo(arquivos, linhas, LAYOUT_PADRAO)
      const hoje = new Date().toISOString().slice(0, 10)
      const base = daObra ? 'planilha_controle' : nomeLimpo(modelo!.name.replace(/\.xlsx$/i, ''))
      baixar(montarXlsx(arquivos), `${base}_${nomeLimpo(obra.codigo)}_${hoje}.xlsx`)
      setMensagem({ tipo: 'ok', texto: `Planilha gerada: ${plural(r.linhas, 'caminhão', 'caminhões')}. As informações a mais começam na coluna ${r.colunaDosExtras}.` })
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) })
    } finally {
      setGerando(false)
    }
  }

  const guardar = async () => {
    if (!modelo) return
    setGerando(true)
    setMensagem(null)
    try {
      await guardarModelo(obra.id, usuario.id, new Uint8Array(await modelo.arrayBuffer()))
      await lerModelo()
      setModelo(null)
      setTrocando(false)
      setMensagem({ tipo: 'ok', texto: 'Modelo guardado para a obra. Agora a planilha sai em um clique, em qualquer aparelho (depois de sincronizar).' })
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) })
    } finally {
      setGerando(false)
    }
  }

  const baixarExemplo = () => {
    const a = modeloExe()
    preencherModelo(a, linhasDaPlanilha(itensDaPlanilha(dados), LAYOUT_EXE), LAYOUT_EXE)
    baixar(montarXlsx(a), `planilha_controle_exemplo_${nomeLimpo(obra.codigo)}.xlsx`)
  }

  return (
    <section class="cartao" data-testid="planilha-controle">
      <h2>Planilha de controle</h2>
      <p class="discreto so-com-ajuda" data-testid="planilha-resumo">
        {plural(linhas.length, 'caminhão', 'caminhões')} na aba "{LAYOUT_PADRAO.aba}"
        {doExemplo > 0 && ` | ${plural(doExemplo, 'caminhão', 'caminhões')} de exemplo fora`}
        <Ajuda>
          Uma linha por caminhão. Tipo, local, pavimento e empreiteira saem com os nomes das listas do modelo; o resto do arquivo fica como está. O
          que o app sabe a mais vai nas colunas depois da tabela.
        </Ajuda>
      </p>
      {modeloObra && !trocando ? (
        <>
          <p class="discreto" data-testid="planilha-modelo-obra">
            Modelo da obra guardado em {String(modeloObra.criado_em_dispositivo ?? '').slice(0, 10).split('-').reverse().join('/')}.
          </p>
          <div class="acoes">
            <button type="button" class="principal" onClick={() => gerar(true)} disabled={gerando}>
              {gerando ? 'Gerando…' : 'Gerar planilha'}
            </button>
            {gestor && (
              <button type="button" onClick={() => setTrocando(true)}>
                Trocar modelo da obra
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <BotaoArquivo
            rotulo="Importar planilha (.xlsx)"
            rotuloLeitor="Modelo da obra (.xlsx)"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            testid="planilha-modelo"
            nome={modelo?.name ?? null}
            aoEscolher={(arquivos) => {
              setModelo(arquivos[0] ?? null)
              setMensagem(null)
            }}
          />
          <div class="acoes">
            <button type="button" class="principal" onClick={() => gerar(false)} disabled={!modelo || gerando}>
              {gerando ? 'Gerando…' : 'Gerar planilha'}
            </button>
            {gestor && (
              <button type="button" onClick={guardar} disabled={!modelo || gerando}>
                Guardar como modelo da obra
              </button>
            )}
            {trocando && (
              <button type="button" onClick={() => setTrocando(false)}>
                Cancelar
              </button>
            )}
          </div>
        </>
      )}
      <div class="acoes">
        <button type="button" onClick={baixarExemplo}>
          Baixar modelo de exemplo
        </button>
      </div>
      {mensagem && (
        <p class={mensagem.tipo === 'erro' ? 'erro' : 'aviso'} role="status" data-testid="planilha-mensagem">
          {mensagem.texto}
        </p>
      )}
    </section>
  )
}
