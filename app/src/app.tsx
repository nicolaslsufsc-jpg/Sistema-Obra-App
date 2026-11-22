// Casca do app. Com a pasta da obra ao lado (dados_obra/): abre direto na obra, sem login, no modo
// sem conta. Sem ela: entrar (e-mail e código) -> escolher obra -> menu de módulos.
// Abre direto do banco do aparelho, sem esperar a internet.
import { useCallback, useEffect, useState } from 'preact/hooks'
import { conta, sincronizador } from './nucleo/servicos'
import { pedirArmazenamentoPersistente } from './nucleo/aparelho'
import type { ObraLocal, UsuarioLocal } from './nucleo/conta'
import { Entrar } from './telas/Entrar'
import { AbrirPacote } from './telas/AbrirPacote'
import { Codigo } from './telas/Codigo'
import { Obras } from './telas/Obras'
import { Menu } from './telas/Menu'
import { Pessoas } from './telas/Pessoas'
import { ehModoLocal } from './nucleo/local'
import { ligarSalvamentoAutomatico } from './nucleo/pasta_salvamento'
import {
  compararComOAtual,
  ligarFonteSemPacote,
  localizarPacote,
  obraDoPacote,
  precisaConfirmar,
  prepararObraLocal,
  type ComparacaoDoPacote,
  type PacoteLocalizado,
  type ProgressoDoPacote,
} from './nucleo/pacote_obra'
import { ConfirmarPacote } from './telas/ConfirmarPacote'
import { banco } from './nucleo/servicos'
import { moduloPorId, type IdModulo } from './modulos'
import { esquecerModulo, lembrarModulo, moduloGuardado } from './telas/ultimo_modulo'

type Tela =
  | { nome: 'carregando' }
  | { nome: 'preparando'; pacote: PacoteLocalizado }
  | { nome: 'confirmar_pacote'; pacote: PacoteLocalizado; comparacao: ComparacaoDoPacote; voltar: Tela }
  | { nome: 'saindo' }
  | { nome: 'entrar'; email: string; voltarPara?: UsuarioLocal; aviso?: string }
  | { nome: 'codigo'; email: string; voltarPara?: UsuarioLocal }
  | { nome: 'obras'; usuario: UsuarioLocal; aviso?: string }
  | { nome: 'menu'; usuario: UsuarioLocal; obra: ObraLocal }
  | { nome: 'pessoas'; usuario: UsuarioLocal; obra: ObraLocal }
  | { nome: 'modulo'; modulo: IdModulo; usuario: UsuarioLocal; obra: ObraLocal }

/** Tela de quem já entrou: menu da última obra, ou lista de obras. */
async function telaDoUsuario(usuario: UsuarioLocal): Promise<Tela> {
  const [obraId, obras] = await Promise.all([conta.obraAtual(), conta.obrasLocais()])
  const obra = obras.find((o) => o.id === obraId)
  return obra ? { nome: 'menu', usuario, obra } : { nome: 'obras', usuario }
}

async function telaInicial(): Promise<Tela> {
  // A pasta da obra ao lado do app abre direto, sem login: na primeira vez, ou quando ela é a obra
  // escolhida no aparelho (aí a regra de versão de sempre). Se a pessoa trocou de obra por um .zip,
  // a escolha dela vale: antes, recarregar a página voltava para a obra da pasta (demonstração, 14/11).
  const pacote = await localizarPacote()
  if (pacote) {
    const [usuario, local, atualId, obras, daPasta] = await Promise.all([
      conta.usuarioLocal(),
      ehModoLocal(banco),
      conta.obraAtual(),
      conta.obrasLocais(),
      obraDoPacote(pacote.indice),
    ])
    const escolhida = local && usuario && atualId && atualId !== daPasta.id && obras.some((o) => o.id === atualId)
    if (!escolhida) return { nome: 'preparando', pacote }
    ligarFonteSemPacote()
    return telaDoUsuario(usuario)
  }
  const [usuario, pendente, local] = await Promise.all([conta.usuarioLocal(), conta.loginPendente(), ehModoLocal(banco)])
  if (local && usuario) {
    // obra que veio de um .zip: abre direto nela; planta tirada do aparelho pede o .zip de novo
    ligarFonteSemPacote()
    return telaDoUsuario(usuario)
  }
  // Código pedido há pouco (o app pode ter sido fechado enquanto a pessoa lia o e-mail).
  if (pendente && (!usuario || usuario.email === pendente.email)) {
    return { nome: 'codigo', email: pendente.email, voltarPara: usuario }
  }
  return usuario ? telaDoUsuario(usuario) : { nome: 'entrar', email: '' }
}

