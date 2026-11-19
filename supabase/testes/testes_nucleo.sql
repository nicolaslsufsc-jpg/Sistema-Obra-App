-- =====================================================================
-- Testes da migração do núcleo. Rodar com supabase/testes/rodar_testes.sh.
-- Cada teste imprime "ok: ..." ou para com "FALHOU [...]".
--
-- Pessoas de teste (id termina em):
--   ...a1 admin                    ...b1 gestor da obra 1 e leitura na obra 2
--   ...c1 campo na obra 1          ...d1 leitura na obra 1
--   ...e1 sem acesso a nenhuma obra
-- Obras: 1111... (obra 1) e 2222... (obra 2)
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- ---------- utilitários ----------
create schema teste;
grant usage on schema teste to anon, authenticated;

create function teste.ok(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FALHOU [%]', p_msg;
  end if;
  raise notice 'ok: %', p_msg;
end;
$$;

create function teste.deve_falhar(p_sql text, p_estado text, p_msg text)
returns void language plpgsql as $$
declare
  v_estado text;
  v_erro   text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_erro = message_text;
    if v_estado <> p_estado then
      raise exception 'FALHOU [%]: esperava erro % e veio % (%)', p_msg, p_estado, v_estado, v_erro;
    end if;
    raise notice 'ok: % (erro %: %)', p_msg, v_estado, v_erro;
    return;
  end;
  raise exception 'FALHOU [%]: deveria dar erro % e passou', p_msg, p_estado;
end;
$$;

grant execute on all functions in schema teste to anon, authenticated;

-- ---------- preparação (como postgres, igual ao editor SQL) ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@teste.local',   '{"nome": "Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'gestor@teste.local',  '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'campo@teste.local',   '{}'),
  ('00000000-0000-0000-0000-0000000000d1', 'leitura@teste.local', '{}'),
  ('00000000-0000-0000-0000-0000000000e1', 'fora@teste.local',    '{}');

select teste.ok((select count(*) from public.perfis) = 5, 'gatilho cria um perfil por usuário');
select teste.ok((select nome from public.perfis where id = '00000000-0000-0000-0000-0000000000a1') = 'Admin',
  'nome do perfil vem do metadata');
select teste.ok((select nome from public.perfis where id = '00000000-0000-0000-0000-0000000000b1') = 'gestor',
  'sem metadata, nome do perfil vem do e-mail');
select teste.ok((select papel from public.perfis where id = '00000000-0000-0000-0000-0000000000b1') = 'usuario',
  'perfil novo nasce como usuario');

update public.perfis set papel = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.obras (id, codigo, nome, criado_por) values
  ('11111111-1111-1111-1111-111111111111', 'OBRA1', 'Obra 1', '00000000-0000-0000-0000-0000000000a1'),
  ('22222222-2222-2222-2222-222222222222', 'OBRA2', 'Obra 2', '00000000-0000-0000-0000-0000000000a1');

insert into public.acessos (usuario_id, obra_id, papel) values
  ('00000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'gestor'),
  ('00000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'leitura'),
  ('00000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'campo'),
  ('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', 'leitura');

insert into public.pavimentos (id, obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Térreo', 1,
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now()),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Térreo', 1,
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now());

-- Tabela de evento de exemplo, como um módulo faria.
create table public.teste_eventos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  elemento              text not null,
  resultado             text not null,
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false
);
select nucleo.preparar_tabela('public.teste_eventos', 'campo', 'nenhuma');

select teste.ok(
  (select inclusao || '/' || alteracao from nucleo.tabelas_sincronizadas where tabela = 'public.teste_eventos') = 'campo/nenhuma',
  'preparar_tabela registra a tabela');
select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela in ('public.pavimentos', 'public.setores', 'public.elementos', 'public.arquivos')) = 4,
  'tabelas do núcleo estão registradas');

-- preparar_tabela recusa tabela fora do padrão
create table public.teste_incompleta (id uuid primary key, obra_id uuid not null);
select teste.deve_falhar($$select nucleo.preparar_tabela('public.teste_incompleta')$$, 'P0001',
  'preparar_tabela recusa tabela sem as colunas obrigatórias');

create table public.teste_pk_errada (
  id uuid not null, obra_id uuid not null, usuario_id uuid not null, dispositivo_id uuid not null,
  criado_em_dispositivo timestamptz not null, criado_em_servidor timestamptz not null,
  atualizado_em timestamptz not null, apagado boolean not null,
  primary key (id, obra_id)
);
select teste.deve_falhar($$select nucleo.preparar_tabela('public.teste_pk_errada')$$, 'P0001',
  'preparar_tabela recusa chave primária que não seja só id');

select teste.deve_falhar($$select nucleo.preparar_tabela('public.teste_eventos', 'qualquer', 'nenhuma')$$, 'P0001',
  'preparar_tabela recusa parâmetro inválido');

-- =====================================================================
-- anon (sem login)
-- =====================================================================
set role anon;
select teste.deve_falhar($$select * from public.obras$$, '42501', 'anon não lê obras');
select teste.deve_falhar($$select * from public.pavimentos$$, '42501', 'anon não lê pavimentos');
reset role;

-- =====================================================================
-- e1: logado, sem acesso a obra nenhuma
-- =====================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';

select teste.ok((select count(*) from public.obras) = 0, 'sem acesso não vê obras');
select teste.ok((select count(*) from public.pavimentos) = 0, 'sem acesso não vê pavimentos');
select teste.ok((select count(*) from public.perfis) = 1, 'sem acesso vê só o próprio perfil');
select teste.ok((select count(*) from public.acessos) = 0, 'sem acesso não vê acessos');
select teste.deve_falhar($$
  insert into storage.objects (bucket_id, name) values ('obras', '11111111-1111-1111-1111-111111111111/fvs/x.jpg')
$$, '42501', 'sem acesso não envia arquivo');
reset role;

-- =====================================================================
-- d1: leitura na obra 1
-- =====================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';

select teste.ok((select array_agg(codigo) from public.obras) = array['OBRA1'], 'leitura vê só a obra 1');
select teste.ok((select count(*) from public.pavimentos) = 1, 'leitura vê os pavimentos da obra 1');
select teste.deve_falhar($$
  insert into public.teste_eventos (id, obra_id, elemento, resultado, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'P1', 'C',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'leitura não registra evento');
select teste.deve_falhar($$
  insert into storage.objects (bucket_id, name) values ('obras', '11111111-1111-1111-1111-111111111111/fvs/d.jpg')
$$, '42501', 'leitura não envia arquivo');
reset role;

-- =====================================================================
-- b1: gestor da obra 1, leitura na obra 2
-- =====================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

select teste.ok((select count(*) from public.obras) = 2, 'gestor vê obra 1 e obra 2 (leitura)');

-- inclusão: hora do servidor é do servidor, hora do aparelho é preservada
insert into public.pavimentos (id, obra_id, nome, ordem, dispositivo_id, criado_em_dispositivo, criado_em_servidor)
values ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '2º Pavimento', 2,
        'dddddddd-dddd-dddd-dddd-dddddddddddd', '2026-01-01 08:00:00-03', '2000-01-01 00:00:00-03');

select teste.ok(
  (select criado_em_servidor > '2020-01-01' and criado_em_dispositivo = '2026-01-01 08:00:00-03'
          and usuario_id = '00000000-0000-0000-0000-0000000000b1'
   from public.pavimentos where id = 'a0000000-0000-0000-0000-000000000003'),
  'inclusão: servidor carimba a própria hora, guarda a do aparelho e o usuário');

select teste.deve_falhar($$
  insert into public.pavimentos (obra_id, nome, ordem, dispositivo_id, criado_em_dispositivo)
  values ('22222222-2222-2222-2222-222222222222', 'Mezanino', 2, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'gestor não cadastra na obra onde só tem leitura');

select teste.deve_falhar($$
  insert into public.pavimentos (obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'Mezanino', 2, '00000000-0000-0000-0000-0000000000c1',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'ninguém inclui registro em nome de outro usuário');

select pg_sleep(0.01);

-- alteração: origem não muda, atualizado_em anda
update public.pavimentos
set nome = '2º Pavto', usuario_id = '00000000-0000-0000-0000-0000000000c1', criado_em_dispositivo = '1999-01-01'
where id = 'a0000000-0000-0000-0000-000000000003';

select teste.ok(
  (select nome = '2º Pavto' and usuario_id = '00000000-0000-0000-0000-0000000000b1'
          and criado_em_dispositivo = '2026-01-01 08:00:00-03' and atualizado_em > criado_em_servidor
   from public.pavimentos where id = 'a0000000-0000-0000-0000-000000000003'),
  'alteração: muda o dado, mantém a origem, avança atualizado_em');

select teste.deve_falhar($$
  delete from public.pavimentos where id = 'a0000000-0000-0000-0000-000000000003'
$$, '42501', 'DELETE pela API é bloqueado (apagar = apagado true)');

update public.pavimentos set apagado = true where id = 'a0000000-0000-0000-0000-000000000003';
select teste.ok(
  (select apagado from public.pavimentos where id = 'a0000000-0000-0000-0000-000000000003'),
  'gestor marca como apagado e o registro continua visível para sincronizar');

-- obras e acessos
select teste.deve_falhar($$
  insert into public.obras (codigo, nome) values ('NOVA', 'Nova')
$$, '42501', 'gestor não cria obra');
with u as (update public.obras set nome = 'x' where codigo = 'OBRA1' returning 1)
select teste.ok((select count(*) from u) = 0, 'gestor não altera a obra');
select teste.ok((select count(*) from public.acessos) = 4, 'gestor vê os acessos da obra 1 e o próprio da obra 2');
select teste.deve_falhar($$
  insert into public.acessos (usuario_id, obra_id, papel)
  values ('00000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', 'campo')
$$, '42501', 'gestor não dá acesso (só admin)');

-- arquivos
insert into public.arquivos (id, obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
values ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111/projetos/prancha.pdf', 'prancha.pdf', repeat('a', 64), 1000,
        'application/pdf', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.deve_falhar($$
  insert into public.arquivos (obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222/x.pdf', 'x.pdf',
          repeat('a', 64), 1, 'application/pdf', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'caminho do arquivo tem que começar pelo id da própria obra');
select teste.deve_falhar($$
  insert into public.arquivos (obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/y.pdf', 'y.pdf',
          'abc', 1, 'application/pdf', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'hash tem que ser SHA-256 em hexadecimal');
reset role;

-- =====================================================================
-- c1: campo na obra 1
-- =====================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

select teste.deve_falhar($$
  insert into public.pavimentos (obra_id, nome, ordem, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'Mezanino', 2, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'campo não cadastra pavimento');

with u as (update public.pavimentos set nome = 'x' where id = 'a0000000-0000-0000-0000-000000000001' returning 1)
select teste.ok((select count(*) from u) = 0, 'campo não altera pavimento');

-- evento de campo, com reenvio idempotente (mesmo id duas vezes)
insert into public.teste_eventos (id, obra_id, elemento, resultado, dispositivo_id, criado_em_dispositivo)
values ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'P1', 'C',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', '2026-11-03 10:15:00-03');
insert into public.teste_eventos (id, obra_id, elemento, resultado, dispositivo_id, criado_em_dispositivo)
values ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'P1', 'C',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', '2026-11-03 10:15:00-03')
on conflict (id) do nothing;
select teste.ok((select count(*) from public.teste_eventos) = 1, 'campo registra evento; reenvio do mesmo id não duplica');

select teste.deve_falhar($$
  update public.teste_eventos set resultado = 'NC'
$$, '42501', 'evento não é alterado pela API');

select teste.deve_falhar($$
  insert into public.teste_eventos (id, obra_id, elemento, resultado, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'P1', 'C',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'campo não registra em obra sem acesso');

-- arquivo de foto de NC: campo inclui registro e envia arquivo
insert into public.arquivos (obra_id, caminho, nome_original, hash, tamanho, tipo, dispositivo_id, criado_em_dispositivo)
values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/fvs/nc1.jpg', 'nc1.jpg',
        repeat('b', 64), 2000, 'image/jpeg', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
with u as (update public.arquivos set apagado = true returning 1)
select teste.ok((select count(*) from u) = 0, 'campo não marca arquivo como apagado');

insert into storage.objects (bucket_id, name) values ('obras', '11111111-1111-1111-1111-111111111111/fvs/nc1.jpg');
select teste.deve_falhar($$
  insert into storage.objects (bucket_id, name) values ('obras', '22222222-2222-2222-2222-222222222222/fvs/nc1.jpg')
$$, '42501', 'campo não envia arquivo para obra sem acesso');
select teste.deve_falhar($$
  insert into storage.objects (bucket_id, name) values ('obras', 'lixo/nc1.jpg')
$$, '42501', 'caminho que não começa por id de obra é recusado sem erro de conversão');
with u as (update storage.objects set name = name || '.bak' returning 1)
select teste.ok((select count(*) from u) = 0, 'arquivo no armazenamento não é alterado');
with u as (delete from storage.objects returning 1)
select teste.ok((select count(*) from u) = 0, 'arquivo no armazenamento não é apagado pela API');

-- perfis
select teste.ok((select count(*) from public.perfis) = 3, 'campo vê o próprio perfil e o de quem divide obra');
update public.perfis set nome = 'Fulano de Campo' where id = '00000000-0000-0000-0000-0000000000c1';
select teste.ok((select nome from public.perfis where id = '00000000-0000-0000-0000-0000000000c1') = 'Fulano de Campo',
  'usuário muda o próprio nome');
select teste.deve_falhar($$
  update public.perfis set papel = 'admin' where id = '00000000-0000-0000-0000-0000000000c1'
$$, '42501', 'usuário não muda o próprio papel');
with u as (update public.perfis set nome = 'x' where id = '00000000-0000-0000-0000-0000000000b1' returning 1)
select teste.ok((select count(*) from u) = 0, 'usuário não muda o nome de outro');
select teste.ok((select count(*) from public.acessos) = 1, 'campo vê só o próprio acesso');
reset role;

-- d1 de novo: vê o arquivo enviado pelo campo; e1 não
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from storage.objects) = 1, 'leitura vê arquivos da obra 1');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from storage.objects) = 0, 'sem acesso não vê arquivos');
reset role;

-- =====================================================================
-- a1: admin
-- =====================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

select teste.ok((select count(*) from public.obras) = 2, 'admin vê todas as obras');
insert into public.obras (codigo, nome) values ('OBRA3', 'Obra 3');
select teste.ok(
  (select criado_por = '00000000-0000-0000-0000-0000000000a1' from public.obras where codigo = 'OBRA3'),
  'admin cria obra e fica como criado_por');
select teste.deve_falhar($$
  insert into public.obras (codigo, nome) values ('obra minúscula', 'x')
$$, '23514', 'código da obra só com maiúsculas, números, _ e -');

select teste.deve_falhar($$
  update public.pavimentos set obra_id = '22222222-2222-2222-2222-222222222222'
  where id = 'a0000000-0000-0000-0000-000000000001'
$$, '23514', 'obra_id não pode ser alterado');

-- elementos
insert into public.elementos (obra_id, pavimento_id, tipo, nome, secao, dispositivo_id, criado_em_dispositivo)
values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'P', 'P124', '20x60',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'P', 'P1',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'elemento não pode apontar para pavimento de outra obra');
select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'V', 'V 46',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'nome de elemento sem espaço');
select teste.deve_falhar($$
  insert into public.elementos (obra_id, pavimento_id, tipo, nome, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'P', 'P124',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'mesmo elemento duas vezes no mesmo pavimento é recusado');
update public.elementos set apagado = true where nome = 'P124';
insert into public.elementos (obra_id, pavimento_id, tipo, nome, dispositivo_id, criado_em_dispositivo)
values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'P', 'P124',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.elementos where nome = 'P124') = 2,
  'depois de apagado, o elemento pode ser cadastrado de novo');

select teste.deve_falhar($$
  insert into public.setores (obra_id, pavimento_id, nome_projeto, disciplina, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'Trecho 1', 'estrutura',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'setor não pode apontar para pavimento de outra obra');
insert into public.setores (obra_id, nome_projeto, disciplina, dispositivo_id, criado_em_dispositivo)
values ('11111111-1111-1111-1111-111111111111', 'Trecho 1', 'estrutura', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.setores) = 1, 'setor sem pavimento é aceito');
reset role;

-- =====================================================================
-- postgres (editor SQL): evento continua só de inclusão
-- =====================================================================
select teste.deve_falhar($$
  update public.teste_eventos set resultado = 'NC'
$$, '23001', 'evento não é alterado nem pelo editor SQL');

-- =====================================================================
-- Cargas iniciais (seed): rodam e podem rodar de novo
-- =====================================================================
\ir ../seed/01_obra_teste.sql
\ir ../seed/02_obra_exemplo.sql
\ir ../seed/01_obra_teste.sql
\ir ../seed/02_obra_exemplo.sql

select teste.ok(
  (select count(*) from public.pavimentos p join public.obras o on o.id = p.obra_id where o.codigo = 'TESTE') = 3,
  'seed: obra TESTE com 3 pavimentos, sem duplicar');
select teste.ok(
  (select string_agg(p.nome, ', ' order by p.ordem)
   from public.pavimentos p join public.obras o on o.id = p.obra_id where o.codigo = 'EXE')
  = 'Subsolo, Térreo, 1º Pavimento, 2º Pavimento, Cobertura',
  'seed: obra de exemplo com os 5 pavimentos na ordem, sem duplicar');

\echo 'TODOS OS TESTES PASSARAM'
