// Botão "Exportar PDF" das telas de consulta (frente 06, 21/11/2026). Monta a folha padrão (folha_pdf.ts)
// escondida na tela, chama o Imprimir do navegador e tira a folha depois. No Imprimir, "Salvar como PDF".
// Só a folha sai na impressão (body.so-imprimindo); as impressões próprias dos módulos não mudam.
// A folha não sai no "afterprint": no Chrome do Android o print() volta na hora e o "afterprint" pode vir
// antes de o PDF ser desenhado (no teste, o page.pdf faz isso). Ela sai no próximo toque ou tecla no app.
import { render } from 'preact'
import { useState } from 'preact/hooks'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import { banco } from '../nucleo/servicos'
import { dataHoraBR, nomeDoArquivoPdf, textoDaCelula, textoDeQuem, type FolhaPdf } from './folha_pdf'
import './exportar_pdf.css'

/** Nomes de quem divide a obra, guardados no aparelho pela FVS (perfis do servidor). */
const CHAVE_NOMES = 'fvs_nomes'

export function Folha({ folha, obra, quem, quando }: { folha: FolhaPdf; obra: Pick<ObraLocal, 'codigo' | 'nome' | 'empresa'>; quem: string; quando: Date }) {
  return (
    <article class={`sf-folha${folha.deitada ? ' sf-deitada' : ''}`}>
      <header class="sf-cab">
        <div class="sf-obra">
          <b>
            {obra.codigo} · {obra.nome}
          </b>
          {obra.empresa && <span>{obra.empresa}</span>}
        </div>
        <div class="sf-meta" data-testid="folha-pdf-meta">
          <span>Gerado em {dataHoraBR(quando)}</span>
          <span>por {quem}</span>
        </div>
      </header>
      <h1 class="sf-titulo">
        {folha.modulo} · {folha.titulo}
      </h1>
      {folha.sub && <p class="sf-sub">{folha.sub}</p>}
      {folha.resumo && folha.resumo.length > 0 && (
        <ul class="sf-resumo">
          {folha.resumo.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {folha.tabelas.map((t, i) => (
        <section class="sf-secao" key={i}>
          {t.titulo && <h2>{t.titulo}</h2>}
          {t.linhas.length === 0 ? (
            <p class="sf-vazio">{t.vazio ?? 'Nada para mostrar.'}</p>
          ) : (
            <table class="sf-tabela">
              <thead>
                <tr>
                  {t.colunas.map((c, k) => (
                    <th key={k} class={t.curtas?.includes(k) ? 'sf-curta' : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.linhas.map((l, j) => (
                  <tr key={j}>
                    {l.map((c, k) => (
                      <td key={k} class={t.curtas?.includes(k) ? 'sf-curta' : undefined}>
                        {textoDaCelula(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {t.nota && <p class="sf-nota">{t.nota}</p>}
        </section>
      ))}
      <footer class="sf-rodape">Sistema Obra · {folha.modulo} · com o que estava neste aparelho na hora</footer>
    </article>
  )
}

/** Tempo em que o Imprimir ainda está abrindo a folha. No Android o "vai imprimir" pode vir depois do print(). */
const VALE_POR_MS = 30_000
const VOLTOU_AO_APP = ['pointerdown', 'keydown'] as const
let folhaAberta: { criada: number; limpar: () => void } | null = null

// Ctrl+P ou o Imprimir de outra tela bem depois: a folha velha (se o "fechou" não veio) não pode sair no lugar
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => {
    if (folhaAberta && Date.now() - folhaAberta.criada > VALE_POR_MS) folhaAberta.limpar()
  })
}

/** Põe a folha na página (escondida na tela), abre o Imprimir do navegador e tira a folha quando ele fecha. */
export async function imprimirFolha(folha: FolhaPdf, obra: Pick<ObraLocal, 'codigo' | 'nome' | 'empresa'>, quem: string, quando = new Date()) {
  folhaAberta?.limpar()
  const raiz = document.createElement('div')
  raiz.className = 'so-folha-pdf'
  raiz.dataset.testid = 'folha-pdf'
  document.body.appendChild(raiz)
  render(<Folha folha={folha} obra={obra} quem={quem} quando={quando} />, raiz)
  const titulo = document.title
  // o Chrome sugere o título da página como nome do arquivo
  document.title = nomeDoArquivoPdf(folha, obra.codigo, quando)
  const esta = {
    criada: Date.now(),
    limpar: () => {
      for (const ev of VOLTOU_AO_APP) window.removeEventListener(ev, esta.limpar, true)
      document.body.classList.remove('so-imprimindo')
      document.title = titulo
      render(null, raiz)
      raiz.remove()
      if (folhaAberta === esta) folhaAberta = null
    },
  }
  folhaAberta = esta
  document.body.classList.add('so-imprimindo')
  // um quadro para o navegador desenhar a folha antes do Imprimir
  await new Promise<void>((ok) => requestAnimationFrame(() => ok()))
  window.print()
  // de volta ao app (o toque do próprio botão já passou): a folha e o título saem
  setTimeout(() => {
    if (folhaAberta === esta) for (const ev of VOLTOU_AO_APP) window.addEventListener(ev, esta.limpar, true)
  }, 0)
}

/** Quem está gerando a folha, pelo que o aparelho sabe (nome do perfil, e-mail ou "sem conta"). */
export async function quemGera(usuario: UsuarioLocal): Promise<string> {
  const nomes = await banco.lerMeta<Record<string, string>>(CHAVE_NOMES).catch(() => undefined)
  return textoDeQuem(usuario, nomes)
}

export function BotaoExportarPdf({
  obra,
  usuario,
  montar,
  rotulo = 'Exportar PDF',
  classe = '',
  testid = 'exportar-pdf',
  desativado = false,
}: {
  obra: ObraLocal
  usuario: UsuarioLocal
  montar: () => FolhaPdf | Promise<FolhaPdf>
  rotulo?: string
  classe?: string
  testid?: string
  desativado?: boolean
}) {
  const [montando, setMontando] = useState(false)
  const [erro, setErro] = useState('')
  const exportar = async () => {
    setErro('')
    setMontando(true)
    try {
      const [folha, quem] = await Promise.all([montar(), quemGera(usuario)])
      await imprimirFolha(folha, obra, quem)
    } catch (e) {
      setErro(`Não deu para montar o PDF: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setMontando(false)
    }
  }
  return (
    <>
      <button type="button" class={`so-bt-pdf nao-imprimir ${classe}`.trim()} data-testid={testid} disabled={desativado || montando} onClick={exportar}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          <path d="M14 2v5h5M8 13h8M8 17h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <span>{montando ? 'Montando…' : rotulo}</span>
      </button>
      {erro && (
        <p class="aviso nao-imprimir" role="alert">
          {erro}
        </p>
      )}
    </>
  )
}
