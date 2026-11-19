// Um registro de uma seção do diário: mão de obra, equipamento, material, serviço ou ocorrência.
import { cancelar, corrigir, podeRegistrar, registrar } from '../dados'
import { dataBR, resumoDoDia, sugestoes, textoDoLocal, type Alvo } from '../regras'
import { SECOES, TIPOS_OCORRENCIA, rotulo, type TabelaSecao } from '../tipos'
import type { BotaoForm, Valores } from './Formulario'
import type { Contexto } from './ModuloRelatorios'
import { Fotos } from './Fotos'
import { Formulario } from './Formulario'
import { Topo, usarMensagem } from './comum'

export const MAPA_DIA = { diario_efetivo: 'efetivo', diario_equipamentos: 'equipamentos', diario_materiais: 'materiais', diario_servicos: 'servicos', diario_ocorrencias: 'ocorrencias' } as const
const ALVO: Partial<Record<TabelaSecao, Alvo['tipo']>> = { diario_servicos: 'servico', diario_ocorrencias: 'ocorrencia' }

export function TelaItem({ ctx, tabela, data, raiz }: { ctx: Contexto; tabela: TabelaSecao; data: string; raiz?: string }) {
  const { dados, obra, usuario, ir, trocar, voltar, recarregar } = ctx
  const secao = SECOES[tabela]
  const mapa = dados[MAPA_DIA[tabela]]
  const atual = raiz ? mapa.get(data)?.find((l) => l.raiz === raiz) : undefined
  const fechado = resumoDoDia(dados, data).fechado
  const pode = podeRegistrar(obra.papel) && !fechado
  const tipoAlvo = ALVO[tabela]
  const [msg, setMsg] = usarMensagem()

  if (raiz && !atual) {
    return (
      <main class="tela">
        <Topo titulo={secao.titulo} aoVoltar={voltar} />
        <p>Este registro foi apagado.</p>
      </main>
    )
  }

  const nomeDoAlvo = (v: Valores) => (tabela === 'diario_ocorrencias' ? rotulo(TIPOS_OCORRENCIA, v.tipo) : String(v.descricao ?? secao.titulo)).slice(0, 60)

  const gravar = async (v: Valores): Promise<string> => {
    if (atual) {
      await corrigir(tabela, obra.id, usuario.id, atual, v)
      return atual.raiz
    }
    const l = await registrar(tabela, obra.id, usuario.id, { ...v, data })
    return l.id
  }

  const salvarEVoltar: BotaoForm['aoSalvar'] = async (v) => {
    await gravar(v)
    await recarregar()
    voltar()
  }

  let botoes: BotaoForm[]
  if (atual) {
    botoes = [{ texto: 'Salvar', principal: true, aoSalvar: salvarEVoltar }]
  } else if (tipoAlvo) {
    botoes = [
      {
        texto: 'Salvar e marcar na planta',
        principal: true,
        aoSalvar: async (v) => {
          const id = await gravar(v)
          await recarregar()
          // troca, não empilha: o voltar da planta cai no dia, não num formulário em branco
          trocar({ nome: 'marcar', alvo: { tipo: tipoAlvo, raiz: id }, titulo: nomeDoAlvo(v) })
        },
      },
      { texto: 'Só salvar', aoSalvar: salvarEVoltar },
    ]
  } else {
    botoes = [
      { texto: 'Salvar', principal: true, aoSalvar: salvarEVoltar },
      {
        texto: 'Salvar e adicionar outro',
        aoSalvar: async (v, limpar) => {
          await gravar(v)
          await recarregar()
          limpar()
          // diz o que entrou: a mesma frase a cada item não mostrava se o último tinha sido salvo
          const resumo = secao.campos.filter((c) => c.obrigatorio && c.tipo !== 'opcoes').map((c) => String(v[c.nome] ?? '')).join(' · ')
          setMsg(`Salvo: ${resumo}. Pode adicionar o próximo.`)
        },
      },
    ]
  }

  const marcas = atual ? (dados.marcas.get(atual.raiz) ?? []) : []
  return (
    <main class="tela">
      <Topo titulo={atual ? secao.titulo : secao.novo} sub={dataBR(data)} aoVoltar={voltar} />
      {fechado && <p class="aviso">Este dia está fechado. Para alterar, um gestor precisa reabrir.</p>}
      {msg && (
        <p class="rl-ok" role="status">
          {msg}
        </p>
      )}
      <Formulario key={atual?.id ?? 'novo'} campos={secao.campos} inicial={atual} desativado={!pode} sugestoes={(c) => sugestoes(mapa, c)} botoes={botoes} />

      {atual && tipoAlvo && (
        <section class="cartao">
          <h2 class="sem-topo">Onde foi</h2>
          <p data-testid="local-item">{marcas.length ? textoDoLocal(dados, marcas) : 'Ainda não marcado na planta.'}</p>
          <button type="button" data-testid="marcar-item" onClick={() => ir({ nome: 'marcar', alvo: { tipo: tipoAlvo, raiz: atual.raiz }, titulo: nomeDoAlvo(atual) })}>
            {pode ? 'Marcar na planta' : 'Ver na planta'}
          </button>
          <h2>Fotos</h2>
          <Fotos ctx={ctx} data={data} alvo={{ tipo: tipoAlvo, raiz: atual.raiz }} pode={pode} />
        </section>
      )}

      {atual && pode && (
        <div class="acoes">
          <button
            type="button"
            class="rl-perigo"
            data-testid="apagar-item"
            onClick={async () => {
              if (!confirm('Apagar este registro do diário?')) return
              await cancelar(tabela, obra.id, usuario.id, atual)
              await recarregar()
              voltar()
            }}
          >
            Apagar
          </button>
        </div>
      )}
    </main>
  )
}
