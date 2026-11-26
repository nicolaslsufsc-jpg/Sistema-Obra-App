// Nova obra, passo "Publicar no servidor" (23/11/2026): a obra montada no assistente vai para o servidor,
// sem .zip e sem Python. Só o administrador publica (as regras do banco: obras.incluir = eh_admin).
//
// Como:
//   1. cria a linha em `obras` (direto, precisa de internet);
//   2. põe na fila de sincronização do núcleo (sincronizacao.ts) as mesmas linhas que o pacote .zip gera
//      (pacote_obra.ts, linhasDoCadastro): pavimentos, peças, setores, arquivos da planta, plantas e fichas.
//      Os arquivos (manifest.json e pacote.bin) entram por registrarArquivo, que os manda ao armazenamento;
//   3. manda a fila (enviar) até esvaziar;
//   4. dá acesso às pessoas pela função `convidar` do banco: quem já tem conta ganha o acesso na hora,
//      quem não tem ganha quando entrar a primeira vez com aquele e-mail (sem e-mail: convite esperando).
// Sem tabela nova e sem migração: só o que o núcleo já tem.
//
// Recomeçar: o rascunho guarda até onde foi (`publicacao`). Se a internet cair no meio, "Publicar" de
// novo não cria outra obra nem repete linhas: só manda o que ficou na fila e os convites que faltam.
import { linhasDoCadastro } from '../nucleo/pacote_obra'
import type { ObraLocal } from '../nucleo/conta'
import { pacoteDoRascunho, type EstadoPublicacao, type LerTiles, type PessoaRascunho, type RascunhoObra } from './modelo'

/** Colunas que o núcleo preenche (sincronizacao.ts, montarLinha): saem das linhas do pacote. */
const DO_NUCLEO = ['obra_id', 'usuario_id', 'dispositivo_id', 'criado_em_dispositivo', 'apagado'] as const

export type Registro =
  | { tipo: 'linha'; tabela: string; campos: Record<string, unknown> }
  /** arquivo da planta: `chave` é o id que as plantas usam no pacote; o servidor dá outro id */
  | { tipo: 'arquivo'; chave: string; nome: string; conteudo: Blob }

export interface PlanoDePublicacao {
  obra: { id: string; codigo: string; nome: string; empresa: string | null }
  registros: Registro[]
}

/** As linhas e os arquivos da obra, na ordem em que o servidor aceita (pais antes dos filhos). */
export async function planoDePublicacao(r: RascunhoObra, obraId: string, lerTiles: LerTiles, agora = new Date()): Promise<PlanoDePublicacao> {
  const { indice, fichas, arquivos, configFvs } = await pacoteDoRascunho(r, agora, lerTiles)
  const obra: ObraLocal = {
    id: obraId,
    codigo: r.codigo,
    nome: r.nome.trim(),
    empresa: r.empresa.trim() || null,
    papel: 'admin',
  }
  const { linhas } = await linhasDoCadastro(obra, indice, fichas, configFvs)
  const conteudo = new Map(arquivos.map(([caminho, c]) => [caminho, typeof c === 'string' ? new Blob([c], { type: 'application/json' }) : c]))
  // caminho do arquivo no pacote, pelo id do arquivo (linhasDoCadastro: `${obra}/fvs/plantas/${planta}/${nome}`)
  const pastaDaPlanta = new Map(indice.pavimentos.flatMap((pv) => pv.plantas.map((pl) => [pl.id, pl.pasta] as const)))
  const registros: Registro[] = []
  for (const { tabela, linha } of linhas) {
    if (tabela === 'arquivos') {
      const m = /\/fvs\/plantas\/([^/]+)\/([^/]+)$/.exec(String(linha.caminho))
      const pasta = m ? pastaDaPlanta.get(m[1]) : undefined
      const blob = pasta ? conteudo.get(pasta + m![2]) : undefined
      if (!m || !blob) throw new Error(`Arquivo da planta não encontrado no pacote: ${String(linha.caminho)}`)
      registros.push({
        tipo: 'arquivo',
        chave: linha.id,
        nome: m[2],
        conteudo: blob,
      })
      continue
    }
    const campos: Record<string, unknown> = { ...linha }
    for (const c of DO_NUCLEO) delete campos[c]
    registros.push({ tipo: 'linha', tabela, campos })
  }
  return {
    obra: {
      id: obraId,
      codigo: obra.codigo,
      nome: obra.nome,
      empresa: obra.empresa,
    },
    registros,
  }
}

/** O que a publicação precisa do servidor (servicos.ts no app; um falso nos testes). */
export interface Servidor {
  /** quem entrou neste navegador, ou null */
  usuario(): Promise<{ id: string; email: string } | null>
  ehAdmin(usuarioId: string): Promise<boolean | string>
  /** id da obra com esse código, null se não há; string = erro */
  obraPorCodigo(codigo: string): Promise<{ id: string } | null | string>
  /** null = criou; string = o motivo */
  criarObra(o: PlanoDePublicacao['obra']): Promise<string | null>
  registrar(tabela: string, obraId: string, usuarioId: string, campos: Record<string, unknown>): Promise<{ id: string }>
  registrarArquivo(obraId: string, usuarioId: string, modulo: string, conteudo: Blob, nome: string): Promise<{ id: string }>
  /** manda a fila; devolve quantos faltam e, se parou, por quê */
  enviar(usuarioId: string): Promise<{ pendentes: number; comErro: number; parouPor?: string }>
  /** null = convite feito (ou acesso dado); string = o motivo */
  convidar(obraId: string, nome: string, papel: PessoaRascunho['papel'], email: string | null): Promise<string | null>
  /** no fim: a lista de obras do app passa a mostrar a nova */
  atualizarObras?(usuarioId: string): Promise<void>
}

