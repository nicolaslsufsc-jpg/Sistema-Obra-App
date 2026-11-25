// "Baixar modelo da obra": lista dos IFCs da obra no Google Drive (ver modelos_drive.ts).
// Tocar num modelo mostra o tamanho e os avisos (Wi-Fi, aparelho); "Abrir no Drive" baixa pelo
// próprio Drive; depois, "Importar IFC" abre o arquivo baixado no leitor. O que já foi importado
// (mesmo nome) aparece como "neste aparelho", com Abrir.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Sessao } from '../sessao'
import { avisosAntesDeBaixar, conexaoAtual, lerLista, mesmoArquivo, linkDaPasta, linkDoArquivo, type FonteListaModelos, type ListaModelos, type ModeloDrive } from '../modelos_drive'
import { tamanhoArquivo } from './PainelModelos'
import { IcAbrir, IcBaixar } from './icones'

export interface PropsModelosDaObra {
  fonte: FonteListaModelos
  /** Muda quando a sincronização trouxe dados novos. */
  versao: number
  sessao: Sessao
  aoImportar: () => void
}

function Modelo({ m, sessao, aberto, aoAbrir, aoBaixou, aoImportar, baixou }: {
  m: ModeloDrive
  sessao: Sessao
  aberto: boolean
  aoAbrir: (v: boolean) => void
  aoBaixou: () => void
  aoImportar: () => void
  baixou: boolean
}) {
  const guardado = sessao.guardados.find((g) => mesmoArquivo(g.nome, m.nome))
  const avisos = aberto ? avisosAntesDeBaixar(m, conexaoAtual()) : []
  return (
    <li class="ifc-da-obra" data-testid="modelo-drive">
      <div class="ifc-da-obra-nome">
        <strong title={m.nome}>{m.nome}</strong>
        <small>
          {m.disciplina} · {tamanhoArquivo(m.tamanho)}
          {m.situacao && ` · ${m.situacao}`}
          {guardado && ' · neste aparelho'}
        </small>
      </div>
      {guardado && !aberto ? (
        <div class="ifc-acoes">
          <button type="button" class="ifc-botao ifc-botao-forte" onClick={() => void sessao.abrirDoAparelho(guardado.id)}>
            <IcAbrir />
            Abrir
          </button>
          <button type="button" class="ifc-botao" onClick={() => aoAbrir(true)}>
            Baixar de novo
          </button>
        </div>
      ) : !aberto ? (
        <div class="ifc-acoes">
          <button type="button" class="ifc-botao" onClick={() => aoAbrir(true)}>
            <IcBaixar />
            Baixar
          </button>
        </div>
      ) : (
        <div class="ifc-baixar-drive" role="group" aria-label={`Baixar ${m.nome}`}>
          <p>
            <strong>{tamanhoArquivo(m.tamanho)}</strong> para baixar.
          </p>
          {avisos.map((a) => (
            <p key={a} class="ifc-baixar-aviso">
              {a}
            </p>
          ))}
          {baixou ? (
            <>
              <p>Quando o Drive terminar de baixar, toque em Importar IFC e escolha "{m.nome}" (pasta Downloads).</p>
              <div class="ifc-acoes">
                <button type="button" class="ifc-botao ifc-botao-forte" onClick={aoImportar}>
                  <IcAbrir />
                  Importar IFC
                </button>
                <button type="button" class="ifc-botao" onClick={() => aoAbrir(false)}>
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <div class="ifc-acoes">
              <a class="ifc-botao ifc-botao-forte" href={linkDoArquivo(m.drive)} target="_blank" rel="noopener noreferrer" onClick={aoBaixou}>
                <IcBaixar />
                Abrir no Drive para baixar
              </a>
              <button type="button" class="ifc-botao" onClick={() => aoAbrir(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export function ModelosDaObra({ fonte, versao, sessao, aoImportar }: PropsModelosDaObra) {
  const [lista, setLista] = useState<ListaModelos | null>(null)
  const [carregou, setCarregou] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const [baixou, setBaixou] = useState<string | null>(null)
  // confirmação discreta na própria seção (os avisos do leitor são só para erro)
  const [carregada, setCarregada] = useState('')
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    fonte
      .ler()
      .then((l) => vivo && setLista(l))
      .catch(() => vivo && setLista(null))
      .finally(() => vivo && setCarregou(true))
    return () => {
      vivo = false
    }
  }, [fonte, versao])

  const carregarArquivo = async (arquivo: File) => {
    try {
      const texto = await arquivo.text()
      const nova = lerLista(texto)
      await fonte.gravar?.(texto)
      setLista(nova)
      setCarregada(`Lista de modelos carregada: ${nova.modelos.length} modelo(s).`)
    } catch (e) {
      sessao.avisarUsuario(`Não consegui carregar a lista de modelos: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!carregou) return null
  if (!lista && !fonte.gravar) return null
  return (
    <section class="ifc-da-obra-lista" aria-label="Baixar modelo da obra" data-testid="modelos-da-obra">
      <h2>Baixar modelo da obra</h2>
      {lista ? (
        <>
          <p class="ifc-discreto">
            Os modelos ficam no Google Drive da obra{lista.exemplo ? ' (lista de exemplo da obra EXE)' : ''}. Para baixar, é preciso ter acesso à pasta.
            {lista.pasta && (
              <>
                {' '}
                <a href={linkDaPasta(lista.pasta)} target="_blank" rel="noopener noreferrer">
                  Ver a pasta
                </a>
              </>
            )}
          </p>
          <ul class="ifc-lista-limpa">
            {lista.modelos.map((m) => (
              <Modelo
                key={m.drive}
                m={m}
                sessao={sessao}
                aberto={aberto === m.drive}
                aoAbrir={(v) => {
                  setAberto(v ? m.drive : null)
                  setBaixou(null)
                }}
                aoBaixou={() => setBaixou(m.drive)}
                aoImportar={aoImportar}
                baixou={baixou === m.drive}
              />
            ))}
          </ul>
        </>
      ) : (
        <p class="ifc-discreto">Sem lista de modelos</p>
      )}
      {carregada && (
        <p class="ifc-discreto" role="status">
          {carregada}
        </p>
      )}
      {fonte.gravar && (
        <>
          <input
            ref={entrada}
            type="file"
            accept=".json,application/json"
            class="ifc-escondido"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="modelos-drive-arquivo"
            onChange={(e) => {
              const alvo = e.target as HTMLInputElement
              const arquivo = alvo.files?.[0]
              alvo.value = ''
              if (arquivo) void carregarArquivo(arquivo)
            }}
          />
          <button type="button" class="ifc-botao ifc-botao-largo" onClick={() => entrada.current?.click()} title="Arquivo modelos_drive.json com nome, disciplina, tamanho e id do Drive de cada modelo">
            {lista && !lista.exemplo ? 'Trocar a lista de modelos' : 'Carregar a lista de modelos (.json)'}
          </button>
        </>
      )}
    </section>
  )
}
