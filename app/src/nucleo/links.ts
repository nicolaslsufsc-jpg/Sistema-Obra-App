// Endereço vindo do banco (ex.: link da pasta no Autodoc) só vira link se for http(s).
// Sem isso, um texto como "javascript:..." gravado na tabela rodaria dentro do app ao ser
// tocado, com acesso ao login de quem tocou.
export function linkSeguro(endereco: string | null | undefined): string | null {
  if (!endereco) return null
  try {
    const u = new URL(endereco.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}
