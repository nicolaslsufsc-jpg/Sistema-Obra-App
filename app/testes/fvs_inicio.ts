// Ajudantes dos testes de tela para o início da FVS em 3 níveis (21/11/2026): pavimentos → disciplinas do
// pavimento → opções da disciplina (Pilares, Vigas, Lajes... na Estrutura). Ver src/fvs/navegacao.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any

/** Volta à lista de pavimentos (nível 1): da planta, o voltar passa pelas opções e pelas disciplinas. */
export async function noInicioFvs(p: Page, timeout = 30_000) {
  const fim = Date.now() + timeout
  for (;;) {
    if (await p.getByTestId('fvs-pavimento').first().isVisible().catch(() => false)) return
    const nivel = await p.locator('[data-testid=fvs-nivel-disciplina], [data-testid=fvs-nivel-pavimento]').count().catch(() => 0)
    if (nivel) {
      await p.goBack()
      continue
    }
    if (Date.now() > fim) throw new Error('não chegou à lista de pavimentos da FVS')
    await p.waitForTimeout(200)
  }
}

/** Espera o pavimento (o primeiro) aparecer na lista já guardado no aparelho ("No aparelho"). */
export async function pavimentoNoAparelhoFvs(p: Page, timeout = 30_000) {
  await noInicioFvs(p, timeout)
  await p.getByTestId('fvs-pavimento').filter({ hasText: 'No aparelho' }).first().waitFor({ timeout })
}

/** Do início, entra no pavimento (o primeiro, ou o de `nome`) e na disciplina ("estrutura", "alvenaria"...). */
export async function naDisciplinaFvs(p: Page, disciplina: string, nome?: string) {
  await noInicioFvs(p)
  const cartoes = p.getByTestId('fvs-pavimento')
  await (nome ? cartoes.filter({ hasText: nome }) : cartoes).first().click()
  await p.locator(`[data-testid=fvs-disciplina][data-disciplina=${disciplina}]`).click()
  await p.getByTestId('fvs-nivel-disciplina').waitFor()
}

/** Abre a planta de forma pela Estrutura: na aba `tipo` (opção da forma no aparelho) ou pelo botão da planta. */
export async function abrirFormaFvs(p: Page, tipo = 'P') {
  await naDisciplinaFvs(p, 'estrutura')
  const opcao = p.locator(`[data-testid=fvs-opcao-forma][data-tipo=${tipo}]`)
  const planta = p.getByTestId('fvs-secao-estrutura').locator('[data-testid=fvs-planta], .fv-trechos .fv-abrir')
  await opcao.or(planta).first().click()
}
