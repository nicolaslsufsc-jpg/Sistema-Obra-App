// Figuras do mapa do canteiro: desenhos genéricos em SVG, feitos para este app (nenhum ícone de terceiros).
// Cada figura é um pedaço de SVG dentro de uma caixa `vb` (largura x altura). O mesmo texto serve para a
// tela e para a imagem exportada. As cores ficam aqui (e não no tema) porque a figura vai sempre sobre
// a folha branca, na tela e no papel.

export interface Figura {
  id: string
  nome: string
  /** caixa do desenho: [largura, altura] */
  vb: readonly [number, number]
  /** largura inicial na folha (a folha tem 1000 de largura) */
  tamanho: number
  svg: string
}

const T = '#1f2937' // traço
const C = `stroke="${T}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`
const FINO = `stroke="${T}" stroke-width="1.5" stroke-linecap="round" fill="none"`
const AMARELO = '#f2b01e'
const LARANJA = '#e8772e'
const CINZA = '#9aa3ad'
const CLARO = '#dfe3e8'
const AZUL = '#3b82c4'
const VIDRO = '#cfe6f5'
const VERMELHO = '#d23c3c'
const VERDE = '#4c9a5b'
const MADEIRA = '#c08a55'
const AREIA = '#e6cf8e'
const BRANCO = '#ffffff'

const roda = (x: number, y: number, r = 7) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${T}"/><circle cx="${x}" cy="${y}" r="${r * 0.4}" fill="${CLARO}"/>`

/** Três paredes de uma baia, vistas de frente, com o monte dentro. */
const baia = (monte: string) =>
  `<path d="M6 54 V14 H14 V46 H86 V14 H94 V54 Z" fill="${CINZA}" ${C}/>${monte}`

/** Galpão simples com telhado de uma água. */
const galpao = (cor: string, dentro: string) =>
  `<path d="M6 22 L94 12 V64 H6 Z" fill="${cor}" ${C}/><path d="M2 23 L98 12" ${C} fill="none"/>${dentro}`

/** Container com as ondas da chapa. */
const container = (cor: string, dentro: string) =>
  `<rect x="4" y="8" width="92" height="36" rx="2" fill="${cor}" ${C}/>` +
  `<path d="M12 12 V40 M20 12 V40 M28 12 V40 M80 12 V40 M88 12 V40" ${FINO}/>${dentro}` +
  `<path d="M10 44 V48 M90 44 V48" ${C}/>`

const pessoa = (x: number, cor: string) =>
  `<circle cx="${x}" cy="19" r="4" fill="${cor}"/><path d="M${x - 5} 38 V28 Q${x} 23 ${x + 5} 28 V38 Z" fill="${cor}"/>`

