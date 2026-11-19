// Laudo do laboratório: os CPs de uma idade, de todos os caminhões da concretagem, de uma vez.
// A conta do que gravar fica em ../laudo.ts.
import { useEffect, useState } from 'preact/hooks'
import { dataLocal, somarDias } from '../cps'
import { cancelar, corrigir, podeLancarLaudo, registrar, type Caminhao, type Concretagem, type Resultado } from '../dados'
import { colunasDoLaudo, dataSugerida, laudoDaIdade, planejarLaudo, resultadosPorCaixa, ultimaDataDeEnsaio, umaCasa, valorAtual } from '../laudo'
import type { Contexto } from './ModuloConcreto'
import { corDoCaminhao, dataBR, lerNumero, numBR, plural, Topo } from './comum'
import { nomeDaConcretagem } from '../exemplo'
import { ACEITAR_LAUDO, guardarLaudo, recusaDoLaudo, urlDoLaudo } from '../laudo_arquivo'

/** O laudo já anexado a esta idade: abre o PDF ou a foto guardada no aparelho. */
function LaudoAnexado({ arquivoId }: { arquivoId: string }) {
  const [aberto, setAberto] = useState<Awaited<ReturnType<typeof urlDoLaudo>> | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    let criada: string | null = null
    urlDoLaudo(arquivoId)
      .then((u) => {
        if (!vivo) {
          if (u) URL.revokeObjectURL(u.url)
          return
        }
        criada = u?.url ?? null
        setAberto(u)
      })
      .catch(() => vivo && setAberto(null))
    return () => {
      vivo = false
      if (criada) URL.revokeObjectURL(criada)
    }
  }, [arquivoId])
  if (aberto === undefined) return <p class="discreto">Abrindo o laudo anexado…</p>
  if (aberto === null) return <p class="discreto" data-testid="laudo-anexo-fora">Laudo anexado (o arquivo não está neste aparelho).</p>
  // não é PDF nem foto de verdade: só baixa (numa aba, HTML ou SVG rodariam)
  if (!aberto.abrir) {
    return (
      <a class="botao" href={aberto.url} download="laudo" data-testid="laudo-anexo">
        Baixar o laudo anexado
      </a>
    )
  }
  return (
    <a class="botao" href={aberto.url} target="_blank" rel="noopener" data-testid="laudo-anexo">
      Abrir o laudo anexado ({aberto.foto ? 'foto' : 'PDF'})
    </a>
  )
}

const chave = (caminhaoId: string, numeroCp: number) => `${caminhaoId}|${numeroCp}`

/** Idade que a tela abre: a primeira que já rompeu e ainda tem caminhão sem resultado. */
function idadeInicial(conc: Concretagem, cams: readonly Caminhao[], existentes: readonly Resultado[], hoje: string): number {
  const idades = [...new Set(conc.idades_dias)].sort((a, b) => a - b)
  const rompidas = idades.filter((i) => somarDias(conc.data, i) <= hoje)
  const falta = rompidas.find((i) => cams.some((c) => !existentes.some((r) => r.caminhao_id === c.raiz && r.idade_dias === i)))
  return falta ?? rompidas.at(-1) ?? idades[0]
}

/** Texto de cada caixa quando a idade abre: o resultado que já está lançado. */
function textosIniciais(cams: readonly Caminhao[], existentes: readonly Resultado[], idade: number, colunas: number): Record<string, string> {
  const porCaixa = resultadosPorCaixa(existentes, idade)
  const t: Record<string, string> = {}
  for (const c of cams) {
    for (let k = 1; k <= colunas; k++) {
      const v = valorAtual(porCaixa, c.raiz, k)
      t[chave(c.raiz, k)] = v === null ? '' : numBR(v)
    }
  }
  return t
}

