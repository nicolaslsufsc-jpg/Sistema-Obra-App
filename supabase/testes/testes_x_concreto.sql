-- =====================================================================
-- Testes da migração do módulo Concreto (20261103230000_concreto.sql).
-- Roda depois de testes_nucleo.sql (usa as pessoas, obras e pavimentos de lá).
--   ...b1 gestor da obra 1   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela in ('public.concretagens', 'public.caminhoes', 'public.caminhao_areas',
                    'public.caminhao_elementos', 'public.cp_resultados')) = 5,
  'concreto: as cinco tabelas ficam registradas no núcleo');

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela in ('public.concretagens', 'public.caminhoes', 'public.caminhao_areas',
                    'public.caminhao_elementos', 'public.cp_resultados')
     and alteracao = 'nenhuma') = 5,
  'concreto: todas são só de inclusão');

select id as elemento from public.elementos
where obra_id = '11111111-1111-1111-1111-111111111111' and not apagado limit 1 \gset

-- ---------------------------------------------------------------------
-- campo (c1) registra concretagem, caminhão, área e peça
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

insert into public.concretagens (id, obra_id, pavimento_id, data, local_descricao, fornecedor, fck_mpa,
                                 slump_cm, slump_tolerancia_cm, dispositivo_id, criado_em_dispositivo)
values ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-000000000001', '2026-10-29', 'Pilotis \ Trecho 1', 'Usina X', 40,
        12, 2, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok(
  (select idades_dias = '{7,28}' and cps_por_idade = 2 from public.concretagens
   where id = 'c0000000-0000-0000-0000-000000000001'),
  'concreto: concretagem nasce com idades 7 e 28 e 2 CPs por idade');

insert into public.caminhoes (id, obra_id, concretagem_id, sequencia, nota_fiscal, volume_m3,
                              inicio_descarga, slump_medido_cm, cps_moldados, dispositivo_id, criado_em_dispositivo)
values ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'c0000000-0000-0000-0000-000000000001', 1, '900001', 8.5, '2026-10-29 07:40-03', 12, 4,
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());

