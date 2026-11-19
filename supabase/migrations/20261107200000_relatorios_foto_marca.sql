-- =====================================================================
-- Relatórios: onde cada foto foi tirada.
-- rel_marcas ganha foto_id: uma marca (ponto, peça ou área na prancha) pode pertencer a uma foto,
-- além de a um serviço, uma ocorrência ou um relatório. Continua valendo um alvo só por marca.
-- Pedido do Nicolas em 07/11/2026 ("função de pingar onde foi o acontecimento de cada imagem").
-- =====================================================================

alter table public.rel_marcas add column foto_id uuid;
alter table public.rel_marcas drop constraint rel_marcas_um_alvo;
alter table public.rel_marcas
  add constraint rel_marcas_um_alvo check (num_nonnulls(servico_id, ocorrencia_id, relatorio_id, foto_id) = 1);
alter table public.rel_marcas
  add constraint rel_marcas_foto_id_obra_id_fkey foreign key (foto_id, obra_id) references public.rel_fotos (id, obra_id);
