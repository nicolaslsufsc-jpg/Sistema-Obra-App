// Campo de arquivo do guia de estilo (docs/DESIGN.md › Componentes, 23/11/2026): um botão
// "Importar planilha (.xlsx)" com o nome do arquivo escolhido ao lado. Nunca o campo padrão do navegador.
// O <input type="file"> continua dentro do botão (escondido só na tela), para o teclado, o leitor de tela e os testes.
import { useState } from 'preact/hooks'
import { Icone } from './icones'
import './botao_arquivo.css'

export function BotaoArquivo({
  rotulo,
  accept,
  multiple,
  capture,
  disabled,
  testid,
  id,
  rotuloLeitor,
  nome,
  principal,
  limpar,
  aoEscolher,
}: {
  /** "Importar planilha (.xlsx)", "Importar foto", "Importar lista (.csv)" */
  rotulo: string
  accept?: string
  multiple?: boolean
  capture?: 'environment' | 'user'
  disabled?: boolean
  /** data-testid do <input> (os testes escolhem o arquivo por ele) */
  testid?: string
  /** id do <input>, para o <label for> de um Campo (aí o nome lido vem desse label) */
  id?: string
  /** nome lido pelo leitor de tela, quando for diferente do rótulo */
  rotuloLeitor?: string
  /** nome mostrado ao lado; sem ele, o botão mostra o que foi escolhido por último */
  nome?: string | null
  principal?: boolean
  /** limpa o campo depois de escolher (o mesmo arquivo pode ser escolhido de novo) */
  limpar?: boolean
  aoEscolher: (arquivos: File[], campo: HTMLInputElement) => void
}) {
  const [escolhido, setEscolhido] = useState('')
  const mostrar = nome === undefined ? escolhido : (nome ?? '')
  return (
    <span class="so-arquivo">
      <label class={`so-arquivo-botao${principal ? ' principal' : ''}${disabled ? ' desativado' : ''}`}>
        <Icone id="importar" />
        <span>{rotulo}</span>
        <input
          type="file"
          class="so-arquivo-campo"
          accept={accept}
          multiple={multiple}
          capture={capture}
          disabled={disabled}
          id={id}
          data-testid={testid}
          aria-label={id && !rotuloLeitor ? undefined : (rotuloLeitor ?? rotulo)}
          onChange={(e) => {
            const campo = e.currentTarget
            const lista = [...(campo.files ?? [])]
            setEscolhido(lista.map((f) => f.name).join(', '))
            aoEscolher(lista, campo)
            if (limpar) campo.value = ''
          }}
        />
      </label>
      {mostrar && (
        <span class="so-arquivo-nome" data-testid={testid ? `${testid}-nome` : undefined}>
          {mostrar}
        </span>
      )}
    </span>
  )
}
