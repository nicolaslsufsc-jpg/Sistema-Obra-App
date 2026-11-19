// Modo sem conta: o app funciona com um usuário e a obra guardados só neste aparelho,
// sem login nem servidor. Quem liga este modo é o pacote da obra (pacote_obra.ts). Os registros
// entram pela mesma fila de pendentes do núcleo; "Salvar" (salvamento.ts) leva essa fila num
// arquivo, e, quando o servidor entrar, "Enviar ao servidor" manda a mesma fila.
import type { BancoLocal } from './banco_local'
import type { UsuarioLocal } from './conta'

export const EMAIL_SEM_CONTA = 'sem-conta@este-aparelho'

/** O aparelho está no modo sem conta? */
export async function ehModoLocal(banco: BancoLocal): Promise<boolean> {
  return (await banco.lerMeta<boolean>('modo_local')) === true
}

/** Cria (uma vez) o usuário local deste aparelho e liga o modo sem conta. */
export async function entrarSemConta(banco: BancoLocal): Promise<UsuarioLocal> {
  return banco.transaction('rw', banco.meta, async () => {
    let id = await banco.lerMeta<string>('usuario_local_id')
    if (!id) {
      id = crypto.randomUUID()
      await banco.gravarMeta('usuario_local_id', id)
    }
    const usuario: UsuarioLocal = { id, email: EMAIL_SEM_CONTA }
    await banco.gravarMeta('usuario', usuario)
    await banco.gravarMeta('modo_local', true)
    return usuario
  })
}
