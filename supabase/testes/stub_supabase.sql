-- =====================================================================
-- Imitação mínima do Supabase para testar as migrações num Postgres local.
-- NÃO aplicar no Supabase de verdade: lá isto já existe.
--
-- Reproduz só o que as migrações usam: papéis anon/authenticated/service_role,
-- privilégios padrão do schema public, auth.users, auth.uid(), storage.buckets
-- e storage.objects (com RLS ativo).
-- =====================================================================

-- Papéis existem no cluster inteiro: o bloco tolera rodar de novo num segundo banco
-- (o teste de restauração da exportação cria um banco novo no mesmo Postgres).
do $$
begin
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create role authenticator login noinherit;
exception when duplicate_object then null;
end
$$;
grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  email_confirmed_at timestamptz, -- null = ainda não digitou o código (o Supabase preenche ao confirmar)
  last_sign_in_at    timestamptz  -- null = pediu o código e nunca entrou
);

-- Mesma definição do Supabase: lê o "sub" do JWT da requisição.
create function auth.uid()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id         text primary key,
  name       text not null unique,
  public     boolean default false,
  owner      uuid,
  created_at timestamptz default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid default auth.uid(),
  created_at timestamptz default now(),
  metadata   jsonb,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
