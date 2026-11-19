-- =====================================================================
-- Testa o MODELO de migração de módulo (supabase/modelos/tabela_de_modulo.sql) e serve de
-- exemplo de teste para as sessões de módulo. Roda por último (mesmo banco dos outros testes).
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

\ir ../modelos/tabela_de_modulo.sql

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas where tabela in ('public.exemplo_fichas', 'public.exemplo_eventos')) = 2,
  'modelo: as duas tabelas do módulo ficam registradas no núcleo');

select id as elemento from public.elementos
where obra_id = '11111111-1111-1111-1111-111111111111' and not apagado limit 1 \gset

-- b1 (gestor da obra 1) cadastra a ficha
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.exemplo_fichas (id, obra_id, titulo, dispositivo_id, criado_em_dispositivo)
values ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ficha de pilar',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
reset role;

-- c1 (campo na obra 1) registra o evento, não cadastra ficha e não altera evento
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.exemplo_eventos (id, obra_id, elemento_id, ficha_id, resultado, dispositivo_id, criado_em_dispositivo)
values ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', :'elemento',
        'f1000000-0000-0000-0000-000000000001', 'NC', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.exemplo_eventos) = 1, 'modelo: campo registra evento');
select teste.deve_falhar($$
  insert into public.exemplo_fichas (obra_id, titulo, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'x', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'modelo: campo não cadastra ficha');
select teste.deve_falhar($$update public.exemplo_eventos set resultado = 'C'$$, '42501',
  'modelo: evento não é alterado');
reset role;

-- a referência tem que ser da mesma obra (chave composta)
select teste.deve_falhar(format($f$
  insert into public.exemplo_eventos (id, obra_id, elemento_id, ficha_id, resultado, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', %L,
          'f1000000-0000-0000-0000-000000000001', 'C', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$f$, :'elemento'), '23503', 'modelo: evento não aponta para elemento ou ficha de outra obra');

-- a exportação põe a tabela de evento depois das que ela referencia
select teste.ok(
  (select nivel from public.tabelas_para_exportar() where tabela = 'public.exemplo_eventos')
  > greatest(
      (select nivel from public.tabelas_para_exportar() where tabela = 'public.exemplo_fichas'),
      (select nivel from public.tabelas_para_exportar() where tabela = 'public.elementos'),
      (select nivel from public.tabelas_para_exportar() where tabela = 'public.arquivos')),
  'modelo: exportação restaura o evento depois de ficha, elemento e arquivo');

\echo 'TESTES DO MODELO DE MÓDULO PASSARAM'
