-- =====================================================================
-- MEXE NO NÚCLEO (tabela elementos): só aplicar no Supabase com o "pode" do Nicolas.
-- Proposta da frente FVS ambientes (20/11/2026), pelo Professor. A frente 01 (núcleo) revisa.
--
-- Modulação de paredes (pedido do Nicolas de 20/11, "super importante"): cada parede de alvenaria do pavimento
-- vira um local de inspeção da FVS, tipo novo
--   M  parede de alvenaria (planta de modulação: "303-M01")         pipeline/fvs/vedacao.py
-- conferido pela ficha de alvenaria (1ª fiada, prumo, nível, amarração, vergas e contravergas...).
-- Sem esta migração o app já marca as paredes na bancada e no aparelho (registro local), mas a planta de
-- modulação não pode ser publicada: o servidor recusa o elemento (o publicador pede --aceita-paredes).
--
-- Duas regras mudam, nada mais:
--   - elementos.tipo aceita M (núcleo);
--   - fichas_modelo.aplica_a aceita M (módulo FVS): a ficha de alvenaria diz que vale por parede.
-- O setor da planta é "Modulação" com disciplina "vedacao" (texto livre: não precisa de migração).
--
-- docs/02_CONTRATO_NUCLEO.md, linha de "elementos": trocar "tipo P/V/L/A/F/E" por "tipo P/V/L/A/F/E/M" junto
-- com a aplicação (fica para quem aplica, com o Nicolas sabendo).
-- =====================================================================

begin;

alter table public.elementos drop constraint elementos_tipo_check;
alter table public.elementos add constraint elementos_tipo_check
  check (tipo in ('P', 'V', 'L', 'A', 'F', 'E', 'M'));

comment on column public.elementos.tipo is
  'P pilar, V viga, L laje, A ambiente (cômodo), F furo de viga, E esquadria do ambiente (porta ou janela), M parede de alvenaria (modulação).';

alter table public.fichas_modelo drop constraint fichas_modelo_aplica_a_check;
alter table public.fichas_modelo add constraint fichas_modelo_aplica_a_check
  check (cardinality(aplica_a) >= 1 and aplica_a <@ array['P', 'V', 'L', 'A', 'M']);

comment on column public.fichas_modelo.aplica_a is
  'Tipos de local a que a ficha se aplica: P pilar, V viga, L laje, A ambiente, M parede de alvenaria.';

commit;
