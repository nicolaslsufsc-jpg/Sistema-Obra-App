-- =====================================================================
-- Barra de laje no servidor (pedido 0 da FVS, aprovado pelo Nicolas em 20/11/2026, pelo Professor).
-- Mexe só em fvs_eventos (tabela da FVS); nenhuma tabela do núcleo muda.
--
-- A barra conferida na aba Barras (docs/modulos/1_fvs.md, "Barras de laje") é um registro de
-- fvs_eventos. Até aqui ia com elemento_id = id da barra, que não está em elementos: no aparelho sem
-- conta funcionava, mas o servidor recusava o envio (chave estrangeira).
--
-- Escolha: a barra ganha coluna própria, como a área de laje (area_id), em vez de virar peça (tipo B em
-- elementos). Motivo: são milhares de barras por pavimento (574 só numa camada do 2º da obra piloto;
-- quatro camadas), e cada uma em elementos iria para todo aparelho da obra; e a barra já mora no pacote
-- da planta (manifest "barras"), com id fixo calculado da camada, da prancha e da posição.
--
--   fvs_eventos.barra_id  id da barra no pacote da planta. Sem chave estrangeira (não há tabela de
--                         barras); por isso o registro da barra precisa dizer de qual planta ela é
--                         (planta_id), e a planta é conferida pela chave que já existe.
-- O registro continua sendo de um local só: peça, área ou barra.
-- =====================================================================

begin;

alter table public.fvs_eventos
  add column barra_id uuid,
  drop constraint fvs_eventos_um_local,
  add constraint fvs_eventos_um_local check (num_nonnulls(elemento_id, area_id, barra_id) = 1),
  add constraint fvs_eventos_barra_da_planta check (barra_id is null or planta_id is not null);

create index fvs_eventos_barra on public.fvs_eventos (obra_id, barra_id, ficha_id, criado_em_dispositivo)
  where barra_id is not null;

comment on column public.fvs_eventos.barra_id is
  'Barra de laje do pacote da planta (manifest "barras", id fixo). Sem chave estrangeira: vem com planta_id. '
  'O registro é de uma peça, de uma área ou de uma barra, nunca de dois.';

commit;
