// Ícones do app (heurísticas de Nielsen, 20/11/2026: "reconhecer em vez de lembrar"; guia de estilo, 23/11/2026:
// um conjunto só, traço fino, mesmo tamanho). Desenhados aqui, sem biblioteca e sem arquivo de fora: traço de
// 1,75 px numa grade de 24, que segue a cor do texto. Os de módulo e de botão saem em 24 px; os de ação, em 20 px.
// Sempre com o texto junto ou com o nome no botão (o ícone é aria-hidden; quem lê a tela ouve o nome).
import type { IdModulo } from '../modulos'
import './icones.css'

export const TRACO_ICONE = 1.75

const TRACOS: Record<IdModulo, string[]> = {
  // prancheta com visto: ficha de verificação
  fvs: ['M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2', 'M9 3h6v3H9z', 'M9 13.5l2 2 4-4.5'],
  // caminhão: concretagem
  concreto: ['M2 6h11v10H2z', 'M13 9h4l4 4v3h-8', 'M6.5 18.5a1.5 1.5 0 1 0 0-.01', 'M16.5 18.5a1.5 1.5 0 1 0 0-.01'],
  // folha com linhas: documento
  documentos: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
  // folhas empilhadas: pranchas
  projetos: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5', 'M3 17.5l9 5 9-5'],
  // caderno: diário
  relatorios: ['M6 3h11a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z', 'M5 17a2 2 0 0 1 2-2h12', 'M9 7h6', 'M9 11h4'],
  // cubo: modelo 3D
  ifc: ['M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z', 'M3.5 7.25L12 12l8.5-4.75', 'M12 12v9.5'],
  // folha dobrada com um marcador: mapa do canteiro
  canteiro: ['M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z', 'M9 4v14', 'M15 6v14'],
}

/** Ícones de ação (no lugar de "‹", "›", "×", "▾", "✓", "↗" escritos como texto). */
const ACOES = {
  voltar: ['M15 5l-7 7 7 7'],
  avancar: ['M9 5l7 7-7 7'],
  fechar: ['M6 6l12 12', 'M18 6L6 18'],
  abrir: ['M6 9l6 6 6-6'],
  recolher: ['M6 15l6-6 6 6'],
  feito: ['M5 12.5l4.5 4.5L19 7'],
  fora: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4'],
  importar: ['M12 15V3', 'M7 8l5-5 5 5', 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'],
  mais: ['M12 5v14', 'M5 12h14'],
} as const

export type IdIcone = keyof typeof ACOES

function Svg({ tracos, classe, tamanho = 24 }: { tracos: readonly string[]; classe: string; tamanho?: number }) {
  return (
    <svg
      class={classe}
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width={TRACO_ICONE}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {tracos.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

export function IconeModulo({ id }: { id: IdModulo }) {
  return <Svg tracos={TRACOS[id]} classe="icone-modulo" />
}

/** Seta para baixo numa bandeja: instalar o app. */
export function IconeInstalar() {
  return <Svg tracos={['M12 3v12', 'M7 10l5 5 5-5', 'M4 20h16']} classe="icone-botao" />
}

/** Ícone de ação, 20 px: <Icone id="voltar" />. */
export function Icone({ id }: { id: IdIcone }) {
  return <Svg tracos={ACOES[id]} classe={`so-icone so-icone-${id}`} tamanho={20} />
}
