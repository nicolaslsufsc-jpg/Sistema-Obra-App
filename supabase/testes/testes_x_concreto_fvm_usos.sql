-- =====================================================================
-- Testes da migração 20261125120000_concreto_fvm_usos.sql (onde o lote foi usado).
-- Roda depois de testes_nucleo.sql e testes_x_concreto_fvm.sql (usa o recebimento f8...01 de lá).
--   ...b1 gestor da obra 1   ...c1 campo na obra 1   ...d1 leitura na obra 1
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela = 'public.recebimento_usos' and inclusao = 'campo' and alteracao = 'nenhuma') = 1,
  'fvm usos: o campo registra, só de inclusão');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.recebimento_usos (id, obra_id, recebimento_id, pavimento_id, elemento_id, local_texto, quantidade, data,
                                     dispositivo_id, criado_em_dispositivo)
values ('f9000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'f8000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001', null, 'Pilares do eixo 3', 800, '2026-11-21',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.recebimento_usos) = 1, 'fvm usos: o campo marca onde o lote foi usado');
select teste.deve_falhar($$update public.recebimento_usos set local_texto = 'outro' where id = 'f9000000-0000-0000-0000-000000000001'$$, '42501',
  'fvm usos: não se altera, só se corrige com linha nova');

-- desfazer = linha nova cancelada que substitui a anterior
insert into public.recebimento_usos (id, obra_id, recebimento_id, pavimento_id, local_texto, quantidade, data, substitui_id, cancelado,
                                     dispositivo_id, criado_em_dispositivo)
values ('f9000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'f8000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001', 'Pilares do eixo 3', 800, '2026-11-21', 'f9000000-0000-0000-0000-000000000001', true,
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.recebimento_usos) = 2, 'fvm usos: desfazer é uma correção cancelada');

-- local de outra obra não serve (pavimento da obra 2)
select teste.deve_falhar($$
  insert into public.recebimento_usos (id, obra_id, recebimento_id, pavimento_id, data, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'f8000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000002', '2026-11-21', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'fvm usos: pavimento de outra obra é recusado');

-- quantidade só positiva
select teste.deve_falhar($$
  insert into public.recebimento_usos (id, obra_id, recebimento_id, pavimento_id, quantidade, data, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'f8000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000001', 0, '2026-11-21', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvm usos: quantidade zero é recusada');

-- quem só lê não marca uso
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.deve_falhar($$
  insert into public.recebimento_usos (id, obra_id, recebimento_id, pavimento_id, data, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'f8000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000001', '2026-11-21', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvm usos: leitura não marca uso');
reset role;

create temporary table niveis as select * from public.tabelas_para_exportar();
select teste.ok((select count(*) from niveis where tabela = 'public.recebimento_usos') = 1, 'fvm usos: a tabela entra na exportação');
drop table niveis;

\echo 'TESTES DOS USOS DO FVM PASSARAM'
