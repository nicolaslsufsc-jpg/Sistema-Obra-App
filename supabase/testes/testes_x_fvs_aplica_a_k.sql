-- =====================================================================
-- Testes da ficha que vale por bloco de fundação (fichas_modelo.aplica_a com K,
-- 20261123180000_fvs_aplica_a_k.sql). Roda depois de testes_nucleo.sql (usa a obra 1 e o Térreo de lá).
-- Obra fictícia, nomes da EXE. Tudo numa transação desfeita no fim: os outros testes não veem nada daqui.
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

begin;

insert into public.elementos (id, obra_id, pavimento_id, tipo, nome, secao, usuario_id, dispositivo_id, criado_em_dispositivo) values
  ('fb200000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
   'K', 'BL-P1', 'BL-04', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now());
select teste.ok((select count(*) from public.elementos where id = 'fb200000-0000-0000-0000-000000000001') = 1,
  'elementos: bloco de fundação (K) entra como local');

insert into public.fichas_modelo (id, obra_id, codigo, titulo, revisao, aplica_a, itens, origem, usuario_id, dispositivo_id, criado_em_dispositivo)
values ('fb300000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'TESTE-PVS-BLOCO-K',
        'Blocos de fundação (ficha de teste)', '0', '{K}', '[{"n":1,"etapa":"INÍCIO","titulo":"Arrasamento das estacas"}]',
        'teste', '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select aplica_a from public.fichas_modelo where codigo = 'TESTE-PVS-BLOCO-K') = '{K}',
  'fichas_modelo: a ficha de blocos vale por bloco (K)');
select teste.ok((select count(*) from public.fichas_modelo where id = 'fb300000-0000-0000-0000-000000000001' and aplica_a <@ array['P', 'V', 'L', 'A', 'M', 'K']) = 1,
  'fichas_modelo: os tipos de antes continuam valendo junto com o K');
-- 24/11 (20261124100000_fvs_aplica_a_s.sql, planta de estacas): a ficha também pode valer por estaca (S)
insert into public.fichas_modelo (id, obra_id, codigo, titulo, revisao, aplica_a, itens, origem, usuario_id, dispositivo_id, criado_em_dispositivo)
values ('fb300000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'TESTE-PVS-ESTACA-S',
        'Estacas (ficha de teste)', '0', '{S}', '[{"n":1,"etapa":"INÍCIO","titulo":"Locação da estaca"}]',
        'teste', '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select aplica_a from public.fichas_modelo where codigo = 'TESTE-PVS-ESTACA-S') = '{S}',
  'fichas_modelo: a ficha de estaca vale por estaca (S)');
select teste.deve_falhar($$
  insert into public.fichas_modelo (obra_id, codigo, titulo, aplica_a, itens, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'TESTE-PVS-Z', 'Tipo que não existe', '{Z}', '[{"n":1,"titulo":"a"}]',
          '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fichas_modelo: aplica_a fora de P, V, L, A, M, K e S é recusado');

rollback;

\echo 'testes_x_fvs_aplica_a_k: ok'
