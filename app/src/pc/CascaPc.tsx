// Casca da versão PC (protótipo 23/11/2026): barra lateral fixa à esquerda com a obra, o início, as
// páginas que só o PC tem (painel, relatórios, pranchas e PDFs) e os módulos; o conteúdo à direita é a
// tela de sempre do módulo. Só monta em tela larga com mouse e com a versão PC ligada (versao_pc.ts).
import type { ComponentChildren, ComponentType } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import { modulosDoMenu, type IdModulo } from '../modulos'
import { IconeModulo } from '../telas/icones'
import { BotaoTema } from '../telas/BotaoTema'
import type { PaginaPc } from './versao_pc'
import './pc.css'

export type DestinoPc = { tipo: 'inicio' } | { tipo: 'modulo'; id: IdModulo } | { tipo: 'pagina'; pagina: PaginaPc }

// `admin`: só aparece para o administrador da obra
const PAGINAS: ReadonlyArray<{ pagina: PaginaPc; nome: string; dica: string; tracos: string[]; admin?: true }> = [
  { pagina: 'painel', nome: 'Avanço da obra', dica: 'Pilares, vigas, lajes, armação e concreto, por residencial', tracos: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'] },
  { pagina: 'qualidade', nome: 'Qualidade', dica: 'Itens conformes, NC abertas, tempo até liberar, laudos e apartamentos', tracos: ['M4 13l4 4L20 5'] },
  { pagina: 'relatorios', nome: 'Relatórios', dica: 'PDF e planilha por módulo, pavimento e período', tracos: ['M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M14 2v5h5', 'M8 13h8', 'M8 17h5'] },
  { pagina: 'pranchas', nome: 'Pranchas e PDFs', dica: 'Busca única em pranchas, documentos e plantas', tracos: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-5-5'] },
  // ideia 14 (25/11/2026): trocar a unidade de conferência de uma ficha numa obra já publicada (nova_obra/TelaUnidades.tsx)
  { pagina: 'unidades', nome: 'Como conferir', dica: 'Por peça, parede, ambiente, trecho, área ou pavimento, ficha por ficha', tracos: ['M4 6h16', 'M4 12h10', 'M4 18h6', 'M17 15l3 3-3 3'], admin: true },
]

function Icone({ tracos }: { tracos: readonly string[] }) {
  return (
    <svg class="pc-icone" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      {tracos.map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      ))}
    </svg>
  )
}

function usarOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const mudou = () => setOnline(navigator.onLine)
    addEventListener('online', mudou)
    addEventListener('offline', mudou)
    return () => {
      removeEventListener('online', mudou)
      removeEventListener('offline', mudou)
    }
  }, [])
  return online
}

