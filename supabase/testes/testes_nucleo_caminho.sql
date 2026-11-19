-- =====================================================================
-- Testes da migração "caminho de arquivo seguro". Roda depois de testes_nucleo.sql
-- (mesmo banco: usa as pessoas e obras criadas lá).
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

-- tabela arquivos
select teste.deve_falhar($$
  insert into public.arquivos (obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/../../vizinho.txt', 'v.txt',
          repeat('c', 64), 1, 'text/plain', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'caminho: ".." é recusado');
select teste.deve_falhar($$
  insert into public.arquivos (obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111//tmp/vitima.txt', 'v.txt',
          repeat('c', 64), 1, 'text/plain', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'caminho: trecho vazio (caminho absoluto) é recusado');
select teste.deve_falhar($$
  insert into public.arquivos (obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/fvs/C:/x.bat', 'x.bat',
          repeat('c', 64), 1, 'text/plain', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'caminho: dois-pontos é recusado');
select teste.deve_falhar($$
  insert into public.arquivos (obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/fvs/foto 1.jpg', 'foto 1.jpg',
          repeat('c', 64), 1, 'image/jpeg', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'caminho: espaço é recusado (nome original fica em nome_original)');
select teste.deve_falhar($$
  insert into public.arquivos (obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/fvs/.escondido', 'e',
          repeat('c', 64), 1, 'text/plain', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'caminho: trecho começando com ponto é recusado');
insert into public.arquivos (obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/fvs/plantas/3PAV-trecho_2.v01.png',
        'Planta 3º pav trecho 2.png', repeat('c', 64), 1, 'image/png', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok(true, 'caminho: letras, números, ponto, hífen e sublinhado em subpastas são aceitos');

-- armazenamento
select teste.deve_falhar($$
  insert into storage.objects (bucket_id, name) values ('obras', '11111111-1111-1111-1111-111111111111/../x.jpg')
$$, '42501', 'caminho: armazenamento recusa ".."');
select teste.deve_falhar($$
  insert into storage.objects (bucket_id, name) values ('obras', '11111111-1111-1111-1111-111111111111/fvs/a b.jpg')
$$, '42501', 'caminho: armazenamento recusa espaço');
insert into storage.objects (bucket_id, name) values ('obras', '11111111-1111-1111-1111-111111111111/fvs/plantas/3PAV-trecho_2.v01.png');
select teste.ok(true, 'caminho: armazenamento aceita caminho seguro');
reset role;

\echo 'TESTES DE CAMINHO PASSARAM'
