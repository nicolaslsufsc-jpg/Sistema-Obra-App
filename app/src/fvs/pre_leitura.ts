// A leitura antecipada da FVS (agendada por ler_antes.ts): a mesma que o módulo faz ao abrir, guardada
// como a da última abertura (leitura.ts). Só lê.
import { carregar } from './dados'
import { preLer } from './leitura'
import { pacotesNoAparelho } from './pacote'

export async function preLerFvs(obraId: string, usuarioId: string): Promise<void> {
  await preLer(`${obraId}|${usuarioId}`, async () => ({ ...(await carregar(obraId)), usuarioId }))
  // a lista das plantas do aparelho também (a tela inicial da FVS usa)
  await pacotesNoAparelho().catch(() => {})
}
