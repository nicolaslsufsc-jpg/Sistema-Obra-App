// Ícones do menu (heurísticas de Nielsen, 20/11/2026: "reconhecer em vez de lembrar").
// Desenhados aqui, sem biblioteca e sem arquivo de fora: traço de 2 px numa grade de 24, que segue a cor do texto.
// Sempre com o texto junto (o ícone é aria-hidden; quem lê a tela ouve o nome do módulo).
import type { IdModulo } from '../modulos'

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
}

function Svg({ tracos, classe }: { tracos: string[]; classe: string }) {
  return (
    <svg
      class={classe}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
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
