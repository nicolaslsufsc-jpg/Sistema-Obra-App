// Página do desenho dos caminhões no PDF do relatório da concretagem (26/11/2026): a planta com as
// áreas unidas por caminhão, o número de cada um e a legenda, antes das tabelas. A folha padrão
// (telas/ExportarPdf.tsx, do Front end) vem logo depois, inteira e sem mudança: aqui ela só é usada.
import type { ObraLocal } from '../../nucleo/conta'
import { Folha } from '../../telas/ExportarPdf'
import { dataHoraBR, type FolhaPdf } from '../../telas/folha_pdf'
import { caminhoAberto, caminhoFechado, type FiguraDoDesenho } from '../pdf_desenho'

export interface LegendaDoCaminhao {
  sequencia: number
  cor: string
  texto: string
}

function Figura({ f }: { f: FiguraDoDesenho }) {
  const [x, y, w, h] = f.recorte
  // tamanhos em px da planta, proporcionais ao recorte, para o traço sair igual em qualquer escala
  const u = Math.max(w, h) / 500
  return (
    <svg class="cc-pdf-figura" viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" data-testid="pdf-desenho-figura">
      <rect x={x} y={y} width={w} height={h} fill="#fff" />
      {f.ladrilhos.map((l) => (
        <image key={l.url} href={l.url} x={l.x} y={l.y} width={l.lado} height={l.lado} preserveAspectRatio="none" />
      ))}
      {f.pecas.map((p) => (
        <g key={p.nome}>
          {p.polys.map((pl, i) => (
            <path key={i} d={caminhoFechado(pl)} fill="#eef0f3" stroke="#5b6470" stroke-width={u} />
          ))}
          <text x={p.centro[0]} y={p.centro[1]} font-size={7 * u} text-anchor="middle" dominant-baseline="central" fill="#333">
            {p.nome}
          </text>
        </g>
      ))}
      {f.caminhoes.map((c) =>
        c.grupos.map((g, i) => (
          <g key={`${c.sequencia}-${i}`}>
            <path d={g.aneis.map(caminhoFechado).join('')} fill={c.cor} fill-opacity={g.laje ? 0.35 : 0.15} fill-rule="nonzero" />
            <path d={g.borda.map(caminhoAberto).join('')} fill="none" stroke={c.cor} stroke-width={2.2 * u} stroke-linejoin="round" stroke-linecap="round" />
          </g>
        )),
      )}
      {/* os números por cima de todas as áreas */}
      {f.caminhoes.map((c) =>
        c.grupos.map((g, i) => (
          <g key={`n${c.sequencia}-${i}`}>
            <circle cx={g.rotulo[0]} cy={g.rotulo[1]} r={9 * u} fill="#fff" stroke={c.cor} stroke-width={2 * u} />
            <text x={g.rotulo[0]} y={g.rotulo[1]} font-size={11 * u} font-weight="700" text-anchor="middle" dominant-baseline="central" fill={c.cor}>
              {c.sequencia}
            </text>
          </g>
        )),
      )}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#999" stroke-width={u} />
    </svg>
  )
}

export function RelatorioComDesenho({
  folha,
  figuras,
  legenda,
  obra,
  quem,
  quando,
}: {
  folha: FolhaPdf
  figuras: readonly FiguraDoDesenho[]
  legenda: readonly LegendaDoCaminhao[]
  obra: Pick<ObraLocal, 'codigo' | 'nome' | 'empresa'>
  quem: string
  quando: Date
}) {
  const comLaje = figuras.some((f) => f.caminhoes.some((c) => c.grupos.some((g) => g.laje)))
  return (
    <div class="cc-pdf">
      {figuras.map((f, i) => (
        <section class="cc-pdf-desenho" key={f.trecho + i} data-testid="pdf-desenho">
          <header class="sf-cab">
            <div class="sf-obra">
              <b>
                {obra.codigo} · {obra.nome}
              </b>
              {obra.empresa && <span>{obra.empresa}</span>}
            </div>
            <div class="sf-meta">
              <span>Gerado em {dataHoraBR(quando)}</span>
              <span>por {quem}</span>
            </div>
          </header>
          <h1 class="sf-titulo">
            {folha.modulo} · Onde foi cada caminhão{figuras.length > 1 ? ` · ${f.trecho}` : ''}
          </h1>
          {folha.sub && <p class="sf-sub">{folha.sub}</p>}
          <Figura f={f} />
          <ul class="cc-pdf-legenda">
            {legenda
              .filter((l) => f.caminhoes.some((c) => c.sequencia === l.sequencia))
              .map((l) => (
                <li key={l.sequencia}>
                  <i style={{ borderColor: l.cor, color: l.cor }}>{l.sequencia}</i>
                  {l.texto}
                </li>
              ))}
          </ul>
          <p class="sf-nota">
            Cada cor é um caminhão; áreas do mesmo caminhão que se tocam aparecem como um desenho só.
            {comLaje ? ' Área mais cheia: laje concretada. Área clara: pilares ou vigas.' : ''}
          </p>
        </section>
      ))}
      <Folha folha={folha} obra={obra} quem={quem} quando={quando} />
    </div>
  )
}
