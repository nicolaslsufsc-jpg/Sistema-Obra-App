// Ajudantes dos testes de tela para o menu refeito pelas heurísticas (20/11/2026): Trocar de obra,
// Pessoas da obra e Sair ficam no menu da obra (toque no nome da obra, no topo), e os pavimentos
// baixados ficam nos "Detalhes técnicos" do bloco do aparelho.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any

/** Abre o menu da obra (se estiver fechado) e devolve o painel. Tenta de novo se a tela do menu for refeita
 *  logo depois do toque (fim do login, pacote aberto): o menu volta fechado e precisa de outro toque. */
export async function abrirMenuObra(p: Page) {
  const botao = p.getByTestId('menu-obra')
  const painel = p.getByTestId('painel-obra')
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    if (await painel.isVisible()) return painel
    if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click()
    try {
      await painel.waitFor({ timeout: 2_000 })
      return painel
    } catch {
      // a tela foi refeita e o menu voltou fechado: toca de novo
    }
  }
  await painel.waitFor({ timeout: 2_000 })
  return painel
}

/** Toca num botão do menu da obra ("Sair", "Trocar de obra", "Pessoas da obra"). */
export async function noMenuObra(p: Page, nome: string) {
  for (let tentativa = 0; ; tentativa++) {
    const painel = await abrirMenuObra(p)
    try {
      await painel.getByRole('button', { name: nome, exact: true }).click({ timeout: 5_000 })
      return
    } catch (erro) {
      // o painel sumiu antes do toque (tela refeita) ou o botão ainda não apareceu: abre e tenta de novo
      if (tentativa >= 4) throw erro
    }
  }
}

/** Abre o bloco do aparelho e os "Detalhes técnicos", roda `fn` com a lista de pavimentos e fecha o que abriu. */
export async function comPavimentosDoAparelho<T>(p: Page, fn: (itens: Page) => Promise<T>): Promise<T> {
  const tecnicos = p.getByTestId('detalhes-tecnicos')
  const bloco = p.locator('details.bloco-recolhido', { has: tecnicos })
  const abrir = async (d: Page) => {
    if (await d.evaluate((e: HTMLDetailsElement) => e.open)) return false
    await d.locator(':scope > summary').click()
    return true
  }
  const abriuBloco = await abrir(bloco)
  const abriuTecnicos = await abrir(tecnicos)
  try {
    return await fn(p.getByTestId('pavimentos-obra').getByRole('listitem'))
  } finally {
    if (abriuTecnicos) await tecnicos.locator(':scope > summary').click()
    if (abriuBloco) await bloco.locator(':scope > summary').click()
  }
}

/** Fecha o menu da obra pelo Esc e espera ele sair da tela (o painel aberto cobre os primeiros cartões). */
export async function fecharMenuObra(p: Page) {
  await p.keyboard.press('Escape')
  await p.getByTestId('painel-obra').waitFor({ state: 'detached' })
}

/** Escolhe o pacote .zip no campo "Pacote da obra (.zip)". No menu da obra o campo só existe com o menu aberto, e a
 *  tela pode ser refeita logo depois de abrir (volta de um "Cancelar", fim de uma troca de obra), fechando o menu:
 *  abre de novo e tenta outra vez. Na tela de entrada (sem menu da obra) o campo já está à vista. */
export async function escolherPacote(p: Page, arquivo: string) {
  const campo = p.getByLabel('Pacote da obra (.zip)')
  for (let tentativa = 0; ; tentativa++) {
    try {
      if ((await campo.count()) === 0 && (await p.getByTestId('menu-obra').count()) > 0) await abrirMenuObra(p)
      await campo.setInputFiles(arquivo, { timeout: 5_000 })
      return
    } catch (erro) {
      if (tentativa >= 5) throw erro
    }
  }
}
