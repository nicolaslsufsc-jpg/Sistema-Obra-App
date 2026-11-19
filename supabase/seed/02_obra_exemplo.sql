-- =====================================================================
-- Obra de exemplo (código EXE), fictícia: cadastro da obra e dos pavimentos.
-- O cadastro de uma obra de verdade fica fora do repositório (é dado da empresa).
--
-- Antes: migração do núcleo aplicada e você marcado como admin (ver supabase/README.md).
-- Pode rodar mais de uma vez: o que já existe é mantido.
-- =====================================================================

begin;

do $$
declare
  v_admin uuid;
  v_obra  uuid;
  v_disp  constant uuid := '00000000-0000-0000-0000-000000000000';  -- "editor SQL"
begin
  select id into v_admin from public.perfis where papel = 'admin' order by criado_em limit 1;
  if v_admin is null then
    raise exception 'Nenhum admin cadastrado. Veja o passo "Virar admin" em supabase/README.md.';
  end if;

  insert into public.obras (codigo, nome, empresa, criado_por)
  values ('EXE', 'Obra Exemplo', 'Construtora Exemplo', v_admin)
  on conflict (codigo) do nothing;
  select id into v_obra from public.obras where codigo = 'EXE';

  insert into public.pavimentos (obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo)
  select v_obra, p.nome, p.ordem, v_admin, v_disp, now()
  from (values
    ('Subsolo',       1),
    ('Térreo',        2),
    ('1º Pavimento',  3),
    ('2º Pavimento',  4),
    ('Cobertura',     5)
  ) as p(nome, ordem)
  where not exists (select 1 from public.pavimentos x where x.obra_id = v_obra and x.nome = p.nome);
end $$;

commit;
