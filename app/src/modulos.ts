// Módulos que aparecem no menu da obra. Cada sessão de módulo mexe só na própria linha:
// quando a tela do módulo existir, preencha `Tela` (o botão do menu fica ativo sozinho).
// A casca (app.tsx e Menu.tsx) é do núcleo e não precisa ser alterada pelos módulos.
//
// Contrato da tela do módulo (detalhes em docs/02_CONTRATO_NUCLEO.md, "Casca do app"):
// - Ao abrir o módulo, a casca empilha no histórico `{ tela: id }` (ex.: `{ tela: 'concreto' }`).
// - Telas internas do módulo empilham estados com o mesmo `tela: id` e o que mais quiserem.
// - Quando o "voltar" do Android sai de um estado com `tela: id`, a casca volta ao menu.
// - `aoSair()` volta ao menu; `aoPerderObra()` é para passar ao `usarSincronizacao`.
import type { ComponentType } from 'preact'
import type { ObraLocal, UsuarioLocal } from './nucleo/conta'
import { ConcretoSobDemanda } from './concreto/telas/SobDemanda'
import { FvsSobDemanda } from './fvs/telas/SobDemanda'
import { IfcSobDemanda } from './ifc/telas/SobDemanda'
import { RelatoriosSobDemanda } from './relatorios/telas/SobDemanda'
import { DocumentosSobDemanda } from './documentos/telas/SobDemanda'
import { sobDemanda } from './telas/SobDemanda'

const ProjetosSobDemanda = sobDemanda('Projetos', () =>
  import('./projetos/telas/ModuloProjetos').then((m) => m.ModuloProjetos),
)

// Mapa do canteiro (26/11/2026): quadro do canteiro com figuras; guarda só no aparelho (docs/modulos/8_canteiro.md).
const CanteiroSobDemanda = sobDemanda('o Mapa do canteiro', () =>
  import('./canteiro/telas/ModuloCanteiro').then((m) => m.ModuloCanteiro),
)

export type IdModulo = 'fvs' | 'projetos' | 'concreto' | 'documentos' | 'relatorios' | 'ifc' | 'canteiro'

export interface PropsModulo {
  usuario: UsuarioLocal
  obra: ObraLocal
  aoSair: () => void
  aoPerderObra: () => void
}

export interface Modulo {
  id: IdModulo
  nome: string
  descricao: string
  /** Sem tela, o botão aparece desativado como "em construção". */
  Tela?: ComponentType<PropsModulo>
  /** Fica fora do menu e não abre; o código continua no repositório. */
  foraDoMenu?: true
  /** Mostra o selo "beta" no cartão do menu: funciona, mas ainda está em teste. */
  beta?: true
  /** Só aparece no modo sem conta (pacote da obra): com conta, ainda não há tabela no servidor. */
  soSemConta?: true
}

// Desde 08/11/2026 o foco é a FVS e o Concreto: os betas (Projetos, IFC) ficam fora do menu, com o
// código guardado. Desde 09/11/2026 os Relatórios (Diário) voltaram e o Documentos entrou.
// Desde 13/11/2026 o IFC voltou, com o selo "beta" (ainda sem teste em Android de verdade).
// Desde 14/11/2026 o Projetos voltou, com o selo "beta" (sem conta ainda não importa a lista de pranchas).
// Desde 18/11/2026 (pedido do Professor, pela regra do CLAUDE.md) Projetos, IFC e Relatórios (Diário) saem
// de novo do menu, com o código guardado. O teste de sincronização com dois aparelhos chega ao Diário pelo
// build de teste (VITE_TESTE_MODULOS_FORA_DO_MENU, do núcleo).
// Desde 20/11/2026 (o Nicolas: "pode religar e tirar do beta") o IFC volta ao menu sem o selo "beta", com
// e sem conta; o Documentos continua no menu sem conta (com conta ainda não há tabela no servidor).
// Desde 20/11/2026 (item 3 do núcleo, aprovado pelo Nicolas) o Documentos abre também com conta: a tabela
// doc_documentos está no servidor (20261120150000_documentos.sql) e na sincronização.
// Desde 20/11/2026 o Projetos volta ao menu, com o selo "beta" (prioridade do Nicolas: lista de distribuição e
// "a entregar"), só sem conta como o Documentos: a base e a lista ainda ficam no aparelho. Relatórios continua fora.
// Desde 20/11/2026 (o Nicolas aprovou a lista de distribuição com conta, item 2 do núcleo, #44) o Projetos aparece
// também com conta, ainda com o selo "beta". Com o Documentos (item 3), nenhum módulo do menu fica só sem conta.
// Desde 26/11/2026 (pedido do Nicolas) o Mapa do canteiro entra no menu do app de testes, com o selo "beta":
// funciona com e sem conta, mas o mapa fica só no aparelho (ainda sem tabela no servidor).
// Para um deles voltar ao menu, apague o `foraDoMenu` da linha dele (e ligue `BETAS_NO_MENU` em testes/local.e2e.test.ts).
const REGISTRO: readonly Modulo[] = [
  { id: 'fvs', nome: 'FVS', descricao: 'Fichas de pilares, vigas, lajes, furos e ambientes', Tela: FvsSobDemanda },
  { id: 'projetos', nome: 'Projetos', descricao: 'Pranchas da obra: revisão em vigor e cópias entregues', Tela: ProjetosSobDemanda, beta: true },
  { id: 'concreto', nome: 'Concreto', descricao: 'Caminhões, peças concretadas e corpos de prova', Tela: ConcretoSobDemanda },
  { id: 'documentos', nome: 'Documentos', descricao: 'Lista mestra do PBQP-H: revisões, validade e impressão', Tela: DocumentosSobDemanda },
  { id: 'relatorios', nome: 'Relatórios', descricao: 'Diário de obra, problemas, limpeza', Tela: RelatoriosSobDemanda, foraDoMenu: true },
  { id: 'ifc', nome: 'IFC', descricao: 'Modelo 3D do projeto: abrir, buscar e cortar', Tela: IfcSobDemanda },
  { id: 'canteiro', nome: 'Mapa do canteiro', descricao: 'Quadro do canteiro: caminhão, caçamba, grua, baias e setores', Tela: CanteiroSobDemanda, beta: true },
]

// Só nos testes de tela: o build de teste liga VITE_TESTE_MODULOS_FORA_DO_MENU=1 para abrir também os
// módulos fora do menu (os testes de sincronização com dois aparelhos usam o Diário, que grava pelo
// núcleo sem precisar de planta). O build de produção (Cloudflare) não liga: o valor vira `false` na
// compilação e os módulos fora do menu continuam sem abrir.
const TESTE_COM_TODOS = import.meta.env.VITE_TESTE_MODULOS_FORA_DO_MENU === '1'

/** Os módulos do menu: só estes a casca deixa abrir. */
export const MODULOS: readonly Modulo[] = REGISTRO.filter((m) => TESTE_COM_TODOS || !m.foraDoMenu)

/** Os módulos que o menu mostra: com conta, sem os que só funcionam sem conta (teste com cabo, 20/11). */
export function modulosDoMenu(semConta: boolean): readonly Modulo[] {
  return MODULOS.filter((m) => semConta || !m.soSemConta)
}

export function moduloPorId(id: string): Modulo | undefined {
  return MODULOS.find((m) => m.id === id)
}
