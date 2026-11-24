/**
 * Ícones dos botões do menu da FVS (22/11/2026, pedido do Nicolas: "so as lajes tem icones, bota um icone para
 * cada"). Um conjunto só, igual ao da armadura de laje (IconeDaCamada, na TelaInicio): 48x48, traço de 3,
 * sem preenchimento, na cor do texto (classe fv-bt-icone, 40 px).
 */

/** Desenho de cada item: abas da forma, seções do pavimento e disciplinas do menu. */
const DESENHOS: Record<string, string> = {
  // forma
  pilar: 'M15 15h18v18H15z M21 21h6v6h-6z',
  viga: 'M4 19h40v10H4z',
  laje: 'M6 10h36v28H6z M6 24h36 M24 10v28',
  furo: 'M4 17h40v14H4z M28 24a4 4 0 1 1-8 0a4 4 0 1 1 8 0',
  barra: 'M6 16h36M6 32h36M16 6v36M32 6v36',
  forma: 'M6 12h36M6 36h36M10 8v32M38 8v32 M24 12v24',
  // bloco de fundação: o bloco com o pilar em cima e duas estacas
  bloco: 'M8 18h32v12H8z M20 8h8v10h-8z M14 30v12 M34 30v12',
  furos: 'M18 24a4 4 0 1 1-8 0a4 4 0 1 1 8 0 M28 24a4 4 0 1 1-8 0a4 4 0 1 1 8 0 M38 24a4 4 0 1 1-8 0a4 4 0 1 1 8 0',
  // paredes e ambientes
  paredes: 'M6 12h36v24H6z M6 24h36 M18 12v12 M30 12v12 M12 24v12 M24 24v12 M36 24v12',
  ambientes: 'M6 8h36v32H6z M24 8v14 M24 30v10 M6 24h18',
  acabamentos: 'M8 8h26v10H8z M34 13h6v12H24v6 M22 31h4v13h-4z',
  // instalações
  hidro: 'M24 6C24 6 12 20 12 29a12 12 0 0 0 24 0C36 20 24 6 24 6z',
  sanitario: 'M38 24a14 14 0 1 1-28 0a14 14 0 1 1 28 0 M17 19h14M15 24h18M17 29h14',
  eletrico: 'M27 4L12 27h11l-3 17 16-24H25z',
  preventivo: 'M24 44c-8 0-13-6-13-13 0-8 7-12 8-20 4 4 5 8 5 12 2-2 3-4 3-7 5 4 10 9 10 15 0 7-5 13-13 13z',
  spda: 'M24 4v30 M18 10l6-6 6 6 M14 34h20 M17 39h14 M21 44h6',
  instalacoes: 'M18 4v10M30 4v10M12 14h24v8a12 12 0 0 1-24 0z M24 34v10',
  // o que o app não conhece
  outro: 'M38 24a14 14 0 1 1-28 0a14 14 0 1 1 28 0',
}

/** Sinônimos: aba da forma pela letra, disciplina do menu pelo id. */
const APELIDOS: Record<string, string> = {
  P: 'pilar',
  V: 'viga',
  L: 'laje',
  F: 'furo',
  B: 'barra',
  K: 'bloco',
  fundacao: 'bloco',
  estrutura: 'forma',
  furacao: 'furos',
  alvenaria: 'paredes',
  vedacao: 'paredes',
}

export function IconeDoItem({ qual }: { qual: string }) {
  const d = DESENHOS[APELIDOS[qual] ?? qual] ?? DESENHOS.outro
  return (
    <svg class="fv-bt-icone" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" data-icone={APELIDOS[qual] ?? qual}>
      <path d={d} />
    </svg>
  )
}
