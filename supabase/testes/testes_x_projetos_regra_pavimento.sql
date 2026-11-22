-- =====================================================================
-- Testes da regra por pavimento (20261121160000_projetos_regra_pavimento.sql).
-- Roda depois de testes_nucleo.sql (usa as pessoas e obras de lá).
--   ...b1 gestor da obra 1
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

-- sem pavimento: vale para todos (como as regras de antes)
insert into public.distribuicao_destinatarios (id, obra_id, disciplina, empresa, colaborador, desde, dispositivo_id, criado_em_dispositivo)
values ('d5100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'HIDRO', 'Instaladora Pav', 'Lia', '2026-11-21', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select pavimento = '' from public.distribuicao_destinatarios where id = 'd5100000-0000-0000-0000-000000000001'),
  'regra por pavimento: sem pavimento fica vazio (todos)');

-- com pavimento
insert into public.distribuicao_destinatarios (id, obra_id, disciplina, empresa, colaborador, pavimento, copias, desde, dispositivo_id, criado_em_dispositivo)
values ('d5100000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'ESTRUTURAL', 'Instaladora Pav', 'Lia', '2º pavimento', 2, '2026-11-21', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select pavimento = '2º pavimento' and copias = 2 from public.distribuicao_destinatarios where id = 'd5100000-0000-0000-0000-000000000002'),
  'regra por pavimento: guarda o pavimento da regra');

-- nome longo demais recusado (23514 = check_violation)
select teste.deve_falhar($$
  insert into public.distribuicao_destinatarios (id, obra_id, disciplina, empresa, pavimento, desde, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'HIDRO', 'X', repeat('a', 61), '2026-11-21', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'regra por pavimento: nome de pavimento com até 60 letras');
reset role;
