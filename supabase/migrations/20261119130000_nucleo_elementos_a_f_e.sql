-- =====================================================================
-- MEXE NO NÚCLEO (tabela elementos): só aplicar no Supabase com o "pode" do Nicolas.
-- Proposta da frente FVS ambientes (19/11/2026), pelo Professor. A frente 01 (núcleo) revisa.
--
-- Os locais de inspeção da FVS passam a ter mais três tipos, numa migração só (decisão do Nicolas, 18/11):
--   A  ambiente (cômodo da planta de arquitetura: "303-05")          pipeline/fvs/ambientes.py
--   F  furo de viga (passagem de instalação: "V12-F1")               pipeline/fvs/furos.py
--   E  esquadria do ambiente (porta ou janela: "303-05-PM80")        pipeline/fvs/esquadrias.py
-- Até aqui só P pilar, V viga e L laje. Sem esta migração o app já marca A, F e E na bancada e no
-- aparelho (registro local), mas a planta com eles não pode ser publicada: o servidor recusa o elemento.
--
-- Muda só a regra do tipo. Nome sem espaço e único por (pavimento, tipo, nome) continuam: a porta entre
-- dois cômodos são dois elementos (303-05-PM80 e 303-04-PM80), um de cada lado.
-- A ligação do filho com o pai (furo → viga, esquadria → ambiente) fica no pacote da planta
-- (manifest.json), não no banco: o banco guarda o local e os registros dele, como para P, V e L.
--
-- Também: fichas_modelo.aplica_a continua P, V, L e A. Furo e esquadria não têm ficha própria: marcam
-- itens da ficha do pai ("furos": true na de viga, "esquadrias": true na de ambiente).
--
-- docs/02_CONTRATO_NUCLEO.md, linha de "elementos": trocar "tipo P/V/L" por "tipo P/V/L/A/F/E" junto com
-- a aplicação (fica para quem aplica, com o Nicolas sabendo).
-- =====================================================================

begin;

alter table public.elementos drop constraint elementos_tipo_check;
alter table public.elementos add constraint elementos_tipo_check
  check (tipo in ('P', 'V', 'L', 'A', 'F', 'E'));

comment on column public.elementos.tipo is
  'P pilar, V viga, L laje, A ambiente (cômodo), F furo de viga, E esquadria do ambiente (porta ou janela).';

commit;
