// Faixa do menu no modo sem conta: no lugar da sincronização, Salvar e Restaurar o arquivo .obra.
import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { banco } from '../nucleo/servicos'
import { aplicarSalvamento, contarFilaDaObra, desempacotar } from '../nucleo/salvamento'
import { chaveUltimoSalvamento, salvarArquivoDaObra } from './faixa_local'
import { escolherPasta, esquecerPasta, estadoPasta, reativarPasta, suportaPasta, type EstadoPasta } from '../nucleo/pasta_salvamento'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import { horaCurta } from './rotulos'

export { chaveUltimoSalvamento }

export function BarraLocal({
  usuario,
  obra,
  pendentes,
  aoMudarDados,
  children,
}: {
  usuario: UsuarioLocal
  obra: ObraLocal
  pendentes: number
  aoMudarDados: () => void
  /** Mais detalhes do aparelho, dentro do mesmo bloco recolhido. */
  children?: ComponentChildren
}) {
  const [ultimo, setUltimo] = useState<string | undefined>()
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const [pasta, setPasta] = useState<EstadoPasta>({ estado: 'nenhuma' })
  /** Só desta obra (`pendentes` conta todas as obras da pessoa; serve de gatilho para recontar). */
  const [daObra, setDaObra] = useState(0)

  useEffect(() => {
    contarFilaDaObra(banco, usuario, obra).then(setDaObra)
  }, [usuario.id, obra.id, pendentes])

  useEffect(() => {
    if (suportaPasta()) estadoPasta(banco).then(setPasta)
  }, [])

  useEffect(() => {
    banco.lerMeta<string>(chaveUltimoSalvamento(obra.id)).then(setUltimo)
  }, [obra.id, pendentes])

  async function salvar() {
    setOcupado(true)
    setErro(null)
    setMensagem(null)
    try {
      setUltimo(await salvarArquivoDaObra(banco, usuario, obra))
      setMensagem('Arquivo salvo. Guarde-o numa pasta sua ou num pendrive.')
    } catch (e) {
      setErro(`Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  async function restaurar(arquivo: File) {
    setOcupado(true)
    setErro(null)
    setMensagem(null)
    try {
      const salvo = await desempacotar(arquivo)
      const r = await aplicarSalvamento(banco, salvo, usuario)
      const contagem = `${r.novos} ${r.novos === 1 ? 'registro restaurado' : 'registros restaurados'}, ${r.repetidos} já ${r.repetidos === 1 ? 'estava' : 'estavam'} aqui.`
      setMensagem(salvo.obra.id === obra.id ? contagem : `Obra ${salvo.obra.codigo}: ${contagem} Toque em "Trocar de obra" para abri-la.`)
      aoMudarDados()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const guardados = daObra > 0 ? `${daObra} ${daObra === 1 ? 'registro guardado' : 'registros guardados'} neste aparelho.` : 'Sem registros neste aparelho.'

  // Na tela inicial, tudo isto fica num bloco recolhido (demonstração, 14/11/2026): à vista só uma linha
  // calma, e o aviso de cópia quando há registro que nunca foi salvo. Abre sozinho quando pede atenção.
  const semCopia = daObra > 0 && !ultimo ? `${daObra} ${daObra === 1 ? 'registro' : 'registros'} ainda sem cópia de segurança.` : ''
  const atencao = !!erro || !!mensagem || pasta.estado === 'pedir'
  return (
    <details class="bloco-recolhido" data-testid="bloco-copia" open={atencao || undefined}>
      <summary>
        <strong>Cópia de segurança e aparelho</strong>
        <span class="discreto" data-testid="estado-sincronizacao">
          Sem conta: tudo fica guardado neste aparelho.
        </span>
        {semCopia && (
          <span class="aviso-calmo" data-testid="aviso-sem-copia">
            {semCopia}
          </span>
        )}
      </summary>
    <section class="barra ok" aria-live="polite">
      <p data-testid="fila">
        {guardados} Último salvamento: {ultimo ? horaCurta(ultimo) : 'ainda não salvo'}.
      </p>
      {mensagem && <p role="status">{mensagem}</p>}
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      <div class="acoes-linha">
        <button type="button" class="principal" onClick={salvar} disabled={ocupado}>
          Salvar arquivo
        </button>
        <button type="button" onClick={() => entrada.current?.click()} disabled={ocupado}>
          Restaurar de um arquivo
        </button>
        <input
          ref={entrada}
          type="file"
          accept=".obra,.json,application/gzip,application/json"
          hidden
          aria-label="Arquivo de salvamento"
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (f) restaurar(f)
          }}
        />
      </div>
      {suportaPasta() && (
        <div class="acoes-linha" data-testid="pasta-automatica">
          {pasta.estado === 'nenhuma' && (
            <>
              <span>Salvamento automático: –</span>
              <button type="button" onClick={async () => setPasta(await escolherPasta(banco))}>
                Escolher pasta
              </button>
            </>
          )}
          {pasta.estado === 'ok' && (
            <>
              <span>Salvamento automático: salvando em "{pasta.nome}".</span>
              <button type="button" onClick={async () => setPasta(await escolherPasta(banco))}>
                Trocar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await esquecerPasta(banco)
                  setPasta({ estado: 'nenhuma' })
                }}
              >
                Parar
              </button>
            </>
          )}
          {pasta.estado === 'pedir' && (
            <>
              <span>A pasta "{pasta.nome}" precisa de permissão de novo.</span>
              <button type="button" class="principal" onClick={async () => setPasta(await reativarPasta(banco))}>
                Reativar
              </button>
            </>
          )}
        </div>
      )}
    </section>
      {children}
    </details>
  )
}
