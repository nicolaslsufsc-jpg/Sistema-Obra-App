-- =====================================================================
-- Módulo FVS (fichas_modelo): a ficha pode valer para o bloco de fundação (tipo K). Avisado ao Professor
-- antes (23/11/2026), pela frente 03 · FVS-EST. Não mexe no núcleo: o tipo K em elementos já existe
-- (20261122180000_nucleo_elementos_s_k.sql, do Concreto).
--
-- Planta de blocos de fundação (item 2.2 da lista de conferências): cada bloco das pranchas de locação é
-- um local "K" ("BL-P65", pipeline/fvs/blocos.py), conferido pela ficha de blocos de fundação. A ficha diz
-- que vale por bloco com aplica_a = {K}.
--
-- Uma regra muda, nada mais: fichas_modelo.aplica_a aceita K.
-- =====================================================================

begin;

alter table public.fichas_modelo drop constraint fichas_modelo_aplica_a_check;
alter table public.fichas_modelo add constraint fichas_modelo_aplica_a_check
  check (cardinality(aplica_a) >= 1 and aplica_a <@ array['P', 'V', 'L', 'A', 'M', 'K']);

comment on column public.fichas_modelo.aplica_a is
  'Tipos de local a que a ficha se aplica: P pilar, V viga, L laje, A ambiente, M parede de alvenaria, K bloco de fundação.';

commit;
