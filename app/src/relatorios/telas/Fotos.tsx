// Fotos de um dia ou de um registro. Tirar foto funciona sem internet: fica no aparelho até enviar.
import { useEffect, useState } from 'preact/hooks'
import { anexarFoto, cancelar, enderecoDaFoto } from '../dados'
import { textoDoLocal, type Alvo, type DadosRelatorios, type Foto } from '../regras'
import type { Contexto } from './ModuloRelatorios'
import { erroEmTexto } from './comum'

export function fotosDe(d: DadosRelatorios, data: string, alvo: Alvo | null): Foto[] {
  return alvo ? (d.fotosDoAlvo.get(alvo.raiz) ?? []) : (d.fotosDoDia.get(data) ?? [])
}

export function Miniatura({ dados, foto }: { dados: DadosRelatorios; foto: Foto }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    let criada: string | null = null
    enderecoDaFoto(dados, foto).then((u) => {
      criada = u
      if (vivo) setUrl(u)
      else if (u) URL.revokeObjectURL(u)
    })
    return () => {
      vivo = false
      if (criada) URL.revokeObjectURL(criada)
    }
  }, [foto.arquivo_id])
  if (url) return <img class="rl-foto" src={url} alt={foto.legenda ?? 'Foto'} loading="lazy" />
  return <div class="rl-foto rl-foto-vazia">{url === undefined ? 'Carregando…' : 'Foto no servidor. Precisa de internet para ver.'}</div>
}

export function Fotos({ ctx, data, alvo, pode }: { ctx: Contexto; data: string; alvo: Alvo | null; pode: boolean }) {
  const { dados, obra, usuario, recarregar, ir } = ctx
  const fotos = fotosDe(dados, data, alvo)
  const [msg, setMsg] = useState('')
  return (
    <div>
      {fotos.length === 0 && !pode && <p class="discreto">Nenhuma foto.</p>}
      {fotos.length > 0 && (
        <ul class="rl-fotos" data-testid="fotos">
          {fotos.map((f) => (
            <li key={f.raiz}>
              <Miniatura dados={dados} foto={f} />
              {f.legenda && <span class="rl-foto-legenda">{f.legenda}</span>}
              <button
                type="button"
                class="rl-foto-onde"
                data-testid="foto-onde"
                onClick={() => ir({ nome: 'marcar', alvo: { tipo: 'foto', raiz: f.raiz }, titulo: f.legenda || 'Foto' })}
              >
                {dados.marcas.get(f.raiz)?.length ? `📍 ${textoDoLocal(dados, dados.marcas.get(f.raiz)!)}` : pode ? '📍 Pingar onde foi' : 'Sem lugar marcado'}
              </button>
              {pode && (
                <button
                  type="button"
                  class="rl-foto-tirar"
                  aria-label="Apagar foto"
                  onClick={async () => {
                    if (!confirm('Apagar esta foto?')) return
                    await cancelar('rel_fotos', obra.id, usuario.id, f)
                    await recarregar()
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pode && (
        <label class="rl-botao-foto">
          Tirar ou escolher foto
          <input
            type="file"
            accept="image/*"
            data-testid="input-foto"
            onChange={async (e) => {
              const entrada = e.currentTarget
              const arq = entrada.files?.[0]
              if (!arq) return
              setMsg('Guardando a foto…')
              try {
                await anexarFoto(obra.id, usuario.id, data, alvo, arq)
                await recarregar()
                setMsg(ctx.local ? 'Foto guardada no aparelho.' : 'Foto guardada. Vai para o servidor quando houver internet.')
              } catch (erro) {
                setMsg(`Não foi possível guardar a foto: ${erroEmTexto(erro)}`)
              } finally {
                entrada.value = ''
              }
            }}
          />
        </label>
      )}
      {msg && (
        <p class="discreto" role="status">
          {msg}
        </p>
      )}
    </div>
  )
}
