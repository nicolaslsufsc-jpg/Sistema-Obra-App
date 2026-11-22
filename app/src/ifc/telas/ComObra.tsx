// O leitor com a obra aberta no app (com conta): sincroniza e mostra a lista "IFCs da obra".
// Sem conta (pacote da obra), o leitor fica como antes: só o que se importa do aparelho.
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { PropsModulo } from '../../modulos'
import { usarSincronizacao } from '../../nucleo/usarSincronizacao'
import { ehModoLocal } from '../../nucleo/local'
import { banco } from '../../nucleo/servicos'
import { fonteDoServidor, fonteListaDoServidor } from '../obra_servidor'
import { fonteLocal } from '../modelos_drive'
import { LeitorIfc, type ContextoObraIfc } from './ModuloIfc'

export function ComObra({ usuario, obra, aoSair, aoPerderObra }: PropsModulo) {
  const { estado, sincronizarAgora } = usarSincronizacao(usuario.id, obra.id, aoPerderObra)
  const fonte = useMemo(() => fonteDoServidor(obra.id, usuario.id), [obra.id, usuario.id])
  // Sem conta ou com conta: decide pelo banco local (sem esperar a internet, que pode nem ter).
  const [semConta, setSemConta] = useState<boolean | null>(null)
  useEffect(() => {
    let vivo = true
    ehModoLocal(banco)
      .then((v) => vivo && setSemConta(v))
      .catch(() => vivo && setSemConta(true))
    return () => {
      vivo = false
    }
  }, [])
  const comServidor = semConta === false && !estado.local
  const obraIfc: ContextoObraIfc | undefined = comServidor
    ? {
        obraId: obra.id,
        fonte,
        podeEnviar: obra.papel === 'admin' || obra.papel === 'gestor',
        online: estado.online,
        versao: estado.versaoDados,
        aoEnviar: () => void sincronizarAgora(),
      }
    : undefined
  // "Baixar modelo da obra": com conta a lista vem do servidor (gestor e admin trocam); sem conta, do aparelho.
  const ehExe = obra.codigo === 'EXE'
  const podeGravar = obra.papel === 'admin' || obra.papel === 'gestor'
  const fonteModelos = useMemo(
    () => (semConta === null ? null : semConta ? fonteLocal(obra.id, ehExe) : fonteListaDoServidor(obra.id, usuario.id, podeGravar, ehExe)),
    [semConta, obra.id, usuario.id, podeGravar, ehExe],
  )
  const modelosDrive = fonteModelos ? { fonte: fonteModelos, versao: estado.versaoDados } : undefined
  return <LeitorIfc aoSair={aoSair} obraIfc={obraIfc} modelosDrive={modelosDrive} />
}