export const FIGURAS: readonly Figura[] = [
  {
    id: 'caminhao_betoneira',
    nome: 'Caminhão betoneira',
    vb: [100, 60],
    tamanho: 120,
    svg:
      `<rect x="6" y="40" width="88" height="7" fill="#6b7280" ${C}/>` +
      `<path d="M68 40 V22 Q68 18 72 18 H84 L94 30 V40 Z" fill="${AMARELO}" ${C}/>` +
      `<path d="M78 22 H84 L90 30 H78 Z" fill="${VIDRO}" ${C}/>` +
      `<ellipse cx="36" cy="25" rx="29" ry="15" transform="rotate(-10 36 25)" fill="${CLARO}" ${C}/>` +
      `<path d="M20 15 L26 40 M34 11 L41 39 M49 9 L55 35" ${FINO}/>` +
      `<path d="M60 6 H70 L66 18 H60 Z" fill="${CINZA}" ${C}/>` +
      roda(20, 50) + roda(37, 50) + roda(80, 50),
  },
  {
    id: 'bomba_concreto',
    nome: 'Bomba de concreto',
    vb: [100, 64],
    tamanho: 130,
    svg:
      `<rect x="6" y="44" width="88" height="7" fill="#6b7280" ${C}/>` +
      `<path d="M70 44 V28 Q70 24 74 24 H84 L94 35 V44 Z" fill="${VERMELHO}" ${C}/>` +
      `<path d="M79 28 H84 L90 35 H79 Z" fill="${VIDRO}" ${C}/>` +
      `<rect x="10" y="32" width="54" height="12" fill="${CLARO}" ${C}/>` +
      `<path d="M14 30 L60 12 L24 8 L70 4" stroke="${T}" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="M14 30 L60 12 L24 8 L70 4" stroke="${AMARELO}" stroke-width="2.4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="M4 34 H12 V44 H4 Z" fill="${CINZA}" ${C}/>` +
      `<path d="M30 51 V60 M24 60 H36 M60 51 V60 M54 60 H66" ${C}/>` +
      roda(18, 54) + roda(46, 54) + roda(82, 54),
  },
  {
    id: 'cacamba_entulho',
    nome: 'Caçamba de entulho',
    vb: [100, 56],
    tamanho: 90,
    svg:
      `<path d="M16 16 L24 6 L36 12 L46 5 L58 12 L70 6 L84 16 Z" fill="${CINZA}" ${C}/>` +
      `<path d="M4 16 H96 L84 50 H16 Z" fill="${LARANJA}" ${C}/>` +
      `<path d="M30 16 L34 50 M50 16 V50 M70 16 L66 50" ${FINO}/>` +
      `<path d="M8 22 H2 M92 22 H98" ${C}/>`,
  },
  {
    id: 'grua',
    nome: 'Grua',
    vb: [100, 110],
    tamanho: 150,
    svg:
      `<path d="M49 6 L8 22 M49 6 L92 22 M49 6 L24 22" ${FINO}/>` +
      `<rect x="6" y="20" width="90" height="6" fill="${AMARELO}" ${C}/>` +
      `<rect x="8" y="26" width="16" height="12" fill="${CINZA}" ${C}/>` +
      `<rect x="43" y="6" width="12" height="94" fill="${AMARELO}" ${C}/>` +
      `<path d="M43 26 L55 40 L43 54 L55 68 L43 82 L55 96 M55 26 L43 40 L55 54 L43 68 L55 82 L43 96" ${FINO}/>` +
      `<rect x="55" y="28" width="12" height="12" fill="${VIDRO}" ${C}/>` +
      `<path d="M82 26 V52 M78 52 H86 M82 52 V58 Q82 63 78 62" ${C} fill="none"/>` +
      `<rect x="30" y="100" width="38" height="7" fill="${CINZA}" ${C}/>`,
  },
  {
    id: 'guincho',
    nome: 'Elevador de obra',
    vb: [70, 110],
    tamanho: 80,
    svg:
      `<rect x="10" y="6" width="14" height="96" fill="${AMARELO}" ${C}/>` +
      `<path d="M10 14 L24 28 L10 42 L24 56 L10 70 L24 84 L10 98 M24 14 L10 28 L24 42 L10 56 L24 70 L10 84 L24 98" ${FINO}/>` +
      `<rect x="24" y="44" width="38" height="34" fill="${VERMELHO}" ${C}/>` +
      `<path d="M30 50 H56 V72 H30 Z M43 50 V72" ${FINO}/>` +
      `<path d="M43 44 V8 H17" ${FINO}/>` +
      `<rect x="4" y="102" width="62" height="6" fill="${CINZA}" ${C}/>`,
  },
  {
    id: 'betoneira',
    nome: 'Betoneira',
    vb: [80, 80],
    tamanho: 70,
    svg:
      `<path d="M14 72 L30 44 M56 72 L42 44 M10 72 H24" ${C} fill="none"/>` +
      `<path d="M20 44 H52" ${C}/>` +
      `<path d="M22 40 L18 20 Q20 10 34 8 L56 6 L62 26 L50 44 Z" fill="${LARANJA}" ${C}/>` +
      `<path d="M56 6 L62 26" stroke="${T}" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M26 22 L46 18 M27 31 L50 27" ${FINO}/>` +
      `<circle cx="66" cy="50" r="9" fill="none" ${C}/><path d="M66 41 V59 M57 50 H75" ${FINO}/>` +
      roda(56, 70, 8),
  },
  {
    id: 'andaime',
    nome: 'Andaime',
    vb: [90, 100],
    tamanho: 90,
    svg:
      `<path d="M14 96 V6 M76 96 V6" ${C}/>` +
      `<path d="M14 66 L76 36 M14 36 L76 66 M14 96 L76 66 M14 66 L76 96" ${FINO}/>` +
      `<rect x="8" y="32" width="74" height="5" fill="${MADEIRA}" ${C}/>` +
      `<rect x="8" y="63" width="74" height="5" fill="${MADEIRA}" ${C}/>` +
      `<path d="M14 14 H76 M14 22 H76" ${C}/>` +
      `<path d="M6 96 H22 M68 96 H84" ${C}/>`,
  },
  {
    id: 'baia_areia',
    nome: 'Baia de areia',
    vb: [100, 60],
    tamanho: 110,
    svg: baia(`<path d="M15 46 Q32 34 48 22 Q54 18 60 24 Q74 36 85 46 Z" fill="${AREIA}" ${C}/>`),
  },
  {
    id: 'baia_brita',
    nome: 'Baia de brita',
    vb: [100, 60],
    tamanho: 110,
    svg: baia(
      `<path d="M15 46 L40 24 L58 20 L85 46 Z" fill="${CLARO}" ${C}/>` +
        `<path d="M36 34 l5 -3 l5 3 l-2 5 h-6 Z M54 30 l5 -2 l4 4 l-4 4 h-5 Z M26 42 l5 -2 l3 4 M64 42 l5 -3 l5 4" ${FINO}/>`,
    ),
  },
  {
    id: 'deposito_cimento',
    nome: 'Depósito de cimento',
    vb: [100, 70],
    tamanho: 110,
    svg: galpao(
      BRANCO,
      [0, 1, 2].map((i) => `<rect x="${16 + i * 24}" y="50" width="22" height="10" rx="3" fill="${CLARO}" ${C}/>`).join('') +
        [0, 1].map((i) => `<rect x="${28 + i * 24}" y="40" width="22" height="10" rx="3" fill="${CLARO}" ${C}/>`).join('') +
        `<rect x="40" y="30" width="22" height="10" rx="3" fill="${CLARO}" ${C}/>`,
    ),
  },
  {
    id: 'almoxarifado',
    nome: 'Almoxarifado',
    vb: [100, 70],
    tamanho: 110,
    svg: galpao(
      AZUL,
      `<rect x="14" y="30" width="44" height="34" fill="${BRANCO}" ${C}/>` +
        `<path d="M14 41 H58 M14 52 H58" ${FINO}/>` +
        `<rect x="19" y="33" width="9" height="8" fill="${MADEIRA}" ${C}/><rect x="34" y="44" width="12" height="8" fill="${MADEIRA}" ${C}/><rect x="22" y="55" width="10" height="9" fill="${MADEIRA}" ${C}/>` +
        `<rect x="68" y="36" width="18" height="28" fill="${CLARO}" ${C}/><circle cx="72" cy="51" r="1.5" fill="${T}"/>`,
    ),
  },
  {
    id: 'container_escritorio',
    nome: 'Escritório',
    vb: [100, 52],
    tamanho: 120,
    svg: container(
      BRANCO,
      `<rect x="36" y="16" width="14" height="28" fill="${CLARO}" ${C}/><circle cx="47" cy="31" r="1.5" fill="${T}"/>` +
        `<rect x="56" y="16" width="20" height="14" fill="${VIDRO}" ${C}/><path d="M66 16 V30" ${FINO}/>`,
    ),
  },
  {
    id: 'vestiario',
    nome: 'Vestiário / banheiro',
    vb: [100, 52],
    tamanho: 120,
    svg: container(AZUL, `<rect x="34" y="12" width="44" height="30" fill="${BRANCO}" ${C}/>` + pessoa(46, T) + `<path d="M56 14 V40" ${FINO}/>` + pessoa(66, T)),
  },
  {
    id: 'refeitorio',
    nome: 'Refeitório',
    vb: [100, 70],
    tamanho: 110,
    svg: galpao(
      VERDE,
      `<circle cx="50" cy="42" r="17" fill="${BRANCO}" ${C}/>` +
        `<path d="M43 31 V53 M39 31 V38 Q39 41 43 41 Q47 41 47 38 V31" ${C} fill="none"/>` +
        `<path d="M58 53 V31 Q52 35 53 43 H58" ${C} fill="none"/>`,
    ),
  },
  {
    id: 'portao',
    nome: 'Portão de acesso',
    vb: [100, 50],
    tamanho: 120,
    svg:
      `<rect x="4" y="6" width="8" height="40" fill="${CINZA}" ${C}/><rect x="88" y="6" width="8" height="40" fill="${CINZA}" ${C}/>` +
      `<rect x="12" y="14" width="37" height="30" fill="${BRANCO}" ${C}/><rect x="51" y="14" width="37" height="30" fill="${BRANCO}" ${C}/>` +
      `<path d="M20 14 V44 M28 14 V44 M36 14 V44 M43 14 V44 M58 14 V44 M65 14 V44 M73 14 V44 M81 14 V44" ${FINO}/>` +
      `<path d="M12 14 L49 44 M88 14 L51 44" ${FINO}/>`,
  },
  {
    id: 'tapume',
    nome: 'Tapume',
    vb: [100, 34],
    tamanho: 160,
    svg:
      `<rect x="2" y="6" width="96" height="22" fill="${VERDE}" ${C}/>` +
      `<path d="M14 6 V28 M26 6 V28 M38 6 V28 M50 6 V28 M62 6 V28 M74 6 V28 M86 6 V28" ${FINO}/>` +
      `<path d="M8 28 V32 M50 28 V32 M92 28 V32" ${C}/>`,
  },
  {
    id: 'extintor',
    nome: 'Extintor',
    vb: [50, 80],
    tamanho: 40,
    svg:
      `<rect x="13" y="24" width="24" height="50" rx="8" fill="${VERMELHO}" ${C}/>` +
      `<rect x="20" y="14" width="10" height="10" fill="${CINZA}" ${C}/>` +
      `<path d="M16 12 H34 M30 16 Q44 16 42 36" ${C} fill="none"/>` +
      `<rect x="17" y="40" width="16" height="12" fill="${BRANCO}" ${C}/>`,
  },
  {
    id: 'ponto_agua',
    nome: 'Ponto de água',
    vb: [70, 80],
    tamanho: 45,
    svg:
      `<path d="M6 30 H40 Q50 30 50 40 V46 H40 V40 H6 Z" fill="${CINZA}" ${C}/>` +
      `<path d="M24 30 V18 M14 18 H34" ${C}/>` +
      `<path d="M45 54 Q53 66 45 72 Q37 66 45 54 Z" fill="${AZUL}" ${C}/>`,
  },
  {
    id: 'quadro_energia',
    nome: 'Quadro de energia',
    vb: [70, 80],
    tamanho: 45,
    svg:
      `<rect x="10" y="6" width="50" height="60" rx="3" fill="${CLARO}" ${C}/>` +
      `<path d="M38 14 L24 38 H35 L30 58 L48 32 H37 Z" fill="${AMARELO}" ${C}/>` +
      `<path d="M26 66 V76 M44 66 V76" ${C}/>`,
  },
  {
    id: 'central_aco',
    nome: 'Central de aço',
    vb: [100, 64],
    tamanho: 120,
    svg:
      `<rect x="8" y="34" width="84" height="6" fill="${MADEIRA}" ${C}/>` +
      `<path d="M16 40 V58 M84 40 V58" ${C}/>` +
      `<path d="M10 26 H90 M10 30 H90 M10 22 H90" stroke="#b5532a" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M28 18 V34 M70 18 V34" ${C}/>` +
      `<path d="M30 52 H62 V46 M36 58 H70 V52" stroke="#b5532a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M44 6 L56 6 L52 16 Z" fill="${CINZA}" ${C}/>`,
  },
  {
    id: 'central_formas',
    nome: 'Central de fôrmas',
    vb: [100, 64],
    tamanho: 120,
    svg:
      `<rect x="8" y="34" width="84" height="6" fill="${MADEIRA}" ${C}/>` +
      `<path d="M16 40 V58 M84 40 V58" ${C}/>` +
      `<path d="M52 34 A16 16 0 0 1 84 34 Z" fill="${CLARO}" ${C}/>` +
      `<path d="M56 26 l4 -4 l3 5 M66 19 l5 -1 l0 6 M77 24 l4 3 l-4 3" ${FINO}/>` +
      `<rect x="12" y="24" width="34" height="5" fill="${AREIA}" ${C}/><rect x="16" y="29" width="34" height="5" fill="${AREIA}" ${C}/>` +
      `<rect x="26" y="46" width="48" height="5" fill="${AREIA}" ${C}/><rect x="22" y="51" width="48" height="5" fill="${AREIA}" ${C}/>`,
  },
  {
    id: 'area_descarga',
    nome: 'Área de descarga',
    vb: [100, 70],
    tamanho: 140,
    svg:
      `<rect x="4" y="4" width="92" height="62" fill="#fff6d6" stroke="${T}" stroke-width="2.5" stroke-dasharray="7 5"/>` +
      `<path d="M4 20 L20 4 M4 44 L44 4 M4 66 L66 4 M26 66 L88 4 M50 66 L96 20 M74 66 L96 44" stroke="${AMARELO}" stroke-width="5"/>` +
      `<path d="M50 14 V44 M36 34 L50 50 L64 34" stroke="${T}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M30 58 H70" stroke="${T}" stroke-width="6" stroke-linecap="round"/>`,
  },
  {
    // Setor: uma área marcada com o nome dentro (o nome é escrito por quem desenha o item).
    id: 'setor',
    nome: 'Setor',
    vb: [100, 60],
    tamanho: 220,
    svg: `<rect x="1.5" y="1.5" width="97" height="57" rx="3" fill="${AZUL}" fill-opacity="0.14" stroke="${AZUL}" stroke-width="1.5" stroke-dasharray="6 4"/>`,
  },
]

const POR_ID = new Map(FIGURAS.map((f) => [f.id, f]))

export function figuraPorId(id: string): Figura | undefined {
  return POR_ID.get(id)
}

/** A figura sozinha, como SVG completo (botões da paleta). */
export function svgDaFigura(f: Figura): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f.vb[0]} ${f.vb[1]}">${f.svg}</svg>`
}
