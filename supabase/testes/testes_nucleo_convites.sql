-- =====================================================================
-- Testes da migração "convites" (pessoa na obra antes de ter e-mail ou conta).
-- Roda depois de testes_nucleo.sql (mesmo banco: usa a1 admin, b1 gestor, c1 campo,
-- e1 sem acesso, e as obras 1111.../2222...). No fim apaga tudo o que criou, porque
-- testes_nucleo_pessoas.sql (depois deste) confere as listas de pessoas exatas.
-- Contas novas deste arquivo: ...f2 a ...f5.
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- Quem não é admin não convida, não lê e não mexe
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select teste.deve_falhar($$select public.convidar('11111111-1111-1111-1111-111111111111', 'Pessoa Um', 'campo')$$,
  '42501', 'convites: gestor não convida');
select teste.ok((select count(*) from public.convites) = 0, 'convites: gestor não lê convites');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.deve_falhar($$select public.convidar('11111111-1111-1111-1111-111111111111', 'Pessoa Um', 'campo')$$,
  '42501', 'convites: campo não convida');
select teste.deve_falhar($$insert into public.convites (obra_id, nome, papel)
  values ('11111111-1111-1111-1111-111111111111', 'Pessoa Um', 'campo')$$,
  '42501', 'convites: campo não insere direto na tabela');
reset role;

set role anon;
select teste.deve_falhar($$select public.convidar('11111111-1111-1111-1111-111111111111', 'Pessoa Um', 'campo')$$,
  '42501', 'convites: visitante sem login não chama');
reset role;

-- Admin convida sem e-mail
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.convidar('11111111-1111-1111-1111-111111111111', '  Pessoa Um ', 'campo') as conv1 \gset
select public.convidar('11111111-1111-1111-1111-111111111111', 'Pessoa Dois', 'leitura') as conv2 \gset
select teste.ok(
  (select array_agg(nome || ':' || papel || ':' || coalesce(email, '-') order by nome) from public.convites)
  = array['Pessoa Dois:leitura:-', 'Pessoa Um:campo:-'],
  'convites: admin convida sem e-mail (nome sem espaços nas pontas)');
select teste.ok((select count(*) from public.acessos where obra_id = '11111111-1111-1111-1111-111111111111') = 3,
  'convites: convite sem e-mail não dá acesso a ninguém');

select teste.deve_falhar($$select public.convidar('11111111-1111-1111-1111-111111111111', 'X', 'chefe')$$,
  '22023', 'convites: papel inválido é recusado');
select teste.deve_falhar($$select public.convidar('11111111-1111-1111-1111-111111111111', '   ', 'campo')$$,
  '22023', 'convites: nome vazio é recusado');
select teste.deve_falhar($$select public.convidar('99999999-9999-9999-9999-999999999999', 'X', 'campo')$$,
  'P0002', 'convites: obra inexistente é recusada');

-- Pôr e-mail num convite de quem ainda não tem conta: espera a pessoa entrar
select teste.ok(public.por_email_no_convite(:'conv1', '  PESSOA.UM@Teste.local ') = false,
  'convites: e-mail sem conta fica esperando (false)');
select teste.ok((select email from public.convites where id = :'conv1') = 'pessoa.um@teste.local',
  'convites: e-mail guardado sem espaços e em minúsculas');
select teste.deve_falhar(format($$select public.por_email_no_convite(%L, 'pessoa.um@teste.local')$$, :'conv2'),
  '23505', 'convites: dois convites abertos com o mesmo e-mail na mesma obra são recusados');
select teste.deve_falhar(format($$select public.por_email_no_convite(%L, 'sem-arroba')$$, :'conv2'),
  '22023', 'convites: e-mail inválido é recusado');
select teste.deve_falhar($$select public.por_email_no_convite('99999999-9999-9999-9999-999999999999', 'a@teste.local')$$,
  'P0002', 'convites: convite inexistente é recusado');
reset role;

-- A pessoa entra no app pela primeira vez (conta nova): o acesso nasce sozinho
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'Pessoa.Um@teste.local');
select teste.ok(
  (select papel from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000f2'
     and obra_id = '11111111-1111-1111-1111-111111111111') = 'campo',
  'convites: conta nova com o e-mail do convite ganha o acesso com o papel do convite');
select teste.ok((select nome from public.perfis where id = '00000000-0000-0000-0000-0000000000f2') = 'Pessoa Um',
  'convites: o nome do convite vai para o perfil');
select teste.ok(
  (select usuario_id = '00000000-0000-0000-0000-0000000000f2' and aceito_em is not null from public.convites where id = :'conv1'),
  'convites: convite marcado como aceito, com a conta');
