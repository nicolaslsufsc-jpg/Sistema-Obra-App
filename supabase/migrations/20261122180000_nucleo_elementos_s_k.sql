-- =====================================================================
-- MEXE NO NÚCLEO (tabela elementos): só aplicar no Supabase com o "pode" do Nicolas
-- (aprovado em 22/11/2026, pelo Professor: "pode realizar"). Frente 04 · Concreto.
--
-- Fundações no Concreto: dois tipos novos de peça, sem desenho na planta de forma:
--   S  estaca ("E-P72.A")
--   K  bloco de fundação ("BL-P36")
-- O caminhão do lote liga a estaca ou o bloco à mão (caminhao_elementos, origem 'manual').
-- Só acrescenta dois valores ao CHECK: nada é apagado nem alterado. fichas_modelo.aplica_a não muda
-- (a FVS não confere estaca nem bloco por enquanto).
--
-- docs/02_CONTRATO_NUCLEO.md, linha de "elementos": tipos P/V/L/A/F/E/M/S/K (atualizado junto, 23/11).
-- junto com a aplicação (fica para quem aplica, com o Nicolas sabendo).
-- =====================================================================

begin;

alter table public.elementos drop constraint elementos_tipo_check;
alter table public.elementos add constraint elementos_tipo_check
  check (tipo in ('P', 'V', 'L', 'A', 'F', 'E', 'M', 'S', 'K'));

comment on column public.elementos.tipo is
  'P pilar, V viga, L laje, A ambiente (cômodo), F furo de viga, E esquadria do ambiente (porta ou janela), M parede de alvenaria (modulação), S estaca, K bloco de fundação.';

commit;
