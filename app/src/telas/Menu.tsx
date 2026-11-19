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
import { MODULOS, type IdModulo } from '../modulos'
import { BarraLocal } from './BarraLocal'
import { AbrirPacote } from './AbrirPacote'
import { BotaoTema } from './BotaoTema'
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
  const [pavimentos, setPavimentos] = useState<Linha[]>([])

  useEffect(() => {
    sincronizador.linhas('pavimentos', obra.id).then((l) => setPavimentos(l.sort((a, b) => Number(a.ordem) - Number(b.ordem))))
  }, [obra.id, estado.versaoDados])

  return (
    <main class="tela">
      <header class="cabecalho cabecalho-obra">
        <div>
          <h1>
            {obra.codigo} <span class="nome-obra">{obra.nome}</span>
          </h1>
          <p class="discreto">
            {estado.local ? 'Sem conta' : usuario.email} · <span data-testid="papel">{PAPEL[obra.papel]}</span>
          </p>
        </div>
        <BotaoTema />
      </header>

      {/* Os módulos vêm logo abaixo do cabeçalho: no celular é a primeira coisa que se vê (acabamento, 09/11) */}
      <section class="menu-modulos">
        <h2>Módulos</h2>
        <ul class="grade">
          {MODULOS.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                class="modulo"
                disabled={!m.Tela || !aoAbrirModulo}
                onClick={() => aoAbrirModulo?.(m.id)}
              >
                <strong>
                  {m.nome}
                  {m.beta && (
                    <>
                      {' '}
                      <span class="selo-beta">beta</span>
                    </>
                  )}
                </strong>
                <span>{m.descricao}</span>
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

      {/* Pavimentos da obra em etiquetas: mais fácil de ler que uma frase corrida (front end, 19/11/2026) */}
      <section data-testid="pavimentos-obra">
        <h2>
          Pavimentos{pavimentos.length > 0 && <span class="discreto"> ({pavimentos.length})</span>}
        </h2>
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

      {/* Salvamento e detalhes técnicos do aparelho num bloco recolhido (demonstração, 14/11/2026) */}
      {estado.local ? (
        <>
          {aoAbrirPacote && <AbrirPacote aoAbrir={aoAbrirPacote} rotulo="Trocar de obra / abrir pacote (.zip)" />}
          <BarraLocal
            usuario={usuario}
            obra={obra}
            pendentes={estado.pendentes + estado.comErro}
            aoMudarDados={async () => {
              await recontar()
              marcarDadosNovos()
            }}
          >
            <Aparelho />
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
            <Aparelho />
          </details>
        </>
      )}
      <InstalarApp />

      <div class="acoes">
        {aoAbrirPessoas && !estado.local && (
          <button type="button" onClick={aoAbrirPessoas}>
            Pessoas da obra
          </button>
        )}
        {aoTrocarObra && (
          <button type="button" onClick={aoTrocarObra}>
            Trocar de obra
          </button>
        )}
        {aoSair && !estado.local && (
          <button type="button" onClick={aoSair}>
            Sair
          </button>
        )}
      </div>
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

function Aparelho() {
  const [persistente, setPersistente] = useState<boolean | null>(null)
  const [espaco, setEspaco] = useState<{ usado: number; total: number } | null>(null)
  const [dispositivo, setDispositivo] = useState('')

  useEffect(() => {
    pedirArmazenamentoPersistente().then(() => armazenamentoPersistente().then(setPersistente))
    espacoUsado().then(setEspaco)
    banco.dispositivoId().then(setDispositivo)
  }, [])

  return (
    <section>
      <h2>Este aparelho</h2>
      <ul class="detalhes">
        <li data-testid="persistente">
          Dados protegidos contra limpeza automática:{' '}
          {persistente === null ? '…' : persistente ? 'sim' : 'não (instale o app para proteger)'}
        </li>
        {espaco && (
          <li>
            Espaço usado: {formatarBytes(espaco.usado)} de {formatarBytes(espaco.total)}
          </li>
        )}
        <li>Código do aparelho: {dispositivo.slice(0, 8)}</li>
      </ul>
    </section>
  )
}

/** "Instalar o app": fica à vista, fora do bloco recolhido (só aparece quando o navegador deixa instalar). */
function InstalarApp() {
  const [instalavel, setInstalavel] = useState(podeInstalar())
  useEffect(() => aoMudarInstalacao(() => setInstalavel(podeInstalar())), [])
  if (!instalavel) return null
  return (
    <button type="button" class="principal" onClick={() => instalar()}>
      Instalar o app neste aparelho
    </button>
  )
}
