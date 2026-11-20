// Tela do leitor de IFC: o modelo ocupa a tela e os painéis abrem por cima ou ao lado.
// Celular em pé: painel embaixo, modelo em cima. Tablet deitado e PC: painel à esquerda.
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import '../ifc.css'
import { filtroAtivo } from '../motor/indice'
import { Visor } from '../motor/visor'
import { Sessao } from '../sessao'
import { PainelBusca } from './PainelBusca'
import { PainelCores } from './PainelCores'
import { PainelCortes } from './PainelCortes'
import { PainelModelos, numero } from './PainelModelos'
import { CartaoElemento } from './CartaoElemento'
import { RotulosNiveis } from './RotulosNiveis'
import { IcAbrir, IcBuscar, IcCorte, IcCores, IcEnquadrar, IcFechar, IcFrente, IcIso, IcModelos, IcTopo, IcVoltar } from './icones'

type IdPainel = 'modelos' | 'buscar' | 'cortes' | 'cores'

const ABAS: Array<{ id: IdPainel; nome: string; Icone: () => preact.JSX.Element }> = [
  { id: 'modelos', nome: 'Modelos', Icone: IcModelos },
  { id: 'buscar', nome: 'Buscar', Icone: IcBuscar },
  { id: 'cortes', nome: 'Cortes', Icone: IcCorte },
  { id: 'cores', nome: 'Cores', Icone: IcCores },
]

export function usarSessao(s: Sessao): void {
  const [, marcar] = useState(0)
  useEffect(() => s.assinar(() => marcar((v) => v + 1)), [s])
}

export interface PropsModuloIfc {
  /** Voltar ao menu do app. Na bancada não existe. */
  aoSair?: () => void
}

