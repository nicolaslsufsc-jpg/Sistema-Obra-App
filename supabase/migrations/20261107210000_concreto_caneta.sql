-- =====================================================================
-- Concreto: duas canetas no mapa (pedido do Nicolas em 07/11/2026).
-- Cada área desenhada diz em que peças ela vale: 'pilares' (só pilares) ou 'vigas_laje' (vigas e a
-- laje do trecho). Área sem alvo (as de antes desta migração) continua valendo para tudo.
-- =====================================================================

alter table public.caminhao_areas
  add column alvo text check (alvo in ('pilares', 'vigas_laje'));
