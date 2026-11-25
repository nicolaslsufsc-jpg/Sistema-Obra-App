-- =====================================================================
-- Testes da tratativa de NC da FVS (20261125150000_fvs_tratativas.sql).
-- Roda depois de testes_nucleo.sql e testes_x_fvs.sql (usa o NC f5...05 e o C f5...01 de lá).
--   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela = 'public.fvs_tratativas' and inclusao = 'campo' and alteracao = 'nenhuma') = 1,
  'fvs_tratativas: registrada no núcleo, campo inclui, ninguém altera');

-- ---------------------------------------------------------------------
-- campo (c1) abre a tratativa do NC e depois muda (linha nova)
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

insert into public.fvs_tratativas (id, obra_id, evento_nc_id, responsavel, prazo, causa, dispositivo_id, criado_em_dispositivo)
values ('f9000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'f5000000-0000-0000-0000-000000000005', 'Empreiteiro Exemplo', '2026-12-01', 'mao_de_obra',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now() - interval '2 min');
select teste.ok((select count(*) from public.fvs_tratativas) = 1, 'fvs_tratativas: campo abre a tratativa do NC');

insert into public.fvs_tratativas (id, obra_id, evento_nc_id, responsavel, prazo, causa, casos_parecidos, concessao, concessao_por,
                                   eficacia, dispositivo_id, criado_em_dispositivo)
values ('f9000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'f5000000-0000-0000-0000-000000000005', 'Empreiteiro Exemplo', '2026-12-01', 'outro', 'Não', true, 'Engenheiro da obra',
        'eficaz', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_tratativas where evento_nc_id = 'f5000000-0000-0000-0000-000000000005') = 2,
  'fvs_tratativas: mudar a tratativa é linha nova');

select teste.deve_falhar($$
  update public.fvs_tratativas set responsavel = 'Outro' where id = 'f9000000-0000-0000-0000-000000000001'
$$, '42501', 'fvs_tratativas: tratativa não se altera: mudar é linha nova');

select teste.deve_falhar($$
  insert into public.fvs_tratativas (id, obra_id, evento_nc_id, concessao, dispositivo_id, criado_em_dispositivo)
  values ('f9000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'f5000000-0000-0000-0000-000000000005', true, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_tratativas: concessão sem quem decidiu é recusada');
select teste.deve_falhar($$
  insert into public.fvs_tratativas (id, obra_id, evento_nc_id, concessao, concessao_por, dispositivo_id, criado_em_dispositivo)
  values ('f9000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'f5000000-0000-0000-0000-000000000005', true, '   ', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_tratativas: concessão com quem decidiu em branco é recusada');
select teste.deve_falhar($$
  insert into public.fvs_tratativas (id, obra_id, evento_nc_id, causa, dispositivo_id, criado_em_dispositivo)
  values ('f9000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'f5000000-0000-0000-0000-000000000005', 'chuva', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_tratativas: causa só da lista (mão de obra, material, projeto, outro)');
select teste.deve_falhar($$
  insert into public.fvs_tratativas (id, obra_id, evento_nc_id, eficacia, dispositivo_id, criado_em_dispositivo)
  values ('f9000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'f5000000-0000-0000-0000-000000000005', 'talvez', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_tratativas: eficácia só eficaz ou não eficaz');
select teste.deve_falhar($$
  insert into public.fvs_tratativas (id, obra_id, evento_nc_id, dispositivo_id, criado_em_dispositivo)
  values ('f9000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'f5000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_tratativas: só de registro NC (um C é recusado)');
select teste.deve_falhar($$
  insert into public.fvs_tratativas (id, obra_id, evento_nc_id, dispositivo_id, criado_em_dispositivo)
  values ('f9000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'f5000000-0000-0000-0000-0000000000ff', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_tratativas: aponta para um registro que existe');
reset role;

-- NC de outra obra: recusado (admin, para passar da RLS e chegar no gatilho)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select teste.deve_falhar($$
  insert into public.fvs_tratativas (id, obra_id, evento_nc_id, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('f9000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222',
          'f5000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_tratativas: não aponta para NC de outra obra');
reset role;

-- ---------------------------------------------------------------------
-- leitura (d1) vê e não registra; sem acesso (e1) não vê
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.fvs_tratativas) = 2, 'fvs_tratativas: leitura vê as tratativas da obra');
select teste.deve_falhar($$
  insert into public.fvs_tratativas (id, obra_id, evento_nc_id, dispositivo_id, criado_em_dispositivo)
  values ('f9000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
          'f5000000-0000-0000-0000-000000000005', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvs_tratativas: leitura não registra tratativa');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.fvs_tratativas) = 0, 'fvs_tratativas: sem acesso à obra não vê');
reset role;

\echo 'TESTES DA TRATATIVA DE NC DA FVS PASSARAM'