export function CascaPc({
  obra,
  semConta,
  atual,
  aoIr,
  aoDesligar,
  children,
}: {
  obra: ObraLocal
  semConta: boolean
  /** onde a pessoa está: destaca o item na barra */
  atual: DestinoPc
  aoIr: (d: DestinoPc) => void
  aoDesligar: () => void
  children: ComponentChildren
}) {
  const online = usarOnline()
  // cada tela nova começa no alto (na versão PC quem rola é esta área, não a janela)
  const rolagem = useRef<HTMLDivElement>(null)
  const onde = atual.tipo === 'modulo' ? atual.id : atual.tipo === 'pagina' ? atual.pagina : 'inicio'
  useEffect(() => {
    rolagem.current?.scrollTo(0, 0)
  }, [onde])
  const ativo = (d: DestinoPc) =>
    d.tipo === atual.tipo && (d.tipo === 'inicio' || (d.tipo === 'modulo' && atual.tipo === 'modulo' && d.id === atual.id) || (d.tipo === 'pagina' && atual.tipo === 'pagina' && d.pagina === atual.pagina))
  const item = (d: DestinoPc, testid: string, conteudo: ComponentChildren, dica?: string) => (
    <li>
      <button type="button" class={`pc-item${ativo(d) ? ' pc-ativo' : ''}`} aria-current={ativo(d) ? 'page' : undefined} data-testid={testid} title={dica} onClick={() => aoIr(d)}>
        {conteudo}
      </button>
    </li>
  )
  return (
    <div class="pc-casca" data-testid="pc-casca">
      <nav class="pc-barra" aria-label="Navegação da versão PC">
        <div class="pc-obra">
          <b>{obra.codigo}</b>
          <span>{obra.nome}</span>
          <small>
            {semConta ? 'Sem conta' : 'Com conta'} ·{' '}
            <span class={online ? 'pc-online' : 'pc-offline'} data-testid="pc-internet">
              {online ? 'com internet' : 'sem internet'}
            </span>
          </small>
        </div>
        <p class="pc-grupo">Escritório</p>
        <ul class="pc-lista">
          {PAGINAS.filter((p) => !p.admin || obra.papel === 'admin').map((p) =>
            item(
              { tipo: 'pagina', pagina: p.pagina },
              `pc-ir-${p.pagina}`,
              <>
                <Icone tracos={p.tracos} />
                <span>{p.nome}</span>
              </>,
              p.dica,
            ),
          )}
        </ul>
        <p class="pc-grupo">Obra</p>
        <ul class="pc-lista">
          {item(
            { tipo: 'inicio' },
            'pc-ir-inicio',
            <>
              <Icone tracos={['M3 11l9-8 9 8', 'M5 10v10h14V10']} />
              <span>Menu da obra</span>
            </>,
            'Módulos, sincronização, cópia de segurança e avisos',
          )}
        </ul>
        <p class="pc-grupo">Módulos</p>
        <ul class="pc-lista">
          {modulosDoMenu(semConta).map((m) =>
            item(
              { tipo: 'modulo', id: m.id },
              `pc-ir-${m.id}`,
              <>
                <IconeModulo id={m.id} />
                <span>{m.nome}</span>
                {m.beta && <span class="selo-beta">beta</span>}
              </>,
              m.descricao,
            ),
          )}
        </ul>
        <div class="pc-rodape">
          <BotaoTema />
          <button type="button" class="pc-desligar" data-testid="pc-voltar-hoje" onClick={aoDesligar}>
            Voltar à versão de hoje
          </button>
        </div>
      </nav>
      {/* o conteúdo rola aqui dentro, e o que os módulos prendem na tela (topo da planta, avisos, painéis)
          fica preso a esta área, sem passar por cima da barra lateral (pc.css) */}
      <div class="pc-conteudo">
        <div class="pc-rolagem" ref={rolagem}>
          {children}
        </div>
      </div>
    </div>
  )
}

type PropsPaginas = { pagina: PaginaPc; obra: ObraLocal; usuario: UsuarioLocal; aoIr: (d: DestinoPc) => void; aoPerderObra: () => void }

/** As páginas do PC, carregadas só quando abertas (como os módulos, sobDemanda). */
export function PaginaPcSobDemanda(props: PropsPaginas) {
  const [Tela, setTela] = useState<ComponentType<PropsPaginas> | null>(null)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => {
    let vivo = true
    import('./PaginasPc')
      .then((m) => vivo && setTela(() => m.PaginasPc))
      .catch(() => vivo && setFalhou(true))
    return () => {
      vivo = false
    }
  }, [])
  if (Tela) return <Tela {...props} />
  return (
    <main class="tela pc-pagina" data-testid={`pc-pagina-${props.pagina}`} aria-busy={!falhou}>
      {falhou ? (
        <p class="erro">
          Não foi possível abrir esta página neste aparelho. Costuma acontecer logo depois de uma versão nova do app: recarregue a página.
        </p>
      ) : (
        <p>Abrindo…</p>
      )}
    </main>
  )
}

/** Botão discreto no canto do menu, só em tela de PC com a versão PC desligada. */
export function ExperimentarPc({ aoLigar }: { aoLigar: () => void }) {
  return (
    <button type="button" class="pc-experimentar" data-testid="pc-experimentar" onClick={aoLigar}>
      Experimentar a versão PC
    </button>
  )
}
