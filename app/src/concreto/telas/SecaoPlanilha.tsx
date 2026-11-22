// Seção "Planilha de controle" do início do Concreto: escolhe o modelo .xlsx da obra e baixa a
// planilha preenchida (planilha_controle.ts). Sem modelo, dá para baixar o de exemplo (obra EXE).
import { useState } from 'preact/hooks'
import { LAYOUT_PADRAO, linhasDaPlanilha, preencherModelo } from '../planilha_controle'
import { itensDaPlanilha } from '../planilha_controle_dados'
import { LAYOUT_EXE, modeloExe } from '../modelo_exe'
import { abrirXlsx, montarXlsx } from '../xlsx'
import type { Contexto } from './ModuloConcreto'
import { plural } from './comum'

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
  const { dados, obra } = ctx
  const [modelo, setModelo] = useState<File | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [gerando, setGerando] = useState(false)
  const linhas = linhasDaPlanilha(itensDaPlanilha(dados))
  // a concretagem de exemplo não entra na planilha (é da obra); diz isso, para a conta não parecer errada
  const doExemplo = dados.concretagens.filter((c) => c.exemplo).reduce((n, c) => n + (dados.caminhoesDe.get(c.raiz)?.length ?? 0), 0)

  const gerar = async () => {
    if (!modelo) return
    setGerando(true)
    setMensagem(null)
    try {
      const arquivos = await abrirXlsx(new Uint8Array(await modelo.arrayBuffer()))
      const r = preencherModelo(arquivos, linhas, LAYOUT_PADRAO)
      const hoje = new Date().toISOString().slice(0, 10)
      baixar(montarXlsx(arquivos), `${nomeLimpo(modelo.name.replace(/\.xlsx$/i, ''))}_${nomeLimpo(obra.codigo)}_${hoje}.xlsx`)
      setMensagem({ tipo: 'ok', texto: `Planilha gerada: ${plural(r.linhas, 'caminhão', 'caminhões')}. As informações a mais começam na coluna ${r.colunaDosExtras}.` })
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
      <p class="discreto">
        Escolha a planilha de controle de concreto da obra (.xlsx). O app preenche a aba "{LAYOUT_PADRAO.aba}", uma linha por caminhão (
        {plural(linhas.length, 'caminhão', 'caminhões')} da obra agora
        {doExemplo > 0 && `; ${doExemplo === 1 ? 'o caminhão' : `os ${doExemplo} caminhões`} da concretagem de exemplo não ${doExemplo === 1 ? 'entra' : 'entram'}`}), e deixa o resto do arquivo como está. O que o app sabe a mais vai nas colunas depois
        da tabela.
      </p>
      <label>
        <span>Modelo da obra (.xlsx)</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          data-testid="planilha-modelo"
          onChange={(e) => {
            setModelo(e.currentTarget.files?.[0] ?? null)
            setMensagem(null)
          }}
        />
      </label>
      <div class="acoes">
        <button type="button" class="principal" onClick={gerar} disabled={!modelo || gerando}>
          {gerando ? 'Gerando…' : 'Gerar planilha'}
        </button>
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
