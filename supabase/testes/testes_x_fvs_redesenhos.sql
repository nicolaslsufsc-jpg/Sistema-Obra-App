-- =====================================================================
-- Testes do redesenho de peça da FVS (20261123120000_fvs_redesenhos.sql).
-- Roda depois de testes_nucleo.sql e testes_x_fvs.sql (usa a peça P900, o trecho e a planta de lá).
--   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela = 'public.fvs_redesenhos' and inclusao = 'campo' and alteracao = 'nenhuma') = 1,
  'fvs_redesenhos: registrada no núcleo, campo inclui, ninguém altera');

-- ---------------------------------------------------------------------
-- campo (c1) redesenha o P900 na planta R00 do trecho 1
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

insert into public.fvs_redesenhos (id, obra_id, elemento_id, setor_id, planta_id, contorno, dispositivo_id, criado_em_dispositivo)
values ('f8000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'fe000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
        'f4000000-0000-0000-0000-000000000001', '[[0,0],[20,0],[20,60],[0,60]]',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_redesenhos) = 1, 'fvs_redesenhos: campo redesenha a peça');

-- redesenhar de novo: linha nova apontando para a que valia (a primeira continua lá)
insert into public.fvs_redesenhos (id, obra_id, elemento_id, setor_id, planta_id, contorno, substitui_id, dispositivo_id, criado_em_dispositivo)
values ('f8000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'fe000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
        'f4000000-0000-0000-0000-000000000002', '[[0,0],[25,0],[25,60],[0,60.5]]',
        'f8000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
-- voltar ao original: linha nova cancelando, sem contorno
insert into public.fvs_redesenhos (id, obra_id, elemento_id, setor_id, substitui_id, cancelado, dispositivo_id, criado_em_dispositivo)
values ('f8000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'fe000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
        'f8000000-0000-0000-0000-000000000002', true, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_redesenhos where elemento_id = 'fe000000-0000-0000-0000-000000000001') = 3,
  'fvs_redesenhos: redesenhar de novo e voltar ao original são linhas novas');

select teste.deve_falhar($$
  update public.fvs_redesenhos set contorno = '[[0,0],[1,0],[1,1]]' where id = 'f8000000-0000-0000-0000-000000000001'
$$, '42501', 'fvs_redesenhos: redesenho não se altera: corrigir é linha nova');

select teste.deve_falhar($$
  insert into public.fvs_redesenhos (id, obra_id, elemento_id, setor_id, contorno, dispositivo_id, criado_em_dispositivo)
  values ('f8000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'fe000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
          '[[0,0],[1,1]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_redesenhos: contorno precisa de pelo menos 3 pontos');
select teste.deve_falhar($$
  insert into public.fvs_redesenhos (id, obra_id, elemento_id, setor_id, contorno, dispositivo_id, criado_em_dispositivo)
  values ('f8000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'fe000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
          '[[0,0],[1,1],["a",2]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_redesenhos: ponto do contorno tem que ser [x, y] numérico');
select teste.deve_falhar($$
  insert into public.fvs_redesenhos (id, obra_id, elemento_id, setor_id, dispositivo_id, criado_em_dispositivo)
  values ('f8000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'fe000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_redesenhos: redesenho sem contorno só ao voltar ao original');
select teste.deve_falhar($$
  insert into public.fvs_redesenhos (id, obra_id, elemento_id, setor_id, cancelado, dispositivo_id, criado_em_dispositivo)
  values ('f8000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'fe000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
          true, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_redesenhos: voltar ao original aponta para o redesenho que valia');
select teste.deve_falhar($$
  insert into public.fvs_redesenhos (id, obra_id, elemento_id, setor_id, contorno, dispositivo_id, criado_em_dispositivo)
  values ('f8000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
          'fe000000-0000-0000-0000-0000000000ff', 'f2000000-0000-0000-0000-000000000001',
          '[[0,0],[1,1],[2,0]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'fvs_redesenhos: aponta para uma peça que existe');
reset role;

-- ---------------------------------------------------------------------
-- leitura (d1) vê e não redesenha; sem acesso (e1) não vê
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.fvs_redesenhos) = 3, 'fvs_redesenhos: leitura vê os redesenhos da obra');
select teste.deve_falhar($$
  insert into public.fvs_redesenhos (id, obra_id, elemento_id, setor_id, contorno, dispositivo_id, criado_em_dispositivo)
  values ('f8000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
          'fe000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
          '[[0,0],[1,1],[2,0]]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvs_redesenhos: leitura não redesenha');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.fvs_redesenhos) = 0, 'fvs_redesenhos: sem acesso à obra não vê');
reset role;

\echo 'TESTES DO REDESENHO DA FVS PASSARAM'
