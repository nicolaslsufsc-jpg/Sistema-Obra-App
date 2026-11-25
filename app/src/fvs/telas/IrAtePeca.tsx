// Ir de uma lista até a peça na planta: acha o trecho, abre e, se a planta não estiver no aparelho,
// oferece baixar. Usado pela lista de reprovações e pela lista de fichas duplicadas.
import { useEffect, useState } from 'preact/hooks'
import { baixarPlanta, type DadosFvs, type Planta } from '../dados'
import { mb } from '../formato'
import { pacotesNoAparelho, pecasNoAparelho, textoDoErroDeDownload } from '../pacote'
import { destinoDaPeca, trechoDoLocal, type DestinoDaPeca, type LocalDaLista } from '../reprovacoes'
import type { ContextoFvs } from './ModuloFvs'

export interface Aparelho {
  pecas: Map<string, string[]>
  plantas: Set<string>
}

/**
 * O que está no aparelho. A peça que está no pacote de uma revisão anterior conta como estando na
 * planta vigente do trecho: é com esse pacote que a planta abre até a revisão nova ser baixada.
 */
export async function lerAparelho(vigenteDe?: ReadonlyMap<string, string>): Promise<Aparelho> {
  const [pecas, plantas] = await Promise.all([pecasNoAparelho(), pacotesNoAparelho()])
  const normalizadas = new Map([...pecas].map(([peca, ids]) => [peca, ids.map((id) => vigenteDe?.get(id) ?? id)]))
  return { pecas: normalizadas, plantas: new Set(plantas.keys()) }
}

/** Trecho de um local: onde foi marcado, o que o local do sistema oficial diz, ou o pacote do aparelho. */
export function trechoDoRegistro(l: Pick<LocalDaLista, 'pecaId' | 'local' | 'plantaMarcada'>, dados: DadosFvs, aparelho: Aparelho | null): string | null {
  const marcada = l.plantaMarcada ? dados.plantaPorId.get(dados.vigenteDe.get(l.plantaMarcada) ?? l.plantaMarcada) : undefined
  if (marcada) return marcada.trecho
  const doLocal = trechoDoLocal(l.local)
  if (doLocal) return doLocal
  const noPacote = aparelho?.pecas.get(l.pecaId)?.[0]
  return (noPacote && dados.plantaPorId.get(noPacote)?.trecho) || null
}

interface Local extends LocalDaLista {
  /** identifica a linha da lista em que a oferta de baixar aparece */
  chave: string
  pavimentoId: string
}

/**
 * aoAbrir: quando a peça está numa planta do aparelho. A tela guarda o que precisa e chama `ir`.
 * Devolve o toque (`abrir`), o que está no aparelho e a oferta de baixar para desenhar na linha.
 */
export function usarIrAtePeca<T extends Local>(ctx: ContextoFvs, aoAbrir: (l: T, plantaId: string) => void) {
  const { dados, props } = ctx
  const [aparelho, setAparelho] = useState<Aparelho | null>(null)
  const [oferta, setOferta] = useState<{ chave: string; destino: DestinoDaPeca } | null>(null)
  const [baixando, setBaixando] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    lerAparelho(dados.vigenteDe).then((a) => vivo && setAparelho(a))
    return () => {
      vivo = false
    }
  }, [])

  const abrir = async (l: T, leitura?: Aparelho) => {
    const a = leitura ?? aparelho ?? (await lerAparelho(dados.vigenteDe))
    const plantas = (dados.plantasDe.get(l.pavimentoId) ?? []).map((p) => ({ ...p, tamanho: (p.manifest?.tamanho ?? 0) + (p.pacote?.tamanho ?? 0) }))
    const plantaMarcada = l.plantaMarcada ? (dados.vigenteDe.get(l.plantaMarcada) ?? l.plantaMarcada) : null
    // área de laje não está no pacote da planta: fica na planta do trecho em que foi desenhada
    const area = dados.areaPorId.get(l.pecaId)
    const daArea = area ? plantas.find((p) => p.setor_id === area.setor_id) : undefined
    const destino: DestinoDaPeca = area
      ? daArea
        ? a.plantas.has(daArea.id)
          ? { tipo: 'abrir', plantaId: daArea.id }
          : { tipo: 'baixar', plantas: [daArea] }
        : { tipo: 'sem_planta' }
      : destinoDaPeca({ ...l, plantaMarcada }, plantas, a.pecas, a.plantas)
    if (destino.tipo === 'abrir') {
      aoAbrir(l, destino.plantaId)
    } else {
      setErro('')
      setOferta({ chave: l.chave, destino })
    }
  }

  const baixar = async (l: T, planta: Planta) => {
    setErro('')
    setBaixando(planta.id)
    try {
      await baixarPlanta(planta, { obraId: props.obra.id, usuarioId: props.usuario.id })
      const a = await lerAparelho(dados.vigenteDe)
      setAparelho(a)
      setOferta(null)
      await abrir(l, a)
    } catch (e) {
      setErro(textoDoErroDeDownload(e))
    } finally {
      setBaixando(null)
    }
  }

  /** O aviso e os botões de baixar, embaixo da linha que foi tocada. */
  const ofertaDaLinha = (l: T) => {
    const destino = oferta?.chave === l.chave ? oferta.destino : null
    if (destino?.tipo === 'sem_planta') {
      return (
        <p class="aviso fv-rep-oferta" data-testid="fvs-rep-oferta">
          Peça fora das plantas deste pavimento.
        </p>
      )
    }
    if (destino?.tipo !== 'baixar') return null
    return (
      <div class="fv-rep-oferta" data-testid="fvs-rep-oferta">
        <p class="aviso">
          {destino.plantas.length === 1
            ? destino.plantas[0].trecho === 'Planta inteira'
              ? 'A planta deste pavimento não está no aparelho.'
              : `A planta do ${destino.plantas[0].trecho} não está no aparelho.`
            : 'A planta desta peça não está no aparelho. Baixe o trecho dela:'}
          {!ctx.online && ' Precisa de internet uma vez.'}
        </p>
        {destino.plantas.map((p) => (
          <button type="button" key={p.id} class="fv-baixar" disabled={!ctx.online || baixando !== null} onClick={() => baixar(l, dados.plantaPorId.get(p.id)!)}>
            {baixando === p.id ? 'Baixando…' : `Baixar ${p.trecho}${p.tamanho ? ` (${mb(p.tamanho)})` : ''}`}
          </button>
        ))}
      </div>
    )
  }

  return { aparelho, abrir, erro, ofertaDaLinha, limparOferta: () => setOferta(null) }
}
