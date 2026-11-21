-- =====================================================================
-- Sistema Obra: convites (pessoa na obra antes de ter e-mail ou conta)
--
-- Pedido do Nicolas (21/11/2026): cadastrar pessoas na obra ainda sem e-mail;
-- o e-mail entra depois e a pessoa vira login.
--
-- Como funciona:
--   1. O admin cria o convite: obra, nome, papel (e-mail pode ficar vazio).
--        select public.convidar('<obra_id>', 'Nome', 'campo');
--   2. Quando souber o e-mail, o admin põe no convite.
--        select public.por_email_no_convite('<convite_id>', 'pessoa@exemplo.com');
--      Se já existe conta com esse e-mail, o acesso é dado na hora.
--   3. Senão, quando a pessoa entra no app pela primeira vez com esse e-mail e
--      confirma com o código, o acesso nasce sozinho (gatilho em auth.users,
--      só com o e-mail confirmado), com o papel do convite, e o nome do
--      convite vai para o perfil.
--
-- Os convites não são sincronizados (não vão para o aparelho) e só o admin
-- lê e escreve. Contrato: docs/02_CONTRATO_NUCLEO.md, seção "Convites".
-- Onde aplicar: editor SQL do Supabase. Roda numa transação.
-- =====================================================================

begin;

create table public.convites (
  id         uuid primary key default gen_random_uuid(),
  obra_id    uuid not null references public.obras (id) on delete cascade,
  nome       text not null check (btrim(nome) <> ''),
  -- Guardado já sem espaços e em minúsculas (as funções normalizam).
  email      text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  papel      text not null check (papel in ('gestor', 'campo', 'leitura')),
  -- Preenchidos quando o convite vira acesso.
  usuario_id uuid references public.perfis (id) on delete set null,
  aceito_em  timestamptz,
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null,
  criado_em  timestamptz not null default now(),
  apagado    boolean not null default false
);
-- Um convite aberto por e-mail em cada obra.
create unique index convites_email_por_obra on public.convites (obra_id, email)
  where email is not null and not apagado;
create index convites_email on public.convites (email) where email is not null and aceito_em is null and not apagado;

-- Só o admin. Sem regra para mais ninguém = ninguém mais vê nem mexe.
alter table public.convites enable row level security;
create policy convites_admin on public.convites
  for all to authenticated
  using (nucleo.eh_admin())
  with check (nucleo.eh_admin());
revoke all on public.convites from anon;
grant select, insert, update on public.convites to authenticated;