select teste.ok((select count(*) from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000f2') = 1,
  'convites: só a obra do convite (nada na obra 2)');

-- Conta nova com outro e-mail não ganha nada
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'outra@teste.local');
select teste.ok((select count(*) from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000f3') = 0,
  'convites: conta sem convite não ganha acesso');
select teste.ok((select nome from public.perfis where id = '00000000-0000-0000-0000-0000000000f3') = 'outra',
  'convites: perfil sem convite fica com o nome padrão');

-- E-mail posto num convite de quem já tem conta: acesso na hora; nome escolhido pela pessoa não é trocado
update public.perfis set nome = 'Nome Que Ela Pos' where id = '00000000-0000-0000-0000-0000000000f3';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select teste.ok(public.por_email_no_convite(:'conv2', 'outra@teste.local') = true,
  'convites: e-mail de conta que já existe dá o acesso na hora (true)');
select teste.ok(
  (select papel from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000f3'
     and obra_id = '11111111-1111-1111-1111-111111111111') = 'leitura',
  'convites: papel do convite');
select teste.ok((select nome from public.perfis where id = '00000000-0000-0000-0000-0000000000f3') = 'Nome Que Ela Pos',
  'convites: nome que a pessoa já tinha não é trocado');
select teste.deve_falhar(format($$select public.por_email_no_convite(%L, 'nova@teste.local')$$, :'conv2'),
  '22023', 'convites: convite aceito não muda mais de e-mail');

-- Convite com e-mail na hora de convidar, para conta que já existe (e1, sem acesso), na obra 2
select public.convidar('22222222-2222-2222-2222-222222222222', 'Pessoa Fora', 'campo', 'fora@teste.local') as conv3 \gset
select teste.ok(
  (select papel from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000e1'
     and obra_id = '22222222-2222-2222-2222-222222222222') = 'campo',
  'convites: convidar já com e-mail de conta existente dá o acesso');

-- Convite apagado não vira acesso
select public.convidar('22222222-2222-2222-2222-222222222222', 'Pessoa Tres', 'campo', 'tres@teste.local') as conv4 \gset
update public.convites set apagado = true where id = :'conv4';
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f4', 'tres@teste.local');
select teste.ok((select count(*) from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000f4') = 0,
  'convites: convite apagado não dá acesso');

-- Convite que dá erro ao virar acesso não impede a pessoa de criar a conta (entrar com o código)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.convidar('22222222-2222-2222-2222-222222222222', 'Pessoa Cinco', 'campo', 'cinco@teste.local') as conv6 \gset
reset role;
create function teste.recusar_acesso() returns trigger language plpgsql as $$
begin
  raise exception 'erro de teste';
end;
$$;
create trigger teste_recusar_acesso before insert on public.acessos for each row execute function teste.recusar_acesso();
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f5', 'cinco@teste.local');
drop trigger teste_recusar_acesso on public.acessos;
drop function teste.recusar_acesso();
select teste.ok(exists (select 1 from public.perfis where id = '00000000-0000-0000-0000-0000000000f5')
  and (select count(*) from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000f5') = 0
  and (select aceito_em is null from public.convites where id = :'conv6'),
  'convites: erro ao aceitar o convite não trava a criação da conta (convite fica aberto)');

-- Convite para o próprio admin: resolve o convite sem linha em acessos
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.convidar('11111111-1111-1111-1111-111111111111', 'Admin', 'campo', 'admin@teste.local') as conv5 \gset
select teste.ok(
  (select count(*) from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000a1') = 0
  and (select aceito_em is not null from public.convites where id = :'conv5'),
  'convites: admin não ganha linha em acessos (já vê tudo)');

-- Gestor continua sem ver convites mesmo com convites na obra dele
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select teste.ok((select count(*) from public.convites) = 0, 'convites: gestor da obra não lê os convites dela');
with u as (update public.convites set papel = 'gestor' returning 1)
select teste.ok((select count(*) from u) = 0, 'convites: gestor não altera convite (0 linhas)');
reset role;

-- Limpeza (testes_nucleo_pessoas.sql confere as listas exatas de pessoas)
delete from public.convites;
delete from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000e1';
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000f2',
  '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f5');
select teste.ok((select count(*) from public.acessos where obra_id = '11111111-1111-1111-1111-111111111111') = 3
  and (select count(*) from public.acessos where usuario_id = '00000000-0000-0000-0000-0000000000e1') = 0,
  'convites: limpeza deixou os acessos como estavam');

\echo 'TESTES DE CONVITES PASSARAM'
