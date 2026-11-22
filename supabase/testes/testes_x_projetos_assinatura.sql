-- =====================================================================
-- Testes da assinatura na entrega (20261121140000_projetos_assinatura_entrega.sql).
-- Roda depois de testes_nucleo.sql e testes_projetos.sql (usa as obras, pessoas,
-- empresas, documentos e revisões de lá).
--   ...c1 campo na obra 1   ...d1 leitura na obra 1
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- arquivo de outra obra, para provar que a assinatura não cruza de obra
insert into public.arquivos (id, obra_id, caminho, nome_original, hash, tamanho, tipo, usuario_id, dispositivo_id, criado_em_dispositivo)
values ('f5100000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
        '22222222-2222-2222-2222-222222222222/projetos/assinatura-outra.png', 'assinatura.png', repeat('c', 64), 900,
        'image/png', '00000000-0000-0000-0000-0000000000b1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

-- campo guarda a assinatura (PNG) e registra uma entrega de duas pranchas com ela
insert into public.arquivos (id, obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
values ('f5100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111/projetos/assinatura-1.png', 'assinatura.png', repeat('b', 64), 1200,
        'image/png', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, colaborador, documento_id, revisao_id, data_evento, assinatura_id, dispositivo_id, criado_em_dispositivo) values
  ('f5000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000001', 'João',
   'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', '2026-11-21', 'f5100000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('f5000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000001', 'João',
   'd1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', '2026-11-21', 'f5100000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok(
  (select count(*) from public.distribuicao_eventos where assinatura_id = 'f5100000-0000-0000-0000-000000000001') = 2,
  'assinatura: uma assinatura vale para as duas pranchas da mesma entrega');

-- sem assinatura continua valendo (opcional)
select teste.ok(
  (select count(*) from public.distribuicao_eventos where assinatura_id is null) > 0,
  'assinatura: entrega sem assinatura continua aceita');

-- assinatura que não existe, ou de outra obra (23503 = foreign_key_violation)
select teste.deve_falhar($$
  insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, data_evento, assinatura_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000001',
          'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', '2026-11-21', gen_random_uuid(), 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'assinatura: id que não está em arquivos é recusado');
select teste.deve_falhar($$
  insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, data_evento, assinatura_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000001',
          'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', '2026-11-21', 'f5100000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'assinatura: arquivo de outra obra é recusado');

-- a assinatura não é trocada depois (evento só inclusão)
select teste.deve_falhar($$update public.distribuicao_eventos set assinatura_id = null where id = 'f5000000-0000-0000-0000-000000000001'$$, '42501',
  'assinatura: não se troca a assinatura de uma entrega');
reset role;
