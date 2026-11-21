// Um documento: dados da revisão vigente, abrir o arquivo, revisões anteriores (obsoletas),
// revisão nova e "em revisão" / "vigente" (correção = linha nova com substitui_id).
import { useEffect, useState } from 'preact/hooks'
import { Topo, erroEmTexto } from '../../relatorios/telas/comum'
import { dataBR } from '../../relatorios/regras'
import { nomeDaCategoria, NOME_DO_ESCOPO } from '../categorias'
import { ArquivoNaoConfere, podeCadastrar, registrarDocumento, urlDoArquivo, type ArquivoDoc } from '../dados'
import { COLUNAS_DOCUMENTO, statusDaRevisao, tamanhoEmTexto, type ComoAbrir, type Revisao, nomeLimpo } from '../regras'
import type { ContextoDoc } from './ModuloDocumentos'
import { SeloExemplo, SeloStatus, SeloValidade, textoValidade } from './comum'

/** Link para abrir o arquivo da revisão (e a foto em miniatura). */
function AbrirArquivo({ arquivo, rotulo, miniatura = false }: { arquivo: ArquivoDoc | undefined; rotulo: string; miniatura?: boolean }) {
  const [aberto, setAberto] = useState<({ url: string } & ComoAbrir) | null>(null)
  const [falta, setFalta] = useState(false)
  // com conta, o arquivo já enviado fica só no servidor: baixa com um toque (doServidor)
  const [doServidor, setDoServidor] = useState(false)
  const [baixando, setBaixando] = useState(false)
  const [naoConfere, setNaoConfere] = useState(false)
  useEffect(() => {
    if (!arquivo) return
    let vivo = true
    let criada: string | null = null
    if (doServidor) setBaixando(true)
    urlDoArquivo(arquivo, doServidor).then((u) => {
      if (!vivo) {
        if (u) URL.revokeObjectURL(u.url)
        return
      }
      criada = u?.url ?? null
      setAberto(u)
      setFalta(!u)
      setBaixando(false)
    }).catch((e) => {
      if (!vivo) return
      setNaoConfere(e instanceof ArquivoNaoConfere)
      setAberto(null)
      setFalta(true)
      setBaixando(false)
    })
    return () => {
      vivo = false
      if (criada) URL.revokeObjectURL(criada)
    }
  }, [arquivo?.id, doServidor])

  if (!arquivo) return <p class="discreto">Sem arquivo.</p>
  if (baixando) return <p class="discreto">Baixando o arquivo do servidor…</p>
  if (falta && !doServidor && arquivo.caminho) {
    return (
      <div class="doc-arquivo">
        <button type="button" class="botao" data-testid="baixar-do-servidor" onClick={() => setDoServidor(true)}>
          Baixar do servidor
        </button>
        <span class="discreto">
          {arquivo.nome_original} · {tamanhoEmTexto(arquivo.tamanho)} · precisa de internet
        </span>
      </div>
    )
  }
  if (falta && naoConfere) return <p class="aviso" data-testid="arquivo-nao-confere">O arquivo que veio do servidor não é o que foi registrado. Não abri. Avise o gestor da obra.</p>
  if (falta) return <p class="aviso">{doServidor ? 'Não consegui baixar o arquivo. Confira a internet e abra o documento de novo.' : 'O arquivo não está neste aparelho.'}</p>
  if (!aberto) return <p class="discreto">Abrindo o arquivo…</p>
  const { url, foto } = aberto
  // não é PDF nem foto de verdade: só baixa (numa aba, HTML ou SVG rodariam)
  if (!aberto.abrir) {
    return (
      <div class="doc-arquivo">
        <a class="botao" href={url} download={nomeLimpo(arquivo.nome_original)} data-testid="baixar-arquivo">
          Baixar arquivo
        </a>
        <span class="aviso">{arquivo.nome_original}: não é PDF nem foto. Só dá para baixar.</span>
      </div>
    )
  }
  return (
    <div class="doc-arquivo">
      <a class="botao" href={url} target="_blank" rel="noopener" data-testid="abrir-arquivo">
        {rotulo}
      </a>
      <span class="discreto">
        {arquivo.nome_original} · {foto ? 'foto' : 'PDF'} · {tamanhoEmTexto(arquivo.tamanho)}
      </span>
      {miniatura && foto && aberto.tipo !== 'image/heic' && <img class="doc-foto" src={url} alt={arquivo.nome_original} />}
    </div>
  )
}

