-- =====================================================================
-- Obra de teste (código TESTE), para testar o app sem dados reais.
--
-- Antes: migração do núcleo aplicada e você marcado como admin (ver supabase/README.md).
-- Pode rodar mais de uma vez: o que já existe é mantido.
-- =====================================================================

begin;

do $$
declare
  v_admin uuid;
  v_obra  uuid;
  -- Registros criados pelo editor SQL não vêm de aparelho: id fixo "editor SQL".
  v_disp  constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  select id into v_admin from public.perfis where papel = 'admin' order by criado_em limit 1;
  if v_admin is null then
    raise exception 'Nenhum admin cadastrado. Veja o passo "Virar admin" em supabase/README.md.';
  end if;

  insert into public.obras (codigo, nome, empresa, criado_por)
  values ('TESTE', 'Obra de teste', null, v_admin)
  on conflict (codigo) do nothing;
  select id into v_obra from public.obras where codigo = 'TESTE';

  insert into public.pavimentos (obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo)
  select v_obra, p.nome, p.ordem, v_admin, v_disp, now()
  from (values
    ('Térreo', 1),
    ('2º Pavimento', 2),
    ('Cobertura', 3)
  ) as p (nome, ordem)
  on conflict (obra_id, nome) where not apagado do nothing;
end;
$$;

commit;
