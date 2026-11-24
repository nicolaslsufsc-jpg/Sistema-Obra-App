// Ficha de concreto usinado de um dia: os caminhões de todas as concretagens do dia, na ordem das
// colunas da ficha. Copiar e colar na planilha da obra, baixar CSV ou imprimir.
import { useEffect, useState } from 'preact/hooks'
import { COLUNAS_FICHA, csvDoDia, fichaDoDia, linhasParaExcel } from '../ficha_concreto'
import type { Contexto } from './ModuloConcreto'
import { Topo, numBR } from './comum'
import { Ajuda } from '../../telas/Ajuda'

export function TelaFicha({ ctx, data }: { ctx: Contexto; data: string }) {
  const { dados, obra, voltar, ir } = ctx
  const [mensagem, setMensagem] = useState('')
  const ficha = fichaDoDia({
    obra: { codigo: obra.codigo, nome: obra.nome },
    data,
    concretagens: dados.concretagens,
    caminhoesDe: dados.caminhoesDe,
    pavimentos: new Map(dados.pavimentos.map((p) => [p.id, p.nome])),
  })
  const nomeArquivo = `${data}_concreto-usinado_${obra.codigo}.csv`

  // A ficha é larga: imprime deitada. Só enquanto esta tela está aberta.
  useEffect(() => {
    const estilo = document.createElement('style')
    estilo.textContent = '@page { size: A4 landscape; margin: 10mm; }'
    document.head.appendChild(estilo)
    return () => estilo.remove()
  }, [])

  const baixar = () => {
    const blob = new Blob([csvDoDia(ficha)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(linhasParaExcel(ficha))
      setMensagem('Copiado. Na planilha da obra, clique na primeira célula da tabela e cole.')
    } catch {
      setMensagem('Não deu para copiar neste aparelho. Use "Baixar CSV".')
    }
  }

  return (
    <main class="tela cc-ficha">
      <Topo titulo="Ficha de concreto usinado" sub={`${obra.codigo} · ${ficha.cabecalho.data}`} aoVoltar={voltar} />

      <section class="cartao cc-ficha-cab">
        <h2 class="cc-so-impressao">Controle de concreto usinado</h2>
        <dl class="cc-dados">
          <dt>Obra</dt>
          <dd>{ficha.cabecalho.obra}</dd>
          <dt>Fornecedor</dt>
          <dd>{ficha.cabecalho.fornecedor || '—'}</dd>
          <dt>Data</dt>
          <dd>{ficha.cabecalho.data}</dd>
          <dt>fck</dt>
          <dd>{ficha.cabecalho.fck ? `${ficha.cabecalho.fck} MPa` : '—'}</dd>
          <dt>Brita</dt>
          <dd>{ficha.cabecalho.brita || '—'}</dd>
          <dt>Slump</dt>
          <dd>{ficha.cabecalho.slump ? `${ficha.cabecalho.slump} cm` : '—'}</dd>
          <dt>Total</dt>
          <dd>
            {ficha.linhas.length} {ficha.linhas.length === 1 ? 'caminhão' : 'caminhões'} · {numBR(ficha.volumeTotal, 2)} m³
          </dd>
        </dl>
      </section>

      {ficha.avisos.map((a) => (
        <p key={a} class="aviso nao-imprimir">
          {a}
        </p>
      ))}

      <div class="acoes nao-imprimir">
        <button type="button" class="principal" onClick={copiar} disabled={ficha.linhas.length === 0}>
          Copiar para a planilha (Excel)
        </button>
        <button type="button" onClick={baixar} disabled={ficha.linhas.length === 0}>
          Baixar CSV
        </button>
        <button type="button" onClick={() => window.print()} disabled={ficha.linhas.length === 0}>
          Imprimir
        </button>
      </div>
      {mensagem && (
        <p class="aviso nao-imprimir" role="status">
          {mensagem}
        </p>
      )}

      {ficha.linhas.length === 0 ? (
        <p class="discreto">Sem caminhões neste dia</p>
      ) : (
        <div class="cc-rolagem">
          <p class="discreto cc-dica-rolagem nao-imprimir">Arraste a tabela para o lado para ver todas as colunas.</p>
          <table class="cc-tabela cc-tabela-ficha" data-testid="ficha-concreto">
            <thead>
              <tr>
                {COLUNAS_FICHA.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ficha.linhas.map((l) => (
                <tr key={`${l.concretagemRaiz}-${l.caminhao}`}>
                  <td>{l.data}</td>
                  <td>{numBR(l.fck)}</td>
                  <td>{l.lacre}</td>
                  <td>
                    <button type="button" class="cc-link nao-imprimir" onClick={() => ir({ nome: 'concretagem', raiz: l.concretagemRaiz })}>
                      {l.caminhao}
                    </button>
                    <span class="cc-so-impressao">{l.caminhao}</span>
                  </td>
                  <td>{l.nf}</td>
                  <td>{numBR(l.volume, 2)}</td>
                  <td>{l.ac}</td>
                  <td>{numBR(l.slump)}</td>
                  <td>{l.cps ?? ''}</td>
                  <td>{l.saida}</td>
                  <td>{l.chegada}</td>
                  <td>{l.inicio}</td>
                  <td>{l.fim}</td>
                  <td>{l.observacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p class="discreto nao-imprimir so-com-ajuda">
        Lacre e A/C: em branco.
        <Ajuda>
          Lacre e A/C não são registrados no app: ficam em branco, como no lançamento à mão. Água adicionada e o local de cada concretagem vão na
          observação. Em "Copiar", as linhas vão na ordem das colunas da ficha: cole na primeira célula da tabela.
        </Ajuda>
      </p>
    </main>
  )
}
