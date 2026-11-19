-- FVS: fichas por ambiente (alvenaria, reboco, pintura...).
--
-- A ficha (PVS) diz a que tipo de local se aplica. Até aqui só peças de estrutura: P pilar, V viga,
-- L laje. Entra o tipo A (ambiente), para as fichas marcadas na planta de ambientes do pavimento
-- (docs/modulos/1_fvs.md, "Ambientes").
--
-- Só muda a tabela do módulo (fichas_modelo). Para os ambientes existirem como local de inspeção
-- no servidor falta o núcleo aceitar o tipo A em "elementos" (pedido ao núcleo no mesmo arquivo);
-- enquanto isso as fichas por ambiente já podem ser cadastradas, sem efeito na estrutura.

alter table public.fichas_modelo drop constraint fichas_modelo_aplica_a_check;
alter table public.fichas_modelo add constraint fichas_modelo_aplica_a_check
  check (cardinality(aplica_a) >= 1 and aplica_a <@ array['P', 'V', 'L', 'A']);

comment on column public.fichas_modelo.aplica_a is
  'Tipos de local a que a ficha se aplica: P pilar, V viga, L laje, A ambiente.';
