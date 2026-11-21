-- =====================================================================
-- Testes da migração 20261121130000_sistema_oficial_leitura.sql (locais do sistema oficial,
-- local_id nas verificações e nas fichas abertas, status do concreto e importações).
-- Roda depois de testes_x_fvs.sql e testes_x_concreto.sql (usa a ficha f1..., o pavimento a0... e
-- a concretagem c0... de lá).
--   ...a1 admin   ...b1 gestor da obra 1   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela in ('public.locais_sistema', 'public.importacoes')) = 2,
  'sistema: as duas tabelas novas ficam registradas no núcleo');
select teste.ok(
  (select alteracao = 'nenhuma' from nucleo.tabelas_sincronizadas where tabela = 'public.importacoes'),
  'sistema: importação é só de inclusão');

-- ---------------------------------------------------------------------
-- gestor (b1) publica a árvore de locais, uma ficha aberta num apartamento e a importação
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

insert into public.locais_sistema (id, obra_id, sistema, origem_id, origem_pai_id, nome, nome_completo, nivel,
                                   pavimento_id, dispositivo_id, criado_em_dispositivo)
values ('a5000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'sistema_exemplo', '100', null,
        'Torre', 'Torre', 0, null, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
       ('a5000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'sistema_exemplo', '101', '100',
        'Apto 201', 'Torre \ 2º Pavimento \ Apto 201', 2, 'a0000000-0000-0000-0000-000000000001',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.locais_sistema) = 2, 'sistema: gestor publica os locais');

select teste.deve_falhar($$
  insert into public.locais_sistema (id, obra_id, sistema, origem_id, nome, nome_completo, dispositivo_id, criado_em_dispositivo)
  values ('a5000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'sistema_exemplo', '101',
          'Repetido', 'Repetido', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'sistema: o mesmo local do sistema não entra duas vezes');
select teste.deve_falhar($$
  insert into public.locais_sistema (id, obra_id, sistema, origem_id, nome, nome_completo, dispositivo_id, criado_em_dispositivo)
  values ('a5000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Sistema Exemplo', '9',
          'X', 'X', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'sistema: o id do sistema é minúsculo, sem espaço');

insert into public.fvs_fichas_campo (id, obra_id, ficha_id, codigo, local_construpoint, ficha_codigo, status,
                                     local_id, agendada_em, reinspecao_em, medicao, dispositivo_id, criado_em_dispositivo)
values ('a6000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'f1000000-0000-0000-0000-000000000001', 'FIC-9001', 'Torre \ 2º Pavimento \ Apto 201', 'TESTE-PVS-1',
        'Pendente Reinspeção', 'a5000000-0000-0000-0000-000000000002', '2026-11-10 08:00-03', '2026-11-12 08:00-03',
        'Medição 3', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok(
  (select local_id = 'a5000000-0000-0000-0000-000000000002' and medicao = 'Medição 3' from public.fvs_fichas_campo
   where id = 'a6000000-0000-0000-0000-000000000001'),
  'sistema: ficha aberta num local que não é peça, com agendamento, reinspeção e medição');

-- verificação num local do sistema (o importador publica como gestor)
insert into public.fvs_eventos (id, obra_id, local_id, ficha_id, item, resultado, rodada, ficha_campo_id,
                                verificado_por, origem_id, dispositivo_id, criado_em_dispositivo)
values ('a7000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'a5000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 1, 'C', 1,
        'a6000000-0000-0000-0000-000000000001', 'Pessoa Exemplo', 'sx-1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_eventos where local_id is not null) = 1,
  'sistema: verificação num local do sistema entra');

select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, elemento_id, local_id, ficha_id, item, resultado, rodada, dispositivo_id, criado_em_dispositivo)
  values ('a7000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
          'fe000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002',
          'f1000000-0000-0000-0000-000000000001', 1, 'C', 1, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'sistema: verificação não pode ser de peça e de local ao mesmo tempo');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, ficha_id, item, resultado, rodada, dispositivo_id, criado_em_dispositivo)
  values ('a7000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
          'f1000000-0000-0000-0000-000000000001', 1, 'C', 1, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'sistema: verificação sem peça, área, barra nem local continua recusada');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, local_id, ficha_id, item, resultado, rodada, dispositivo_id, criado_em_dispositivo)
  values ('a7000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
          'a5000000-0000-0000-0000-0000000000ff', 'f1000000-0000-0000-0000-000000000001', 1, 'C', 1,
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'sistema: local que não existe é recusado');

-- concretagem é só de inclusão: a situação vem na linha publicada
insert into public.concretagens (id, obra_id, pavimento_id, data, local_descricao, fck_mpa, status_sistema,
                                 dispositivo_id, criado_em_dispositivo)
values ('a9000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-000000000001', '2026-11-03', 'Pilotis \ Trecho 2 \ Vigas', 40, 'Aguardando Laudo',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok(
  (select status_sistema = 'Aguardando Laudo' from public.concretagens where id = 'a9000000-0000-0000-0000-000000000001'),
  'sistema: concretagem guarda a situação no sistema oficial');

insert into public.importacoes (id, obra_id, sistema, lida_em, contagens, dispositivo_id, criado_em_dispositivo)
values ('a8000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'sistema_exemplo',
        '2026-11-21 10:00-03', '{"locais": 2, "fvs_eventos": 1}', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.importacoes) = 1, 'sistema: gestor registra a importação');
select teste.deve_falhar($$
  insert into public.importacoes (id, obra_id, sistema, lida_em, contagens, dispositivo_id, criado_em_dispositivo)
  values ('a8000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'sistema_exemplo',
          now(), '[1, 2]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'sistema: contagens é um objeto');
reset role;

-- ---------------------------------------------------------------------
-- campo (c1) e leitura (d1) veem, mas não cadastram locais; sem acesso não vê nada
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.ok((select count(*) from public.locais_sistema) = 2, 'sistema: campo vê os locais');
select teste.deve_falhar($$
  insert into public.locais_sistema (id, obra_id, sistema, origem_id, nome, nome_completo, dispositivo_id, criado_em_dispositivo)
  values ('a5000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'sistema_exemplo', '200',
          'Do campo', 'Do campo', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'sistema: campo não cadastra local');
select teste.deve_falhar($$
  insert into public.importacoes (id, obra_id, sistema, lida_em, dispositivo_id, criado_em_dispositivo)
  values ('a8000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'sistema_exemplo',
          now(), 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'sistema: campo não registra importação');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.importacoes) = 1, 'sistema: leitura vê a importação');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.locais_sistema) = 0, 'sistema: sem acesso à obra não vê os locais');
select teste.ok((select count(*) from public.importacoes) = 0, 'sistema: sem acesso à obra não vê as importações');
reset role;

\echo 'TESTES DO SISTEMA OFICIAL PASSARAM'
