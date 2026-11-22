-- =====================================================================
-- Projetos: pedido de atualização do Autodoc pelo app
--
-- Pedido do Nicolas (21/11/2026, prioridade 1 do Projetos): um botão no app
-- que busca os projetos no Autodoc e refaz o painel.
--
-- Como funciona:
--   1. O gestor toca em "Atualizar do Autodoc": o app insere um pedido
--      (só obra_id; o resto o banco preenche). Um pedido aberto por obra.
--   2. O vigia do PC do escritório (a cada 5 min) chama
--        select * from public.projetos_pegar_pedido('<obra_id>');
--      que devolve o pedido pendente mais antigo já como 'buscando'.
--   3. O PC roda o relatório do Autodoc, publica a lista e baixa as
--      revisões novas; depois chama
--        select public.projetos_concluir_pedido('<id>', true, '{"revisoes_novas": 3, "baixadas": 3, "falharam": []}', null);
--      ou, com erro, (id, false, null, 'login do Autodoc vencido: entre no PC').
--   4. Pedido 'buscando' há mais de 30 min (o vigia caiu) vira erro
--      'interrompido' no próximo pedido ou na próxima rodada do vigia.
--
-- Ninguém altera um pedido por update direto: só as duas funções acima,
-- que exigem gestor da obra e seguem a ordem pendente -> buscando -> pronto/erro.
-- Fica fora da sincronização: o app lê e grava direto (o botão precisa de internet).
-- Onde aplicar: editor SQL do Supabase. Roda numa transação.
-- =====================================================================

begin;

create table public.projetos_pedidos_atualizacao (
  id           uuid primary key default gen_random_uuid(),
  obra_id      uuid not null references public.obras (id),
  pedido_por   uuid not null default auth.uid() references public.perfis (id),
  criado_em    timestamptz not null default now(),
  estado       text not null default 'pendente' check (estado in ('pendente', 'buscando', 'pronto', 'erro')),
  iniciado_em  timestamptz,
  concluido_em timestamptz,
  -- {"revisoes_novas": n, "baixadas": n, "falharam": [{"codigo": "...", "motivo": "..."}]}
  resumo       jsonb check (resumo is null or jsonb_typeof(resumo) = 'object'),
  erro         text,
  check ((estado = 'pendente') = (iniciado_em is null)),
  check ((estado in ('pronto', 'erro')) = (concluido_em is not null)),
  check (estado <> 'erro' or btrim(coalesce(erro, '')) <> '')
);

-- um pedido aberto (pendente ou buscando) por obra
create unique index projetos_pedidos_um_aberto
  on public.projetos_pedidos_atualizacao (obra_id) where estado in ('pendente', 'buscando');
create index projetos_pedidos_por_obra on public.projetos_pedidos_atualizacao (obra_id, criado_em desc);

alter table public.projetos_pedidos_atualizacao enable row level security;

create policy ler on public.projetos_pedidos_atualizacao for select to authenticated
  using (nucleo.pode_ler(obra_id));
create policy pedir on public.projetos_pedidos_atualizacao for insert to authenticated
  with check (nucleo.pode_gerir(obra_id) and pedido_por = auth.uid());

revoke all on public.projetos_pedidos_atualizacao from anon, authenticated;
grant select on public.projetos_pedidos_atualizacao to authenticated;
-- o app só escolhe a obra (e o id, se quiser): estado, datas, resumo e erro são do banco e do PC
grant insert (id, obra_id) on public.projetos_pedidos_atualizacao to authenticated;

-- Pedido 'buscando' há mais de 30 min: o vigia caiu no meio. Vira erro 'interrompido'.
create function nucleo.projetos_destravar_pedidos(p_obra_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.projetos_pedidos_atualizacao
     set estado = 'erro', concluido_em = now(),
         erro = 'interrompido: o PC parou no meio. Peça de novo.'
   where obra_id = p_obra_id and estado = 'buscando' and iniciado_em < now() - interval '30 minutes';
$$;
revoke execute on function nucleo.projetos_destravar_pedidos(uuid) from public, anon, authenticated;

-- Antes de um pedido novo: destrava o que ficou preso (senão o índice de "um aberto" barraria o pedido).
create function nucleo.projetos_pedido_antes_inserir()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform nucleo.projetos_destravar_pedidos(new.obra_id);
  new.pedido_por := auth.uid();
  new.criado_em := now();
  return new;
end;
$$;
create trigger antes_inserir before insert on public.projetos_pedidos_atualizacao
  for each row execute function nucleo.projetos_pedido_antes_inserir();

-- O PC pega o pedido pendente mais antigo da obra (já marcado 'buscando'). Sem pedido: nenhuma linha.
create function public.projetos_pegar_pedido(p_obra_id uuid)
returns setof public.projetos_pedidos_atualizacao
language plpgsql security definer set search_path = ''
as $$
begin
  if not nucleo.pode_gerir(p_obra_id) then
    raise exception 'só o gestor da obra pega pedido de atualização' using errcode = '42501';
  end if;
  perform nucleo.projetos_destravar_pedidos(p_obra_id);
  return query
    update public.projetos_pedidos_atualizacao p
       set estado = 'buscando', iniciado_em = now()
     where p.id = (
       select q.id from public.projetos_pedidos_atualizacao q
        where q.obra_id = p_obra_id and q.estado = 'pendente'
        order by q.criado_em
        limit 1
        for update skip locked)
    returning p.*;
end;
$$;

-- O PC conclui o pedido que está 'buscando': pronto (com resumo) ou erro (com o motivo).
create function public.projetos_concluir_pedido(p_id uuid, p_ok boolean, p_resumo jsonb, p_erro text)
returns public.projetos_pedidos_atualizacao
language plpgsql security definer set search_path = ''
as $$
declare
  v public.projetos_pedidos_atualizacao;
begin
  select * into v from public.projetos_pedidos_atualizacao where id = p_id for update;
  if v.id is null or not nucleo.pode_gerir(v.obra_id) then
    raise exception 'pedido não encontrado' using errcode = '42501';
  end if;
  if v.estado <> 'buscando' then
    raise exception 'o pedido não está em andamento (estado: %)', v.estado using errcode = '22023';
  end if;
  update public.projetos_pedidos_atualizacao
     set estado = case when p_ok then 'pronto' else 'erro' end,
         concluido_em = now(),
         resumo = p_resumo,
         erro = case when p_ok then null else coalesce(nullif(btrim(p_erro), ''), 'erro sem descrição') end
   where id = p_id
  returning * into v;
  return v;
end;
$$;

revoke execute on function public.projetos_pegar_pedido(uuid) from public, anon;
revoke execute on function public.projetos_concluir_pedido(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.projetos_pegar_pedido(uuid) to authenticated;
grant execute on function public.projetos_concluir_pedido(uuid, boolean, jsonb, text) to authenticated;

commit;
