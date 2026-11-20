// Antes de preparar um pacote da obra (.zip) que troca a obra do aparelho ou é mais antigo que o que
// está aqui: mostra os dois e só segue com a confirmação. Cancelar volta sem mexer em nada.
import type { ComparacaoDoPacote, ObraDoPacoteResumo } from '../nucleo/pacote_obra'

export function quando(iso: string | null): string {
  if (!iso) return 'sem data'
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${dia} às ${hora}`
}

const descrever = (o: ObraDoPacoteResumo) => `${o.codigo}${o.nome && o.nome !== o.codigo ? ` (${o.nome})` : ''}`

export function ConfirmarPacote({ comparacao: c, aoConfirmar, aoCancelar }: { comparacao: ComparacaoDoPacote; aoConfirmar: () => void; aoCancelar: () => void }) {
  return (
    <main class="tela tela-estreita">
      {/* pacote sem data: o título dizia "mais antigo" e o texto "não tem data" (testador, 08/11, T3) */}
      <h1>{c.outraObra ? 'Trocar de obra?' : c.maisAntigo ? 'Abrir um pacote mais antigo?' : 'Abrir um pacote sem data?'}</h1>
      <dl class="comparacao-pacote" data-testid="comparacao-pacote">
        <dt>Pacote escolhido</dt>
        <dd>
          Obra {descrever(c.novo)}, gerado em {quando(c.novo.geradoEm)}
        </dd>
        {c.atual && (
          <>
            <dt>Neste aparelho agora</dt>
            <dd>
              Obra {descrever(c.atual)}, pacote de {quando(c.atual.geradoEm)}
            </dd>
          </>
        )}
      </dl>
      <p class="aviso" role="alert">
        {c.outraObra
          ? `Este pacote é de outra obra. O app passa a abrir na obra ${c.novo.codigo}. O que foi marcado na obra ${c.atual?.codigo} continua guardado neste aparelho.`
          : c.maisAntigo
            ? 'Este pacote é mais antigo do que o que está no aparelho. Plantas e fichas podem voltar para uma revisão anterior.'
            : 'Este pacote não tem data: não dá para saber se é mais novo do que o que está no aparelho.'}
      </p>
      <div class="acoes">
        <button type="button" class="principal" onClick={aoConfirmar}>
          {c.outraObra ? `Trocar para a obra ${c.novo.codigo}` : 'Abrir mesmo assim'}
        </button>
        <button type="button" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </main>
  )
}
