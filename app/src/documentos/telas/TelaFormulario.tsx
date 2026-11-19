// Cadastrar documento (escopo da aba) ou revisão nova de um documento (código e escopo fixos).
import { useState } from 'preact/hooks'
import { Topo, erroEmTexto } from '../../relatorios/telas/comum'
import { CATEGORIAS, type Escopo } from '../categorias'
import { guardarArquivo, podeCadastrar, registrarDocumento } from '../dados'
import { ACEITAR_NO_SELETOR, camposDoRascunho, conferirRascunho, LIMITE_ARQUIVO, recusaDoArquivo, tamanhoEmTexto, tipoDoArquivo, type Rascunho } from '../regras'
import type { ContextoDoc } from './ModuloDocumentos'

type Props = { ctx: ContextoDoc; escopo: Escopo; chave?: undefined } | { ctx: ContextoDoc; chave: string; escopo?: undefined }

function Campo({ nome, rotulo, erro, children }: { nome: string; rotulo: string; erro?: string; children: preact.ComponentChildren }) {
  return (
    <div class={`rl-campo${erro ? ' com-erro' : ''}`}>
      <label class="sem-margem" htmlFor={`doc-${nome}`}>
        {rotulo}
      </label>
      {children}
      {erro && (
        <p class="erro" data-testid={`erro-${nome}`}>
          {erro}
        </p>
      )}
    </div>
  )
}

