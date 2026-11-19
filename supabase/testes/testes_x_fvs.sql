-- =====================================================================
-- Testes da migração do módulo FVS (20261104100000_fvs.sql).
-- Roda depois de testes_nucleo.sql (usa as pessoas, obras e pavimentos de lá).
--   ...a1 admin   ...b1 gestor da obra 1   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- Obra 1 = 1111..., obra 2 = 2222...
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela in ('public.fichas_modelo', 'public.plantas', 'public.fvs_eventos', 'public.fvs_fotos')) = 4,
  'fvs: as quatro tabelas ficam registradas no núcleo');
select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela in ('public.fvs_eventos', 'public.fvs_fotos') and alteracao = 'nenhuma') = 2,
  'fvs: registros de campo e fotos são só de inclusão');
-- a migração 20261108120000 (C/NC) desliga o sinc_alterar para converter A/R: ele tem que voltar ligado
select teste.ok(
  (select tgenabled = 'O' from pg_trigger
   where tgrelid = 'public.fvs_eventos'::regclass and tgname = 'sinc_alterar' and not tgisinternal),
  'fvs: o gatilho que recusa alteração em fvs_eventos continua ligado depois da troca para C/NC');

-- peça da obra 1 (criada como postgres, como se viesse do publicador de planta)
insert into public.elementos (id, obra_id, pavimento_id, tipo, nome, secao, usuario_id, dispositivo_id, criado_em_dispositivo)
values ('fe000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-000000000001', 'P', 'P900', '20x60',
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now());

-- ---------------------------------------------------------------------
-- gestor (b1) cadastra ficha, setor, arquivos do pacote e planta
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

insert into public.fichas_modelo (id, obra_id, codigo, titulo, revisao, tipo_modelo, aplica_a, itens, origem,
                                  dispositivo_id, criado_em_dispositivo)
values ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'TESTE-PVS-1',
        'Ficha de teste de pilares', '0', 'ESTRUTURA', '{P}',
        '[{"n":1,"etapa":"INÍCIO","titulo":"Local limpo","descricao":"","dispositivo":"Visual","tolerancia":"Visual"},
          {"n":2,"etapa":"EXECUÇÃO","titulo":"Prumo","descricao":"Prumo de centro","dispositivo":"Prumo","tolerancia":"2 mm"}]',
        'teste', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fichas_modelo) = 1, 'fvs: gestor cadastra ficha');

