// Entrega com assinatura (21/11/2026, migração 20261121140000_projetos_assinatura_entrega.sql).
// Pedido do Nicolas: "dedo ou caneta, registro de data hora projeto e assinatura única"; opcional com aviso.
// A assinatura é um PNG guardado como arquivo do núcleo (como as fotos). UMA por entrega: várias pranchas
// levadas juntas apontam para o mesmo assinatura_id. Data e hora: criado_em_dispositivo do evento.
import { BUCKET_OBRAS } from '../config'
import type { Linha } from '../nucleo/banco_local'
import { banco, cliente, sincronizador } from '../nucleo/servicos'
import type { FolhaPdf } from '../telas/folha_pdf'
import type { DadosProjetos } from './dados'

/** Guarda o PNG da assinatura no aparelho (sobe com a internet) e devolve o id do arquivo. */
export async function guardarAssinatura(obraId: string, usuarioId: string, png: Blob): Promise<string> {
  const linha = await sincronizador.registrarArquivo(obraId, usuarioId, 'projetos', png, 'assinatura.png')
  return linha.id
}

function comoDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = () => erro(r.error)
    r.readAsDataURL(b)
  })
}

/**
 * A imagem da assinatura, como data URL (serve na tela e no PDF). Ainda não enviada: vem do aparelho.
 * Já enviada: precisa de internet. Sem os dois: null (a tela diz que há assinatura, sem a imagem).
 */
export async function imagemDaAssinatura(obraId: string, arquivoId: string): Promise<string | null> {
  const local = await banco.conteudos.get(arquivoId)
  if (local) return comoDataUrl(new Blob([local.bytes], { type: 'image/png' }))
  if (!navigator.onLine) return null
  try {
    const arq = (await sincronizador.linhas('arquivos', obraId)).find((a) => a.id === arquivoId)
    if (!arq) return null
    const { data, error } = await cliente.storage.from(BUCKET_OBRAS).download(String(arq.caminho))
    return error || !data ? null : comoDataUrl(data)
  } catch {
    return null
  }
}

/** As linhas de uma entrega assinada (todas as pranchas que a pessoa levou junto). */
export function entregaDaAssinatura(d: Pick<DadosProjetos, 'eventos'>, assinaturaId: string): Linha[] {
  // na ordem em que foram registradas (a prancha de onde a entrega começou vem primeiro)
  return d.eventos
    .filter((e) => e.tipo === 'entrega' && e.assinatura_id === assinaturaId && !e.apagado)
    .sort((a, b) => String(a.criado_em_dispositivo).localeCompare(String(b.criado_em_dispositivo)))
}

const dois = (n: number) => String(n).padStart(2, '0')

/** "21/11/2026 14:37" na hora do aparelho. */
export function dataHoraDe(iso: unknown): string {
  const d = new Date(String(iso ?? ''))
  if (Number.isNaN(d.getTime())) return ''
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`
}

/** A folha do comprovante: quem retirou, quando, as pranchas e a assinatura. */
export function folhaDoComprovante(d: Pick<DadosProjetos, 'documentoPorId' | 'revisaoPorId' | 'empresaPorId'>, linhas: readonly Linha[], imagem: string | null): FolhaPdf {
  const l0 = linhas[0]
  const empresa = d.empresaPorId.get(String(l0?.empresa_id))?.nome ?? ''
  const quem = String(l0?.colaborador ?? '').trim()
  const rot = (r?: Linha) => (r ? `${String(r.fase ?? '')} R${String(r.numero ?? '')}`.trim() : '')
  return {
    modulo: 'Projetos',
    titulo: 'Comprovante de entrega de cópias',
    sub: `Retirado por ${quem || '(sem nome)'}${empresa ? ` · ${empresa}` : ''} · ${dataHoraDe(l0?.criado_em_dispositivo)}`,
    resumo: [`${linhas.length} ${linhas.length === 1 ? 'prancha' : 'pranchas'}`],
    tabelas: [
      {
        colunas: ['Código', 'Título', 'Revisão', 'Data da entrega'],
        curtas: [2, 3],
        linhas: linhas.map((l) => {
          const doc = d.documentoPorId.get(String(l.documento_id))
          const data = String(l.data_evento ?? '')
          return [doc?.codigo ?? '', doc?.titulo ?? '', rot(d.revisaoPorId.get(String(l.revisao_id))), data.split('-').reverse().join('/')]
        }),
      },
    ],
    imagens: [{ legenda: `Assinatura de ${quem || 'quem retirou'}${empresa ? ` (${empresa})` : ''} · ${dataHoraDe(l0?.criado_em_dispositivo)}`, src: imagem ?? '' }],
  }
}
