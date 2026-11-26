// Botão "Reportar problema" e a janela do reporte (versão sem servidor).
// Por ora só nas telas do Concreto: pôr em toda tela do app é uma linha na casca (app.tsx), que é
// núcleo; fica como proposta. O componente não depende do Concreto.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import type { EstadoSincronizacao } from '../nucleo/usarSincronizacao'
import { LIMITE_COMENTARIO, MAX_IMAGENS, navegadorResumido, nomeDoReporte, ROTULO_GRAVIDADE, versaoDoApp, type ContextoDoReporte, type Gravidade, type Reporte } from './coleta'
import { errosRecentes, instalarCapturaDeErros } from './erros'
import { apagarReporte, guardarReporte, listarReportes, zipDosReportes } from './guarda'
import { ACEITAR_IMAGEM, recusaDaImagem, reduzirImagem } from './imagem'
import './reportes.css'

instalarCapturaDeErros()

interface Props {
  modulo: string
  tela: string
  obra: ObraLocal
  usuario: UsuarioLocal
  estado: EstadoSincronizacao
  /** no mapa o botão sobe para não cobrir o painel e o zoom */
  noMapa?: boolean
  /** dentro do cabeçalho da tela (guia de estilo, 21/11/2026): não flutua por cima do conteúdo */
  noCabecalho?: boolean
}

export function montarContexto(p: Props): ContextoDoReporte {
  return {
    modulo: p.modulo,
    tela: p.tela,
    versao_app: versaoDoApp(),
    obra_id: p.obra.id,
    obra_codigo: p.obra.codigo,
    usuario_id: p.usuario.id,
    sem_conta: p.estado.local,
    tela_px: `${innerWidth}×${innerHeight}`,
    navegador: navegadorResumido(navigator.userAgent),
    instalado: matchMedia('(display-mode: standalone)').matches,
    online: navigator.onLine,
    fila: { pendentes: p.estado.pendentes, com_erro: p.estado.comErro, ultima_sincronizacao: p.estado.ultima ?? null },
    erros: errosRecentes.lista(),
  }
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function BotaoReportar(p: Props) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" class={`rp-botao${p.noMapa ? ' rp-no-mapa' : ''}${p.noCabecalho ? ' rp-no-cabecalho' : ''}`} onClick={() => setAberto(true)} data-testid="reportar" aria-label="Reportar problema">
        <span aria-hidden="true">!</span>
        <span class="rp-texto">Reportar</span>
      </button>
      {aberto && <JanelaReporte {...p} aoFechar={() => setAberto(false)} />}
    </>
  )
}

