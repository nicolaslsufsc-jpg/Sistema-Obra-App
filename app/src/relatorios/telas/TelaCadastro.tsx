// Dados da obra que vão no cabeçalho do diário.
import { podeFechar, registrar } from '../dados'
import { CAMPOS_CADASTRO } from '../tipos'
import type { Contexto } from './ModuloRelatorios'
import { Formulario } from './Formulario'
import { Topo } from './comum'

export function TelaCadastro({ ctx }: { ctx: Contexto }) {
  const { obra, usuario, dados, voltar, recarregar } = ctx
  const pode = podeFechar(obra.papel)
  return (
    <main class="tela">
      <Topo titulo="Dados da obra no diário" sub="Aparecem no cabeçalho do diário impresso." aoVoltar={voltar} />
      {!pode && <p class="discreto">Só gestor e administrador alteram estes dados.</p>}
      <Formulario
        campos={CAMPOS_CADASTRO}
        inicial={dados.cadastro}
        desativado={!pode}
        botoes={[
          {
            texto: 'Salvar',
            principal: true,
            aoSalvar: async (v) => {
              await registrar('diario_cadastro', obra.id, usuario.id, v)
              await recarregar()
              voltar()
            },
          },
        ]}
      />
    </main>
  )
}