insert into public.caminhao_areas (id, obra_id, caminhao_id, planta_ref, contorno, dispositivo_id, criado_em_dispositivo)
values ('c2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'c1000000-0000-0000-0000-000000000001', 'teste:pavimento-1', '[[0,0],[100,0],[100,100]]',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());

-- duas canetas (20261107210000_concreto_caneta.sql): o alvo da área é pilares, vigas_laje ou vazio
insert into public.caminhao_areas (id, obra_id, caminhao_id, planta_ref, contorno, alvo, dispositivo_id, criado_em_dispositivo)
values ('c2000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'c1000000-0000-0000-0000-000000000001', 'teste:pavimento-1', '[[0,0],[100,0],[100,100]]', 'vigas_laje',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.deve_falhar($$
  insert into public.caminhao_areas (id, obra_id, caminhao_id, planta_ref, contorno, alvo, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000001',
          'teste:pavimento-1', '[[0,0],[100,0],[100,100]]', 'paredes', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'concreto: alvo da área fora da lista é recusado');

-- seis canetas (20261126120000_concreto_canetas_combinadas.sql): as combinações novas entram;
-- "pilares e lajes" sem as vigas continua fora; a área que já existia não mudou
insert into public.caminhao_areas (id, obra_id, caminhao_id, planta_ref, contorno, alvo, dispositivo_id, criado_em_dispositivo)
select gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000001',
       'teste:pavimento-1', '[[0,0],[100,0],[100,100]]', v, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()
from unnest(array['vigas', 'laje', 'pilares_vigas', 'pilares_vigas_laje']) as v;
select teste.ok(
  (select count(distinct alvo) from public.caminhao_areas where alvo in ('vigas', 'laje', 'pilares_vigas', 'pilares_vigas_laje')) = 4,
  'concreto: as canetas combinadas (vigas, laje, pilares e vigas, pilares vigas e laje) entram');
select teste.deve_falhar($$
  insert into public.caminhao_areas (id, obra_id, caminhao_id, planta_ref, contorno, alvo, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000001',
          'teste:pavimento-1', '[[0,0],[100,0],[100,100]]', 'pilares_laje', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'concreto: pilares e lajes sem as vigas é recusado');
select teste.ok(
  (select alvo from public.caminhao_areas where id = 'c2000000-0000-0000-0000-000000000002') = 'vigas_laje'
  and (select alvo from public.caminhao_areas where id = 'c2000000-0000-0000-0000-000000000001') is null,
  'concreto: as áreas que já existiam ficam como estavam');

insert into public.caminhao_elementos (id, obra_id, caminhao_id, elemento_id, origem, fracao, incluido,
                                       dispositivo_id, criado_em_dispositivo)
values ('c3000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'c1000000-0000-0000-0000-000000000001', :'elemento', 'desenho', 0.95, true,
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.caminhao_elementos) = 1, 'concreto: campo registra peça do caminhão');

-- corrigir = linha nova que substitui a antiga
insert into public.caminhoes (id, obra_id, concretagem_id, sequencia, nota_fiscal, volume_m3,
                              substitui_id, dispositivo_id, criado_em_dispositivo)
values ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'c0000000-0000-0000-0000-000000000001', 1, '900002', 8.5,
        'c1000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.caminhoes) = 2, 'concreto: correção entra como linha nova');

select teste.deve_falhar($$update public.caminhoes set nota_fiscal = 'x'$$, '42501',
  'concreto: caminhão não é alterado');
select teste.deve_falhar($$
  insert into public.cp_resultados (id, obra_id, caminhao_id, idade_dias, numero_cp, resistencia_mpa,
                                    dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000002',
          7, 1, 30, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'concreto: campo não lança resultado de laudo');
reset role;

-- ---------------------------------------------------------------------
-- gestor (b1) lança o resultado do laudo
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.cp_resultados (id, obra_id, caminhao_id, idade_dias, numero_cp, data_ensaio, resistencia_mpa,
                                  dispositivo_id, criado_em_dispositivo)
values ('c4000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'c1000000-0000-0000-0000-000000000002', 7, 1, '2026-11-05', 31.4,
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok(
  (select origem = 'manual' from public.cp_resultados where id = 'c4000000-0000-0000-0000-000000000001'),
  'concreto: gestor lança resultado, origem padrão manual');
reset role;

-- ---------------------------------------------------------------------
-- leitura (d1) só lê; quem não tem acesso (e1) não vê nada
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.caminhoes) = 2, 'concreto: leitura vê os caminhões da obra');
select teste.deve_falhar($$
  insert into public.concretagens (id, obra_id, pavimento_id, data, fck_mpa, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
          '2026-10-30', 30, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'concreto: leitura não registra concretagem');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok(
  (select count(*) from public.concretagens) + (select count(*) from public.caminhoes)
  + (select count(*) from public.caminhao_areas) + (select count(*) from public.caminhao_elementos)
  + (select count(*) from public.cp_resultados) = 0,
  'concreto: sem acesso à obra não vê nada');
reset role;

-- ---------------------------------------------------------------------
-- valores inválidos e referências de outra obra (como postgres, sem RLS)
-- ---------------------------------------------------------------------
select teste.deve_falhar($$
  insert into public.caminhoes (id, obra_id, concretagem_id, sequencia, usuario_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'c0000000-0000-0000-0000-000000000001', 2,
          '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now())
$$, '23503', 'concreto: caminhão não aponta para concretagem de outra obra');

select teste.deve_falhar($$
  insert into public.caminhoes (id, obra_id, concretagem_id, sequencia, substitui_id, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('c1000000-0000-0000-0000-0000000000ff', '11111111-1111-1111-1111-111111111111',
          'c0000000-0000-0000-0000-000000000001', 2, 'c1000000-0000-0000-0000-0000000000ff',
          '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now())
$$, '23514', 'concreto: linha não substitui a si mesma');

select teste.deve_falhar($$
  insert into public.caminhao_areas (id, obra_id, caminhao_id, planta_ref, contorno, usuario_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000002',
          'teste', '[[0,0],[1,1]]', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now())
$$, '23514', 'concreto: área precisa de pelo menos 3 pontos');

select teste.deve_falhar($$
  insert into public.concretagens (id, obra_id, pavimento_id, data, fck_mpa, idades_dias, usuario_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
          '2026-10-30', 30, '{0,28}', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now())
$$, '23514', 'concreto: idade de CP tem que ser de 1 a 365 dias');

-- substitui_id que não existe: recusado no fim da transação
begin;
set constraints all immediate;
select teste.deve_falhar($$
  insert into public.caminhoes (id, obra_id, concretagem_id, sequencia, substitui_id, usuario_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 3,
          'c1000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000000', now())
$$, '23503', 'concreto: não substitui linha que não existe');
commit;

-- restaurar.sql pode trazer a correção antes da linha corrigida (mesma transação)
begin;
insert into public.caminhoes (id, obra_id, concretagem_id, sequencia, substitui_id, usuario_id, dispositivo_id, criado_em_dispositivo)
values ('c1000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111',
        'c0000000-0000-0000-0000-000000000001', 4, 'c1000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now());
insert into public.caminhoes (id, obra_id, concretagem_id, sequencia, usuario_id, dispositivo_id, criado_em_dispositivo)
values ('c1000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111',
        'c0000000-0000-0000-0000-000000000001', 4,
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now());
commit;
select teste.ok((select count(*) from public.caminhoes where sequencia = 4) = 2,
  'concreto: correção carregada antes da linha corrigida é aceita no fim da transação');

-- ---------------------------------------------------------------------
-- laje por trecho (docs/modulos/3_concreto.md, decisão de 04/11, confirmada em 07/11): no primeiro
-- toque o app cria a laje em "elementos", com nome sem espaço e o mesmo id em qualquer aparelho.
-- Nada muda no banco: estas checagens conferem o que o app supõe do servidor.
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.deve_falhar($$
  insert into public.elementos (id, obra_id, pavimento_id, tipo, nome, dispositivo_id, criado_em_dispositivo)
  values ('c5000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
          'a0000000-0000-0000-0000-000000000001', 'L', 'Laje_Trecho_2', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'concreto: campo não cria a laje do trecho (só gestor e admin cadastram peça)');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select teste.deve_falhar($$
  insert into public.elementos (id, obra_id, pavimento_id, tipo, nome, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
          'a0000000-0000-0000-0000-000000000001', 'L', 'Laje do Trecho 2', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'concreto: nome de laje com espaço é recusado (por isso o app grava "Laje_Trecho_2")');
-- dois aparelhos criam a mesma laje sem internet: mesmo id, o envio repetido não duplica
insert into public.elementos (id, obra_id, pavimento_id, tipo, nome, dispositivo_id, criado_em_dispositivo)
values ('c5000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-000000000001', 'L', 'Laje_Trecho_2', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
on conflict (id) do nothing;
insert into public.elementos (id, obra_id, pavimento_id, tipo, nome, dispositivo_id, criado_em_dispositivo)
values ('c5000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-000000000001', 'L', 'Laje_Trecho_2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', now())
on conflict (id) do nothing;
select teste.ok((select count(*) from public.elementos where nome = 'Laje_Trecho_2') = 1,
  'concreto: a mesma laje enviada por dois aparelhos fica uma só');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.caminhao_elementos (id, obra_id, caminhao_id, elemento_id, origem, fracao, incluido,
                                       dispositivo_id, criado_em_dispositivo)
values ('c3000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
        'c1000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001', 'manual', null, true,
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok(
  (select count(*) from public.caminhao_elementos where elemento_id = 'c5000000-0000-0000-0000-000000000001') = 1,
  'concreto: campo marca no caminhão a laje que o gestor criou');
reset role;

-- ---------------------------------------------------------------------
-- exportação: cada tabela vem depois das que ela referencia
-- ---------------------------------------------------------------------
create temporary table niveis as select * from public.tabelas_para_exportar();
select teste.ok(
  (select nivel from niveis where tabela = 'public.concretagens')
    > (select nivel from niveis where tabela = 'public.pavimentos')
  and (select nivel from niveis where tabela = 'public.caminhoes')
    > (select nivel from niveis where tabela = 'public.concretagens')
  and (select nivel from niveis where tabela = 'public.caminhao_areas')
    > (select nivel from niveis where tabela = 'public.caminhoes')
  and (select nivel from niveis where tabela = 'public.caminhao_elementos')
    > greatest((select nivel from niveis where tabela = 'public.caminhoes'),
               (select nivel from niveis where tabela = 'public.elementos'))
  and (select nivel from niveis where tabela = 'public.cp_resultados')
    > greatest((select nivel from niveis where tabela = 'public.caminhoes'),
               (select nivel from niveis where tabela = 'public.arquivos')),
  'concreto: exportação restaura cada tabela depois das que ela referencia');
drop table niveis;

\echo 'TESTES DO CONCRETO PASSARAM'