function Miniatura({ blob, aoTirar }: { blob: Blob; aoTirar: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return (
    <span class="rp-mini">
      {url && <img src={url} alt="Imagem do reporte" />}
      <button type="button" onClick={aoTirar}>
        Tirar
      </button>
    </span>
  )
}

function JanelaReporte(p: Props & { aoFechar: () => void }) {
  // o contexto é tirado na hora em que o botão foi tocado (a tela e os erros daquele momento)
  const [contexto] = useState(() => montarContexto(p))
  const [comentario, setComentario] = useState('')
  const [gravidade, setGravidade] = useState<Gravidade>('atrapalha')
  const [imagens, setImagens] = useState<Blob[]>([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [guardados, setGuardados] = useState<Reporte[]>([])
  const [verJunto, setVerJunto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  const recarregar = () => listarReportes().then(setGuardados).catch(() => setGuardados([]))
  useEffect(() => {
    recarregar()
    caixa.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && p.aoFechar()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [])

  const escolher = async (input: HTMLInputElement) => {
    const arquivos = [...(input.files ?? [])]
    input.value = ''
    setErro('')
    for (const a of arquivos) {
      if (imagens.length >= MAX_IMAGENS) return setErro(`No máximo ${MAX_IMAGENS} imagens.`)
      const recusa = recusaDaImagem(a)
      if (recusa) return setErro(recusa)
      try {
        const reduzida = await reduzirImagem(a)
        setImagens((l) => (l.length >= MAX_IMAGENS ? l : [...l, reduzida]))
      } catch (e) {
        return setErro((e as Error).message)
      }
    }
  }

  const guardar = async (eBaixar: boolean) => {
    if (!comentario.trim()) return setErro('Escreva o que aconteceu.')
    setErro('')
    setOcupado(true)
    const r: Reporte = { id: crypto.randomUUID(), criado_em: new Date().toISOString(), comentario: comentario.trim(), gravidade, contexto, imagens }
    try {
      await guardarReporte(r)
      if (eBaixar) baixar(await zipDosReportes([r]), `${nomeDoReporte(r)}.zip`)
      setComentario('')
      setImagens([])
      setAviso(eBaixar ? 'Guardado e baixado. Mande o .zip para quem cuida do app.' : 'Guardado neste aparelho. Baixe o .zip quando for mandar.')
      await recarregar()
    } catch (e) {
      setErro(`Não guardou: ${(e as Error).message}`)
    } finally {
      setOcupado(false)
    }
  }

  const baixarTodos = async () => {
    if (guardados.length === 0) return
    const d = new Date()
    baixar(await zipDosReportes(guardados), `reportes-${p.obra.codigo}-${d.toISOString().slice(0, 10)}.zip`)
  }

  const apagar = async (r: Reporte) => {
    if (!confirm('Apagar este reporte deste aparelho?')) return
    await apagarReporte(r.id)
    await recarregar()
  }

  return (
    <div class="rp-fundo" onClick={(e) => e.target === e.currentTarget && p.aoFechar()}>
      <div class="rp-janela" role="dialog" aria-modal="true" aria-labelledby="rp-titulo" tabIndex={-1} ref={caixa} data-testid="janela-reporte">
        <header class="rp-cabeca">
          <h2 id="rp-titulo">Reportar problema</h2>
          <button type="button" onClick={p.aoFechar}>
            Fechar
          </button>
        </header>
        <p class="discreto">Conte o que aconteceu. Pode juntar um print ou uma foto.</p>

        <label class="rp-campo">
          <span>O que aconteceu?</span>
          <textarea rows={4} maxLength={LIMITE_COMENTARIO} value={comentario} onInput={(e) => setComentario(e.currentTarget.value)} data-testid="reporte-comentario" />
        </label>

        <div class="rp-gravidade" role="group" aria-label="Gravidade">
          {(Object.keys(ROTULO_GRAVIDADE) as Gravidade[]).map((g) => (
            <button key={g} type="button" class={gravidade === g ? 'on' : ''} aria-pressed={gravidade === g} onClick={() => setGravidade(g)}>
              {ROTULO_GRAVIDADE[g]}
            </button>
          ))}
        </div>

        <label class="rp-campo">
          <span>
            Print ou foto ({imagens.length} de {MAX_IMAGENS})
          </span>
          <input type="file" accept={ACEITAR_IMAGEM} multiple disabled={imagens.length >= MAX_IMAGENS} onChange={(e) => escolher(e.currentTarget)} data-testid="reporte-imagem" />
        </label>
        {imagens.length > 0 && (
          <div class="rp-minis" data-testid="reporte-minis">
            {imagens.map((b, i) => (
              <Miniatura key={i} blob={b} aoTirar={() => setImagens((l) => l.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}

        <button type="button" class="rp-junto" aria-expanded={verJunto} onClick={() => setVerJunto(!verJunto)}>
          {verJunto ? 'Esconder' : 'Ver'} o que vai junto
        </button>
        {verJunto && (
          <dl class="rp-dados" data-testid="reporte-junto">
            <dt>Tela</dt>
            <dd>
              {contexto.modulo} / {contexto.tela}
            </dd>
            <dt>Obra</dt>
            <dd>{contexto.obra_codigo}</dd>
            <dt>Versão</dt>
            <dd>{contexto.versao_app}</dd>
            <dt>Aparelho</dt>
            <dd>
              {contexto.navegador} · {contexto.tela_px}
            </dd>
            <dt>Fila</dt>
            <dd>
              {contexto.fila.pendentes} esperando, {contexto.fila.com_erro} com erro
            </dd>
            <dt>Erros</dt>
            <dd>{contexto.erros.length === 0 ? 'nenhum' : `${contexto.erros.length} (sem e-mail nem senha)`}</dd>
            <dt>Não vai</dt>
            <dd>seu nome, e-mail, localização e o que está digitado na tela</dd>
          </dl>
        )}

        {erro && (
          <p class="erro" role="alert">
            {erro}
          </p>
        )}
        {aviso && (
          <p class="aviso" role="status" data-testid="reporte-aviso">
            {aviso}
          </p>
        )}
        <div class="rp-acoes">
          <button type="button" class="principal" disabled={ocupado} onClick={() => guardar(true)} data-testid="reporte-baixar">
            Guardar e baixar .zip
          </button>
          <button type="button" disabled={ocupado} onClick={() => guardar(false)}>
            Só guardar
          </button>
        </div>

        <h3>Guardados neste aparelho ({guardados.length})</h3>
        {guardados.length === 0 ? (
          <p class="discreto">–</p>
        ) : (
          <>
            <ul class="rp-lista" data-testid="reportes-guardados">
              {guardados.map((r) => (
                <li key={r.id}>
                  <span>
                    <strong>{r.comentario.slice(0, 80)}</strong>
                    <span class="discreto">
                      {new Date(r.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {r.contexto.modulo}/{r.contexto.tela}
                      {r.imagens.length ? ` · ${r.imagens.length} imagem(ns)` : ''}
                    </span>
                  </span>
                  <span class="rp-lista-acoes">
                    <button type="button" onClick={async () => baixar(await zipDosReportes([r]), `${nomeDoReporte(r)}.zip`)}>
                      .zip
                    </button>
                    <button type="button" class="perigo" onClick={() => apagar(r)}>
                      Apagar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" class="rp-largo" onClick={baixarTodos} data-testid="reportes-baixar-todos">
              Baixar todos (.zip)
            </button>
          </>
        )}
      </div>
    </div>
  )
}
