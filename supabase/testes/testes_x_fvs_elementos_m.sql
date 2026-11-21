-- =====================================================================
-- Testes da migração do tipo M (parede de alvenaria) em elementos e em fichas_modelo.aplica_a
-- (20261120200000_nucleo_elementos_m.sql). Roda depois de testes_nucleo.sql (usa a obra 1 e o Térreo de lá).
-- Obra fictícia, nomes da EXE. Tudo numa transação desfeita no fim: os outros testes não veem nada daqui.
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

begin;

insert into public.elementos (id, obra_id, pavimento_id, tipo, nome, secao, usuario_id, dispositivo_id, criado_em_dispositivo) values
  ('fb000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
   'M', '101-M01', '3,45 m · 14 cm', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now()),
  ('fb000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
   'M', 'AC-M01', '6,10 m · 19 cm', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now());
select teste.ok(
  (select count(*) from public.elementos where id::text like 'fb000000-%' and tipo = 'M') = 2,
  'elementos: parede de alvenaria (M) entra como local');

select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'm', '101-M02',
          '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'elementos: tipo m em minúscula é recusado');
select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'M', '101-M01',
          '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'elementos: a mesma parede duas vezes no pavimento é recusada');

insert into public.fichas_modelo (id, obra_id, codigo, titulo, revisao, aplica_a, itens, origem, dispositivo_id, criado_em_dispositivo)
values ('fb100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'TESTE-PVS-ALV-M',
        'Alvenaria (ficha de teste)', '0', '{A,M}', '[{"n":1,"etapa":"MARCAÇÃO","titulo":"Primeira fiada"}]',
        'teste', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select aplica_a from public.fichas_modelo where codigo = 'TESTE-PVS-ALV-M') = '{A,M}',
  'fichas_modelo: a ficha de alvenaria vale por ambiente e por parede (A e M)');
select teste.deve_falhar($$
  insert into public.fichas_modelo (obra_id, codigo, titulo, aplica_a, itens, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'TESTE-PVS-X', 'Tipo errado', '{X}', '[{"n":1,"titulo":"a"}]',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fichas_modelo: aplica_a fora de P, V, L, A e M é recusado');

rollback;

\echo 'testes_x_fvs_elementos_m: ok'
