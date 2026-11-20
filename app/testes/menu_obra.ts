// Ajudantes dos testes de tela para o menu refeito pelas heurísticas (20/11/2026): Trocar de obra,
// Pessoas da obra e Sair ficam no menu da obra (toque no nome da obra, no topo), e os pavimentos
// baixados ficam nos "Detalhes técnicos" do bloco do aparelho.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any

/** Abre o menu da obra (se estiver fechado) e devolve o painel. */
export async function abrirMenuObra(p: Page) {
  const botao = p.getByTestId('menu-obra')
  if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click()
  const painel = p.getByTestId('painel-obra')
  await painel.waitFor()
  return painel
}

/** Toca num botão do menu da obra ("Sair", "Trocar de obra", "Pessoas da obra"). */
export async function noMenuObra(p: Page, nome: string) {
  const painel = await abrirMenuObra(p)
  await painel.getByRole('button', { name: nome, exact: true }).click()
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
