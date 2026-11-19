-- =====================================================================
-- Sistema Obra: migração do núcleo (v1)
--
-- Onde aplicar: editor SQL do Supabase, projeto wtptoyvyypaeotxiqupy.
-- Quantas vezes: uma. Roda tudo numa transação: se der erro, nada fica pela metade.
-- Contrato: docs/02_CONTRATO_NUCLEO.md (dono: sessão Núcleo).
--
-- Conteúdo:
--   1. Esquema "nucleo" (funções internas, não exposto pela API)
--   2. perfis, obras, acessos
--   3. Funções de permissão usadas nas regras RLS
--   4. Gatilhos das colunas de sincronização
--   5. nucleo.preparar_tabela(): o que todo módulo chama nas próprias tabelas
--   6. pavimentos, setores, elementos, arquivos
--   7. Bucket "obras" no armazenamento e regras de acesso aos arquivos
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Esquema interno
-- ---------------------------------------------------------------------
-- Fica fora do "public", então a API (PostgREST) não expõe estas funções como RPC.
-- O papel authenticated precisa de USAGE porque as regras RLS chamam as funções.
create schema nucleo;
grant usage on schema nucleo to authenticated;

-- ---------------------------------------------------------------------
-- 2. Perfis, obras e acessos
-- ---------------------------------------------------------------------

-- Um perfil por usuário do Supabase (criado pelo gatilho em auth.users, seção 4).
-- papel 'admin': cria obras, dá acessos e vê todas as obras.
-- papel 'usuario': só vê as obras listadas em acessos.
create table public.perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text not null default '',
  papel         text not null default 'usuario' check (papel in ('admin', 'usuario')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.obras (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null unique check (codigo ~ '^[A-Z0-9_-]+$'),
  nome               text not null,
  empresa            text,
  criado_por         uuid default auth.uid() references public.perfis (id),
  criado_em_servidor timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  apagado            boolean not null default false
);

-- Papel do usuário dentro de uma obra:
--   gestor : cadastro da obra e dados de escritório (projetos, documentos); também registra em campo
--   campo  : registra em campo (eventos de FVS, fotos de NC, caminhões de concreto) e lê o resto
--   leitura: só lê
-- Revogar acesso = apagar a linha (esta tabela não é baixada por cursor).
create table public.acessos (
  usuario_id    uuid not null references public.perfis (id) on delete cascade,
  obra_id       uuid not null references public.obras (id) on delete cascade,
  papel         text not null check (papel in ('gestor', 'campo', 'leitura')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, obra_id)
);
create index acessos_obra on public.acessos (obra_id);

-- ---------------------------------------------------------------------
-- 3. Funções de permissão
-- ---------------------------------------------------------------------
-- security definer: leem perfis/acessos sem passar pelas regras RLS dessas tabelas
-- (evita recursão). search_path vazio e nomes qualificados: proteção padrão
-- contra sequestro de search_path em funções security definer.

create function nucleo.eh_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p
    where p.id = auth.uid() and p.papel = 'admin'
  );
$$;