export function TelaLaudo({ ctx, concretagemRaiz }: { ctx: Contexto; concretagemRaiz: string }) {
  const { dados, obra, usuario, voltar, recarregar } = ctx
  const conc = dados.concretagens.find((x) => x.raiz === concretagemRaiz)
  const cams = conc ? (dados.caminhoesDe.get(conc.raiz) ?? []) : []
  const existentes = cams.flatMap((c) => dados.resultadosDe.get(c.raiz) ?? [])
  const hoje = dataLocal(new Date())

  const [idade, setIdade] = useState(() => (conc ? idadeInicial(conc, cams, existentes, hoje) : 7))
  const colunas = conc ? colunasDoLaudo(conc.cps_por_idade, existentes, idade) : 0
  const [textos, setTextos] = useState(() => textosIniciais(cams, existentes, idade, colunas))
  const [data, setData] = useState(() => (conc ? dataSugerida(existentes, idade, somarDias(conc.data, idade)) : ''))
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [mexeu, setMexeu] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erroArquivo, setErroArquivo] = useState('')

  if (!conc) {
    return (
      <main class="tela">
        <Topo titulo="Laudo" aoVoltar={voltar} />
        <p>Esta concretagem foi apagada.</p>
      </main>
    )
  }
  const pav = dados.pavimentos.find((p) => p.id === conc.pavimento_id)
  const idades = [...new Set(conc.idades_dias)].sort((a, b) => a - b)
  const controle = idades[idades.length - 1]
  const anexado = laudoDaIdade(existentes, idade)

  const trocarIdade = (i: number) => {
    if (i === idade) return
    if (mexeu && !confirm(`Os valores de ${idade} dias ainda não foram salvos. Trocar para ${i} dias e perder o que foi digitado?`)) return
    setMexeu(false)
    const n = colunasDoLaudo(conc.cps_por_idade, existentes, i)
    setIdade(i)
    setTextos(textosIniciais(cams, existentes, i, n))
    setData(dataSugerida(existentes, i, somarDias(conc.data, i)))
    setErros([])
    setArquivo(null)
    setErroArquivo('')
  }

  const nomeDoCaminhao = (raiz: string) => {
    const c = cams.find((x) => x.raiz === raiz)
    return c ? `Caminhão ${c.sequencia}` : 'Caminhão'
  }

  const salvar = async () => {
    const caixas = cams.flatMap((c) =>
      Array.from({ length: colunas }, (_, i) => ({ caminhao_id: c.raiz, numero_cp: i + 1, valor: lerNumero(textos[chave(c.raiz, i + 1)] ?? '') })),
    )
    const base = { idade, dataEnsaio: data || null, dataMoldagem: conc.data, caixas, existentes, nomeDoCaminhao }
    // confere antes de guardar o arquivo: laudo com erro não deixa arquivo solto na fila
    const previa = planejarLaudo({ ...base, laudoArquivoId: arquivo ? 'escolhido' : null })
    if (previa.erros.length > 0) return setErros(previa.erros)
    if (previa.gravacoes.length === 0) {
      return setErros([arquivo ? 'Para anexar o laudo, digite os resultados desta idade.' : 'Nada para salvar: nenhum valor novo ou diferente do que já está lançado.'])
    }
    setErros([])
    setSalvando(true)
    try {
      const laudoArquivoId = arquivo ? await guardarLaudo(obra.id, usuario.id, arquivo) : null
      const plano = planejarLaudo({ ...base, laudoArquivoId })
      for (const g of plano.gravacoes) {
        if (g.tipo === 'novo') await registrar('cp_resultados', obra.id, usuario.id, g.campos)
        else if (g.tipo === 'corrigir') await corrigir('cp_resultados', obra.id, usuario.id, g.atual, g.mudancas)
        else await cancelar('cp_resultados', obra.id, usuario.id, g.atual)
      }
      await recarregar()
      voltar()
    } catch (e) {
      setSalvando(false)
      setErros([`Não salvou: ${e instanceof Error ? e.message : String(e)}`])
    }
  }

  // Enter no teclado do celular vai para a próxima caixa (não salva no meio do laudo)
  const proximaCaixa = (ev: KeyboardEvent) => {
    if (ev.key !== 'Enter') return
    ev.preventDefault()
    const caixas = [...document.querySelectorAll<HTMLInputElement>('.cc-laudo input')]
    const i = caixas.indexOf(ev.currentTarget as HTMLInputElement)
    if (i >= 0 && i < caixas.length - 1) caixas[i + 1].focus()
    else (ev.currentTarget as HTMLInputElement).blur()
  }

  if (!podeLancarLaudo(obra.papel)) {
    return (
      <main class="tela">
        <Topo titulo={`Laudo · ${dataBR(conc.data)}`} aoVoltar={voltar} />
        <p>Só gestor ou administrador da obra lança laudo.</p>
      </main>
    )
  }

  return (
    <main class="tela">
      <Topo
        titulo={`Laudo · ${dataBR(conc.data)}`}
        sub={`${pav?.nome ?? ''} · ${nomeDaConcretagem(conc)} · fck ${numBR(conc.fck_mpa)} MPa`}
        aoVoltar={voltar}
      />

      {idades.length > 1 && (
        <div class="cc-seg" role="tablist" data-testid="laudo-idades">
          {idades.map((i) => (
            <button key={i} type="button" role="tab" aria-selected={i === idade} class={i === idade ? 'on' : ''} onClick={() => trocarIdade(i)}>
              {i} dias
            </button>
          ))}
        </div>
      )}
      <p class="discreto">
        Moldagem {dataBR(conc.data)} · rompimento de {idade} dias previsto para {dataBR(somarDias(conc.data, idade))}
        {idade === controle ? ' · esta é a idade que vale para o fck' : ''}
      </p>

      <label class="cc-campo">
        <span>Data do ensaio</span>
        <input type="date" value={data} min={conc.data} max={ultimaDataDeEnsaio(hoje)} onInput={(e) => setData(e.currentTarget.value)} data-testid="laudo-data" />
      </label>

      <div class="cc-campo" data-testid="laudo-arquivo-campo">
        <span>Arquivo do laudo (PDF ou foto, opcional)</span>
        {anexado && !arquivo && <LaudoAnexado arquivoId={anexado} />}
        <input
          type="file"
          accept={ACEITAR_LAUDO}
          aria-label="Arquivo do laudo"
          data-testid="laudo-arquivo"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0] ?? null
            const recusa = f ? recusaDoLaudo(f) : null
            setErroArquivo(recusa ?? '')
            setArquivo(recusa ? null : f)
            if (recusa) e.currentTarget.value = ''
            if (f && !recusa) setMexeu(true)
          }}
        />
        {arquivo && <span class="discreto">{anexado ? 'Troca o laudo anexado ao salvar' : 'Vai junto ao salvar'}: {arquivo.name}</span>}
        {erroArquivo && (
          <span class="erro" role="alert" data-testid="laudo-arquivo-erro">
            {erroArquivo}
          </span>
        )}
      </div>

      {cams.length === 0 ? (
        <p class="discreto">Nenhum caminhão registrado nesta concretagem.</p>
      ) : (
        <>
          <p class="discreto">Digite em MPa, como está no laudo. Caixa vazia não grava nada.</p>
          <div class="cc-rolagem">
            <table class="cc-tabela cc-laudo" data-testid="laudo">
              <thead>
                <tr>
                  <th>Caminhão</th>
                  {Array.from({ length: colunas }, (_, i) => (
                    <th key={i}>CP{i + 1}</th>
                  ))}
                  <th>Exemplar</th>
                </tr>
              </thead>
              <tbody>
                {cams.map((c) => {
                  const valores = Array.from({ length: colunas }, (_, i) => lerNumero(textos[chave(c.raiz, i + 1)] ?? ''))
                  const validos = valores.filter((v): v is number => v !== null && !Number.isNaN(v) && v >= 0 && v <= 200)
                  const exemplar = validos.length > 0 ? umaCasa(Math.max(...validos)) : null
                  const abaixo = exemplar !== null && idade === controle && exemplar < conc.fck_mpa
                  return (
                    <tr key={c.raiz} data-testid={`laudo-caminhao-${c.sequencia}`}>
                      <td>
                        <span class="cc-laudo-cam">
                          <span class="cc-bolinha" style={{ background: corDoCaminhao(c.sequencia) }}>
                            {c.sequencia}
                          </span>
                          <span>NF {c.nota_fiscal || '—'}</span>
                        </span>
                      </td>
                      {valores.map((v, i) => (
                        <td key={i}>
                          <input
                            inputMode="decimal"
                            enterKeyHint="next"
                            aria-label={`Caminhão ${c.sequencia}, CP${i + 1}, MPa`}
                            class={v !== null && Number.isNaN(v) ? 'cc-errado' : ''}
                            value={textos[chave(c.raiz, i + 1)] ?? ''}
                            onInput={(e) => {
                              const valor = e.currentTarget.value
                              setTextos((t) => ({ ...t, [chave(c.raiz, i + 1)]: valor }))
                              setMexeu(true)
                            }}
                            onKeyDown={proximaCaixa}
                          />
                        </td>
                      ))}
                      <td class={abaixo ? 'cc-abaixo' : ''} data-testid={`laudo-exemplar-${c.sequencia}`}>
                        {exemplar === null ? '—' : numBR(exemplar)}
                        {abaixo ? ' abaixo do fck' : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {erros.length > 0 && (
            <ul class="erro" data-testid="laudo-erros">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button type="button" class="principal cc-largo" disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando…' : `Salvar laudo de ${idade} dias`}
          </button>
          <p class="discreto">
            {plural(cams.length, 'caminhão', 'caminhões')} · {conc.cps_por_idade} CP{conc.cps_por_idade === 1 ? '' : 's'} por idade. Valor mudado fica
            como correção: o anterior continua no histórico.
          </p>
        </>
      )}
    </main>
  )
}
