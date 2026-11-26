// Leitura dos quatro módulos para as páginas do PC (painel, relatórios, pranchas). Tudo vem do banco do
// aparelho pelos mesmos `carregar` dos módulos: funciona sem internet. Um módulo que falhar não derruba
// os outros: a página mostra "não deu para ler" só naquele bloco.
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import type { DadosFvs } from '../fvs/dados'
import type { DadosConcreto } from '../concreto/dados'
import type { DadosProjetos } from '../projetos/dados'
import type { BaseProjetos } from '../projetos/base'
import type { DadosDocumentos } from '../documentos/dados'
import { useEffect, useState } from 'preact/hooks'

export interface DadosPc {
  fvs?: DadosFvs
  concreto?: DadosConcreto
  projetos?: DadosProjetos
  base?: BaseProjetos | null
  documentos?: DadosDocumentos
  /** módulo -> mensagem de erro */
  erros: Partial<Record<'fvs' | 'concreto' | 'projetos' | 'documentos', string>>
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function lerTudo(obra: ObraLocal, usuario: UsuarioLocal): Promise<DadosPc> {
  const erros: DadosPc['erros'] = {}
  const [fvs, concreto, projetos, base, documentos] = await Promise.all([
    import('../fvs/dados')
      .then(async (m) => ({ ...(await m.carregar(obra.id)), usuarioId: usuario.id }))
      .catch((e) => void (erros.fvs = msg(e))),
    import('../concreto/dados').then((m) => m.carregar(obra.id)).catch((e) => void (erros.concreto = msg(e))),
    import('../projetos/dados').then((m) => m.carregar(obra.id)).catch((e) => void (erros.projetos = msg(e))),
    import('../projetos/base').then((m) => m.lerBaseOuDoPacote(obra.id)).catch(() => null),
    import('../documentos/dados').then((m) => m.carregar(obra.id)).catch((e) => void (erros.documentos = msg(e))),
  ])
  return { fvs: fvs ?? undefined, concreto: concreto ?? undefined, projetos: projetos ?? undefined, base, documentos: documentos ?? undefined, erros }
}

/**
 * Os dados da obra para a página (null enquanto lê pela primeira vez). `versao` muda quando a sincronização
 * traz dado novo do servidor: a página relê sem piscar (fica com o que tinha até o novo chegar).
 */
export function usarDadosPc(obra: ObraLocal, usuario: UsuarioLocal, versao = 0): DadosPc | null {
  const [dados, setDados] = useState<DadosPc | null>(null)
  useEffect(() => {
    setDados(null)
  }, [obra.id, usuario.id])
  useEffect(() => {
    let vivo = true
    lerTudo(obra, usuario).then((d) => vivo && setDados(d))
    return () => {
      vivo = false
    }
  }, [obra.id, usuario.id, versao])
  return dados
}

/** Hoje no aparelho, AAAA-MM-DD (hora local). */
export function hojeLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "23/11/2026" a partir de AAAA-MM-DD (ou ISO); vazio fica "–". */
export function dataBR(iso: string | null | undefined): string {
  const d = (iso ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : '–'
}
