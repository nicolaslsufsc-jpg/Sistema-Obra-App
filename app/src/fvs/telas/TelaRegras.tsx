// Regras da obra (prazos e ligações entre itens), só leitura. Decisão do Nicolas (19/11/2026): as regras
// vêm do config_fvs.json da obra; quem cuida do cadastro troca o arquivo, e esta tela só mostra o que vale.
import { useMemo } from 'preact/hooks'
import { regrasNaTela, type ItemDaRegra } from '../regras_tela'
import type { ContextoFvs } from './ModuloFvs'

function Item({ i }: { i: ItemDaRegra }) {
  return (
    <span class="fv-regra-item">
      <b class={i.titulo ? '' : 'fv-txt-r'}>{i.titulo ?? 'Não está nas fichas da obra'}</b>
      <span class="discreto">{i.ref}</span>
    </span>
  )
}

export function TelaRegras({ ctx }: { ctx: ContextoFvs }) {
  const { dados, voltar } = ctx
  const r = useMemo(() => regrasNaTela(dados.regras, dados.fichas), [dados])
  const vazio = !r.prazos.length && !r.ligacoes.length

  return (
    <main class="tela fv-inicio fv-regras">
      <header class="fv-topo-inicio">
        <button type="button" class="fv-voltar" onClick={voltar} aria-label="Voltar">
          ‹ Voltar
        </button>
        <div>
          <h1>Regras da obra</h1>
          <p class="discreto">Prazos e ligações entre os itens das fichas. Só leitura.</p>
        </div>
      </header>
      <p class="discreto">Vêm da configuração da obra. Para mudar, fale com quem cuida do cadastro.</p>
      {r.fora > 0 && (
        <p class="aviso" data-testid="fvs-regras-fora">
          {r.fora === 1 ? '1 regra do arquivo ficou de fora' : `${r.fora} regras do arquivo ficaram de fora`} por formato errado.
        </p>
      )}
      {r.semFicha > 0 && (
        <p class="aviso" data-testid="fvs-regras-sem-ficha">
          {r.semFicha === 1 ? '1 item citado não está' : `${r.semFicha} itens citados não estão`} nas fichas da obra: a regra só vale quando a ficha chegar.
        </p>
      )}
      {vazio && <p data-testid="fvs-regras-vazio">Esta obra não tem regras válidas: nenhum prazo e nenhuma ligação.</p>}

      {r.prazos.length > 0 && (
        <section>
          <h2>Prazos</h2>
          <p class="discreto">Antes do prazo o app só avisa: pede confirmação e grava "Marcado antes do prazo".</p>
          <ul class="lista fv-regras-lista">
            {r.prazos.map((p) => (
              <li key={p.id} data-testid="fvs-regra-prazo">
                {p.texto && <span class="fv-regra-nome">{p.texto}</span>}
                <Item i={p.item} />
                <span class="fv-regra-quando">Libera {p.regra}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.ligacoes.length > 0 && (
        <section>
          <h2>Ligações</h2>
          <p class="discreto">O C no primeiro item marca C no segundo, na mesma peça, se ele ainda estiver vazio. Dá para desfazer.</p>
          <ul class="lista fv-regras-lista">
            {r.ligacoes.map((l) => (
              <li key={l.id} data-testid="fvs-regra-ligacao">
                <Item i={l.de} />
                <span class="fv-regra-seta">↓ marca C em</span>
                <Item i={l.para} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
