-- =====================================================================
-- Testes da migração do módulo Relatórios (20261106120000_relatorios.sql).
-- Roda depois de testes_nucleo.sql (usa as pessoas, obras e pavimentos de lá).
--   ...b1 gestor da obra 1   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela in ('public.diario_cadastro', 'public.diario_clima', 'public.diario_efetivo',
                    'public.diario_equipamentos', 'public.diario_materiais', 'public.diario_servicos',
                    'public.diario_ocorrencias', 'public.diario_fechamentos', 'public.relatorios',
                    'public.relatorio_andamentos', 'public.rel_marcas', 'public.rel_fotos')
     and alteracao = 'nenhuma') = 12,
  'relatorios: as doze tabelas ficam registradas no núcleo, todas só de inclusão');

select id as elemento, pavimento_id as pavimento from public.elementos
where obra_id = '11111111-1111-1111-1111-111111111111' and not apagado limit 1 \gset

-- ---------------------------------------------------------------------
-- campo (c1) escreve o diário do dia e um relatório
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

insert into public.diario_clima (id, obra_id, data, periodo, tempo, condicao, dispositivo_id, criado_em_dispositivo)
values ('d1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2026-11-06', 'manha',
        'chuva_forte', 'impraticavel', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.diario_efetivo (id, obra_id, data, empresa, funcao, quantidade, dispositivo_id, criado_em_dispositivo)
values ('d1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '2026-11-06', 'Construtora Exemplo',
        'Pedreiro', 6, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.diario_equipamentos (id, obra_id, data, nome, quantidade, situacao, dispositivo_id, criado_em_dispositivo)
values ('d1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '2026-11-06', 'Grua',
        1, 'parado', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.diario_materiais (id, obra_id, data, material, quantidade, unidade, fornecedor, nota_fiscal, dispositivo_id, criado_em_dispositivo)
values ('d1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '2026-11-06', 'Aço CA-50',
        1250.5, 'kg', 'Gerdau', '12345', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.diario_servicos (id, obra_id, data, descricao, empresa, situacao, avanco_pct, local_texto, dispositivo_id, criado_em_dispositivo)
values ('d1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '2026-11-06', 'Forma de pilares',
        'Construtora Exemplo', 'concluido', 100, 'Trecho 2', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.diario_ocorrencias (id, obra_id, data, tipo, descricao, horas_paradas, dispositivo_id, criado_em_dispositivo)
values ('d1000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '2026-11-06', 'interrupcao',
        'Chuva forte parou a concretagem', 2.5, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.relatorios (id, obra_id, tipo, data, titulo, descricao, gravidade, responsavel, prazo, itens, dispositivo_id, criado_em_dispositivo)
values ('d2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'problema', '2026-11-06',
        'Vazamento no subsolo', 'Água na cortina', 'alta', 'Hidráulica', '2026-11-10', '[]',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.relatorio_andamentos (id, obra_id, relatorio_id, situacao, comentario, dispositivo_id, criado_em_dispositivo)
values ('d2000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'd2000000-0000-0000-0000-000000000001', 'em_andamento', 'Empreiteiro avisado',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.diario_efetivo where quantidade = 6) = 1, 'relatorios: campo registra o diário');
select teste.ok((select count(*) from public.relatorios) = 1, 'relatorios: campo registra relatório');

-- ---------------------------------------------------------------------
-- marcas na planta: peça, área e ponto, ligadas a serviço, ocorrência ou relatório
-- ---------------------------------------------------------------------
insert into public.rel_marcas (id, obra_id, servico_id, pavimento_id, planta_ref, forma, elemento_id, dispositivo_id, criado_em_dispositivo)
values ('d3000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'd1000000-0000-0000-0000-000000000005', :'pavimento', 'trecho@R01', 'peca', :'elemento',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.rel_marcas (id, obra_id, relatorio_id, pavimento_id, planta_ref, forma, contorno, dispositivo_id, criado_em_dispositivo)
values ('d3000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'd2000000-0000-0000-0000-000000000001', :'pavimento', 'trecho@R01', 'ponto', '[[120.5, 80]]',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.rel_marcas (id, obra_id, ocorrencia_id, pavimento_id, planta_ref, forma, contorno, dispositivo_id, criado_em_dispositivo)
values ('d3000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'd1000000-0000-0000-0000-000000000006', :'pavimento', 'trecho@R01', 'area', '[[0,0],[10,0],[10,10]]',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
-- peça marcada na lista, sem planta no aparelho
insert into public.rel_marcas (id, obra_id, servico_id, pavimento_id, forma, elemento_id, dispositivo_id, criado_em_dispositivo)
values ('d3000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
        'd1000000-0000-0000-0000-000000000005', :'pavimento', 'peca', :'elemento',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.rel_marcas) = 4, 'relatorios: marca de peça, ponto e área');

select teste.deve_falhar(format($f$
  insert into public.rel_marcas (id, obra_id, pavimento_id, planta_ref, forma, elemento_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', %L, 'trecho@R01', 'peca', %L,
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$f$, :'pavimento', :'elemento'), '23514', 'relatorios: marca sem alvo é recusada');
select teste.deve_falhar(format($f$
  insert into public.rel_marcas (id, obra_id, servico_id, relatorio_id, pavimento_id, planta_ref, forma, elemento_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000005',
          'd2000000-0000-0000-0000-000000000001', %L, 'trecho@R01', 'peca', %L,
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$f$, :'pavimento', :'elemento'), '23514', 'relatorios: marca com dois alvos é recusada');
select teste.deve_falhar(format($f$
  insert into public.rel_marcas (id, obra_id, servico_id, pavimento_id, forma, contorno, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000005', %L,
          'area', '[[0,0],[1,1],[2,2]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$f$, :'pavimento'), '23514', 'relatorios: área sem a prancha é recusada');
select teste.deve_falhar(format($f$
  insert into public.rel_marcas (id, obra_id, servico_id, pavimento_id, planta_ref, forma, contorno, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000005', %L,
          'trecho@R01', 'area', '[[0,0],[1,1]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$f$, :'pavimento'), '23514', 'relatorios: área com menos de 3 pontos é recusada');
select teste.deve_falhar(format($f$
  insert into public.rel_marcas (id, obra_id, servico_id, pavimento_id, planta_ref, forma, contorno, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000005', %L,
          'trecho@R01', 'ponto', '[[0,0],[1,1]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$f$, :'pavimento'), '23514', 'relatorios: ponto com dois pontos é recusado');

-- onde a foto foi tirada (20261107200000_relatorios_foto_marca.sql): foto_id é um quarto alvo, e vale um só
select teste.deve_falhar(format($f$
  insert into public.rel_marcas (id, obra_id, servico_id, foto_id, pavimento_id, planta_ref, forma, contorno, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000005',
          'd1000000-0000-0000-0000-0000000000ff', %L, 'trecho@R01', 'ponto', '[[10,20]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$f$, :'pavimento'), '23514', 'relatorios: marca de foto não pode ser também de serviço');
select teste.deve_falhar(format($f$
  insert into public.rel_marcas (id, obra_id, foto_id, pavimento_id, planta_ref, forma, contorno, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-0000000000ff', %L,
          'trecho@R01', 'ponto', '[[10,20]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$f$, :'pavimento'), '23503', 'relatorios: marca aponta para uma foto que existe');

-- ---------------------------------------------------------------------
-- só inclusão: corrigir = linha nova com substitui_id; apagar pela API não existe
-- ---------------------------------------------------------------------
select teste.deve_falhar($$update public.diario_efetivo set quantidade = 7$$, '42501',
  'relatorios: registro do diário não é alterado');
select teste.deve_falhar($$delete from public.relatorios$$, '42501',
  'relatorios: relatório não é apagado pela API');
insert into public.diario_efetivo (id, obra_id, data, empresa, funcao, quantidade, substitui_id, dispositivo_id, criado_em_dispositivo)
values ('d1000000-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', '2026-11-06', 'Construtora Exemplo',
        'Pedreiro', 7, 'd1000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.diario_efetivo) = 2, 'relatorios: correção é uma linha nova');

-- valores fora da lista
select teste.deve_falhar($$
  insert into public.diario_clima (id, obra_id, data, periodo, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '2026-11-06', 'madrugada',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'relatorios: período inválido é recusado');
select teste.deve_falhar($$
  insert into public.relatorios (id, obra_id, tipo, data, titulo, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Tipo Com Espaço', '2026-11-06', 'x',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'relatorios: tipo fora do formato é recusado');

-- campo não fecha o dia nem muda o cabeçalho
select teste.deve_falhar($$
  insert into public.diario_fechamentos (id, obra_id, data, acao, numero, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '2026-11-06', 'fechado', 1,
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'relatorios: campo não fecha o dia');
select teste.deve_falhar($$
  insert into public.diario_cadastro (id, obra_id, responsavel_tecnico, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Fulano',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'relatorios: campo não muda os dados da obra');
reset role;

-- ---------------------------------------------------------------------
-- gestor (b1) fecha o dia e preenche o cabeçalho
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.diario_fechamentos (id, obra_id, data, acao, numero, dispositivo_id, criado_em_dispositivo)
values ('d4000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2026-11-06', 'fechado', 1,
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.diario_cadastro (id, obra_id, responsavel_tecnico, art, data_inicio, prazo_fim, dispositivo_id, criado_em_dispositivo)
values ('d4000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Eng. Fulano', '123',
        '2026-01-10', '2028-06-30', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.diario_fechamentos) = 1, 'relatorios: gestor fecha o dia');
reset role;

-- ---------------------------------------------------------------------
-- leitura (d1) lê e não escreve; sem acesso (e1) não vê nada
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.relatorios) = 1, 'relatorios: leitura vê o relatório');
select teste.deve_falhar($$
  insert into public.diario_efetivo (id, obra_id, data, funcao, quantidade, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '2026-11-06', 'x', 1,
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'relatorios: leitura não registra');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.diario_efetivo) = 0, 'relatorios: sem acesso não vê o diário');
select teste.ok((select count(*) from public.rel_marcas) = 0, 'relatorios: sem acesso não vê as marcas');
select teste.deve_falhar($$
  insert into public.relatorios (id, obra_id, tipo, data, titulo, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'problema', '2026-11-06', 'x',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'relatorios: sem acesso não registra');
reset role;

-- a referência tem que ser da mesma obra (chave composta)
select teste.deve_falhar($$
  insert into public.relatorio_andamentos (id, obra_id, relatorio_id, situacao, usuario_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'd2000000-0000-0000-0000-000000000001',
          'aberto', '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'relatorios: andamento não aponta para relatório de outra obra');
select teste.deve_falhar(format($f$
  insert into public.rel_marcas (id, obra_id, relatorio_id, pavimento_id, planta_ref, forma, contorno, usuario_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'd2000000-0000-0000-0000-000000000001', %L,
          'x@R0', 'ponto', '[[1,1]]', '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$f$, :'pavimento'), '23503', 'relatorios: marca não aponta para relatório de outra obra');

-- a exportação põe a marca depois do que ela referencia
select teste.ok(
  (select nivel from public.tabelas_para_exportar() where tabela = 'public.rel_marcas')
  > greatest(
      (select nivel from public.tabelas_para_exportar() where tabela = 'public.diario_servicos'),
      (select nivel from public.tabelas_para_exportar() where tabela = 'public.relatorios'),
      (select nivel from public.tabelas_para_exportar() where tabela = 'public.elementos')),
  'relatorios: exportação restaura a marca depois de serviço, relatório e peça');

\echo 'TESTES DO MÓDULO RELATÓRIOS PASSARAM'
