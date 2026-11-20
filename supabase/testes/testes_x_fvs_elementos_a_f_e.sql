-- =====================================================================
-- Testes da migração dos tipos A, F e E em elementos (20261119130000_nucleo_elementos_a_f_e.sql).
-- Roda depois de testes_nucleo.sql (usa a obra 1 e o Térreo de lá). Obra fictícia, nomes da EXE.
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- ambiente, furo e esquadria entram como local (criados como postgres, como pelo publicador de planta)
insert into public.elementos (id, obra_id, pavimento_id, tipo, nome, secao, usuario_id, dispositivo_id, criado_em_dispositivo) values
  ('fa000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
   'A', '101-01', '9,0 m²', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now()),
  ('fa000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
   'A', '101-02', '9,0 m²', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now()),
  ('fa000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
   'F', 'V900-F1', null, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now()),
  -- a porta entre os dois quartos: um elemento de cada lado
  ('fa000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
   'E', '101-01-PM80', 'PM80', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now()),
  ('fa000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
   'E', '101-02-PM80', 'PM80', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now());
select teste.ok(
  (select count(*) from public.elementos where id::text like 'fa000000-%' and tipo in ('A', 'F', 'E')) = 5,
  'elementos: ambiente (A), furo (F) e esquadria (E) entram como local');

select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'X', 'X1',
          '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'elementos: tipo fora de P, V, L, A, F e E é recusado');
select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'e', '101-01-PM70',
          '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'elementos: tipo em minúscula é recusado');
select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'E', '101-01 PM80',
          '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'elementos: nome de esquadria continua sem espaço');
select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'E', '101-01-PM80',
          '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'elementos: a mesma esquadria duas vezes no pavimento é recusada');

-- o mesmo nome em tipo diferente é outro local (o único é por pavimento, tipo e nome)
insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'E', '101-01',
        '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.elementos where nome = '101-01' and not apagado) = 2,
  'elementos: ambiente e esquadria com o mesmo nome são locais diferentes');

select teste.ok(
  (select pg_get_constraintdef(oid) like '%''E''%' from pg_constraint where conname = 'elementos_tipo_check'),
  'elementos: a regra do tipo cita o E');

\echo 'testes_x_fvs_elementos_a_f_e: ok'
