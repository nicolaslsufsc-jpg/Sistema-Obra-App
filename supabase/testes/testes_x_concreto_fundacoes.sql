-- =====================================================================
-- Testes da migração dos tipos S (estaca) e K (bloco) em elementos (20261122180000_nucleo_elementos_s_k.sql).
-- Roda depois de testes_nucleo.sql (usa a obra 1 e o Térreo de lá). Obra fictícia EXE.
-- Tudo numa transação desfeita no fim: os outros testes não veem nada daqui.
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

begin;

insert into public.elementos (id, obra_id, pavimento_id, tipo, nome, secao, usuario_id, dispositivo_id, criado_em_dispositivo) values
  ('fc000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
   'S', 'E-P1.A', null, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now()),
  ('fc000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
   'K', 'BL-P1', null, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now());
select teste.ok(
  (select count(*) from public.elementos where id::text like 'fc000000-%' and tipo in ('S', 'K')) = 2,
  'elementos: estaca (S) e bloco (K) entram como peça');

select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 's', 'E-P2.A',
          '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'elementos: tipo s em minúscula é recusado');
select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'X', 'X-1',
          '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'elementos: tipo fora da lista continua recusado');
select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'K', 'BL-P1',
          '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'elementos: o mesmo bloco duas vezes no pavimento é recusado');

rollback;

\echo 'testes_x_concreto_fundacoes: ok'
