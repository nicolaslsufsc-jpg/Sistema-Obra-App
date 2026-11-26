// Lista "IFCs da obra": baixar para usar sem internet, abrir, apagar do aparelho e (gestor) enviar.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { IfcDaObra, IfcsDaObra } from '../obra'
import { tamanhoArquivo } from './PainelModelos'
import { IcAbrir, IcBaixar, IcLixo } from './icones'

export interface PropsIfcsDaObra {
  lista: IfcsDaObra
  /** Gestor ou admin, com conta: aparece "Enviar IFC para a obra". */
  podeEnviar: boolean
  online: boolean
  aoEnviar?: () => void
}

function usarLista(l: IfcsDaObra): void {
  const [, marcar] = useState(0)
  useEffect(() => l.assinar(() => marcar((v) => v + 1)), [l])
}

function Item({ lista, item, online }: { lista: IfcsDaObra; item: IfcDaObra; online: boolean }) {
  const baixando = lista.baixando.get(item.envio)
  const guardado = lista.guardadoDe(item)
  const data = item.criado ? new Date(item.criado).toLocaleDateString('pt-BR') : ''
  return (
    <li class="ifc-da-obra" data-testid="ifc-da-obra">
      <div class="ifc-da-obra-nome">
        <strong title={item.nome}>{item.nome}</strong>
        <small>
          {tamanhoArquivo(item.tamanho)} para baixar{data && ` · enviado em ${data}`}
          {!item.completo && ` · subindo (${item.partes.length} de ${item.total})`}
          {guardado && ' · neste aparelho'}
        </small>
      </div>
      {baixando ? (
        <div class="ifc-da-obra-progresso" role="status" aria-live="polite">
          <span>
            {baixando.fase} · {Math.round(baixando.fracao * 100)}%
          </span>
          <div class="ifc-barra" aria-hidden="true">
            <div style={{ transform: `scaleX(${baixando.fracao})` }} />
          </div>
        </div>
      ) : guardado ? (
        <div class="ifc-acoes">
          <button type="button" class="ifc-botao ifc-botao-forte" onClick={() => void lista.abrir(item)}>
            <IcAbrir />
            Abrir
          </button>
          <button type="button" class="ifc-botao" onClick={() => void lista.apagar(item)} aria-label={`Apagar ${item.nome} deste aparelho`}>
            <IcLixo />
            Apagar do aparelho
          </button>
        </div>
      ) : (
        <div class="ifc-acoes">
          <button
            type="button"
            class="ifc-botao"
            disabled={!item.completo || !online}
            title={!online ? 'Precisa de internet para baixar' : undefined}
            onClick={() => void lista.baixar(item)}
          >
            <IcBaixar />
            Baixar para usar offline
          </button>
        </div>
      )}
    </li>
  )
}

export function IfcsDaObraLista({ lista, podeEnviar, online, aoEnviar }: PropsIfcsDaObra) {
  usarLista(lista)
  const entrada = useRef<HTMLInputElement>(null)
  useEffect(() => {
    void lista.atualizar()
  }, [lista])
  if (!lista.carregou) return null
  if (lista.itens.length === 0 && !podeEnviar) return null
  return (
    <section class="ifc-da-obra-lista" aria-label="IFCs da obra" data-testid="ifcs-da-obra">
      <h2>IFCs da obra</h2>
      {lista.itens.length === 0 ? (
        <p class="ifc-discreto">Sem IFC enviado</p>
      ) : (
        <ul class="ifc-lista-limpa">
          {lista.itens.map((item) => (
            <Item key={item.envio} lista={lista} item={item} online={online} />
          ))}
        </ul>
      )}
      {!online && lista.itens.some((i) => !lista.guardadoDe(i)) && <p class="ifc-discreto">Sem internet: dá para abrir só os que já estão neste aparelho.</p>}
      {podeEnviar && (
        <>
          <input
            ref={entrada}
            type="file"
            class="ifc-escondido"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="ifc-enviar-arquivo"
            onChange={(e) => {
              const alvo = e.target as HTMLInputElement
              const arquivo = alvo.files?.[0]
              alvo.value = ''
              if (arquivo) void lista.enviar(arquivo).then((ok) => ok && aoEnviar?.())
            }}
          />
          {lista.enviando ? (
            <div class="ifc-da-obra-progresso" role="status" aria-live="polite">
              <span>
                {lista.enviando.fase} · {Math.round(lista.enviando.fracao * 100)}%
              </span>
              <div class="ifc-barra" aria-hidden="true">
                <div style={{ transform: `scaleX(${lista.enviando.fracao})` }} />
              </div>
            </div>
          ) : (
            <button type="button" class="ifc-botao ifc-botao-largo" onClick={() => entrada.current?.click()} title="Comprime o IFC e põe na fila: sobe na próxima sincronização e aparece nos aparelhos da obra">
              Enviar IFC para a obra
            </button>
          )}
        </>
      )}
    </section>
  )
}
