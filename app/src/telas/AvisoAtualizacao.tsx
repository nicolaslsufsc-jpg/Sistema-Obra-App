import { useRegisterSW } from 'virtual:pwa-register/preact'

/** Avisa que há versão nova do app. Só atualiza quando a pessoa toca no botão. */
export function AvisoAtualizacao() {
  const {
    needRefresh: [precisa, setPrecisa],
    updateServiceWorker,
  } = useRegisterSW()
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
