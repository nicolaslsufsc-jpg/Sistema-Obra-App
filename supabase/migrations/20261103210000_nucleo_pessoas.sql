-- =====================================================================
-- Sistema Obra: núcleo, pessoas da obra (v1)
--
-- Onde aplicar: editor SQL do Supabase, depois das migrações anteriores. Uma vez.
-- Usado pela tela "Pessoas da obra" do app: o admin dá, muda e tira acesso sem colar SQL.
--
-- Mudar o papel e tirar o acesso o app faz direto na tabela acessos (as regras do núcleo já
-- deixam só o admin alterar e apagar). Estas funções existem porque o e-mail fica em
-- auth.users, que a API não mostra: só o admin vê e-mails, por elas.
-- =====================================================================

begin;

-- Quem vê a obra: os administradores (veem todas as obras, papel 'admin') e quem tem linha
-- em acessos. Admin com linha em acessos aparece como 'admin' (a linha não muda nada).
create function public.pessoas_da_obra(p_obra_id uuid)
returns table (usuario_id uuid, email text, nome text, papel text, desde timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not nucleo.eh_admin() then
    raise exception 'Sistema Obra: só o administrador vê a lista de pessoas' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.nome,
           case when p.papel = 'admin' then 'admin' else a.papel end,
           coalesce(a.criado_em, p.criado_em)
    from public.perfis p
    join auth.users u on u.id = p.id
    left join public.acessos a on a.usuario_id = p.id and a.obra_id = p_obra_id
    where p.papel = 'admin' or a.usuario_id is not null
    order by (p.papel = 'admin') desc, lower(u.email::text);
end;
$$;

-- Contas que já entraram no app (completaram um login) e não têm acesso a ESTA obra.
-- em_outra_obra: já tem acesso a alguma outra. total: quantas existem no todo (a lista
-- corta nas 200 mais recentes).
create function public.contas_sem_acesso(p_obra_id uuid)
returns table (usuario_id uuid, email text, nome text, criada_em timestamptz, em_outra_obra boolean, total bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not nucleo.eh_admin() then
    raise exception 'Sistema Obra: só o administrador vê as contas sem acesso' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.nome, p.criado_em,
           exists (select 1 from public.acessos a where a.usuario_id = p.id),
           count(*) over ()
    from public.perfis p
    join auth.users u on u.id = p.id
    where p.papel <> 'admin'
      and u.last_sign_in_at is not null
      and not exists (select 1 from public.acessos a where a.usuario_id = p.id and a.obra_id = p_obra_id)
    order by p.criado_em desc
    limit 200;
end;
$$;

-- Dá o acesso (ou muda o papel, se já tinha) achando a conta pelo e-mail.
-- A pessoa precisa ter entrado no app uma vez (é quando a conta nasce).
create function public.dar_acesso(p_email text, p_obra_id uuid, p_papel text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_usuario uuid;
  v_quantas integer;
begin
  if not nucleo.eh_admin() then
    raise exception 'Sistema Obra: só o administrador dá acesso' using errcode = '42501';
  end if;
  if p_papel is null or p_papel not in ('gestor', 'campo', 'leitura') then
    raise exception 'Sistema Obra: papel inválido: % (use gestor, campo ou leitura)', p_papel using errcode = '22023';
  end if;
  if not exists (select 1 from public.obras o where o.id = p_obra_id and not o.apagado) then
    raise exception 'Sistema Obra: obra não encontrada' using errcode = 'P0002';
  end if;
  select count(*), (array_agg(u.id))[1] into v_quantas, v_usuario
  from auth.users u
  where lower(u.email::text) = lower(btrim(p_email));
  if v_quantas = 0 then
    raise exception 'Sistema Obra: nenhuma conta com o e-mail %. Peça para a pessoa entrar uma vez no app e tente de novo.',
      btrim(p_email) using errcode = 'P0002';
  end if;
  if v_quantas > 1 then
    raise exception 'Sistema Obra: há mais de uma conta com o e-mail %. Resolva no painel do Supabase (Authentication > Users).',
      btrim(p_email) using errcode = 'P0003';
  end if;
  if exists (select 1 from public.perfis p where p.id = v_usuario and p.papel = 'admin') then
    raise exception 'Sistema Obra: % é administrador e já vê todas as obras.', btrim(p_email) using errcode = '22023';
  end if;
  insert into public.acessos (usuario_id, obra_id, papel)
  values (v_usuario, p_obra_id, p_papel)
  on conflict (usuario_id, obra_id) do update set papel = excluded.papel;
  return v_usuario;
end;
$$;

revoke execute on function public.pessoas_da_obra(uuid) from public, anon;
revoke execute on function public.contas_sem_acesso(uuid) from public, anon;
revoke execute on function public.dar_acesso(text, uuid, text) from public, anon;
grant execute on function public.pessoas_da_obra(uuid) to authenticated;
grant execute on function public.contas_sem_acesso(uuid) to authenticated;
grant execute on function public.dar_acesso(text, uuid, text) to authenticated;

commit;
