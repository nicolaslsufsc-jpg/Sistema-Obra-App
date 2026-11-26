-- =====================================================================
-- Módulo FVS (fichas_modelo): a ficha pode valer para a estaca de fundação (tipo S). Não mexe no núcleo:
-- o tipo S em elementos já existe (20261122180000_nucleo_elementos_s_k.sql, do Concreto).
--
-- Planta de estacas (item 2.1 da lista de conferências, 24/11/2026): as estacas dentro dos blocos das
-- pranchas de locação viram locais "S" ("E-P65.1", pipeline/fvs/blocos.py), conferidos pela ficha de
-- estaca. A ficha diz que vale por estaca com aplica_a = {S}.
--
-- Uma regra muda, nada mais: fichas_modelo.aplica_a aceita S.
-- =====================================================================

begin;

alter table public.fichas_modelo drop constraint fichas_modelo_aplica_a_check;
alter table public.fichas_modelo add constraint fichas_modelo_aplica_a_check
  check (cardinality(aplica_a) >= 1 and aplica_a <@ array['P', 'V', 'L', 'A', 'M', 'K', 'S']);

comment on column public.fichas_modelo.aplica_a is
  'Tipos de local a que a ficha se aplica: P pilar, V viga, L laje, A ambiente, M parede de alvenaria, K bloco de fundação, S estaca.';

commit;