-- Dá o acesso do convite à conta e marca o convite como aceito.
-- Uso interno: chamada pelas funções abaixo, que já conferiram quem pode.
create function nucleo.aceitar_convite(p_convite_id uuid, p_usuario_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.convites;
begin
  select * into c from public.convites where id = p_convite_id;
  -- Admin já vê todas as obras: não ganha linha em acessos, mas o convite fica resolvido.
  if not exists (select 1 from public.perfis p where p.id = p_usuario_id and p.papel = 'admin') then
    insert into public.acessos (usuario_id, obra_id, papel)
    values (p_usuario_id, c.obra_id, c.papel)
    on conflict (usuario_id, obra_id) do update set papel = excluded.papel;
  end if;
  -- O nome do convite vale mais que o padrão tirado do e-mail (o que vem antes do @).
  update public.perfis p
  set nome = c.nome
  where p.id = p_usuario_id
    and (p.nome = '' or p.nome = split_part(coalesce((select u.email::text from auth.users u where u.id = p_usuario_id), ''), '@', 1));
  update public.convites set usuario_id = p_usuario_id, aceito_em = now() where id = p_convite_id;
end;
$$;
revoke execute on function nucleo.aceitar_convite(uuid, uuid) from public;

create function public.convidar(p_obra_id uuid, p_nome text, p_papel text, p_email text default null)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not nucleo.eh_admin() then
    raise exception 'Sistema Obra: só o administrador convida' using errcode = '42501';
  end if;
  if p_papel is null or p_papel not in ('gestor', 'campo', 'leitura') then
    raise exception 'Sistema Obra: papel inválido: % (use gestor, campo ou leitura)', p_papel using errcode = '22023';
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Sistema Obra: o convite precisa de um nome' using errcode = '22023';
  end if;
  if not exists (select 1 from public.obras o where o.id = p_obra_id and not o.apagado) then
    raise exception 'Sistema Obra: obra não encontrada' using errcode = 'P0002';
  end if;
  insert into public.convites (obra_id, nome, papel)
  values (p_obra_id, btrim(p_nome), p_papel)
  returning id into v_id;
  if nullif(btrim(coalesce(p_email, '')), '') is not null then
    perform public.por_email_no_convite(v_id, p_email);
  end if;
  return v_id;
end;
$$;

-- Põe (ou troca) o e-mail do convite. Devolve true se o acesso já foi dado
-- (havia conta com esse e-mail) e false se fica esperando a pessoa entrar.
create function public.por_email_no_convite(p_convite_id uuid, p_email text)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  c public.convites;
  v_quantas integer;
  v_usuario uuid;
begin
  if not nucleo.eh_admin() then
    raise exception 'Sistema Obra: só o administrador mexe em convites' using errcode = '42501';
  end if;
  select * into c from public.convites where id = p_convite_id and not apagado;
  if not found then
    raise exception 'Sistema Obra: convite não encontrado' using errcode = 'P0002';
  end if;
  if c.aceito_em is not null then
    raise exception 'Sistema Obra: este convite já virou acesso. Para mudar, use a tela Pessoas da obra.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Sistema Obra: e-mail inválido: %', btrim(coalesce(p_email, '')) using errcode = '22023';
  end if;
  if exists (select 1 from public.convites o where o.obra_id = c.obra_id and o.email = v_email
             and o.id <> c.id and not o.apagado) then
    raise exception 'Sistema Obra: já existe um convite com o e-mail % nesta obra', v_email using errcode = '23505';
  end if;

  update public.convites set email = v_email where id = c.id;

  select count(*), (array_agg(u.id))[1] into v_quantas, v_usuario
  from auth.users u where lower(u.email::text) = v_email;
  if v_quantas > 1 then
    raise exception 'Sistema Obra: há mais de uma conta com o e-mail %. Resolva no painel do Supabase (Authentication > Users).',
      v_email using errcode = 'P0003';
  end if;
  -- Só conta com o e-mail confirmado (a pessoa já provou, com o código, que é dona dele).
  -- Conta ainda não confirmada: o gatilho dá o acesso quando ela confirmar.
  if v_quantas = 1
     and exists (select 1 from auth.users u where u.id = v_usuario and u.email_confirmed_at is not null)
     and exists (select 1 from public.perfis p where p.id = v_usuario) then
    perform nucleo.aceitar_convite(c.id, v_usuario);
    return true;
  end if;
  return false;
end;
$$;

revoke execute on function public.convidar(uuid, text, text, text) from public, anon;
revoke execute on function public.por_email_no_convite(uuid, text) from public, anon;
grant execute on function public.convidar(uuid, text, text, text) to authenticated;
grant execute on function public.por_email_no_convite(uuid, text) to authenticated;

-- Conta com e-mail confirmado: se houver convite aberto com o e-mail dela, vira acesso.
-- Segurança: o acesso só sai depois que o e-mail é confirmado (email_confirmed_at).
-- No login por código, o Supabase cria a conta ao pedir o código e só confirma o
-- e-mail quando a pessoa digita o código certo; quem só digitou o e-mail de outra
-- pessoa não ganha nada. Vale também para conta criada com senha pela API.
create function nucleo.aceitar_convites_da_conta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(coalesce(new.email::text, ''));
  c record;
begin
  if new.email_confirmed_at is null or v_email = '' then
    return new;
  end if;
  -- Já estava confirmado com o mesmo e-mail: nada de novo.
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null
     and lower(coalesce(old.email::text, '')) = v_email then
    return new;
  end if;
  -- O perfil nasce de outro gatilho em auth.users; este roda depois (ordem alfabética do nome).
  if not exists (select 1 from public.perfis p where p.id = new.id) then
    return new;
  end if;
  for c in
    select v.id from public.convites v
    join public.obras o on o.id = v.obra_id
    where v.email = v_email and v.aceito_em is null and not v.apagado and not o.apagado
    order by v.criado_em
  loop
    -- Roda dentro do cadastro e da confirmação da conta: erro aqui impediria a pessoa
    -- de entrar com o código. Um convite com problema só gera aviso no log; o admin
    -- dá o acesso pela tela Pessoas da obra.
    begin
      perform nucleo.aceitar_convite(c.id, new.id);
    exception when others then
      raise warning 'Sistema Obra: convite % não virou acesso: %', c.id, sqlerrm;
    end;
  end loop;
  return new;
end;
$$;
revoke execute on function nucleo.aceitar_convites_da_conta() from public;

-- O nome começa depois de "sistema_obra_criar_perfil" na ordem alfabética: o Postgres
-- roda os gatilhos AFTER da mesma tabela nessa ordem, então o perfil já existe aqui.
create trigger sistema_obra_entrada_convites
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function nucleo.aceitar_convites_da_conta();

commit;
