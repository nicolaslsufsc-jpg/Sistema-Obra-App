// Menu da obra, com login: "Plantas para usar sem internet". Baixa sozinho as que faltam quando há
// internet (nucleo/plantas_offline.ts). Sem login (modo local) não aparece: lá as plantas vêm do .zip.
import { useEffect, useRef, useState } from 'preact/hooks'
import { espacoUsado, formatarBytes } from '../nucleo/aparelho'
import { baixarQueFaltam, cabeNoAparelho, lerSituacao, textoDoErro, type SituacaoDasPlantas } from '../nucleo/plantas_offline'
import { terminarBaixa } from './fim_da_baixa'

export function PlantasSemInternet({
  obraId,
  usuarioId,
  online,
  versaoDados,
}: {
  obraId: string
  usuarioId: string
  online: boolean
  /** Muda quando a sincronização traz dados novos (planta nova publicada, por exemplo). */
  versaoDados: number
}) {
  const [situacao, setSituacao] = useState<SituacaoDasPlantas | null>(null)
  const [baixando, setBaixando] = useState<{ feitas: number; total: number } | null>(null)
  const [erro, setErro] = useState('')
  const [semEspaco, setSemEspaco] = useState(false)
  const ativo = useRef(true)
  const rodando = useRef(false)
  const tentouAuto = useRef(false)

  useEffect(() => {
    ativo.current = true
    return () => {
      ativo.current = false
    }
  }, [])

  const reler = async () => {
    const s = await lerSituacao(obraId).catch(() => null)
    if (ativo.current) setSituacao(s)
    return s
  }

  const baixar = async () => {
    if (rodando.current) return
    rodando.current = true
    setErro('')
    try {
      await baixarQueFaltam(obraId, { obraId, usuarioId }, (feitas, total) => ativo.current && setBaixando({ feitas, total }), () => !ativo.current)
    } catch (e) {
      const texto = await textoDoErro(e)
      if (ativo.current) setErro(texto)
    } finally {
      rodando.current = false
      // relê antes de tirar o "baixando": senão pisca a contagem de antes da baixa ("0 de 9")
      await terminarBaixa(reler, () => ativo.current && setBaixando(null))
    }
  }

  // A cada dado novo: relê. Com internet e algo faltando, baixa sozinho (uma tentativa automática por
  // abertura do menu; depois de um erro, só pelo botão, para não gastar dados do celular em repetição).
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const s = await reler()
      if (cancelado || !s || !online || s.faltam.length === 0 || tentouAuto.current) return
      const cabe = cabeNoAparelho(s.bytesQueFaltam, await espacoUsado())
      if (cabe === false) {
        setSemEspaco(true)
        return
      }
      tentouAuto.current = true
      await baixar()
      tentouAuto.current = false
    })()
    return () => {
      cancelado = true
    }
  }, [obraId, versaoDados, online])

  if (!situacao || situacao.total === 0) return null
  const tudo = situacao.faltam.length === 0

  let texto: string
  if (baixando) texto = `Baixando plantas para usar sem internet: ${baixando.feitas} de ${baixando.total}…`
  else if (tudo) texto = `Plantas no aparelho: ${situacao.total} de ${situacao.total}. Pode usar sem internet.`
  else
    texto = `Plantas no aparelho: ${situacao.noAparelho} de ${situacao.total}. Faltam ${formatarBytes(situacao.bytesQueFaltam)}${
      online ? '.' : ': conecte à internet para baixar.'
    }`

  return (
    <section class={`barra ${tudo && !erro ? 'ok' : 'atencao'}`} aria-live="polite" data-testid="plantas-sem-internet">
      <p>{texto}</p>
      {semEspaco && !baixando && <p>O aparelho está sem espaço para as plantas que faltam. Libere espaço e toque em "Baixar plantas".</p>}
      {erro && <p>{erro}</p>}
      {!tudo && !baixando && (
        <button type="button" onClick={baixar} disabled={!online}>
          Baixar plantas
        </button>
      )}
    </section>
  )
}
