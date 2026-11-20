-- =====================================================================
-- Testes da lista de distribuição do Projetos (20261120130000_projetos_destinatarios.sql).
-- Roda depois de testes_nucleo.sql (usa as pessoas e obras de lá).
--   ...b1 gestor da obra 1   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela = 'public.distribuicao_destinatarios' and inclusao = 'gestor' and alteracao = 'nenhuma') = 1,
  'destinatarios: registrada no núcleo, gestor inclui, ninguém altera');

-- ---------------------------------------------------------------------
-- gestor (b1) monta a lista da obra 1
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

insert into public.distribuicao_destinatarios (id, obra_id, disciplina, pasta, empresa, colaborador, copias, desde, dispositivo_id, criado_em_dispositivo)
values
  ('d5000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ESTRUTURAL', '', 'Empreiteira Alfa', 'João', 1, '2026-11-20', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('d5000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'ESTRUTURAL', 'LO/Pilares', 'Formas Delta', 'Ana', 2, '2026-11-20', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('d5000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'HIDRO', '', 'Hidráulica Beta', '', 1, '2026-11-20', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.destinatarios_vigentes) = 3, 'destinatarios: gestor monta a lista (disciplina inteira, pasta, empresa toda)');

-- desativar = linha nova que substitui a anterior; a antiga continua guardada
insert into public.distribuicao_destinatarios (id, obra_id, disciplina, pasta, empresa, colaborador, copias, ativo, desde, substitui_id, dispositivo_id, criado_em_dispositivo)
values ('d5000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'HIDRO', '', 'Hidráulica Beta', '', 1, false, '2026-11-20',
        'd5000000-0000-0000-0000-000000000003', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.distribuicao_destinatarios) = 4, 'destinatarios: nada se apaga (4 linhas)');
select teste.ok((select count(*) from public.destinatarios_vigentes) = 3, 'destinatarios: vale a última de cada cadeia (3 regras)');
select teste.ok((select not ativo from public.destinatarios_vigentes where empresa = 'Hidráulica Beta'), 'destinatarios: a Beta está desativada');

-- a mesma linha não pode ser substituída duas vezes (23505 = unique_violation)
select teste.deve_falhar($$
  insert into public.distribuicao_destinatarios (id, obra_id, disciplina, empresa, desde, substitui_id, dispositivo_id, criado_em_dispositivo)
  values ('d5000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'HIDRO', 'Hidráulica Beta', '2026-11-20',
          'd5000000-0000-0000-0000-000000000003', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'destinatarios: a mesma regra não é substituída duas vezes');

-- formatos recusados (23514 = check_violation)
select teste.deve_falhar($$
  insert into public.distribuicao_destinatarios (id, obra_id, disciplina, empresa, desde, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Estrutural', 'X', '2026-11-20', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'destinatarios: disciplina sem acento e em maiúscula');
select teste.deve_falhar($$
  insert into public.distribuicao_destinatarios (id, obra_id, disciplina, empresa, desde, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'HIDRO', '  ', '2026-11-20', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'destinatarios: empresa vazia recusada');
select teste.deve_falhar($$
  insert into public.distribuicao_destinatarios (id, obra_id, disciplina, empresa, copias, desde, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'HIDRO', 'X', 0, '2026-11-20', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'destinatarios: cópias de 1 para cima');

-- só inclusão: nem o gestor altera (sem privilégio de update pela API)
select teste.deve_falhar($$update public.distribuicao_destinatarios set copias = 3$$, '42501',
  'destinatarios: ninguém altera uma linha (só inclui outra)');
reset role;

-- ---------------------------------------------------------------------
-- campo (c1) e leitura (d1) leem, não incluem; sem acesso (e1) não vê
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.ok((select count(*) from public.destinatarios_vigentes) = 3, 'destinatarios: campo lê a lista');
select teste.deve_falhar($$
  insert into public.distribuicao_destinatarios (id, obra_id, disciplina, empresa, desde, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'HIDRO', 'X', '2026-11-20', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'destinatarios: campo não muda a lista');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.distribuicao_destinatarios) = 4, 'destinatarios: leitura lê a lista');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.destinatarios_vigentes) = 0, 'destinatarios: quem não tem acesso não vê nada');
reset role;
