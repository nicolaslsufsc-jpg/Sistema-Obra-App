// Listas do módulo. Para acrescentar um tipo de relatório ou de ocorrência, basta uma linha aqui:
// o banco só confere o formato do código, não precisa de migração.

export interface Opcao {
  v: string
  t: string
}

export const PERIODOS: readonly Opcao[] = [
  { v: 'manha', t: 'Manhã' },
  { v: 'tarde', t: 'Tarde' },
  { v: 'noite', t: 'Noite' },
]

export const TEMPOS: readonly Opcao[] = [
  { v: 'sol', t: 'Sol' },
  { v: 'nublado', t: 'Nublado' },
  { v: 'chuva_fraca', t: 'Chuva fraca' },
  { v: 'chuva_forte', t: 'Chuva forte' },
]

export const SITUACOES_SERVICO: readonly Opcao[] = [
  { v: 'iniciado', t: 'Iniciado' },
  { v: 'em_andamento', t: 'Em andamento' },
  { v: 'concluido', t: 'Concluído' },
  { v: 'paralisado', t: 'Paralisado' },
]

export const SITUACOES_EQUIPAMENTO: readonly Opcao[] = [
  { v: 'operando', t: 'Operando' },
  { v: 'parado', t: 'Parado' },
  { v: 'manutencao', t: 'Manutenção' },
]

export const TIPOS_OCORRENCIA: readonly Opcao[] = [
  // 'relato' é o texto corrido do dia (TelaDia); gravado como ocorrência para não precisar de tabela nova
  { v: 'relato', t: 'Relato do dia' },
  { v: 'interrupcao', t: 'Interrupção dos trabalhos' },
  { v: 'acidente', t: 'Acidente' },
  { v: 'dano', t: 'Dano material' },
  { v: 'visita', t: 'Visita' },
  { v: 'orientacao', t: 'Orientação de execução' },
  { v: 'interferencia', t: 'Interferência entre serviços' },
  { v: 'falta_material', t: 'Falta de material' },
  { v: 'falta_mao_de_obra', t: 'Falta de mão de obra' },
  { v: 'equipamento', t: 'Problema em equipamento' },
  { v: 'outro', t: 'Outro' },
]

export const GRAVIDADES: readonly Opcao[] = [
  { v: 'baixa', t: 'Baixa' },
  { v: 'media', t: 'Média' },
  { v: 'alta', t: 'Alta' },
]

export const SITUACOES_RELATORIO: readonly Opcao[] = [
  { v: 'aberto', t: 'Aberto' },
  { v: 'em_andamento', t: 'Em andamento' },
  { v: 'resolvido', t: 'Resolvido' },
]

export const RESULTADOS_ITEM: readonly Opcao[] = [
  { v: 'ok', t: 'OK' },
  { v: 'atencao', t: 'Atenção' },
  { v: 'ruim', t: 'Ruim' },
]

export interface TipoRelatorio {
  v: string
  t: string
  /** Frase curta para quem escolhe o tipo. */
  ajuda: string
  /** Título já preenchido (quem preenche pode trocar). */
  titulo?: string
  /** Lista de conferência do tipo. Sem lista, o relatório é só texto, foto e local. */
  itens?: readonly string[]
  /** Pede gravidade, responsável e prazo? */
  acompanha: boolean
}

// As listas de conferência são uma proposta inicial, genérica: cada empresa pode trazer a sua.
export const TIPOS_RELATORIO: readonly TipoRelatorio[] = [
  { v: 'problema', t: 'Problema na obra', ajuda: 'Algo errado que alguém precisa resolver.', acompanha: true },
  {
    v: 'limpeza',
    t: 'Limpeza e organização',
    ajuda: 'Vistoria de limpeza de um pavimento ou área.',
    titulo: 'Vistoria de limpeza',
    acompanha: true,
    itens: [
      'Entulho removido do pavimento',
      'Acessos e circulação livres',
      'Materiais organizados e empilhados',
      'Caçambas sem excesso',
      'Sanitários e vestiários limpos',
      'Refeitório limpo',
      'Área externa e calçada limpas',
    ],
  },
  {
    v: 'seguranca',
    t: 'Segurança do trabalho',
    ajuda: 'Risco ou desvio de segurança encontrado.',
    titulo: 'Vistoria de segurança',
    acompanha: true,
    itens: [
      'Uso de EPI pelas equipes',
      'Guarda-corpo e proteção de periferia',
      'Aberturas de piso protegidas',
      'Instalações elétricas provisórias',
      'Escadas e andaimes em ordem',
      'Sinalização',
    ],
  },
  { v: 'qualidade', t: 'Qualidade', ajuda: 'Defeito ou retrabalho fora de uma ficha da FVS.', acompanha: true },
  { v: 'material', t: 'Material e estoque', ajuda: 'Material danificado, mal guardado ou faltando.', acompanha: true },
  { v: 'outro', t: 'Outro', ajuda: 'Qualquer outro registro.', acompanha: true },
]

export function tipoRelatorio(v: string): TipoRelatorio {
  return TIPOS_RELATORIO.find((t) => t.v === v) ?? { v, t: v, ajuda: '', acompanha: true }
}

export function rotulo(lista: readonly Opcao[], v: unknown): string {
  return lista.find((o) => o.v === v)?.t ?? (v ? String(v) : '')
}

// ---------------------------------------------------------------------
// Formulário genérico das seções do diário
// ---------------------------------------------------------------------

