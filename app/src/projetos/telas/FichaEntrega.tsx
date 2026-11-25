// Desenho da ficha de entrega no formato do formulário da obra (23/11/2026). A4 deitado: cabeçalho do
// formulário (logo, título, referência, datas, versão, página), OBRA, caixas de disciplina e a tabela com
// uma linha por prancha entregue, com a assinatura de quem recebeu. Tudo o que é da empresa vem do modelo
// (dado da obra, ver projetos/ficha_entrega.ts). Sai pelo Exportar PDF do comprovante.
import type { ModeloFichaEntrega, LinhaDaFicha } from '../ficha_entrega'
import { paginasDaFicha } from '../ficha_entrega'
import '../ficha_entrega.css'

export function FichaEntrega({
  modelo,
  obra,
  linhas,
  marcadas,
  outros,
  assinatura,
}: {
  modelo: ModeloFichaEntrega
  obra: string
  linhas: readonly LinhaDaFicha[]
  marcadas: ReadonlySet<string>
  outros: readonly string[]
  /** imagem da assinatura (data URL ou endereço); sem ela, a célula fica em branco para assinar à mão */
  assinatura: string | null
}) {
  const paginas = paginasDaFicha(linhas, modelo.linhas_por_pagina)
  const caixas = modelo.disciplinas
  // as caixas em duas linhas, como no formulário impresso
  const meio = Math.ceil(caixas.length * 0.66)
  return (
    <div class="fe-ficha" data-testid="ficha-entrega">
      {paginas.map((pagina, p) => (
        <section class="fe-pagina" key={p} data-testid="ficha-entrega-pagina">
          <table class="fe-cab">
            <colgroup>
              <col class="fe-c-logo" />
              <col />
              <col class="fe-c-ref1" />
              <col class="fe-c-ref2" />
            </colgroup>
            <tbody>
              <tr>
                <td class="fe-logo" rowspan={1}>
                  {modelo.logo ? <img src={modelo.logo} alt={modelo.empresa ?? 'logo'} /> : <b>{modelo.empresa ?? ''}</b>}
                </td>
                <td class="fe-nome">
                  <span class="fe-rot">Nome:</span>
                  <div class="fe-titulo">
                    {modelo.titulo.map((t) => (
                      <div key={t}>{t}</div>
                    ))}
                  </div>
                </td>
                <td colspan={2} class="fe-dir">
                  <span class="fe-rot">Referência / Arquivo:</span>
                  <b class="fe-val">{modelo.referencia}</b>
                  <span class="fe-rot fe-sep">Data de emissão:</span>
                  <b class="fe-val">{modelo.emissao}</b>
                </td>
              </tr>
              <tr>
                <td colspan={2}>
                  <span class="fe-rot">Tipo de documento:</span>
                  <b class="fe-val fe-esq">{modelo.tipo}</b>
                </td>
                <td colspan={2} class="fe-dir">
                  <span class="fe-rot">Data da última revisão:</span>
                  <b class="fe-val">{modelo.revisao}</b>
                </td>
              </tr>
              <tr>
                <td colspan={2}>
                  <span class="fe-rot">Setores envolvidos:</span>
                  <b class="fe-val fe-esq">{modelo.setores}</b>
                </td>
                <td class="fe-dir">
                  <span class="fe-rot">Versão:</span>
                  <b class="fe-val">{modelo.versao}</b>
                </td>
                <td class="fe-dir">
                  <span class="fe-rot">Página:</span>
                  <b class="fe-val">
                    {p + 1}/{paginas.length}
                  </b>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="fe-corpo">
            <p class="fe-obra">
              OBRA: <span class="fe-preenche">{obra}</span>
            </p>
            <p class="fe-disc" data-testid="ficha-entrega-disciplinas">
              <span class="fe-disc-rot">DISCIPLINA:</span>
              {caixas.slice(0, meio).map((c) => (
                <Caixa key={c.nome} nome={c.nome} marcada={marcadas.has(c.nome)} />
              ))}
            </p>
            <p class="fe-disc fe-disc-2">
              {caixas.slice(meio).map((c) => (
                <Caixa key={c.nome} nome={c.nome} marcada={marcadas.has(c.nome)} extra={c.outros ? outros.join(', ') : undefined} />
              ))}
            </p>

            <table class="fe-tabela">
              <colgroup>
                <col class="fe-c-codigo" />
                <col />
                <col class="fe-c-versao" />
                <col class="fe-c-copias" />
                <col class="fe-c-data" />
                <col class="fe-c-emp" />
                <col class="fe-c-nome" />
                <col class="fe-c-assinatura" />
              </colgroup>
              <thead>
                <tr>
                  <th rowspan={2}>CÓDIGO DA PRANCHA</th>
                  <th rowspan={2}>DESCRIÇÃO</th>
                  <th rowspan={2}>VERSÃO</th>
                  <th colspan={5}>ENTREGA</th>
                </tr>
                <tr>
                  <th>Nº DE CÓPIAS</th>
                  <th>DATA DE ENTREGA</th>
                  <th>EMPREITEIRA</th>
                  <th>NOME</th>
                  <th>ASSINATURA</th>
                </tr>
              </thead>
              <tbody>
                {pagina.map((l, i) =>
                  l ? (
                    <tr key={i} data-testid="ficha-entrega-linha">
                      <td class="fe-cod">{l.codigo}</td>
                      <td>{l.descricao}</td>
                      <td class="fe-centro">{l.versao}</td>
                      <td class="fe-centro">{l.copias}</td>
                      <td class="fe-centro">{l.data}</td>
                      <td>{l.empreiteira}</td>
                      <td>{l.nome}</td>
                      <td class="fe-ass">{assinatura ? <img src={assinatura} alt={`assinatura de ${l.nome || 'quem recebeu'}`} /> : null}</td>
                    </tr>
                  ) : (
                    <tr key={i} class="fe-vazia">
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

function Caixa({ nome, marcada, extra }: { nome: string; marcada: boolean; extra?: string }) {
  return (
    <span class={`fe-caixa${marcada ? ' marcada' : ''}`} data-marcada={marcada ? 'sim' : undefined}>
      ( {marcada ? 'X' : ' '} ) {nome}
      {extra !== undefined && <span class="fe-preenche fe-outros">{extra}</span>}
    </span>
  )
}

/**
 * A assinatura guardada é o quadro inteiro; na linha da ficha só cabe o risco. Corta a imagem no que foi
 * riscado (com uma folga). Se não der para ler a imagem (outro endereço, sem canvas), volta a original.
 */
export async function recortarAssinatura(src: string | null): Promise<string | null> {
  if (!src || typeof document === 'undefined') return src
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((ok, erro) => {
      img.onload = () => ok()
      img.onerror = () => erro(new Error('imagem'))
      img.src = src
    })
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h) return src
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const c = cv.getContext('2d', { willReadFrequently: true })
    if (!c) return src
    c.drawImage(img, 0, 0)
    const px = c.getImageData(0, 0, w, h).data
    let x0 = w
    let y0 = h
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        // risco = ponto visível e escuro (o fundo pode ser transparente ou branco)
        if (px[i + 3] > 40 && px[i] + px[i + 1] + px[i + 2] < 600) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    if (x1 < 0) return src
    const folga = Math.round(Math.max(x1 - x0, y1 - y0) * 0.05) + 2
    x0 = Math.max(0, x0 - folga)
    y0 = Math.max(0, y0 - folga)
    x1 = Math.min(w - 1, x1 + folga)
    y1 = Math.min(h - 1, y1 + folga)
    const out = document.createElement('canvas')
    out.width = x1 - x0 + 1
    out.height = y1 - y0 + 1
    out.getContext('2d')!.drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  } catch {
    return src
  }
}
