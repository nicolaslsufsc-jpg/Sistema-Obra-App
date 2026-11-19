-- =====================================================================
-- Testes da migração "pessoas da obra". Roda depois de testes_nucleo.sql (mesmo banco:
-- usa as pessoas a1..e1 e as obras 1111.../2222... criadas lá).
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- Quem entrou no app de verdade; f1 só pediu o código e nunca entrou.
update auth.users set last_sign_in_at = now();
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'nunca@teste.local');

-- c1 (campo na obra 1): não vê e-mails nem dá acesso
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.deve_falhar($$select * from public.pessoas_da_obra('11111111-1111-1111-1111-111111111111')$$, '42501',
  'pessoas: só admin vê a lista de pessoas');
select teste.deve_falhar($$select * from public.contas_sem_acesso('11111111-1111-1111-1111-111111111111')$$, '42501',
  'pessoas: só admin vê contas sem acesso');
select teste.deve_falhar($$select public.dar_acesso('fora@teste.local', '11111111-1111-1111-1111-111111111111', 'campo')$$,
  '42501', 'pessoas: só admin dá acesso');
reset role;

-- b1 (gestor da obra 1) também não; e update/delete em acessos não mudam nada para ele
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select teste.deve_falhar($$select public.dar_acesso('fora@teste.local', '11111111-1111-1111-1111-111111111111', 'campo')$$,
  '42501', 'pessoas: gestor não dá acesso');
with u as (update public.acessos set papel = 'gestor' where usuario_id = '00000000-0000-0000-0000-0000000000c1' returning 1)
select teste.ok((select count(*) from u) = 0, 'pessoas: gestor não muda papel de ninguém (0 linhas)');
with d as (delete from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000c1' returning 1)
select teste.ok((select count(*) from d) = 0, 'pessoas: gestor não tira acesso de ninguém (0 linhas)');
reset role;

-- a1 (admin)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

select teste.ok(
  (select array_agg(email || ':' || papel order by papel = 'admin' desc, email) from public.pessoas_da_obra('11111111-1111-1111-1111-111111111111'))
  = array['admin@teste.local:admin', 'campo@teste.local:campo', 'gestor@teste.local:gestor', 'leitura@teste.local:leitura'],
  'pessoas: admin vê as pessoas da obra com e-mail, inclusive o próprio admin como admin');
select teste.ok(
  (select array_agg(email) from public.contas_sem_acesso('11111111-1111-1111-1111-111111111111')) = array['fora@teste.local'],
  'pessoas: contas sem acesso mostra quem entrou e não tem esta obra (sem o admin, sem quem nunca entrou)');
select teste.ok(
  (select array_agg(email || ':' || em_outra_obra order by email) from public.contas_sem_acesso('22222222-2222-2222-2222-222222222222'))
  = array['campo@teste.local:true', 'fora@teste.local:false', 'leitura@teste.local:true'],
  'pessoas: na obra 2, quem está só na obra 1 aparece marcado como "em outra obra"');
select teste.ok(
  (select min(total) from public.contas_sem_acesso('22222222-2222-2222-2222-222222222222')) = 3,
  'pessoas: total acompanha a lista');

select teste.ok(
  public.dar_acesso('  FORA@teste.local ', '11111111-1111-1111-1111-111111111111', 'campo')
  = '00000000-0000-0000-0000-0000000000e1',
  'pessoas: dar acesso acha a conta pelo e-mail (sem diferenciar maiúsculas e espaços)');
select teste.ok(
  (select papel from public.pessoas_da_obra('11111111-1111-1111-1111-111111111111') where email = 'fora@teste.local') = 'campo',
  'pessoas: acesso dado aparece na lista');
select teste.ok((select count(*) from public.contas_sem_acesso('11111111-1111-1111-1111-111111111111')) = 0,
  'pessoas: quem ganhou acesso sai das contas sem acesso');

select public.dar_acesso('fora@teste.local', '11111111-1111-1111-1111-111111111111', 'leitura');
select teste.ok(
  (select papel from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000e1'
     and obra_id = '11111111-1111-1111-1111-111111111111') = 'leitura',
  'pessoas: dar acesso de novo muda o papel');

select teste.deve_falhar($$select public.dar_acesso('ninguem@teste.local', '11111111-1111-1111-1111-111111111111', 'campo')$$,
  'P0002', 'pessoas: e-mail sem conta dá erro explicando o que fazer');
select teste.deve_falhar($$select public.dar_acesso('admin@teste.local', '11111111-1111-1111-1111-111111111111', 'campo')$$,
  '22023', 'pessoas: admin não ganha linha de acesso (já vê tudo)');
select teste.deve_falhar($$select public.dar_acesso('fora@teste.local', '11111111-1111-1111-1111-111111111111', 'chefe')$$,
  '22023', 'pessoas: papel inválido é recusado');
select teste.deve_falhar($$select public.dar_acesso('fora@teste.local', '99999999-9999-9999-9999-999999999999', 'campo')$$,
  'P0002', 'pessoas: obra inexistente é recusada');

-- mudar papel e tirar acesso: direto na tabela, só admin
update public.acessos set papel = 'gestor'
where usuario_id = '00000000-0000-0000-0000-0000000000e1' and obra_id = '11111111-1111-1111-1111-111111111111';
delete from public.acessos
where usuario_id = '00000000-0000-0000-0000-0000000000e1' and obra_id = '11111111-1111-1111-1111-111111111111';
select teste.ok(
  (select array_agg(email) from public.contas_sem_acesso('11111111-1111-1111-1111-111111111111')) = array['fora@teste.local'],
  'pessoas: admin muda papel e tira acesso pela tabela');
reset role;

-- dois e-mails iguais (só possível com SSO ou conta criada à mão): recusa em vez de escolher um
insert into auth.users (id, email, last_sign_in_at) values ('00000000-0000-0000-0000-0000000000e2', 'FORA@teste.local', now());
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select teste.deve_falhar($$select public.dar_acesso('fora@teste.local', '11111111-1111-1111-1111-111111111111', 'campo')$$,
  'P0003', 'pessoas: mais de uma conta com o mesmo e-mail é recusada');
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e2';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000f1';

set role anon;
select teste.deve_falhar($$select * from public.contas_sem_acesso('11111111-1111-1111-1111-111111111111')$$, '42501',
  'pessoas: visitante sem login não chama');
reset role;

\echo 'TESTES DE PESSOAS PASSARAM'
