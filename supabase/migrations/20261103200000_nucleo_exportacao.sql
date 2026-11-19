-- =====================================================================
-- Sistema Obra: núcleo, exportação de obra (v1)
--
-- Onde aplicar: editor SQL do Supabase, depois de 20261103120000_nucleo.sql. Uma vez.
-- Usado por pipeline/exportar_obra.py (entrega 5 do núcleo).
-- =====================================================================

begin;

-- Tabelas sincronizadas (as do núcleo e as que os módulos registrarem com
-- nucleo.preparar_tabela) na ordem de restauração: quem é referenciado vem antes.
-- nivel 0 = não depende de outra tabela sincronizada; nivel 1 = depende de uma de nivel 0; etc.
-- Só nomes de tabela: nenhum dado. security definer porque nucleo.tabelas_sincronizadas
-- não é visível pela API.
create function public.tabelas_para_exportar()
returns table (tabela text, nivel integer)
language sql stable security definer set search_path = ''
as $$
  with recursive
  registradas as (
    select t.tabela, t.tabela::regclass as oid
    from nucleo.tabelas_sincronizadas t
  ),
  dependencias as (
    select c.conrelid as filho, c.confrelid as pai
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.conrelid <> c.confrelid
      and c.conrelid in (select oid from registradas)
      and c.confrelid in (select oid from registradas)
  ),
  niveis (oid, nivel) as (
    select oid, 0 from registradas
    union all
    select d.filho, n.nivel + 1
    from niveis n
    join dependencias d on d.pai = n.oid
    where n.nivel < 50
  )
  select r.tabela, max(n.nivel)::integer as nivel
  from registradas r
  join niveis n on n.oid = r.oid
  group by r.tabela
  order by 2, 1;
$$;

revoke execute on function public.tabelas_para_exportar() from public, anon;
grant execute on function public.tabelas_para_exportar() to authenticated;

commit;