export function ModuloIfc({ aoSair }: PropsModuloIfc) {
  const sessao = useMemo(() => new Sessao(), [])
  usarSessao(sessao)
  const canvas = useRef<HTMLCanvasElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const [painel, setPainel] = useState<IdPainel | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [erroVisor, setErroVisor] = useState<string | null>(null)

  useEffect(() => {
    let v: Visor | null = null
    try {
      v = new Visor(canvas.current!)
      sessao.ligarVisor(v)
    } catch {
      setErroVisor('Este aparelho ou navegador não conseguiu ligar o desenho 3D (WebGL2). Tente no Chrome atualizado.')
    }
    void sessao.atualizarGuardados()
    if (import.meta.env.DEV) (window as unknown as { __ifc: Sessao }).__ifc = sessao
    return () => sessao.destruir()
  }, [sessao])

  const escolher = useCallback(() => entrada.current?.click(), [])
  const aoEscolher = useCallback(
    (e: Event) => {
      const alvo = e.target as HTMLInputElement
      const arquivos = Array.from(alvo.files ?? [])
      alvo.value = ''
      if (arquivos.length) void sessao.abrirArquivos(arquivos)
    },
    [sessao],
  )

  const aoSoltar = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setArrastando(false)
      const arquivos = Array.from(e.dataTransfer?.files ?? [])
      if (arquivos.length) void sessao.abrirArquivos(arquivos)
    },
    [sessao],
  )

  // No celular em pé o desenho precisa da tela: o painel fecha e volta pela aba Cortes.
  const aoVer2D = useCallback(() => {
    if (matchMedia('(max-width: 899px) and (orientation: portrait)').matches) setPainel(null)
    sessao.abrirVista2D()
  }, [sessao])

  const alternar = (id: IdPainel) => setPainel((p) => (p === id ? null : id))
  const vazio = sessao.modelos.length === 0
  const passoAlinhar = sessao.passoAlinhamento()
  const vista2D = sessao.corte?.vista2D ?? false
  const elementoAberto = sessao.selecao !== null
  const desalinhado = sessao.modeloDesalinhado()
  const filtroLigado = filtroAtivo(sessao.filtro) && sessao.modoFiltro !== 'lista'
  const ocultos = sessao.qtdOcultos()
  const totalPecas = sessao.modelos.reduce((s, m) => s + m.flags.length, 0)

  return (
    <div
      class={`ifc ${painel ? 'ifc-com-painel' : ''} ${elementoAberto ? 'ifc-com-elemento' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) setArrastando(false)
      }}
      onDrop={aoSoltar}
    >
      {/* Sem accept: no Android, o seletor deixa .ifc cinza porque não conhece o tipo do arquivo. */}
      <input ref={entrada} type="file" multiple class="ifc-escondido" onChange={aoEscolher} data-testid="ifc-arquivos" tabIndex={-1} aria-hidden="true" />

      <nav class="ifc-abas" aria-label="Ferramentas do leitor">
        {aoSair && (
          <button type="button" class="ifc-aba ifc-aba-voltar" onClick={aoSair} aria-label="Voltar ao menu">
            <IcVoltar />
            <span>Menu</span>
          </button>
        )}
        {ABAS.map(({ id, nome, Icone }) => (
          <button key={id} type="button" class="ifc-aba" aria-pressed={painel === id} onClick={() => alternar(id)} disabled={vazio && id !== 'modelos'}>
            <Icone />
            <span>{nome}</span>
          </button>
        ))}
      </nav>

      {painel && (
        <section class="ifc-painel" data-painel={painel} aria-label={ABAS.find((a) => a.id === painel)?.nome}>
          <header class="ifc-painel-topo">
            <h2>{ABAS.find((a) => a.id === painel)?.nome}</h2>
            <button type="button" class="ifc-icone" onClick={() => setPainel(null)} aria-label="Fechar painel">
              <IcFechar />
            </button>
          </header>
          <div class="ifc-painel-corpo">
            {painel === 'modelos' && <PainelModelos sessao={sessao} aoEscolher={escolher} />}
            {painel === 'buscar' && <PainelBusca sessao={sessao} />}
            {painel === 'cortes' && <PainelCortes sessao={sessao} aoVer2D={aoVer2D} />}
            {painel === 'cores' && <PainelCores sessao={sessao} />}
          </div>
        </section>
      )}

      <main class="ifc-cena">
        <canvas ref={canvas} data-testid="ifc-canvas" />
        <RotulosNiveis sessao={sessao} />

        {vazio && !erroVisor && (
          <div class="ifc-vazio" data-testid="ifc-importar">
            <h1>Importe aqui seu IFC</h1>
            <p>Escolha um ou mais arquivos .ifc do projeto (ou arraste para cá). Eles aparecem um por cima do outro, com busca e cortes. Tudo fica só neste aparelho.</p>
            <button type="button" class="ifc-botao ifc-botao-forte" onClick={escolher}>
              <IcAbrir />
              Importar IFC
            </button>
            {sessao.guardados.length > 0 && (
              <div class="ifc-vazio-guardados">
                <h2>Guardados neste aparelho</h2>
                <ul>
                  {sessao.guardados.map((g) => (
                    <li key={g.id}>
                      <button type="button" class="ifc-botao" onClick={() => void sessao.abrirDoAparelho(g.id)}>
                        {g.nome}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {erroVisor && (
          <div class="ifc-vazio" role="alert">
            <h1>Não deu para abrir o visor</h1>
            <p>{erroVisor}</p>
          </div>
        )}

        {!vazio && !vista2D && (
          <div class="ifc-vistas" role="toolbar" aria-label="Vistas">
            <button type="button" class="ifc-icone ifc-icone-flutuante" onClick={() => sessao.visor?.enquadrar()} aria-label="Enquadrar tudo" title="Enquadrar tudo">
              <IcEnquadrar />
            </button>
            <button type="button" class="ifc-icone ifc-icone-flutuante" onClick={() => sessao.visor?.vista('topo', sessao.giroPredio)} aria-label="Vista de cima" title="Vista de cima">
              <IcTopo />
            </button>
            <button type="button" class="ifc-icone ifc-icone-flutuante" onClick={() => sessao.visor?.vista('frente', sessao.giroPredio)} aria-label="Vista de frente" title="Vista de frente">
              <IcFrente />
            </button>
            <button type="button" class="ifc-icone ifc-icone-flutuante" onClick={() => sessao.visor?.vista('iso', sessao.giroPredio)} aria-label="Vista em perspectiva" title="Vista em perspectiva">
              <IcIso />
            </button>
          </div>
        )}

        {vista2D && sessao.corte && (
          <div class="ifc-faixa ifc-faixa-curta">
            <strong>{sessao.corte.nome}</strong>
            <button type="button" class="ifc-botao" onClick={() => sessao.fecharVista2D()}>
              Voltar ao 3D
            </button>
          </div>
        )}

        {sessao.esperandoFace && (
          <div class="ifc-faixa" role="status">
            <span>Toque na face onde quer cortar.</span>
            <button type="button" class="ifc-botao" onClick={() => sessao.cancelarEsperaFace()}>
              Cancelar
            </button>
          </div>
        )}

        {passoAlinhar && (
          <div class="ifc-faixa" role="status">
            <span>{passoAlinhar.texto}</span>
            {passoAlinhar.podeConcluir && (
              <button type="button" class="ifc-botao ifc-botao-forte" onClick={() => sessao.concluirAlinhamento()}>
                Concluir
              </button>
            )}
            <button type="button" class="ifc-botao" onClick={() => sessao.cancelarAlinhamento()}>
              Cancelar
            </button>
          </div>
        )}

        {desalinhado && !passoAlinhar && !vista2D && (
          <div class="ifc-faixa ifc-faixa-coluna" role="status" data-testid="ifc-desalinhado">
            <span>
              <strong>{desalinhado.nome}</strong> ficou a {Math.round(desalinhado.distancia)} m do outro modelo: os arquivos não vieram na mesma coordenada.
            </span>
            <div class="ifc-acoes">
              <button type="button" class="ifc-botao ifc-botao-forte" onClick={() => sessao.iniciarAlinhamento(desalinhado.chave)}>
                Marcar pontos
              </button>
              <button type="button" class="ifc-botao" onClick={() => sessao.encaixarPelaCaixa(desalinhado.chave)}>
                Encaixar pelo centro
              </button>
              <button type="button" class="ifc-botao" onClick={() => sessao.dispensarAlinhamento(desalinhado.chave)}>
                Deixar assim
              </button>
            </div>
          </div>
        )}

        {sessao.leituras.length > 0 && (
          <div class="ifc-leituras" role="status" aria-live="polite">
            {sessao.leituras.map((l) => (
              <div key={l.id} class="ifc-leitura">
                <div class="ifc-leitura-texto">
                  <strong>{l.nome}</strong>
                  <span>
                    {l.fase} · {Math.round(l.fracao * 100)}%
                  </span>
                </div>
                <div class="ifc-barra" aria-hidden="true">
                  <div style={{ transform: `scaleX(${l.fracao})` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {sessao.avisos.length > 0 && (
          <ul class="ifc-avisos" role="alert">
            {sessao.avisos.map((a, i) => (
              <li key={i}>
                <span>{a}</span>
                <button type="button" class="ifc-icone" onClick={() => sessao.descartarAviso(i)} aria-label="Dispensar aviso">
                  <IcFechar />
                </button>
              </li>
            ))}
          </ul>
        )}

        {sessao.leituras.length === 0 && (filtroLigado || ocultos > 0) && (
          <div class="ifc-estado" role="status">
            {filtroLigado ? (
              <>
                <span>
                  {numero(sessao.resultado?.total ?? 0)} de {numero(totalPecas)} peças
                </span>
                <button type="button" onClick={() => sessao.limparFiltro()}>
                  Limpar
                </button>
              </>
            ) : (
              <>
                <span>{numero(ocultos)} ocultas</span>
                <button type="button" onClick={() => sessao.mostrarTudo()}>
                  Mostrar todas
                </button>
              </>
            )}
          </div>
        )}

        {arrastando && <div class="ifc-soltar">Solte os arquivos IFC aqui</div>}
      </main>

      {elementoAberto && <CartaoElemento sessao={sessao} />}
    </div>
  )
}