/**
 * Reabrir o app volta ao módulo que estava aberto na obra atual (o Chrome fechado perde o histórico).
 * Só quando já ia ao menu: entrar, código, preparar e confirmar pacote nunca são pulados.
 */
function voltarAoModulo(t: Tela, semConta: boolean): Tela {
  if (t.nome !== 'menu') return t
  const id = moduloGuardado(t.obra.id)
  const modulo = id ? moduloPorId(id) : undefined
  if (!modulo?.Tela || (modulo.soSemConta && !semConta)) {
    if (id) esquecerModulo() // saiu do menu (ou nunca esteve): não insiste
    return t
  }
  // Recarregar: o histórico já está no módulo, com o menu embaixo. Chrome reaberto: o módulo entra
  // em cima do menu, para o voltar do Android cair no menu. `retomar` avisa o módulo que é uma volta.
  if (history.state?.tela !== modulo.id) history.pushState({ tela: modulo.id, retomar: true }, '')
  return { nome: 'modulo', modulo: modulo.id, usuario: t.usuario, obra: t.obra }
}

/** Confirma a saída explicando o que acontece. true = pode sair. */
async function confirmarSaida(usuario: UsuarioLocal): Promise<boolean> {
  const { pendentes, comErro } = await sincronizador.contarFila(usuario.id)
  const partes = ['Sair desta conta neste aparelho?']
  const naoEnviados = pendentes + comErro
  if (naoEnviados > 0) {
    const detalhe = comErro > 0 ? ` (${pendentes} esperando envio e ${comErro} recusado(s) pelo servidor)` : ''
    partes.push(
      `Há ${naoEnviados} registro(s) deste aparelho ainda não enviado(s)${detalhe}. Eles continuam guardados e são enviados quando você entrar de novo.`,
    )
  }
  if (!navigator.onLine) {
    partes.push(
      'Você está sem internet: para entrar de novo vai precisar de internet, e o cadastro da obra baixado neste aparelho será apagado.',
    )
  }
  return confirm(partes.join('\n\n'))
}

function textoDoProgresso(codigo: string, p: ProgressoDoPacote | null): string {
  if (!p) return `Abrindo a obra ${codigo}…`
  if (p.etapa === 'cadastro') return `Lendo o cadastro da obra ${codigo}…`
  if (p.etapa === 'historico') return 'Lendo o histórico das fichas…'
  return p.total === 0 ? 'Abrindo…' : `Guardando as plantas no aparelho: ${Math.min(p.feitas + 1, p.total)} de ${p.total}`
}