export interface Campo {
  nome: string
  rotulo: string
  tipo: 'texto' | 'numero' | 'inteiro' | 'opcoes' | 'longo' | 'data'
  opcoes?: readonly Opcao[]
  obrigatorio?: boolean
  max?: number
  min?: number
  padrao?: string
  /** Lista de sugestões vindas do que já foi digitado na obra (coluna da mesma tabela). */
  sugere?: boolean
  /** Continua preenchido no "Salvar e adicionar outro" (a empresa das várias funções, o fornecedor). */
  repete?: boolean
}

export type TabelaSecao = 'diario_efetivo' | 'diario_equipamentos' | 'diario_materiais' | 'diario_servicos' | 'diario_ocorrencias'

export interface Secao {
  tabela: TabelaSecao
  titulo: string
  novo: string
  campos: readonly Campo[]
}

export const SECOES: Record<TabelaSecao, Secao> = {
  diario_efetivo: {
    tabela: 'diario_efetivo',
    titulo: 'Mão de obra',
    novo: 'Adicionar mão de obra',
    campos: [
      { nome: 'empresa', rotulo: 'Empresa', tipo: 'texto', max: 120, sugere: true, repete: true },
      { nome: 'funcao', rotulo: 'Função', tipo: 'texto', obrigatorio: true, max: 120, sugere: true },
      { nome: 'quantidade', rotulo: 'Quantidade de pessoas', tipo: 'inteiro', obrigatorio: true, min: 0, max: 5000, padrao: '1' },
      { nome: 'observacao', rotulo: 'Observação', tipo: 'texto', max: 1000 },
    ],
  },
  diario_equipamentos: {
    tabela: 'diario_equipamentos',
    titulo: 'Equipamentos',
    novo: 'Adicionar equipamento',
    campos: [
      { nome: 'nome', rotulo: 'Equipamento', tipo: 'texto', obrigatorio: true, max: 120, sugere: true },
      { nome: 'quantidade', rotulo: 'Quantidade', tipo: 'inteiro', obrigatorio: true, min: 0, max: 1000, padrao: '1' },
      { nome: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: SITUACOES_EQUIPAMENTO, obrigatorio: true, padrao: 'operando' },
      { nome: 'observacao', rotulo: 'Observação', tipo: 'texto', max: 1000 },
    ],
  },
  diario_materiais: {
    tabela: 'diario_materiais',
    titulo: 'Materiais recebidos',
    novo: 'Adicionar material',
    campos: [
      { nome: 'material', rotulo: 'Material', tipo: 'texto', obrigatorio: true, max: 200, sugere: true },
      { nome: 'quantidade', rotulo: 'Quantidade', tipo: 'numero', min: 0, max: 999999 },
      { nome: 'unidade', rotulo: 'Unidade', tipo: 'texto', max: 20, sugere: true },
      { nome: 'fornecedor', rotulo: 'Fornecedor', tipo: 'texto', max: 200, sugere: true, repete: true },
      { nome: 'nota_fiscal', rotulo: 'Nota fiscal', tipo: 'texto', max: 60 },
      { nome: 'observacao', rotulo: 'Observação', tipo: 'texto', max: 1000 },
    ],
  },
  diario_servicos: {
    tabela: 'diario_servicos',
    titulo: 'Serviços executados',
    novo: 'Adicionar serviço',
    campos: [
      { nome: 'descricao', rotulo: 'Serviço', tipo: 'texto', obrigatorio: true, max: 1000, sugere: true },
      { nome: 'empresa', rotulo: 'Empresa', tipo: 'texto', max: 120, sugere: true },
      { nome: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: SITUACOES_SERVICO, obrigatorio: true, padrao: 'em_andamento' },
      { nome: 'avanco_pct', rotulo: 'Avanço (%)', tipo: 'inteiro', min: 0, max: 100 },
      { nome: 'local_texto', rotulo: 'Local por escrito (opcional, além da planta)', tipo: 'texto', max: 300 },
      { nome: 'observacao', rotulo: 'Observação', tipo: 'texto', max: 1000 },
    ],
  },
  diario_ocorrencias: {
    tabela: 'diario_ocorrencias',
    titulo: 'Ocorrências',
    novo: 'Adicionar ocorrência',
    campos: [
      // sem o "Relato do dia": ele tem seção própria no dia, e gravado por aqui sumia das ocorrências
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', opcoes: TIPOS_OCORRENCIA.filter((t) => t.v !== 'relato'), obrigatorio: true },
      { nome: 'descricao', rotulo: 'O que aconteceu', tipo: 'longo', obrigatorio: true, max: 2000 },
      { nome: 'horas_paradas', rotulo: 'Horas paradas (se parou)', tipo: 'numero', min: 0, max: 24 },
      { nome: 'local_texto', rotulo: 'Local por escrito (opcional, além da planta)', tipo: 'texto', max: 300 },
    ],
  },
}

export const CAMPOS_CADASTRO: readonly Campo[] = [
  { nome: 'endereco', rotulo: 'Endereço da obra', tipo: 'texto', max: 300 },
  { nome: 'contratante', rotulo: 'Contratante', tipo: 'texto', max: 200 },
  { nome: 'responsavel_tecnico', rotulo: 'Responsável técnico', tipo: 'texto', max: 200 },
  { nome: 'art', rotulo: 'ART', tipo: 'texto', max: 60 },
  { nome: 'data_inicio', rotulo: 'Início da obra', tipo: 'data' },
  { nome: 'prazo_fim', rotulo: 'Fim do prazo', tipo: 'data' },
]
