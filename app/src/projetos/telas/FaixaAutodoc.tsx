// Faixa no alto do painel do Projetos (só com conta): quando o Autodoc foi puxado pela última vez e por
// quem. Mais de 1 dia sem atualizar: pede para rodar o atalho no PC. Ver projetos/autodoc.ts.
import { useEffect, useState } from 'preact/hooks'
import { atualizarDoServidor, faixaAutodoc, lerGuardado, type EstadoAutodoc } from '../autodoc'

/** undefined = ainda lendo; null = nada guardado e sem resposta do servidor. */
export function usarEstadoAutodoc(obraId: string, ativo = true, versao = 0): EstadoAutodoc | null | undefined {
  const [estado, setEstado] = useState<EstadoAutodoc | null | undefined>(undefined)
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    // primeiro a cópia do aparelho (abre na hora, até sem internet); depois o servidor
    lerGuardado(obraId).then((g) => vivo && setEstado((e) => (e === undefined ? g : e)))
    atualizarDoServidor(obraId).then((s) => vivo && setEstado(s))
    return () => {
      vivo = false
    }
  }, [obraId, ativo, versao])
  return estado
}

export function FaixaAutodoc({ obraId, estado: dado }: { obraId: string; estado?: EstadoAutodoc | null }) {
  const lido = usarEstadoAutodoc(obraId, dado === undefined)
  const estado = dado === undefined ? lido : dado
  if (estado === undefined) return null
  const f = faixaAutodoc(estado)
  return (
    <section class={`pj-autodoc ${f.tipo}`} data-testid="projetos-autodoc" aria-live="polite">
      <strong>{f.titulo}</strong>
      <span>{f.detalhe}</span>
    </section>
  )
}
