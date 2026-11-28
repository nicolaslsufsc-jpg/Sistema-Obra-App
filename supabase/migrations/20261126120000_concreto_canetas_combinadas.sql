-- =====================================================================
-- Concreto: seis canetas no mapa (pedido do Nicolas em 26/11/2026).
-- Antes (20261107210000_concreto_caneta.sql) eram duas: 'pilares' e 'vigas_laje'. Agora a área
-- desenhada pode dizer também 'vigas', 'laje', 'pilares_vigas' e 'pilares_vigas_laje' (o que foi
-- concretado junto). "Pilares e lajes" sem as vigas não existe.
-- Só troca a lista aceita na coluna: nenhuma linha muda. Área sem alvo continua valendo para tudo.
-- =====================================================================

alter table public.caminhao_areas
  drop constraint if exists caminhao_areas_alvo_check;

alter table public.caminhao_areas
  add constraint caminhao_areas_alvo_check
  check (alvo in ('pilares', 'vigas', 'laje', 'pilares_vigas', 'vigas_laje', 'pilares_vigas_laje'));