select teste.deve_falhar($$
  insert into public.fichas_modelo (obra_id, codigo, titulo, aplica_a, itens, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'TESTE-PVS-1', 'Repetida', '{P}', '[{"n":1,"titulo":"x"}]',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'fvs: mesma ficha e revisão não entra duas vezes');
select teste.deve_falhar($$
  insert into public.fichas_modelo (obra_id, codigo, titulo, aplica_a, itens, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'TESTE-PVS-2', 'Item repetido', '{P}',
          '[{"n":1,"titulo":"a"},{"n":1,"titulo":"b"}]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs: ficha não aceita número de item repetido');
select teste.deve_falhar($$
  insert into public.fichas_modelo (obra_id, codigo, titulo, aplica_a, itens, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'TESTE-PVS-3', 'Sem título', '{V}',
          '[{"n":1}]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs: item da ficha precisa de título');
select teste.deve_falhar($$
  insert into public.fichas_modelo (obra_id, codigo, titulo, aplica_a, itens, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'TESTE-PVS-4', 'Vazia', '{V}', '[]',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs: ficha precisa de pelo menos um item');
select teste.deve_falhar($$
  insert into public.fichas_modelo (obra_id, codigo, titulo, aplica_a, itens, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'TESTE-PVS-5', 'Tipo errado', '{X}', '[{"n":1,"titulo":"a"}]',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs: ficha só se aplica a P, V, L ou A');

-- ficha por ambiente (alvenaria, reboco...): tipo A
insert into public.fichas_modelo (id, obra_id, codigo, titulo, tipo_modelo, aplica_a, itens, dispositivo_id, criado_em_dispositivo)
values ('f1000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'TESTE-PVS-AMB',
        'Ficha de teste por ambiente', 'VEDAÇÃO', '{A}', '[{"n":1,"etapa":"MARCAÇÃO","titulo":"Primeira fiada"}]',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select aplica_a from public.fichas_modelo where codigo = 'TESTE-PVS-AMB') = '{A}',
  'fvs: gestor cadastra ficha por ambiente');

-- revisão nova da mesma ficha é aceita
insert into public.fichas_modelo (id, obra_id, codigo, titulo, revisao, aplica_a, itens, dispositivo_id, criado_em_dispositivo)
values ('f1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'TESTE-PVS-1',
        'Ficha de teste de pilares', '1', '{P}', '[{"n":1,"titulo":"Local limpo"}]',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fichas_modelo where codigo = 'TESTE-PVS-1') = 2,
  'fvs: revisão nova da ficha entra como linha nova');

insert into public.setores (id, obra_id, pavimento_id, nome_projeto, disciplina, dispositivo_id, criado_em_dispositivo)
values ('f2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-000000000001', 'Trecho 1', 'estrutura', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.arquivos (id, obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
values
  ('f3000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111/fvs/plantas/f4000000-0000-0000-0000-000000000001/manifest.json',
   'manifest.json', repeat('b', 64), 100, 'application/json', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('f3000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111/fvs/plantas/f4000000-0000-0000-0000-000000000001/pacote.bin',
   'pacote.bin', repeat('c', 64), 1000, 'application/octet-stream', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.plantas (id, obra_id, pavimento_id, setor_id, prancha, revisao, largura, altura,
                            manifest_id, pacote_id, elementos, dispositivo_id, criado_em_dispositivo)
values ('f4000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
        'TESTE.ES.LO.001.FOR-R00', 'R00', 2384, 1684,
        'f3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000002', 1,
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.plantas) = 1, 'fvs: gestor cadastra planta com o pacote');

-- revisão nova da prancha substitui a anterior
insert into public.plantas (id, obra_id, pavimento_id, setor_id, prancha, revisao, largura, altura,
                            manifest_id, pacote_id, substitui_id, dispositivo_id, criado_em_dispositivo)
values ('f4000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
        'TESTE.ES.LO.001.FOR-R01', 'R01', 2384, 1684,
        'f3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000002',
        'f4000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.plantas where substitui_id is not null) = 1,
  'fvs: revisão nova da prancha aponta para a anterior');
reset role;

-- ---------------------------------------------------------------------
-- campo (c1) marca itens, reinspeciona e manda foto; não mexe em ficha nem planta
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, rodada, observacao, planta_id,
                                dispositivo_id, criado_em_dispositivo)
values
  ('f5000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'fe000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 1, 'A', 1, null,
   'f4000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now() - interval '2 min'),
  ('f5000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'fe000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 2, 'R', 1, 'fora de prumo',
   'f4000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now() - interval '1 min'),
  ('f5000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'fe000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 2, 'A', 2, null,
   'f4000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_eventos) = 3, 'fvs: campo marca itens e reinspeção (V02)');
-- os três acima vieram como o app gravava até 08/11/2026 (A e R): entram como C e NC
select teste.ok(
  (select string_agg(resultado, ',' order by id) from public.fvs_eventos) = 'C,NC,C',
  'fvs: A e R de um aparelho com o app antigo entram como C e NC');
insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, rodada, dispositivo_id, criado_em_dispositivo)
values ('f5000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
        'fe000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 1, 'NC', 1,
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now() - interval '3 min'),
       ('f5000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
        'fe000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 1, 'C', 1,
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now() - interval '3 min');
select teste.ok(
  (select string_agg(resultado, ',' order by id) from public.fvs_eventos where id in ('f5000000-0000-0000-0000-000000000005', 'f5000000-0000-0000-0000-000000000006')) = 'NC,C',
  'fvs: o app novo grava C e NC');

-- desmarcar = registro sem resultado; lote = marcações feitas juntas
insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, lote_id, dispositivo_id, criado_em_dispositivo)
values ('f5000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
        'fe000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 1, null,
        'f6000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select resultado is null and rodada = 1 from public.fvs_eventos where id = 'f5000000-0000-0000-0000-000000000004'),
  'fvs: desmarcar entra como registro sem resultado, rodada 1 por padrão');

insert into public.arquivos (id, obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
values ('f3000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111/fvs/fotos/f5000000-0000-0000-0000-000000000002.jpg',
        'foto.jpg', repeat('d', 64), 5000, 'image/jpeg', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.fvs_fotos (id, obra_id, evento_id, arquivo_id, dispositivo_id, criado_em_dispositivo)
values ('f7000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'f5000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000003',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_fotos) = 1, 'fvs: campo manda foto da não conformidade');

select teste.deve_falhar($$update public.fvs_eventos set resultado = 'A'$$, '42501',
  'fvs: registro de campo não é alterado');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'fe000000-0000-0000-0000-000000000001',
          'f1000000-0000-0000-0000-000000000001', 3, 'A', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'fvs: item que não existe na ficha é recusado');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'fe000000-0000-0000-0000-000000000001',
          'f1000000-0000-0000-0000-000000000001', 1, 'X', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs: resultado só C, NC ou NA');
select teste.deve_falhar($$
  insert into public.fichas_modelo (obra_id, codigo, titulo, aplica_a, itens, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'TESTE-PVS-9', 'x', '{P}', '[{"n":1,"titulo":"a"}]',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvs: campo não cadastra ficha');
select teste.deve_falhar($$
  insert into public.plantas (obra_id, pavimento_id, setor_id, prancha, revisao, largura, altura, manifest_id, pacote_id,
                              dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
          'f2000000-0000-0000-0000-000000000001', 'x', 'R00', 1, 1, 'f3000000-0000-0000-0000-000000000001',
          'f3000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvs: campo não cadastra planta');
reset role;

-- ---------------------------------------------------------------------
-- leitura (d1) só lê; quem não tem acesso (e1) não vê nada
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.fvs_eventos) = 6 and (select count(*) from public.plantas) = 2,
  'fvs: leitura vê registros e plantas da obra');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'fe000000-0000-0000-0000-000000000001',
          'f1000000-0000-0000-0000-000000000001', 1, 'A', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvs: leitura não marca item');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok(
  (select count(*) from public.fichas_modelo) + (select count(*) from public.plantas)
  + (select count(*) from public.fvs_eventos) + (select count(*) from public.fvs_fotos) = 0,
  'fvs: sem acesso à obra não vê nada');
reset role;

-- ---------------------------------------------------------------------
-- referências de outra obra (como postgres, sem RLS)
-- ---------------------------------------------------------------------
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, usuario_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'fe000000-0000-0000-0000-000000000001',
          'f1000000-0000-0000-0000-000000000001', 1, 'A', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000000', now())
$$, '23503', 'fvs: registro não aponta para peça ou ficha de outra obra');
select teste.deve_falhar($$
  insert into public.plantas (obra_id, pavimento_id, setor_id, prancha, revisao, largura, altura, manifest_id, pacote_id,
                              usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001',
          'f2000000-0000-0000-0000-000000000001', 'x', 'R00', 1, 1, 'f3000000-0000-0000-0000-000000000001',
          'f3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000000', now())
$$, '23503', 'fvs: planta não aponta para pavimento, setor ou arquivo de outra obra');
select teste.deve_falhar($$
  insert into public.fvs_fotos (id, obra_id, evento_id, arquivo_id, usuario_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'f5000000-0000-0000-0000-000000000002',
          'f0000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000000', now())
$$, '23503', 'fvs: foto aponta para um arquivo que existe');
select teste.deve_falhar($$
  insert into public.plantas (id, obra_id, pavimento_id, setor_id, prancha, revisao, largura, altura, manifest_id, pacote_id,
                              substitui_id, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('f4000000-0000-0000-0000-0000000000ff', '11111111-1111-1111-1111-111111111111',
          'a0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'x', 'R00', 1, 1,
          'f3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000002',
          'f4000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000000', now())
$$, '23514', 'fvs: planta não substitui a si mesma');

-- ---------------------------------------------------------------------
-- histórico do Construpoint: fichas abertas e registros com data original
-- ---------------------------------------------------------------------
select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas where tabela = 'public.fvs_fichas_campo' and alteracao = 'gestor') = 1,
  'fvs: fichas abertas ficam registradas no núcleo');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.fvs_fichas_campo (id, obra_id, elemento_id, ficha_id, codigo, construpoint_id, local_construpoint, ficha_codigo, status,
                                     inspetor, dispositivo_id, criado_em_dispositivo)
values ('f6000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'fe000000-0000-0000-0000-000000000001',
        'f1000000-0000-0000-0000-000000000001', 'FVS-TESTE-0001', 101, 'Pavimento \ Trecho 1 \ Pilares \ P900', 'TESTE-PVS-1', 'Aceito',
        'Pessoa de teste', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
       ('f6000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'fe000000-0000-0000-0000-000000000001',
        'f1000000-0000-0000-0000-000000000001', 'FVS-TESTE-0002', 102, 'Pavimento \ Trecho 1 \ Pilares \ P900', 'TESTE-PVS-1', 'Pendente Reinspeção',
        'Pessoa de teste', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
       -- ficha sem peça na planta e sem ficha modelo cadastrada (laje, bloco...)
       ('f6000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', null, null, 'FVS-TESTE-0003', 103,
        'Infra estrutura \ Setor 1', 'TESTE-PVS-LAJE', 'Em Andamento', null, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_fichas_campo where elemento_id = 'fe000000-0000-0000-0000-000000000001') = 2,
  'fvs: a mesma peça aceita duas fichas abertas (ficha duplicada)');
select teste.deve_falhar($$
  insert into public.fvs_fichas_campo (id, obra_id, codigo, local_construpoint, status, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'FVS-TESTE-0001', 'x', 'Aceito', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'fvs: o mesmo código de ficha não entra duas vezes');

-- registro importado: data e hora de quando foi feito, nome de quem marcou, id de origem
insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, ficha_campo_id, verificado_por, origem_id,
                                dispositivo_id, criado_em_dispositivo)
values ('f7000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'fe000000-0000-0000-0000-000000000001',
        'f1000000-0000-0000-0000-000000000001', 1, 'R', 'f6000000-0000-0000-0000-000000000002', 'Pessoa de teste', '555',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', '2026-09-30 11:15:51+00');
select teste.ok(
  (select criado_em_dispositivo = '2026-09-30 11:15:51+00' and verificado_por = 'Pessoa de teste'
   from public.fvs_eventos where id = 'f7000000-0000-0000-0000-000000000001'),
  'fvs: registro importado guarda a data original e quem marcou');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, origem_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'fe000000-0000-0000-0000-000000000001',
          'f1000000-0000-0000-0000-000000000001', 1, 'A', '555', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'fvs: importar de novo não duplica o registro');
-- publicar_historico.py roda de novo: o mesmo id não muda nada e não dá erro (como faz o servidor com on_conflict=id)
insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, ficha_campo_id, verificado_por, origem_id,
                                dispositivo_id, criado_em_dispositivo)
values ('f7000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'fe000000-0000-0000-0000-000000000001',
        'f1000000-0000-0000-0000-000000000001', 1, 'A', 'f6000000-0000-0000-0000-000000000002', 'Outra pessoa', '555',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', '2026-10-01 11:15:51+00')
on conflict (id) do nothing;
insert into public.fvs_fichas_campo (id, obra_id, codigo, local_construpoint, status, dispositivo_id, criado_em_dispositivo)
values ('f6000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'FVS-TESTE-0002', 'outro local', 'Aceito',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
on conflict (id) do nothing;
select teste.ok(
  (select resultado = 'NC' and verificado_por = 'Pessoa de teste' from public.fvs_eventos where id = 'f7000000-0000-0000-0000-000000000001')
  and (select status = 'Pendente Reinspeção' from public.fvs_fichas_campo where id = 'f6000000-0000-0000-0000-000000000002'),
  'fvs: publicar o histórico de novo não muda o que já está lá');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, elemento_id, ficha_id, item, resultado, ficha_campo_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'fe000000-0000-0000-0000-000000000001',
          'f1000000-0000-0000-0000-000000000001', 1, 'A', 'f6000000-0000-0000-0000-0000000000ff',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'fvs: registro aponta para uma ficha aberta que existe');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.ok((select count(*) from public.fvs_fichas_campo) = 3, 'fvs: campo vê as fichas abertas da obra');
select teste.deve_falhar($$
  insert into public.fvs_fichas_campo (id, obra_id, codigo, local_construpoint, status, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'FVS-TESTE-0009', 'x', 'Aceito', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvs: campo não cadastra ficha aberta');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.fvs_fichas_campo) = 0, 'fvs: sem acesso à obra não vê as fichas abertas');
reset role;

-- ---------------------------------------------------------------------
-- áreas de laje (20261106130000_fvs_areas.sql): campo desenha, liga à ficha e marca
-- ---------------------------------------------------------------------
select teste.ok(
  (select alteracao = 'nenhuma' and inclusao = 'campo' from nucleo.tabelas_sincronizadas where tabela = 'public.fvs_areas'),
  'fvs: área de laje é registro de campo, só inclusão');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.fvs_areas (id, obra_id, area_id, pavimento_id, setor_id, planta_id, nome, ficha_id, codigo_ficha, contorno, dispositivo_id, criado_em_dispositivo)
values ('fa000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'fa000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001',
        'Laje 1', 'f1000000-0000-0000-0000-000000000001', 'FVS-TESTE-0100', '[[0,0],[100,0],[100,50.5]]',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_areas) = 1, 'fvs: campo desenha área de laje');

-- contorno novo: linha nova, mesma área (a primeira continua lá, porque nada se altera)
insert into public.fvs_areas (id, obra_id, area_id, pavimento_id, setor_id, nome, ficha_id, contorno, dispositivo_id, criado_em_dispositivo)
values ('fa000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'fa000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
        'Laje 1', 'f1000000-0000-0000-0000-000000000001', '[[0,0],[200,0],[200,50],[0,50]]',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_areas where area_id = 'fa000000-0000-0000-0000-000000000001') = 2,
  'fvs: redesenhar a área é linha nova com o mesmo area_id');

select teste.deve_falhar($$
  update public.fvs_areas set nome = 'Outro' where id = 'fa000000-0000-0000-0000-000000000001'
$$, '42501', 'fvs: área não se altera: corrigir é linha nova');

select teste.deve_falhar($$
  insert into public.fvs_areas (id, obra_id, area_id, pavimento_id, setor_id, nome, ficha_id, contorno, dispositivo_id, criado_em_dispositivo)
  values ('fa000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'fa000000-0000-0000-0000-000000000009',
          'a0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
          'Sem cantos', 'f1000000-0000-0000-0000-000000000001', '[[0,0],[1,1]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs: contorno precisa de pelo menos 3 pontos');
select teste.deve_falhar($$
  insert into public.fvs_areas (id, obra_id, area_id, pavimento_id, setor_id, nome, ficha_id, contorno, dispositivo_id, criado_em_dispositivo)
  values ('fa000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'fa000000-0000-0000-0000-000000000009',
          'a0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
          'Ponto errado', 'f1000000-0000-0000-0000-000000000001', '[[0,0],[1,1],["a",2]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs: ponto do contorno tem que ser [x, y] numérico');
select teste.deve_falhar($$
  insert into public.fvs_areas (id, obra_id, area_id, pavimento_id, setor_id, nome, ficha_id, contorno, dispositivo_id, criado_em_dispositivo)
  values ('fa000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'fa000000-0000-0000-0000-000000000009',
          'a0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
          'Ficha que não existe', 'f1000000-0000-0000-0000-0000000000ff', '[[0,0],[1,1],[2,0]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'fvs: área aponta para uma ficha que existe');

-- marcação na área
insert into public.fvs_eventos (id, obra_id, area_id, ficha_id, item, resultado, dispositivo_id, criado_em_dispositivo)
values ('f7000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'fa000000-0000-0000-0000-000000000001',
        'f1000000-0000-0000-0000-000000000001', 1, 'A', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_eventos where area_id is not null) = 1, 'fvs: campo marca item numa área');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, ficha_id, item, resultado, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'f1000000-0000-0000-0000-000000000001', 1, 'A',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs: registro sem peça e sem área não entra');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, elemento_id, area_id, ficha_id, item, resultado, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'fe000000-0000-0000-0000-000000000001',
          'fa000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 1, 'A',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs: registro não é de uma peça e de uma área ao mesmo tempo');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, area_id, ficha_id, item, resultado, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'fa000000-0000-0000-0000-0000000000ff',
          'f1000000-0000-0000-0000-000000000001', 1, 'A', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'fvs: registro aponta para uma área que existe');
select teste.deve_falhar($$
  insert into public.fvs_eventos (id, obra_id, area_id, ficha_id, item, resultado, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'fa000000-0000-0000-0000-000000000001',
          'f1000000-0000-0000-0000-000000000001', 99, 'A', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'fvs: item marcado na área tem que existir na ficha');
reset role;

-- quem só lê não desenha; quem não tem acesso não vê
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.fvs_areas) = 2, 'fvs: leitura vê as áreas da obra');
select teste.deve_falhar($$
  insert into public.fvs_areas (id, obra_id, area_id, pavimento_id, setor_id, nome, ficha_id, contorno, dispositivo_id, criado_em_dispositivo)
  values ('fa000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'fa000000-0000-0000-0000-000000000008',
          'a0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
          'Só leitura', 'f1000000-0000-0000-0000-000000000001', '[[0,0],[1,1],[2,0]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvs: leitura não desenha área');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.fvs_areas) = 0, 'fvs: sem acesso à obra não vê as áreas');
reset role;

\echo 'TESTES DA FVS PASSARAM'
