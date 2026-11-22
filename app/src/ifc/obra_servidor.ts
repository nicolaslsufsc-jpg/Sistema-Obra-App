// Fonte dos IFCs da obra no app de verdade: lista pela tabela `arquivos` do banco local (que o núcleo
// sincroniza), baixa do bucket `obras` e envia pela fila do núcleo. Ver obra.ts.
// Fica num arquivo à parte para a bancada do IFC (sem servidor) não carregar o cliente do Supabase.
import { BUCKET_OBRAS } from '../config'
import { banco, cliente, sincronizador } from '../nucleo/servicos'
import { comPrazo, DownloadParado, lerComProgresso, LIMITE_SEM_DADOS_MS } from '../fvs/pacote'
import type { FonteIfcs, ParteIfc } from './obra'
import { gravarListaLocal, lerLista, lerListaLocal, listaDeExemplo, NOME_LISTA, type FonteListaModelos } from './modelos_drive'

export function fonteDoServidor(obraId: string, usuarioId: string): FonteIfcs {
  return {
    listar: () => sincronizador.linhas('arquivos', obraId),

    async bytesDaParte(p: ParteIfc, aoBytes) {
      // Quem enviou ainda tem a parte no aparelho até ela subir.
      const local = await banco.conteudos.get(p.id)
      if (local?.bytes) return new Blob([local.bytes])
      if (!navigator.onLine) throw new Error('sem internet. Baixe quando tiver conexão.')
      const seNaoParou = (e: unknown) => {
        if (e instanceof DownloadParado) throw e
        return null
      }
      // por endereço assinado dá para mostrar o progresso; se não der, baixa direto
      const assinado = await comPrazo(cliente.storage.from(BUCKET_OBRAS).createSignedUrl(p.caminho, 3600), LIMITE_SEM_DADOS_MS).catch(seNaoParou)
      const controle = new AbortController()
      const resposta = assinado?.data?.signedUrl ? await comPrazo(fetch(assinado.data.signedUrl, { signal: controle.signal }), LIMITE_SEM_DADOS_MS, () => controle.abort()).catch(seNaoParou) : null
      if (resposta?.ok) return lerComProgresso(resposta, aoBytes)
      const { data, error } = await comPrazo(cliente.storage.from(BUCKET_OBRAS).download(p.caminho), 20 * LIMITE_SEM_DADOS_MS)
      if (error || !data) throw new Error('o servidor não entregou o arquivo. Confira a internet e tente de novo.')
      return data
    },

    async enviarParte(conteudo, nomeOriginal) {
      await sincronizador.registrarArquivo(obraId, usuarioId, 'ifc', conteudo, nomeOriginal)
    },
  }
}

/**
 * Lista "Baixar modelo da obra" com conta: o JSON mais novo chamado `modelos_drive.json` entre os
 * arquivos do módulo ifc (ver modelos_drive.ts). Fica também no aparelho, para abrir sem internet.
 */
export function fonteListaDoServidor(obraId: string, usuarioId: string, podeGravar: boolean, exemploSeVazia: boolean): FonteListaModelos {
  return {
    async ler() {
      const linhas = (await sincronizador.linhas('arquivos', obraId)).filter(
        (l) => String(l.caminho ?? '').startsWith(`${obraId}/ifc/`) && l.nome_original === NOME_LISTA,
      )
      const quando = (l: (typeof linhas)[number]) => String(l.criado_em_servidor ?? l.criado_em_dispositivo ?? '')
      const maisNova = linhas.sort((a, b) => (quando(a) < quando(b) ? 1 : -1))[0]
      if (maisNova) {
        try {
          const local = await banco.conteudos.get(maisNova.id)
          let texto: string | null = local?.bytes ? new TextDecoder().decode(local.bytes) : null
          if (texto === null && navigator.onLine) {
            const { data } = await comPrazo(cliente.storage.from(BUCKET_OBRAS).download(String(maisNova.caminho)), LIMITE_SEM_DADOS_MS)
            texto = data ? await data.text() : null
          }
          if (texto !== null) {
            const lista = lerLista(texto)
            gravarListaLocal(obraId, texto)
            return lista
          }
        } catch {
          // sem internet ou arquivo com defeito: fica a cópia do aparelho
        }
      }
      return lerListaLocal(obraId) ?? (exemploSeVazia ? listaDeExemplo() : null)
    },
    gravar: podeGravar
      ? async (texto) => {
          await sincronizador.registrarArquivo(obraId, usuarioId, 'ifc', new Blob([texto], { type: 'application/json' }), NOME_LISTA)
          gravarListaLocal(obraId, texto)
        }
      : undefined,
  }
}
