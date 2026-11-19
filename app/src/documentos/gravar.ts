// Grava uma linha de doc_documentos do jeito do núcleo (registro local + fila de pendentes), sem a
// tabela estar na lista de sincronizadas (a migração ainda não existe; ver dados.ts).
import type { BancoLocal, Linha } from '../nucleo/banco_local'
import { TABELA_DOCUMENTOS } from './regras'

/** Grava uma linha de doc_documentos como pendente (registro + fila), igual ao núcleo. */
export async function gravarLinha(b: BancoLocal, obraId: string, usuarioId: string, campos: Record<string, unknown>): Promise<Linha> {
  const linha: Linha = {
    ...campos,
    id: crypto.randomUUID(),
    obra_id: obraId,
    usuario_id: usuarioId,
    dispositivo_id: await b.dispositivoId(),
    criado_em_dispositivo: new Date().toISOString(),
    apagado: false,
  }
  await b.transaction('rw', b.registros, b.fila, async () => {
    await b.registros.put({ tabela: TABELA_DOCUMENTOS, id: linha.id, obra_id: obraId, linha, pendente: 1 })
    await b.fila.add({ usuario_id: usuarioId, obra_id: obraId, tabela: TABELA_DOCUMENTOS, id: linha.id, linha, estado: 'pendente', tentativas: 0, criado_em: new Date().toISOString() })
  })
  return linha
}

