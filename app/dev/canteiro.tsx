// Bancada do Mapa do canteiro (ver canteiro.html). Põe no banco do navegador, como se tivessem sido
// baixados do servidor, dois pavimentos da obra fictícia EXE:
//   - "Térreo": planta de teste com imagem em pedaços (como o pacote de planta da FVS)
//   - "1º pavimento": planta de teste só com o contorno das peças
// e a folha "Canteiro geral", em branco com grade. Sem login: o módulo trabalha só com o aparelho.
import { render } from 'preact'
import '../src/style.css'
import { banco } from '../src/nucleo/servicos'
import { ModuloCanteiro, type FonteDePlantas } from '../src/canteiro/telas/ModuloCanteiro'
import type { PlantaDeFundo } from '../src/canteiro/fundo'
import type { ObraLocal, UsuarioLocal } from '../src/nucleo/conta'

const OBRA = 'b0000000-0000-0000-0000-0000000000ce'
const TERREO = 'a0000000-0000-0000-0000-0000000000c1'
const PRIMEIRO = 'a0000000-0000-0000-0000-0000000000c2'
const usuario: UsuarioLocal = { id: '00000000-0000-0000-0000-0000000000a1', email: 'bancada@teste.local' }
const obra: ObraLocal = { id: OBRA, codigo: 'EXE', nome: 'Obra Exemplo', empresa: 'Construtora Exemplo', papel: 'admin', sistema_oficial: null }

async function semear() {
  if ((await banco.registros.where('[tabela+obra_id]').equals(['pavimentos', OBRA]).count()) > 0) return
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: new Date().toISOString(), apagado: false }
  const pavs = [
    { ...base, id: TERREO, nome: 'Térreo', ordem: 1 },
    { ...base, id: PRIMEIRO, nome: '1º pavimento', ordem: 2 },
  ]
  await banco.registros.bulkPut(pavs.map((linha) => ({ tabela: 'pavimentos', id: linha.id, obra_id: OBRA, linha: linha as never, pendente: 0 as const })))
}

/** Pedaço de imagem de teste: quadriculado claro com o endereço do pedaço escrito. */
function pedaco(z: number, x: number, y: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">` +
    `<rect width="256" height="256" fill="#fbfbf7"/><rect x="0.5" y="0.5" width="255" height="255" fill="none" stroke="#b9c0c8"/>` +
    `<rect x="96" y="96" width="64" height="64" fill="none" stroke="#5b6470" stroke-width="3"/>` +
    `<text x="8" y="20" font-family="sans-serif" font-size="14" fill="#5b6470">${z}/${x}/${y}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const plantas: Record<string, PlantaDeFundo[]> = {
  [TERREO]: [
    {
      id: 'bancada:terreo',
      titulo: 'Térreo · Planta de teste',
      largura: 2048,
      altura: 1280,
      fundo: { tile: 256, niveis: [-1, 0], url: (z, x, y) => pedaco(z, x, y) },
    },
  ],
  [PRIMEIRO]: [
    {
      id: 'bancada:primeiro',
      titulo: '1º pavimento · Planta de teste',
      largura: 1600,
      altura: 1000,
      elementos: [0, 1, 2, 3, 4, 5].map((n) => {
        const x = 200 + (n % 3) * 600
        const y = 200 + Math.floor(n / 3) * 600
        return { polys: [[[x - 30, y - 30], [x + 30, y - 30], [x + 30, y + 30], [x - 30, y + 30]] as Array<[number, number]>] }
      }),
    },
  ],
}

const fonte: FonteDePlantas = async (_obraId, pavimento) => plantas[pavimento.id] ?? []

semear().then(() => {
  history.replaceState({ tela: 'canteiro' }, '')
  render(<ModuloCanteiro usuario={usuario} obra={obra} aoSair={() => location.reload()} aoPerderObra={() => {}} fontePlantas={fonte} />, document.getElementById('app')!)
})
