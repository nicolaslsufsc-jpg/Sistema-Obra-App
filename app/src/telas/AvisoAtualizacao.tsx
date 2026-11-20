import { useRegisterSW } from 'virtual:pwa-register/preact'
import { checarAtualizacao } from './checar_atualizacao'

/** Avisa que há versão nova do app. Só atualiza quando a pessoa toca no botão. */
export function AvisoAtualizacao() {
  const {
    needRefresh: [precisa, setPrecisa],
    updateServiceWorker,
  } = useRegisterSW({
    // confere se há versão nova ao abrir e ao voltar para a aba (só avisa; quem atualiza é a pessoa)
    onRegisteredSW: (_url, registro) => {
      if (registro) checarAtualizacao(registro)
    },
  })
  if (!precisa) return null
  return (
    <div class="faixa-atualizacao" role="status">
      <span>Versão nova do app disponível.</span>
      <button type="button" class="principal" onClick={() => updateServiceWorker(true)}>
        Atualizar
      </button>
      <button type="button" onClick={() => setPrecisa(false)}>
        Depois
      </button>
    </div>
  )
}