/** A obra da pasta entrando no aparelho (só demora na primeira vez: as plantas são dezenas de MB). */
function Preparando({
  pacote,
  aoPronto,
  aoEscolherOutro,
}: {
  pacote: PacoteLocalizado
  aoPronto: (usuario: UsuarioLocal, obra: ObraLocal) => void
  aoEscolherOutro: (pacote: PacoteLocalizado) => void
}) {
  const [progresso, setProgresso] = useState<ProgressoDoPacote | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    setErro(null)
    setProgresso(null) // sem isso, "Tentar de novo" mostrava a etapa em que a tentativa anterior parou
    prepararObraLocal(banco, pacote, (p) => {
      if (vivo) setProgresso(p)
    })
      .then(async ({ usuario, obra }) => {
        // exemplos do diário e dos relatórios (uma vez por obra), para a apresentação ter conteúdo
        await import('./relatorios/exemplos')
          .then((m) => m.semearExemplos(banco, obra))
          .catch(() => 0)
        if (!vivo) return
        pedirArmazenamentoPersistente()
        aoPronto(usuario, obra)
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [pacote, tentativa])

  const codigo = pacote.indice.obra.toUpperCase()
  return (
    <main class="tela tela-estreita">
      <h1>Sistema Obra</h1>
      {erro ? (
        <>
          <p class="erro" role="alert">
            {erro.startsWith('Não coube no aparelho') ? erro : `Não consegui preparar a obra ${codigo}: ${erro}`}
          </p>
          <div class="acoes-linha">
            <button type="button" class="principal" onClick={() => setTentativa((t) => t + 1)}>
              Tentar de novo
            </button>
          </div>
          <AbrirPacote aoAbrir={aoEscolherOutro} rotulo="Escolher outro arquivo" />
        </>
      ) : (
        <>
          <p data-testid="preparando" aria-live="polite">
            {textoDoProgresso(codigo, progresso)}
          </p>
          {progresso?.etapa === 'plantas' && progresso.total > 0 && <progress max={progresso.total} value={progresso.feitas} aria-label="Plantas guardadas" />}
        </>
      )}
    </main>
  )
}

export function App() {
  const [tela, setTela] = useState<Tela>({ nome: 'carregando' })
  const [local, setLocal] = useState(false)

  useEffect(() => {
    // Os dois juntos: a tela de obras precisa saber se é modo sem conta antes de montar.
    Promise.all([ehModoLocal(banco), telaInicial()]).then(([l, t]) => {
      setLocal(l)
      setTela(voltarAoModulo(t, l))
    })
    // Botão/gesto "voltar" do Android numa subtela volta ao menu em vez de fechar o app.
    // Num módulo, o próprio módulo cuida do voltar entre as telas dele (estados com
    // `tela: id do módulo`); sai para o menu quando o histórico volta para antes da entrada.
    const aoVoltar = (e: PopStateEvent) =>
      setTela((t) => {
        if (!(t.nome === 'pessoas' || (t.nome === 'modulo' && e.state?.tela !== t.modulo))) return t
        esquecerModulo() // de volta ao menu: reabrir o app abre no menu
        return { nome: 'menu', usuario: t.usuario, obra: t.obra }
      })
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  // Cada tela nova começa no alto (a anterior pode ter sido rolada até o fim).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tela.nome])

  // Modo sem conta: enquanto uma obra está aberta (menu ou módulo), cada registro novo grava o
  // .obra na pasta escolhida (se houver). Fica na casca para valer dentro dos módulos também.
  const aberta = tela.nome === 'menu' || tela.nome === 'modulo' || tela.nome === 'pessoas' ? { usuario: tela.usuario, obra: tela.obra } : null
  useEffect(() => {
    if (!local || !aberta) return
    return ligarSalvamentoAutomatico(banco, () => aberta)
  }, [local, aberta?.obra.id, aberta?.usuario.id])

  const usuario = tela.nome === 'obras' || tela.nome === 'menu' || tela.nome === 'modulo' ? tela.usuario : null
  const obraNome = tela.nome === 'menu' || tela.nome === 'modulo' ? tela.obra.codigo : null
  const aoPerderObra = useCallback(() => {
    esquecerModulo()
    if (usuario) setTela({ nome: 'obras', usuario, aviso: `Seu acesso à obra ${obraNome} foi retirado.` })
  }, [usuario?.id, obraNome])

  const sair = async (u: UsuarioLocal) => {
    if (!(await confirmarSaida(u))) return
    // A tela muda na hora: antes o OK parecia não fazer nada enquanto o aparelho apagava (22/11/2026).
    setTela({ nome: 'saindo' })
    esquecerModulo()
    let limpou = false
    try {
      limpou = await conta.sair()
    } catch (e) {
      console.error('Sair falhou', e)
    } finally {
      // Volta para "Entrar" mesmo se a limpeza falhar; o que sobrou é apagado no próximo login.
      setTela({
        nome: 'entrar',
        email: '',
        aviso: limpou ? undefined : 'Você saiu da conta. Parte do que foi baixado não pôde ser apagada agora; será apagada no próximo login.',
      })
    }
  }

  // Pacote (.zip) escolhido no aparelho: troca de obra ou pacote mais antigo pedem confirmação antes.
  const escolherPacote = async (pacote: PacoteLocalizado, voltar: Tela) => {
    esquecerModulo()
    const comparacao = await compararComOAtual(banco, pacote)
    setTela(precisaConfirmar(comparacao) ? { nome: 'confirmar_pacote', pacote, comparacao, voltar } : { nome: 'preparando', pacote })
  }

  switch (tela.nome) {
    case 'carregando':
      return <main class="tela tela-estreita">Carregando…</main>
    case 'saindo':
      return (
        <main class="tela tela-estreita" aria-busy="true">
          Saindo… apagando deste aparelho o que foi baixado.
        </main>
      )
    case 'preparando':
      return (
        <Preparando
          pacote={tela.pacote}
          aoEscolherOutro={(pacote) => escolherPacote(pacote, tela)}
          aoPronto={(usuario, obra) => {
            setLocal(true)
            setTela(voltarAoModulo({ nome: 'menu', usuario, obra }, true))
          }}
        />
      )
    case 'confirmar_pacote':
      return (
        <ConfirmarPacote
          comparacao={tela.comparacao}
          aoConfirmar={() => setTela({ nome: 'preparando', pacote: tela.pacote })}
          aoCancelar={() => setTela(tela.voltar)}
        />
      )
    case 'entrar':
      return (
        <Entrar
          emailInicial={tela.email}
          aviso={tela.aviso}
          aoEnviar={(email) => setTela({ nome: 'codigo', email, voltarPara: tela.voltarPara })}
          aoVoltar={tela.voltarPara ? async () => setTela(await telaDoUsuario(tela.voltarPara!)) : undefined}
          aoAbrirPacote={tela.voltarPara ? undefined : (pacote) => escolherPacote(pacote, tela)}
        />
      )
    case 'codigo':
      return (
        <Codigo
          email={tela.email}
          aoTrocarEmail={async () => {
            await conta.cancelarLoginPendente()
            setTela({ nome: 'entrar', email: tela.email, voltarPara: tela.voltarPara })
          }}
          aoEntrar={async (u) => {
            pedirArmazenamentoPersistente()
            setLocal(false)
            setTela(await telaDoUsuario(u))
          }}
        />
      )
    case 'obras':
      return (
        <>
          {tela.aviso && <p class="faixa-aviso">{tela.aviso}</p>}
          <Obras
            usuario={tela.usuario}
            aoEscolher={async (obra) => {
              await conta.escolherObra(obra.id)
              setTela({ nome: 'menu', usuario: tela.usuario, obra })
            }}
            aoSair={local ? undefined : () => sair(tela.usuario)}
            local={local}
          />
        </>
      )
    case 'menu':
      return (
        <Menu
          key={tela.obra.id}
          usuario={tela.usuario}
          obra={tela.obra}
          // Sem conta a obra é a da pasta: não há outra para trocar.
          aoTrocarObra={
            local
              ? undefined
              : () => {
                  esquecerModulo()
                  setTela({ nome: 'obras', usuario: tela.usuario })
                }
          }
          aoAbrirPacote={local ? (pacote) => escolherPacote(pacote, tela) : undefined}
          aoPerderObra={aoPerderObra}
          aoEntrarDeNovo={() => setTela({ nome: 'entrar', email: tela.usuario.email, voltarPara: tela.usuario })}
          aoSair={local ? undefined : () => sair(tela.usuario)}
          aoAbrirPessoas={
            tela.obra.papel === 'admin'
              ? () => {
                  history.pushState({ tela: 'pessoas' }, '')
                  setTela({ nome: 'pessoas', usuario: tela.usuario, obra: tela.obra })
                }
              : undefined
          }
          aoAbrirModulo={(id) => {
            if (!moduloPorId(id)?.Tela) return
            history.pushState({ tela: id }, '')
            lembrarModulo(tela.obra.id, id)
            setTela({ nome: 'modulo', modulo: id, usuario: tela.usuario, obra: tela.obra })
          }}
        />
      )
    case 'modulo': {
      const TelaModulo = moduloPorId(tela.modulo)?.Tela
      if (!TelaModulo) return <main class="tela tela-estreita">Módulo indisponível.</main>
      const id = tela.modulo
      return (
        <TelaModulo
          key={`${id}:${tela.obra.id}`}
          usuario={tela.usuario}
          obra={tela.obra}
          aoPerderObra={aoPerderObra}
          aoSair={() => {
            // Volta ao estado de antes da entrada no módulo; o popstate leva ao menu.
            esquecerModulo()
            if (history.state?.tela === id) history.back()
            else setTela({ nome: 'menu', usuario: tela.usuario, obra: tela.obra })
          }}
        />
      )
    }
    case 'pessoas':
      return (
        <Pessoas
          obra={tela.obra}
          usuario={tela.usuario}
          aoVoltar={() => {
            if (history.state?.tela === 'pessoas') history.back() // o popstate volta ao menu
            else setTela({ nome: 'menu', usuario: tela.usuario, obra: tela.obra })
          }}
        />
      )
  }
}
