// Ids dos dados de teste (supabase/testes/dados_integracao.sql). Manter os dois iguais.
export const OBRA1 = '11111111-1111-1111-1111-111111111111'
export const OBRA2 = '22222222-2222-2222-2222-222222222222'

export const USUARIOS = {
  admin: { id: '00000000-0000-0000-0000-0000000000a1', email: 'admin@teste.local' },
  gestor: { id: '00000000-0000-0000-0000-0000000000b1', email: 'gestor@teste.local' },
  campo: { id: '00000000-0000-0000-0000-0000000000c1', email: 'campo@teste.local' },
  leitura: { id: '00000000-0000-0000-0000-0000000000d1', email: 'leitura@teste.local' },
  fora: { id: '00000000-0000-0000-0000-0000000000e1', email: 'fora@teste.local' },
} as const

/** Código que o servidor de teste aceita no login. */
export const CODIGO_TESTE = '123456'