export function TelaFormulario({ ctx, escopo, chave }: Props) {
  const { dados, hoje, obra, usuario, trocar, voltar, recarregar } = ctx
  const doc = chave ? dados.documentos.find((d) => d.chave === chave) : undefined
  const escopoInicial: Escopo = doc?.escopo ?? escopo ?? 'obra'
  const [r, setR] = useState<Rascunho>(() => ({
    escopo: escopoInicial,
    categoria: doc?.categoria ?? CATEGORIAS.find((c) => c.escopo === escopoInicial)?.id ?? '',
    codigo: doc?.codigo ?? '',
    titulo: doc?.atual.titulo ?? '',
    revisao: '',
    data_revisao: hoje,
    validade: '',
    responsavel: doc?.atual.responsavel ?? '',
    situacao: 'vigente',
    observacao: '',
  }))
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [gravando, setGravando] = useState(false)

  if (!podeCadastrar(obra.papel)) {
    return (
      <>
        <Topo titulo="Documentos" aoVoltar={voltar} />
        <p class="aviso">Só gestor ou admin cadastram documentos.</p>
      </>
    )
  }

  const mudar = (campo: keyof Rascunho) => (e: Event) => {
    setR({ ...r, [campo]: (e.target as HTMLInputElement).value })
    if (erros[campo]) setErros({ ...erros, [campo]: '' })
  }
  const escolherArquivo = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null
    // o limite vale para PDF e para foto (a foto é reduzida depois, mas uma enorme nem chega a ser lida)
    const recusa = f ? recusaDoArquivo(f.size, tipoDoArquivo(f)) : null
    setErros({ ...erros, arquivo: recusa ?? '' })
    setArquivo(recusa ? null : f)
    if (recusa) (e.target as HTMLInputElement).value = ''
  }

  const salvar = async (e: Event) => {
    e.preventDefault()
    const novos = conferirRascunho(r, dados.documentos, chave)
    setErros(novos)
    if (Object.keys(novos).length > 0) return
    setGravando(true)
    try {
      const arquivoId = arquivo ? await guardarArquivo(obra.id, usuario.id, arquivo) : null
      await registrarDocumento(obra.id, usuario.id, camposDoRascunho(r, arquivoId))
      await recarregar()
      // revisão nova: volta ao documento (que já está atrás no histórico); cadastro: troca o formulário pelo documento
      if (doc) voltar()
      else trocar({ nome: 'documento', chave: `${r.escopo}:${r.codigo.trim().toUpperCase()}` })
    } catch (err) {
      setErros({ geral: erroEmTexto(err) })
    } finally {
      setGravando(false)
    }
  }

  const fixo = !!doc
  return (
    <>
      <Topo titulo={doc ? `Revisão nova · ${doc.codigo}` : 'Cadastrar documento'} sub={doc ? `Vigente hoje: rev. ${doc.atual.revisao}` : undefined} aoVoltar={voltar} />
      <form class="rl-form" onSubmit={salvar} data-testid="form-documento" noValidate>
        {!fixo && (
          <div class="rl-campo">
            <p class="rl-rotulo-campo">De quem é</p>
            <div class="rl-chips" role="group" aria-label="De quem é">
              {(['empresa', 'obra'] as const).map((v) => (
                <button type="button" key={v} class={`rl-chip${r.escopo === v ? ' on' : ''}`} aria-pressed={r.escopo === v} onClick={() => setR({ ...r, escopo: v })}>
                  {v === 'empresa' ? 'Empresa (todas as obras)' : 'Esta obra'}
                </button>
              ))}
            </div>
          </div>
        )}
        <Campo nome="categoria" rotulo="Categoria" erro={erros.categoria}>
          <select id="doc-categoria" value={r.categoria} onChange={mudar('categoria')}>
            {CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        {!fixo && (
          <Campo nome="codigo" rotulo="Código" erro={erros.codigo}>
            <input id="doc-codigo" value={r.codigo} maxLength={40} placeholder="Ex.: EXE-PES-01" autoComplete="off" onInput={mudar('codigo')} />
          </Campo>
        )}
        <Campo nome="titulo" rotulo="Título" erro={erros.titulo}>
          <input id="doc-titulo" value={r.titulo} maxLength={160} onInput={mudar('titulo')} />
        </Campo>
        <div class="doc-duas">
          <Campo nome="revisao" rotulo="Revisão" erro={erros.revisao}>
            <input id="doc-revisao" value={r.revisao} maxLength={12} placeholder="Ex.: 00" autoComplete="off" onInput={mudar('revisao')} />
          </Campo>
          <Campo nome="data_revisao" rotulo="Data da revisão" erro={erros.data_revisao}>
            <input id="doc-data_revisao" type="date" value={r.data_revisao} onInput={mudar('data_revisao')} />
          </Campo>
        </div>
        <Campo nome="validade" rotulo="Validade (vazio = não vence)" erro={erros.validade}>
          <input id="doc-validade" type="date" value={r.validade} onInput={mudar('validade')} />
        </Campo>
        <Campo nome="responsavel" rotulo="Responsável" erro={erros.responsavel}>
          <input id="doc-responsavel" value={r.responsavel} maxLength={120} placeholder="Nome ou função" onInput={mudar('responsavel')} />
        </Campo>
        <div class="rl-campo">
          <p class="rl-rotulo-campo">Status</p>
          <div class="rl-chips" role="group" aria-label="Status">
            {(['vigente', 'em_revisao'] as const).map((v) => (
              <button type="button" key={v} class={`rl-chip${r.situacao === v ? ' on' : ''}`} aria-pressed={r.situacao === v} onClick={() => setR({ ...r, situacao: v })}>
                {v === 'vigente' ? 'Vigente' : 'Em revisão'}
              </button>
            ))}
          </div>
        </div>
        <Campo nome="arquivo" rotulo={`Arquivo: PDF ou foto, até ${tamanhoEmTexto(LIMITE_ARQUIVO)}`} erro={erros.arquivo}>
          <input id="doc-arquivo" type="file" accept={ACEITAR_NO_SELETOR} onChange={escolherArquivo} />
        </Campo>
        <Campo nome="observacao" rotulo="Observação (opcional)">
          <textarea id="doc-observacao" rows={2} maxLength={500} value={r.observacao} onInput={mudar('observacao')} />
        </Campo>
        {erros.geral && <p class="erro">{erros.geral}</p>}
        <button type="submit" class="principal" disabled={gravando} data-testid="salvar-documento">
          {gravando ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </>
  )
}
