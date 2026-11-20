-- =====================================================================
-- Testes da migração do FVM (20261120120000_concreto_fvm.sql): recebimento de materiais.
-- Roda depois de testes_nucleo.sql (usa as pessoas e obras de lá).
--   ...b1 gestor da obra 1   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where (tabela = 'public.materiais_controlados' and inclusao = 'gestor' and alteracao = 'nenhuma')
      or (tabela = 'public.recebimentos' and inclusao = 'campo' and alteracao = 'nenhuma')) = 2,
  'fvm: lista é do gestor, recebimento é do campo, as duas só de inclusão');

-- ---------------------------------------------------------------------
-- decisão 2: o gestor importa a lista; o campo não mexe nela
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.materiais_controlados (id, obra_id, codigo, nome, unidade, estrutural, exige_ensaio, itens, documentos, ordem, via,
                                          dispositivo_id, criado_em_dispositivo)
values ('f7000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ACO', 'Aço CA-50', 'kg', true, false,
        '[{"codigo":"1","texto":"Bitola conforme pedido"},{"codigo":"2","texto":"Comprimento da barra (m)","valor":{"min":11.9,"max":12.1}}]',
        '["Certificado do lote"]', 0, null, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
       ('f7000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'BLOCO', 'Bloco estrutural', 'un', true, true,
        '[{"codigo":"1","texto":"Dimensões"}]', '[]', 1, null, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
       ('f7000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'CONCRETO', 'Concreto usinado', 'm³', true, false,
        '[]', '[]', 2, 'concreto', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.materiais_controlados) = 3, 'fvm: gestor importa a lista de materiais');
select teste.deve_falhar($$update public.materiais_controlados set via = null where codigo = 'CONCRETO'$$, '42501',
  'fvm: lista de materiais não é alterada, só corrigida com linha nova');
reset role;

select teste.deve_falhar($$
  insert into public.materiais_controlados (id, obra_id, codigo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'AREIA', 'Areia',
          '00000000-0000-0000-0000-0000000000b1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvm: material sem itens de conferência (e sem via) é recusado');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.deve_falhar($$
  insert into public.materiais_controlados (id, obra_id, codigo, nome, itens, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'AREIA', 'Areia', '[{"codigo":"1","texto":"Limpa"}]',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvm: campo não mexe na lista de materiais');

-- ---------------------------------------------------------------------
-- o campo registra o recebimento
-- ---------------------------------------------------------------------
insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal, lote,
                                 quantidade, itens, documentos, situacao, dispositivo_id, criado_em_dispositivo)
values ('f8000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ACO', 'Aço CA-50', 'kg',
        '2026-11-20', 'Fornecedor Exemplo', '123456', 'L-01', 2500,
        '[{"codigo":"1","texto":"Bitola conforme pedido","resultado":"C","valor":null,"observacao":null}]',
        '[{"nome":"Certificado do lote","veio":true}]', 'liberado', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.recebimentos) = 1, 'fvm: campo registra o recebimento liberado');

-- material com ensaio entra retido, com o motivo
insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal, lote,
                                 quantidade, situacao, motivo, dispositivo_id, criado_em_dispositivo)
values ('f8000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'BLOCO', 'Bloco estrutural', 'un',
        '2026-11-20', 'Fornecedor Exemplo', '123457', 'L-07', 3000, 'retido', 'Aguardando o ensaio do lote',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());

-- decisão 4: liberado com ressalva (e qualquer situação fora de "liberado") exige o texto
select teste.deve_falhar($$
  insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal,
                                   quantidade, situacao, motivo, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'ACO', 'Aço CA-50', 'kg', '2026-11-20',
          'Fornecedor Exemplo', '123458', 10, 'liberado_ressalva', '  ', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvm: liberado com ressalva sem escrever a ressalva é recusado');
select teste.deve_falhar($$
  insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal,
                                   quantidade, situacao, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'ACO', 'Aço CA-50', 'kg', '2026-11-20',
          'Fornecedor Exemplo', '123459', 10, 'retido', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvm: retido sem motivo é recusado');
select teste.deve_falhar($$
  insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal,
                                   quantidade, situacao, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'ACO', 'Aço CA-50', 'kg', '2026-11-20',
          'Fornecedor Exemplo', '123460', 10, 'aprovado', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvm: situação fora da lista é recusada');
select teste.deve_falhar($$
  insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal,
                                   quantidade, situacao, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'ACO', 'Aço CA-50', 'kg', '2026-11-20',
          'Fornecedor Exemplo', '123461', 0, 'liberado', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvm: quantidade zero é recusada');

-- decisão 5: o campo não tira do retido
select teste.deve_falhar($$
  insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal, lote,
                                   quantidade, situacao, motivo, liberado_por, liberado_em, substitui_id,
                                   dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'BLOCO', 'Bloco estrutural', 'un', '2026-11-20',
          'Fornecedor Exemplo', '123457', 'L-07', 3000, 'liberado', 'Ensaio aprovado',
          '00000000-0000-0000-0000-0000000000c1', now(), 'f8000000-0000-0000-0000-000000000002',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvm: campo não tira material do retido');

-- mas o campo pode corrigir o retido mantendo retido (ex.: errou a nota) ou cancelar
insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal, lote,
                                 quantidade, situacao, motivo, substitui_id, dispositivo_id, criado_em_dispositivo)
values ('f8000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'BLOCO', 'Bloco estrutural', 'un',
        '2026-11-20', 'Fornecedor Exemplo', '123499', 'L-07', 3000, 'retido', 'Aguardando o ensaio do lote',
        'f8000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.recebimentos where situacao = 'retido') = 2,
  'fvm: campo corrige um retido que continua retido');

select teste.deve_falhar($$update public.recebimentos set situacao = 'liberado'$$, '42501',
  'fvm: recebimento não é alterado');
reset role;

-- ---------------------------------------------------------------------
-- o gestor tira do retido, e fica registrado quem foi
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select teste.deve_falhar($$
  insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal, lote,
                                   quantidade, situacao, motivo, liberado_por, liberado_em, substitui_id,
                                   dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'BLOCO', 'Bloco estrutural', 'un', '2026-11-20',
          'Fornecedor Exemplo', '123499', 'L-07', 3000, 'liberado', 'Ensaio aprovado',
          '00000000-0000-0000-0000-0000000000c1', now(), 'f8000000-0000-0000-0000-000000000003',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvm: quem libera é quem grava (liberado_por)');
insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal, lote,
                                 quantidade, situacao, motivo, liberado_por, liberado_em, substitui_id,
                                 dispositivo_id, criado_em_dispositivo)
values ('f8000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'BLOCO', 'Bloco estrutural', 'un',
        '2026-11-20', 'Fornecedor Exemplo', '123499', 'L-07', 3000, 'liberado', 'Ensaio do lote aprovado',
        '00000000-0000-0000-0000-0000000000b1', now(), 'f8000000-0000-0000-0000-000000000003',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok(
  (select liberado_por = '00000000-0000-0000-0000-0000000000b1' from public.recebimentos
   where id = 'f8000000-0000-0000-0000-000000000004'),
  'fvm: gestor tira do retido e fica como quem liberou');
reset role;

-- ---------------------------------------------------------------------
-- leitura só lê; quem não tem acesso não vê nada
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.recebimentos) = 4, 'fvm: leitura vê os recebimentos da obra');
select teste.deve_falhar($$
  insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal,
                                   quantidade, situacao, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'ACO', 'Aço CA-50', 'kg', '2026-11-20',
          'Fornecedor Exemplo', '123462', 10, 'liberado', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvm: leitura não registra recebimento');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok(
  (select count(*) from public.materiais_controlados) + (select count(*) from public.recebimentos) = 0,
  'fvm: sem acesso à obra não vê nada');
reset role;

-- ---------------------------------------------------------------------
-- restaurar.sql (dono do banco): a correção pode vir antes da linha corrigida
-- ---------------------------------------------------------------------
begin;
insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal,
                                 quantidade, situacao, motivo, liberado_por, liberado_em, substitui_id,
                                 usuario_id, dispositivo_id, criado_em_dispositivo)
values ('f8000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111', 'BLOCO', 'Bloco estrutural', 'un',
        '2026-11-19', 'Fornecedor Exemplo', '777', 50, 'liberado', 'Ensaio aprovado',
        '00000000-0000-0000-0000-0000000000b1', now(), 'f8000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', now());
insert into public.recebimentos (id, obra_id, material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal,
                                 quantidade, situacao, motivo, usuario_id, dispositivo_id, criado_em_dispositivo)
values ('f8000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'BLOCO', 'Bloco estrutural', 'un',
        '2026-11-19', 'Fornecedor Exemplo', '777', 50, 'retido', 'Aguardando ensaio',
        '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', now());
commit;
select teste.ok((select count(*) from public.recebimentos where nota_fiscal = '777') = 2,
  'fvm: correção carregada antes da linha corrigida é aceita no fim da transação');

-- ---------------------------------------------------------------------
-- exportação: as tabelas do FVM entram (só apontam para obras e perfis)
-- ---------------------------------------------------------------------
create temporary table niveis as select * from public.tabelas_para_exportar();
select teste.ok(
  (select count(*) from niveis where tabela in ('public.materiais_controlados', 'public.recebimentos')) = 2,
  'fvm: as duas tabelas entram na exportação');
drop table niveis;

\echo 'TESTES DO FVM PASSARAM'