export function TelaDocumento({ ctx, chave }: { ctx: ContextoDoc; chave: string }) {
  const { dados, hoje, obra, usuario, ir, voltar, recarregar } = ctx
  const doc = dados.documentos.find((d) => d.chave === chave)
  const [erro, setErro] = useState('')
  const [gravando, setGravando] = useState(false)
  if (!doc) {
    return (
      <>
        <Topo titulo="Documento" aoVoltar={voltar} />
        <p class="discreto">Este documento não existe mais neste aparelho.</p>
      </>
    )
  }
  const a = doc.atual
  const pode = podeCadastrar(obra.papel)

  const mudarSituacao = async (situacao: 'vigente' | 'em_revisao') => {
    setGravando(true)
    setErro('')
    try {
      const campos: Record<string, unknown> = {}
      for (const c of COLUNAS_DOCUMENTO) campos[c] = (a as Record<string, unknown>)[c] ?? null
      await registrarDocumento(obra.id, usuario.id, { ...campos, situacao, substitui_id: a.id, cancelado: false })
      await recarregar()
    } catch (e) {
      setErro(erroEmTexto(e))
    } finally {
      setGravando(false)
    }
  }

  const linhaRevisao = (r: Revisao) => (
    <li key={r.raiz} class="doc-revisao">
      <div>
        <strong>rev. {r.revisao}</strong> · {dataBR(r.data_revisao)} <SeloStatus status={statusDaRevisao(doc, r)} />
      </div>
      <AbrirArquivo arquivo={r.arquivo_id ? dados.arquivos.get(r.arquivo_id) : undefined} rotulo={`Abrir rev. ${r.revisao}`} />
    </li>
  )

  return (
    <>
      <Topo titulo={doc.codigo} sub={`${NOME_DO_ESCOPO[doc.escopo]} · ${nomeDaCategoria(doc.categoria)}`} aoVoltar={voltar} />
      <h2 class="doc-titulo" data-testid="titulo-documento">
        {a.titulo}
      </h2>
      <p class="doc-selos">
        {doc.exemplo && <SeloExemplo />}
        <SeloStatus status={statusDaRevisao(doc, a)} />
        <SeloValidade doc={doc} hoje={hoje} />
      </p>
      <dl class="doc-dados">
        <dt>Revisão</dt>
        <dd>{a.revisao}</dd>
        <dt>Data da revisão</dt>
        <dd>{dataBR(a.data_revisao)}</dd>
        <dt>Validade</dt>
        <dd>{textoValidade(a.validade)}</dd>
        <dt>Responsável</dt>
        <dd>{a.responsavel}</dd>
        {a.observacao && (
          <>
            <dt>Observação</dt>
            <dd>{a.observacao}</dd>
          </>
        )}
      </dl>

      <AbrirArquivo arquivo={a.arquivo_id ? dados.arquivos.get(a.arquivo_id) : undefined} rotulo="Abrir arquivo" miniatura />

      {pode && (
        <div class="doc-acoes">
          <button type="button" class="principal" data-testid="revisao-nova" onClick={() => ir({ nome: 'revisao', chave })}>
            Revisão nova
          </button>
          {a.situacao === 'em_revisao' ? (
            <button type="button" disabled={gravando} onClick={() => mudarSituacao('vigente')}>
              Marcar como vigente
            </button>
          ) : (
            <button type="button" disabled={gravando} data-testid="marcar-em-revisao" onClick={() => mudarSituacao('em_revisao')}>
              Marcar "em revisão"
            </button>
          )}
        </div>
      )}
      {erro && <p class="erro">{erro}</p>}

      <h2>Revisões anteriores</h2>
      {doc.anteriores.length === 0 ? (
        <p class="discreto">Nenhuma: esta é a primeira revisão cadastrada.</p>
      ) : (
        <ul class="doc-revisoes" data-testid="revisoes-anteriores">
          {doc.anteriores.map(linhaRevisao)}
        </ul>
      )}
    </>
  )
}