export interface Progresso {
  etapa: 'conferir' | 'obra' | 'fila' | 'enviar' | 'pessoas' | 'pronto'
  texto: string
}

export type ResultadoPublicacao = { ok: true; estado: EstadoPublicacao; avisos: string[] } | { ok: false; erro: string; estado?: EstadoPublicacao }

/**
 * Publica o rascunho. `guardar` grava o estado no rascunho a cada passo (para recomeçar).
 * Não apaga nem troca nada que já esteja no servidor: obra com o mesmo código que não é esta publicação
 * é recusada.
 */
export async function publicarObra(
  r: RascunhoObra,
  s: Servidor,
  lerTiles: LerTiles,
  guardar: (e: EstadoPublicacao) => void,
  aoProgresso: (p: Progresso) => void = () => {},
  novoId: () => string = () => crypto.randomUUID(),
): Promise<ResultadoPublicacao> {
  aoProgresso({
    etapa: 'conferir',
    texto: 'Conferindo a conta e o código da obra…',
  })
  const u = await s.usuario()
  if (!u)
    return {
      ok: false,
      erro: 'Entre no app com a conta de administrador (botão "Abrir o app") e volte aqui.',
    }
  const admin = await s.ehAdmin(u.id)
  if (typeof admin === 'string') return { ok: false, erro: `Não consegui conferir a conta: ${admin}` }
  if (!admin)
    return {
      ok: false,
      erro: `A conta ${u.email} não é de administrador. Só o administrador cria obra no servidor.`,
    }

  let estado = r.publicacao?.codigo === r.codigo ? r.publicacao : undefined
  const existente = await s.obraPorCodigo(r.codigo)
  if (typeof existente === 'string')
    return {
      ok: false,
      erro: `Não consegui falar com o servidor: ${existente}`,
    }
  if (existente && existente.id !== estado?.obraId)
    return {
      ok: false,
      erro: `Já existe no servidor uma obra com o código ${r.codigo}. Escolha outro código no passo 1 (a obra de lá não é mexida).`,
    }
  if (!existente && estado) estado = undefined // a obra sumiu do servidor (ou era de outro servidor): começa do zero

  if (!estado) {
    const plano = await planoDePublicacao(r, novoId(), lerTiles)
    aoProgresso({ etapa: 'obra', texto: `Criando a obra ${r.codigo}…` })
    const erro = await s.criarObra(plano.obra)
    if (erro) return { ok: false, erro: `Não consegui criar a obra: ${erro}` }
    estado = {
      obraId: plano.obra.id,
      codigo: r.codigo,
      naFila: false,
      enviada: false,
      convidadas: [],
      em: new Date().toISOString(),
    }
    guardar(estado)
    aoProgresso({
      etapa: 'fila',
      texto: 'Preparando pavimentos, peças, plantas e fichas…',
    })
    const idDoArquivo = new Map<string, string>()
    for (const reg of plano.registros) {
      if (reg.tipo === 'arquivo') {
        const l = await s.registrarArquivo(estado.obraId, u.id, 'fvs', reg.conteudo, reg.nome)
        idDoArquivo.set(reg.chave, l.id)
        continue
      }
      const campos = { ...reg.campos }
      if (reg.tabela === 'plantas') {
        campos.manifest_id = idDoArquivo.get(String(campos.manifest_id))
        campos.pacote_id = idDoArquivo.get(String(campos.pacote_id))
      }
      await s.registrar(reg.tabela, estado.obraId, u.id, campos)
    }
    estado = { ...estado, naFila: true }
    guardar(estado)
  } else if (!estado.naFila) {
    // caiu entre criar a obra e pôr na fila: a obra está vazia no servidor; pôr na fila agora
    return {
      ok: false,
      erro: `A obra ${r.codigo} foi criada no servidor, mas a publicação parou antes de preparar os dados. Peça ao administrador para apagar a obra ${r.codigo} no servidor, ou use outro código.`,
      estado,
    }
  }

  if (!estado.enviada) {
    for (let volta = 0; volta < 20; volta++) {
      aoProgresso({ etapa: 'enviar', texto: 'Enviando para o servidor…' })
      const e = await s.enviar(u.id)
      if (e.comErro)
        return {
          ok: false,
          erro: `${e.comErro} ${e.comErro === 1 ? 'registro foi recusado' : 'registros foram recusados'} pelo servidor. Abra o app para ver o motivo.`,
          estado,
        }
      if (e.parouPor)
        return {
          ok: false,
          erro: `O envio parou: ${e.parouPor}. Toque em "Publicar" de novo para continuar de onde parou.`,
          estado,
        }
      if (e.pendentes === 0) break
    }
    estado = { ...estado, enviada: true }
    guardar(estado)
  }

  const avisos: string[] = []
  const pessoas = r.pessoas ?? []
  for (const [i, p] of pessoas.entries()) {
    if (estado.convidadas.includes(i)) continue
    aoProgresso({ etapa: 'pessoas', texto: `Dando acesso a ${p.nome}…` })
    const erro = await s.convidar(estado.obraId, p.nome.trim(), p.papel, p.email.trim() || null)
    if (erro) {
      avisos.push(`${p.nome}: ${erro}`)
      continue
    }
    estado = { ...estado, convidadas: [...estado.convidadas, i] }
    guardar(estado)
  }
  await s.atualizarObras?.(u.id).catch(() => undefined)
  aoProgresso({ etapa: 'pronto', texto: 'Obra publicada.' })
  return { ok: true, estado, avisos }
}
