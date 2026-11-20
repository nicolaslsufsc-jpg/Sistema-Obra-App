-- =====================================================================
-- Testes da lista mestra do Documentos com conta (20261120150000_documentos.sql).
-- Roda depois de testes_nucleo.sql (usa as pessoas e obras de lá).
--   ...b1 gestor da obra 1 (leitura na obra 2)   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela = 'public.doc_documentos' and inclusao = 'gestor' and alteracao = 'nenhuma') = 1,
  'documentos: registrada no núcleo, gestor inclui, ninguém altera');

-- ---------------------------------------------------------------------
-- gestor (b1) cadastra na obra 1: o PDF (núcleo) e a revisão que aponta para ele
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

insert into public.arquivos (id, obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
values ('d6f00000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111/documentos/d6f00000-0000-0000-0000-000000000001.pdf', 'EXE-PES-01_rev00.pdf',
        repeat('a', 64), 1000, 'application/pdf', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());

insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, validade, responsavel, arquivo_id, dispositivo_id, criado_em_dispositivo)
values
  ('d6000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'empresa', 'pes', 'EXE-PES-01', 'Execução de alvenaria', '00',
   '2026-11-01', null, 'Engenheira da qualidade', 'd6f00000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('d6000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'obra', 'controle_tecnologico', 'EXE-PCT', 'Plano de controle tecnológico', 'A',
   '2026-11-02', '2027-11-02', 'Engenheiro da obra', null, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.doc_documentos) = 2, 'documentos: gestor cadastra (com e sem arquivo)');

-- marcar "em revisão" = linha nova que substitui a anterior; a antiga continua guardada
insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, responsavel, situacao, arquivo_id, substitui_id, dispositivo_id, criado_em_dispositivo)
values ('d6000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'empresa', 'pes', 'EXE-PES-01', 'Execução de alvenaria', '00',
        '2026-11-01', 'Engenheira da qualidade', 'em_revisao', 'd6f00000-0000-0000-0000-000000000001',
        'd6000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.doc_documentos) = 3, 'documentos: nada se apaga (3 linhas)');

-- a mesma linha não pode ser substituída duas vezes (23505 = unique_violation; 20261120160000)
select teste.deve_falhar($$
  insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, responsavel, situacao, substitui_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'empresa', 'pes', 'EXE-PES-01', 'Execução de alvenaria', '00',
          '2026-11-01', 'Engenheira da qualidade', 'vigente', 'd6000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'documentos: a mesma revisão não é substituída duas vezes');

-- formatos recusados (23514 = check_violation)
select teste.deve_falhar($$
  insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, responsavel, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'setor', 'pes', 'X', 'X', '00', '2026-11-01', 'X', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'documentos: escopo só empresa ou obra');
select teste.deve_falhar($$
  insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, responsavel, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'obra', 'pes', '   ', 'X', '00', '2026-11-01', 'X', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'documentos: código vazio recusado');
select teste.deve_falhar($$
  insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, responsavel, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'obra', 'pes', repeat('X', 41), 'X', '00', '2026-11-01', 'X', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'documentos: código com até 40 letras');
select teste.deve_falhar($$
  insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, validade, responsavel, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'obra', 'pes', 'X', 'X', '00', '2026-11-01', '2026-10-01', 'X', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'documentos: validade antes da data da revisão recusada');
select teste.deve_falhar($$
  insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, responsavel, situacao, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'obra', 'pes', 'X', 'X', '00', '2026-11-01', 'X', 'obsoleto', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'documentos: obsoleto não se grava (é calculado)');
select teste.deve_falhar($$
  insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, responsavel, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'obra', 'Execução', 'X', 'X', '00', '2026-11-01', 'X', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'documentos: categoria é o código da lista do app');

-- referências da mesma obra (23503 = foreign_key_violation)
select teste.deve_falhar($$
  insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, responsavel, arquivo_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'obra', 'pes', 'X', 'X', '00', '2026-11-01', 'X',
          'd6f00000-0000-0000-0000-0000000000ff', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'documentos: arquivo que não existe recusado');
-- (substitui_id de outra linha que não existe: a chave é conferida no fim da transação, como no Concreto)

-- só inclusão: nem o gestor altera (sem privilégio de update pela API)
select teste.deve_falhar($$update public.doc_documentos set titulo = 'Outro'$$, '42501',
  'documentos: ninguém altera uma linha (só inclui outra)');
-- gestor da obra 1 é só leitura na obra 2: não cadastra lá
select teste.deve_falhar($$
  insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, responsavel, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'obra', 'pes', 'X', 'X', '00', '2026-11-01', 'X', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'documentos: quem é só leitura na obra não cadastra');
reset role;

-- ---------------------------------------------------------------------
-- campo (c1) e leitura (d1) leem, não cadastram; sem acesso (e1) não vê
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.ok((select count(*) from public.doc_documentos) = 3, 'documentos: campo lê a lista');
select teste.deve_falhar($$
  insert into public.doc_documentos (id, obra_id, escopo, categoria, codigo, titulo, revisao, data_revisao, responsavel, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'obra', 'pes', 'X', 'X', '00', '2026-11-01', 'X', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'documentos: campo não cadastra');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.doc_documentos) = 3, 'documentos: leitura lê a lista');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.doc_documentos) = 0, 'documentos: quem não tem acesso não vê nada');
reset role;