-- 'admin', 'gestor', 'campo', 'leitura' ou null (sem acesso).
create function nucleo.papel_na_obra(p_obra_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when p_obra_id is null then null
    when nucleo.eh_admin() then 'admin'
    else (
      select a.papel from public.acessos a
      where a.usuario_id = auth.uid() and a.obra_id = p_obra_id
    )
  end;
$$;

create function nucleo.pode_ler(p_obra_id uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select nucleo.papel_na_obra(p_obra_id) is not null;
$$;

create function nucleo.pode_registrar(p_obra_id uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(nucleo.papel_na_obra(p_obra_id) in ('admin', 'gestor', 'campo'), false);
$$;

create function nucleo.pode_gerir(p_obra_id uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(nucleo.papel_na_obra(p_obra_id) in ('admin', 'gestor'), false);
$$;

-- Ver o perfil (nome) de outra pessoa: só quem divide obra com ela, ou admin.
-- Serve para mostrar "conferido por Fulano".
create function nucleo.ve_perfil(p_usuario_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_usuario_id = auth.uid()
      or nucleo.eh_admin()
      or exists (
        select 1
        from public.acessos eu
        join public.acessos outro on outro.obra_id = eu.obra_id
        where eu.usuario_id = auth.uid() and outro.usuario_id = p_usuario_id
      );
$$;

-- ---------------------------------------------------------------------
-- 4. Gatilhos
-- ---------------------------------------------------------------------

-- Inclusão em tabela sincronizada: hora do servidor é sempre a do servidor,
-- mesmo que o aparelho mande outra.
create function nucleo.sinc_antes_inserir()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.criado_em_servidor := now();
  new.atualizado_em := now();
  return new;
end;
$$;

-- Alteração em tabela sincronizada: origem do registro não muda.
-- id e obra_id não mudam nunca (mudar obra_id quebraria acesso e sincronização).
create function nucleo.sinc_antes_alterar()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id or new.obra_id <> old.obra_id then
    raise exception 'Sistema Obra: id e obra_id não podem ser alterados (tabela %)', tg_table_name
      using errcode = 'check_violation';
  end if;
  new.usuario_id            := old.usuario_id;
  new.dispositivo_id        := old.dispositivo_id;
  new.criado_em_dispositivo := old.criado_em_dispositivo;
  new.criado_em_servidor    := old.criado_em_servidor;
  new.atualizado_em         := now();
  return new;
end;
$$;

-- Tabelas de evento são só de inclusão: corrigir = registrar evento novo.
-- Vale até para o editor SQL. Para limpar dados de teste, use DELETE (não é bloqueado aqui).
create function nucleo.bloquear_alteracao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Sistema Obra: % é só de inclusão. Registre um evento novo em vez de alterar.', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

create function nucleo.tocar_atualizado_em()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create function nucleo.obras_antes_alterar()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Sistema Obra: id da obra não pode ser alterado' using errcode = 'check_violation';
  end if;
  new.criado_por         := old.criado_por;
  new.criado_em_servidor := old.criado_em_servidor;
  new.atualizado_em      := now();
  return new;
end;
$$;

create trigger tocar_atualizado_em before update on public.perfis
  for each row execute function nucleo.tocar_atualizado_em();
create trigger tocar_atualizado_em before update on public.acessos
  for each row execute function nucleo.tocar_atualizado_em();
create trigger sinc_inserir before insert on public.obras
  for each row execute function nucleo.sinc_antes_inserir();
create trigger obras_alterar before update on public.obras
  for each row execute function nucleo.obras_antes_alterar();

-- Perfil automático para cada usuário novo do Supabase.
create function nucleo.criar_perfil()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.perfis (id, nome)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function nucleo.criar_perfil() from public;

create trigger sistema_obra_criar_perfil after insert on auth.users
  for each row execute function nucleo.criar_perfil();

-- Usuários que já existiam antes desta migração.
insert into public.perfis (id, nome)
select u.id, split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 5. nucleo.preparar_tabela(): padrão de toda tabela sincronizada
-- ---------------------------------------------------------------------
-- Cada módulo cria a tabela com as colunas obrigatórias (ver contrato) e chama:
--   select nucleo.preparar_tabela('public.fvs_eventos', 'campo', 'nenhuma');   -- evento de campo
--   select nucleo.preparar_tabela('public.revisoes', 'gestor', 'gestor');      -- cadastro de escritório
--
-- p_inclusao  : quem inclui. 'campo' (admin, gestor, campo) ou 'gestor' (admin, gestor)
-- p_alteracao : quem altera. 'gestor' (admin, gestor) ou 'nenhuma' (só inclusão)
--
-- A função confere as colunas, liga os gatilhos, ativa RLS, cria as regras
-- (ler / incluir / alterar), tira DELETE da API e cria o índice da baixa por cursor.
-- Pode ser chamada de novo na mesma tabela (refaz gatilhos e regras).

create table nucleo.tabelas_sincronizadas (
  tabela        text primary key,
  inclusao      text not null,
  alteracao     text not null,
  registrada_em timestamptz not null default now()
);

create function nucleo.preparar_tabela(
  p_tabela    regclass,
  p_inclusao  text default 'gestor',
  p_alteracao text default 'gestor'
)
returns void
language plpgsql
set search_path = ''
set client_min_messages = warning  -- sem avisos "does not exist, skipping" no editor SQL
as $$
declare
  v_relname   text;
  v_faltando  text;
  v_attnum_id smallint;
begin
  if p_inclusao not in ('campo', 'gestor') then
    raise exception 'Sistema Obra: p_inclusao deve ser campo ou gestor (veio %)', p_inclusao;
  end if;
  if p_alteracao not in ('gestor', 'nenhuma') then
    raise exception 'Sistema Obra: p_alteracao deve ser gestor ou nenhuma (veio %)', p_alteracao;
  end if;

  select c.relname into v_relname from pg_catalog.pg_class c where c.oid = p_tabela;

  -- Colunas obrigatórias, com tipo certo e NOT NULL.
  select string_agg(esperada.coluna || ' ' || esperada.tipo, ', ')
  into v_faltando
  from (values
    ('id',                    'uuid'),
    ('obra_id',               'uuid'),
    ('usuario_id',            'uuid'),
    ('dispositivo_id',        'uuid'),
    ('criado_em_dispositivo', 'timestamp with time zone'),
    ('criado_em_servidor',    'timestamp with time zone'),
    ('atualizado_em',         'timestamp with time zone'),
    ('apagado',               'boolean')
  ) as esperada (coluna, tipo)
  where not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = p_tabela
      and a.attname = esperada.coluna
      and not a.attisdropped
      and a.attnotnull
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = esperada.tipo
  );
  if v_faltando is not null then
    raise exception 'Sistema Obra: % não tem as colunas obrigatórias (NOT NULL): %', p_tabela, v_faltando;
  end if;

  -- Chave primária tem que ser só "id".
  select a.attnum into v_attnum_id
  from pg_catalog.pg_attribute a
  where a.attrelid = p_tabela and a.attname = 'id';
  if not exists (
    select 1 from pg_catalog.pg_constraint k
    where k.conrelid = p_tabela and k.contype = 'p' and k.conkey = array[v_attnum_id]
  ) then
    raise exception 'Sistema Obra: a chave primária de % tem que ser só a coluna id', p_tabela;
  end if;

  -- Gatilhos
  execute format('drop trigger if exists sinc_inserir on %s', p_tabela);
  execute format('drop trigger if exists sinc_alterar on %s', p_tabela);
  execute format(
    'create trigger sinc_inserir before insert on %s for each row execute function nucleo.sinc_antes_inserir()',
    p_tabela);
  execute format(
    'create trigger sinc_alterar before update on %s for each row execute function %s',
    p_tabela,
    case p_alteracao when 'nenhuma' then 'nucleo.bloquear_alteracao()' else 'nucleo.sinc_antes_alterar()' end);

  -- RLS e privilégios explícitos (não depende do padrão do projeto Supabase).
  -- Apagar = marcar apagado = true; DELETE pela API não existe.
  execute format('alter table %s enable row level security', p_tabela);
  execute format('revoke all on %s from anon, authenticated', p_tabela);
  execute format('grant select, insert on %s to authenticated', p_tabela);
  if p_alteracao = 'gestor' then
    execute format('grant update on %s to authenticated', p_tabela);
  end if;

  execute format('drop policy if exists ler on %s', p_tabela);
  execute format('drop policy if exists incluir on %s', p_tabela);
  execute format('drop policy if exists alterar on %s', p_tabela);

  execute format(
    'create policy ler on %s for select to authenticated using (nucleo.pode_ler(obra_id))',
    p_tabela);
  execute format(
    'create policy incluir on %s for insert to authenticated with check (usuario_id = (select auth.uid()) and %s(obra_id))',
    p_tabela,
    case p_inclusao when 'campo' then 'nucleo.pode_registrar' else 'nucleo.pode_gerir' end);
  if p_alteracao = 'gestor' then
    execute format(
      'create policy alterar on %s for update to authenticated using (nucleo.pode_gerir(obra_id)) with check (nucleo.pode_gerir(obra_id))',
      p_tabela);
  end if;

  -- Índice da baixa por cursor: where obra_id = ? and atualizado_em > ? order by atualizado_em, id
  execute format('create index if not exists %I on %s (obra_id, atualizado_em, id)', v_relname || '_cursor', p_tabela);

  insert into nucleo.tabelas_sincronizadas (tabela, inclusao, alteracao)
  values (p_tabela::text, p_inclusao, p_alteracao)
  on conflict (tabela) do update
    set inclusao = excluded.inclusao, alteracao = excluded.alteracao, registrada_em = now();
end;
$$;
revoke execute on function nucleo.preparar_tabela(regclass, text, text) from public;
revoke all on nucleo.tabelas_sincronizadas from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Tabelas sincronizadas do núcleo
-- ---------------------------------------------------------------------
-- unique (id, obra_id) em cada uma: permite chave estrangeira composta
-- (x_id, obra_id) nos módulos, garantindo que a referência é da mesma obra.

create table public.pavimentos (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  nome                  text not null,
  ordem                 integer not null,  -- de baixo para cima: subsolo menor que cobertura
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id)
);
create unique index pavimentos_nome_unico on public.pavimentos (obra_id, nome) where not apagado;

-- Liga o trecho da prancha ao setor do Construpoint (nomenclaturas diferentes).
create table public.setores (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  pavimento_id          uuid,
  nome_projeto          text not null,     -- ex.: "Trecho 2"
  nome_construpoint     text,              -- ex.: "B/C"; de-para da obra ainda não definido
  disciplina            text not null,     -- ex.: "estrutura"
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (pavimento_id, obra_id) references public.pavimentos (id, obra_id)
);

-- Pilar que aparece em dois trechos é um elemento só.
create table public.elementos (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  pavimento_id          uuid not null,
  tipo                  text not null check (tipo in ('P', 'V', 'L')),  -- pilar, viga, laje
  nome                  text not null check (nome ~ '^\S+$'),          -- sem espaços: "V46", não "V 46"
  secao                 text,                                           -- ex.: "20x60"
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (pavimento_id, obra_id) references public.pavimentos (id, obra_id)
);
create unique index elementos_unico on public.elementos (pavimento_id, tipo, nome) where not apagado;

-- Registro de cada arquivo guardado no bucket "obras".
-- Arquivo é imutável: versão nova = arquivo novo com caminho novo.
-- usuario_id = quem criou; criado_em_servidor = quando criou.
create table public.arquivos (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  caminho               text not null unique,  -- no bucket "obras": {obra_id}/{modulo}/...
  nome_original         text not null,
  hash                  text not null check (hash ~ '^[0-9a-f]{64}$'),  -- SHA-256 em hexadecimal
  tamanho               bigint not null check (tamanho >= 0),          -- bytes
  tipo                  text not null,                                  -- tipo MIME, ex.: image/jpeg
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  check (starts_with(caminho, obra_id::text || '/'))
);

select nucleo.preparar_tabela('public.pavimentos', 'gestor', 'gestor');
select nucleo.preparar_tabela('public.setores',    'gestor', 'gestor');
select nucleo.preparar_tabela('public.elementos',  'gestor', 'gestor');
-- Foto de NC é tirada em campo: campo inclui. Só gestor marca como apagado.
select nucleo.preparar_tabela('public.arquivos',   'campo',  'gestor');

-- ---------------------------------------------------------------------
-- RLS de perfis, obras e acessos
-- ---------------------------------------------------------------------

-- Privilégios explícitos em todas: não depende do padrão do projeto Supabase.

alter table public.perfis enable row level security;
revoke all on public.perfis from anon, authenticated;
grant select, update (nome) on public.perfis to authenticated;  -- papel só muda pelo editor SQL
create policy ler on public.perfis for select to authenticated
  using (nucleo.ve_perfil(id));
create policy alterar_proprio on public.perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.obras enable row level security;
revoke all on public.obras from anon, authenticated;
grant select, insert, update on public.obras to authenticated;
create policy ler on public.obras for select to authenticated
  using (nucleo.pode_ler(id));
create policy incluir on public.obras for insert to authenticated
  with check (nucleo.eh_admin());
create policy alterar on public.obras for update to authenticated
  using (nucleo.eh_admin()) with check (nucleo.eh_admin());

alter table public.acessos enable row level security;
revoke all on public.acessos from anon, authenticated;
grant select, insert, update, delete on public.acessos to authenticated;
create policy ler on public.acessos for select to authenticated
  using (usuario_id = (select auth.uid()) or nucleo.pode_gerir(obra_id));
create policy incluir on public.acessos for insert to authenticated
  with check (nucleo.eh_admin());
create policy alterar on public.acessos for update to authenticated
  using (nucleo.eh_admin()) with check (nucleo.eh_admin());
create policy apagar on public.acessos for delete to authenticated
  using (nucleo.eh_admin());

-- ---------------------------------------------------------------------
-- 7. Armazenamento: bucket "obras"
-- ---------------------------------------------------------------------
-- Privado. Caminho de todo arquivo começa pelo id da obra: {obra_id}/{modulo}/...
-- Ler: quem tem acesso à obra. Enviar: admin, gestor, campo.
-- Sem regra de alterar nem apagar: arquivo é imutável. Limpeza pelo painel do Supabase.

insert into storage.buckets (id, name, public)
values ('obras', 'obras', false)
on conflict (id) do nothing;

-- Primeiro trecho do caminho como uuid, ou null se não for uuid (null = sem acesso).
create function nucleo.obra_do_caminho(p_caminho text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
declare
  v_trecho text := split_part(p_caminho, '/', 1);
begin
  if v_trecho ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_trecho::uuid;
  end if;
  return null;
end;
$$;

create policy sistema_obra_ler on storage.objects for select to authenticated
  using (bucket_id = 'obras' and nucleo.pode_ler(nucleo.obra_do_caminho(name)));
create policy sistema_obra_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'obras' and nucleo.pode_registrar(nucleo.obra_do_caminho(name)));

commit;
