import { useEffect, useState } from 'preact/hooks'
import { banco, sincronizador } from '../nucleo/servicos'
import { usarSincronizacao, type EstadoSincronizacao } from '../nucleo/usarSincronizacao'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import type { ItemFila, Linha } from '../nucleo/banco_local'
import {
  aoMudarInstalacao,
  armazenamentoPersistente,
  espacoUsado,
  formatarBytes,
  instalar,
  pedirArmazenamentoPersistente,
  podeInstalar,
} from '../nucleo/aparelho'
import { PAPEL, horaCurta } from './rotulos'
import { modulosDoMenu, type IdModulo } from '../modulos'
import { BarraLocal } from './BarraLocal'
import { AbrirPacote } from './AbrirPacote'
import { BotaoTema } from './BotaoTema'
import { IconeInstalar, IconeModulo } from './icones'
import { PlantasSemInternet } from './PlantasSemInternet'
import type { PacoteLocalizado } from '../nucleo/pacote_obra'

export function Menu({
  usuario,
  obra,
  aoTrocarObra,
  aoPerderObra,
  aoSair,
  aoEntrarDeNovo,
  aoAbrirPessoas,
  aoAbrirModulo,
  aoAbrirPacote,
}: {
  /** Sem conta: abrir um pacote da obra (.zip) novo, com plantas ou fichas novas. */
  aoAbrirPacote?: (pacote: PacoteLocalizado) => void
  usuario: UsuarioLocal
  obra: ObraLocal
  /** Sem conta não existe: a obra é a da pasta. */
  aoTrocarObra?: () => void
  aoPerderObra: () => void
  aoSair?: () => void
  aoEntrarDeNovo: () => void
  /** Só existe para o admin. */
  aoAbrirPessoas?: () => void
  aoAbrirModulo?: (id: IdModulo) => void
}) {
  const { estado, sincronizarAgora, recontar, marcarDadosNovos } = usarSincronizacao(usuario.id, obra.id, aoPerderObra)
  const [menuObra, setMenuObra] = useState(false)

  // O menu da obra fecha no Esc e ao tocar fora dele (controle do usuário, 20/11/2026)
  useEffect(() => {
    if (!menuObra) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setMenuObra(false)
    const toque = (e: PointerEvent) => {
      const alvo = e.target as Element | null
      if (!alvo?.closest('#painel-obra, [data-testid="menu-obra"]')) setMenuObra(false)
    }
    document.addEventListener('keydown', tecla)
    document.addEventListener('pointerdown', toque)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.removeEventListener('pointerdown', toque)
    }
  }, [menuObra])

  return (
    <main class="tela">
      {/* Barra do topo (heurísticas de Nielsen, 20/11/2026): à esquerda a obra, que abre o menu da obra
          (trocar de obra, pacote, pessoas, sair); à direita instalar e o tema. */}
      <header class="cabecalho cabecalho-obra barra-app">
        {/* O nome da obra continua sendo o título da tela (leitor de tela e testes acham a obra por ele) */}
        <h1 class="menu-obra-titulo">
          <button
            type="button"
            class="menu-obra"
            data-testid="menu-obra"
            aria-expanded={menuObra}
            aria-controls="painel-obra"
            onClick={() => setMenuObra(!menuObra)}
          >
            <span class="menu-obra-nome">
              <strong>{obra.codigo}</strong> <span class="nome-obra">{obra.nome}</span>
              <span class="menu-obra-seta" aria-hidden="true">
                ▾
              </span>
            </span>
            <span class="menu-obra-quem">
              {estado.local ? 'Sem conta' : usuario.email} · <span data-testid="papel">{PAPEL[obra.papel]}</span>
            </span>
          </button>
        </h1>
        <div class="barra-app-acoes">
          <InstalarApp />
          <BotaoTema />
        </div>
      </header>
      {/* Menu da obra: fora do cabeçalho (a faixa colorida corta o que passa dela); fecha no Esc ou ao tocar fora */}
      {menuObra && (
        <div class="menu-obra-ancora">
          <div class="menu-obra-painel" id="painel-obra" role="group" aria-label="Menu da obra" data-testid="painel-obra">
            {aoTrocarObra && (
              <button type="button" onClick={aoTrocarObra}>
                Trocar de obra
              </button>
            )}
            {estado.local && aoAbrirPacote && <AbrirPacote aoAbrir={aoAbrirPacote} rotulo="Trocar de obra / abrir pacote (.zip)" />}
            {aoAbrirPessoas && !estado.local && (
              <button type="button" onClick={aoAbrirPessoas}>
                Pessoas da obra
              </button>
            )}
            {aoSair && !estado.local && (
              <button type="button" onClick={aoSair}>
                Sair
              </button>
            )}
            <button type="button" class="menu-obra-fechar" onClick={() => setMenuObra(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Os módulos vêm logo abaixo do cabeçalho: no celular é a primeira coisa que se vê (acabamento, 09/11) */}
      <section class="menu-modulos">
        <h2>Módulos</h2>
        <ul class="grade">
          {modulosDoMenu(estado.local).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                class="modulo"
                disabled={!m.Tela || !aoAbrirModulo}
                onClick={() => aoAbrirModulo?.(m.id)}
              >
                <strong>
                  <IconeModulo id={m.id} />
                  {m.nome}
                  {m.beta && (
                    <>
                      {' '}
                      <span class="selo-beta">beta</span>
                    </>
                  )}
                </strong>
                <span class="modulo-descricao">{m.descricao}</span>
                {m.Tela && aoAbrirModulo && (
                  <span class="modulo-abrir" aria-hidden="true">
                    Abrir ›
                  </span>
                )}
                {!m.Tela && <span class="discreto">em construção</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Salvamento e detalhes técnicos do aparelho num bloco recolhido (demonstração, 14/11/2026) */}
      {estado.local ? (
        <>
          <BarraLocal
            usuario={usuario}
            obra={obra}
            pendentes={estado.pendentes + estado.comErro}
            aoMudarDados={async () => {
              await recontar()
              marcarDadosNovos()
            }}
          >
            <Aparelho obraId={obra.id} versaoDados={estado.versaoDados} />
          </BarraLocal>
        </>
      ) : (
        <>
          <BarraSincronizacao estado={estado} aoSincronizar={sincronizarAgora} aoEntrarDeNovo={aoEntrarDeNovo} />
          <PlantasSemInternet obraId={obra.id} usuarioId={usuario.id} online={estado.online} versaoDados={estado.versaoDados} />
          {estado.comErro > 0 && (
            <ItensComErro
              usuarioId={usuario.id}
              versao={estado.comErro}
              aoTentarDeNovo={async () => {
                await recontar()
                sincronizarAgora()
              }}
            />
          )}
          <details class="bloco-recolhido">
            <summary>
              <strong>Este aparelho</strong>
            </summary>
            <Aparelho obraId={obra.id} versaoDados={estado.versaoDados} />
          </details>
        </>
      )}

      {/* Avisos abaixo da sincronização (20/11/2026): primeiro o estado dos dados, depois o que pede atenção.
          Fora do bloco recolhido: sem proteção, o navegador pode apagar o que ainda não foi enviado (C4). */}
      <AvisoDadosDesprotegidos />
    </main>
  )
}

function BarraSincronizacao({
  estado,
  aoSincronizar,
  aoEntrarDeNovo,
}: {
  estado: EstadoSincronizacao
  aoSincronizar: () => void
  aoEntrarDeNovo: () => void
}) {
  let texto: string
  let classe = 'ok'
  const ultima = estado.ultima ? ` Última sincronização: ${horaCurta(estado.ultima)}.` : ''
  if (!estado.online) {
    texto = `Sem internet. Pode continuar trabalhando: tudo fica guardado no aparelho.${ultima}`
    classe = 'atencao'
  } else if (estado.sessao === 'entrar') {
    texto = 'Seu login venceu. Entre de novo para enviar e receber dados (nada do aparelho é perdido).'
    classe = 'atencao'
  } else if (estado.sessao === 'outro') {
    texto = 'Este navegador está com outra conta aberta (outra aba?). Feche as outras abas do app e entre de novo.'
    classe = 'atencao'
  } else if (estado.sincronizando) {
    texto = 'Sincronizando…'
  } else if (estado.problema) {
    texto = `Não foi possível sincronizar agora (${estado.problema}). Vamos tentar de novo sozinhos a cada minuto.${ultima}`
    classe = 'atencao'
  } else {
    texto = estado.ultima ? `Sincronizado ${horaCurta(estado.ultima)}.` : 'Ainda não sincronizado.'
  }
  const fila =
    estado.pendentes > 0
      ? `${estado.pendentes} ${estado.pendentes === 1 ? 'registro esperando' : 'registros esperando'} envio.`
      : 'Nada esperando envio.'

  return (
    <section class={`barra ${classe}`} aria-live="polite">
      <p data-testid="estado-sincronizacao" data-ultima={estado.ultima ?? ''}>
        {texto}
      </p>
      <p data-testid="fila">{fila}</p>
      {estado.deOutros > 0 && (
        <p data-testid="fila-de-outros">
          {estado.deOutros} {estado.deOutros === 1 ? 'registro de outra pessoa esperando' : 'registros de outra pessoa esperando'} envio: ela
          precisa entrar neste aparelho para enviar. Não apague os dados do app.
        </p>
      )}
      {(estado.sessao === 'entrar' || estado.sessao === 'outro') && estado.online ? (
        <button type="button" class="principal" onClick={aoEntrarDeNovo}>
          Entrar de novo
        </button>
      ) : (
        <button type="button" onClick={aoSincronizar} disabled={!estado.online || estado.sincronizando}>
          Sincronizar agora
        </button>
      )}
    </section>
  )
}

function ItensComErro({
  usuarioId,
  aoTentarDeNovo,
  versao,
}: {
  usuarioId: string
  aoTentarDeNovo: () => void
  versao: number
}) {
  const [itens, setItens] = useState<ItemFila[]>([])
  useEffect(() => {
    sincronizador.itensComErro(usuarioId).then(setItens)
  }, [usuarioId, versao])

  return (
    <section class="barra erro-fila">
      <p>
        <strong>
          {itens.length} {itens.length === 1 ? 'registro foi recusado' : 'registros foram recusados'} pelo servidor.
        </strong>{' '}
        Eles continuam guardados no aparelho. Mostre esta lista ao administrador.
      </p>
      <ul>
        {itens.map((i) => (
          <li key={i.seq}>
            {i.tabela} · {new Date(i.criado_em).toLocaleString('pt-BR')} · {i.erro}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={async () => {
          await sincronizador.tentarDeNovo(usuarioId)
          aoTentarDeNovo()
        }}
      >
        Tentar enviar de novo
      </button>
    </section>
  )
}

function Aparelho({ obraId, versaoDados }: { obraId: string; versaoDados: number }) {
  const [persistente, setPersistente] = useState<boolean | null>(null)
  const [pavimentos, setPavimentos] = useState<Linha[]>([])
  const [espaco, setEspaco] = useState<{ usado: number; total: number } | null>(null)
  const [dispositivo, setDispositivo] = useState('')

  useEffect(() => {
    pedirArmazenamentoPersistente().then(() => armazenamentoPersistente().then(setPersistente))
    espacoUsado().then(setEspaco)
    banco.dispositivoId().then(setDispositivo)
  }, [])

  // Os pavimentos saíram da tela do menu (20/11/2026: "não serve de nada" para quem usa). Ficam aqui, nos
  // detalhes para o suporte, para conferir o que o aparelho baixou da obra.
  useEffect(() => {
    sincronizador.linhas('pavimentos', obraId).then((l) => setPavimentos(l.sort((a, b) => Number(a.ordem) - Number(b.ordem))))
  }, [obraId, versaoDados])

  return (
    <section>
      <h2>Este aparelho</h2>
      {/* Texto simples à vista; o que só serve para suporte fica em "Detalhes técnicos" (front end, 19/11/2026) */}
      <ul class="detalhes">
        <li data-testid="persistente">
          Dados protegidos neste aparelho:{' '}
          {persistente === null ? '…' : persistente ? 'sim' : 'não. Instale o app para proteger.'}
        </li>
        {espaco && (
          <li>
            Espaço usado: {formatarBytes(espaco.usado)} de {formatarBytes(espaco.total)}
          </li>
        )}
      </ul>
      <details class="detalhes-tecnicos" data-testid="detalhes-tecnicos">
        <summary>Detalhes técnicos (para o suporte)</summary>
        <ul class="detalhes">
          <li>Código do aparelho: {dispositivo.slice(0, 8)}</li>
          <li>Proteção contra limpeza automática do navegador: {persistente === null ? '…' : persistente ? 'ligada' : 'desligada'}</li>
        </ul>
        <section data-testid="pavimentos-obra">
          <h3>Pavimentos baixados ({pavimentos.length})</h3>
          {pavimentos.length === 0 ? (
            <p class="discreto">Nenhum pavimento baixado ainda.</p>
          ) : (
            <ul class="lista-pavimentos">
              {pavimentos.map((p) => (
                <li key={String(p.id)}>{String(p.nome)}</li>
              ))}
            </ul>
          )}
        </section>
      </details>
    </section>
  )
}

/**
 * Aviso à vista quando o navegador não protege os dados do app (correção C4, risco R4): sem a proteção,
 * o Chrome do Android pode apagar o banco do aparelho quando falta espaço, e com ele a fila. Pede a
 * proteção de novo ao abrir o menu; com o app instalado o Chrome costuma dar.
 */
function AvisoDadosDesprotegidos() {
  const [protegido, setProtegido] = useState<boolean | null>(null)
  useEffect(() => {
    let vivo = true
    pedirArmazenamentoPersistente().then((p) => vivo && setProtegido(p))
    return () => {
      vivo = false
    }
  }, [])
  if (protegido !== false) return null
  return (
    <section class="barra atencao" data-testid="aviso-protecao">
      <p>
        <strong>Instale o app para não perder marcações.</strong> Sem instalar, o navegador pode apagar os dados deste aparelho quando faltar espaço,
        inclusive o que ainda não foi enviado.
      </p>
    </section>
  )
}

/** "Instalar o app": no canto de cima à direita (20/11/2026); só aparece quando o navegador deixa instalar. */
function InstalarApp() {
  const [instalavel, setInstalavel] = useState(podeInstalar())
  useEffect(() => aoMudarInstalacao(() => setInstalavel(podeInstalar())), [])
  if (!instalavel) return null
  return (
    <button type="button" class="principal botao-instalar" data-testid="instalar-app" aria-label="Instalar o app" onClick={() => instalar()}>
      <IconeInstalar />
      Instalar
    </button>
  )
}
