-- =====================================================================
-- FVS: regras da obra entre itens das fichas (prazos e ligações).
-- Tabela nova: só aplicar no Supabase com o "pode" do Nicolas.
-- Desenho: docs/modulos/1_fvs.md (Projeto 1, FVS estrutura). Regras: docs/02_CONTRATO_NUCLEO.md.
--
--   fvs_regras  cadastro do escritório (gestor), só inclusão: cada linha é a configuração
--               inteira da obra numa versão. Vale a mais nova (criado_em_servidor); mudar
--               as regras = incluir linha nova com tudo. Nada de alterar linha antiga.
--
-- regras: {"prazos":   [{"id": "texto", "ficha": "codigo", "item": 12, "dias": 21,
--                        "depois_de": {"tipo": "concretagem"}
--                                   | {"tipo": "item", "ficha": "codigo", "item": 3},
--                        "texto": "opcional"}, ...],
--          "ligacoes": [{"id": "texto", "de": {"ficha": "codigo", "item": 5},
--                                       "para": {"ficha": "codigo", "item": 2}}, ...]}
-- "prazos" e "ligacoes" podem faltar (= lista vazia). O banco confere só o formato: não
-- confere se a ficha ou o item existem (a ficha pode ganhar revisão nova depois).
-- =====================================================================

begin;

create table public.fvs_regras (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  regras                jsonb not null,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id)
);
create index fvs_regras_obra_recente on public.fvs_regras (obra_id, criado_em_servidor desc);

-- Confere o formato das regras (gatilho, e não função no check, para não virar função da API).
-- "coalesce(..., '')": campo que falta dá null, e "null <> x" não dispara o if.
-- A conversão para número só roda dentro de um case que testa antes se o valor é número: o Postgres
-- não garante a ordem dos OR, e um item em texto daria erro de conversão (22P02) em vez da nossa
-- mensagem (23514).
create function public.fvs_conferir_regras()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r jsonb := new.regras;
  lista text;
  it jsonb;
  ref jsonb;
  ids text[];
begin
  if jsonb_typeof(r) <> 'object' then
    raise exception 'Sistema Obra: as regras da FVS têm que ser um objeto {"prazos": [...], "ligacoes": [...]}'
      using errcode = 'check_violation';
  end if;

  foreach lista in array array['prazos', 'ligacoes'] loop
    if r ? lista and (jsonb_typeof(r -> lista) <> 'array' or jsonb_array_length(r -> lista) > 1000) then
      raise exception 'Sistema Obra: "%" das regras da FVS tem que ser uma lista (até 1000)', lista
        using errcode = 'check_violation';
    end if;
    ids := '{}';
    for it in select * from jsonb_array_elements(coalesce(r -> lista, '[]')) loop
      if jsonb_typeof(it) <> 'object'
         or coalesce(jsonb_typeof(it -> 'id'), '') <> 'string'
         or coalesce(length(it ->> 'id'), 0) not between 1 and 80 then
        raise exception 'Sistema Obra: regra da FVS em "%" sem id', lista
          using errcode = 'check_violation';
      end if;
      if (it ->> 'id') = any (ids) then
        raise exception 'Sistema Obra: id repetido em "%" das regras da FVS (%)', lista, it ->> 'id'
          using errcode = 'check_violation';
      end if;
      ids := ids || (it ->> 'id');

      -- as referências a item de ficha desta regra: {"ficha": "codigo", "item": n}
      for ref in
        select x from unnest(case lista
          when 'prazos' then array[it, case when it -> 'depois_de' ->> 'tipo' = 'item' then it -> 'depois_de' end]
          else array[coalesce(it -> 'de', 'null'), coalesce(it -> 'para', 'null')] end) as x
        where x is not null
      loop
        if jsonb_typeof(ref) <> 'object'
           or coalesce(jsonb_typeof(ref -> 'ficha'), '') <> 'string'
           or coalesce(length(ref ->> 'ficha'), 0) not between 1 and 40
           or coalesce(jsonb_typeof(ref -> 'item'), '') <> 'number'
           or (case when jsonb_typeof(ref -> 'item') = 'number'
                   then (ref ->> 'item')::numeric % 1 <> 0 or (ref ->> 'item')::numeric not between 1 and 999
                   else true end) then
          raise exception 'Sistema Obra: regra da FVS "%" sem ficha ou com número de item inválido', it ->> 'id'
            using errcode = 'check_violation';
        end if;
      end loop;

      if lista = 'prazos' then
        if coalesce(jsonb_typeof(it -> 'dias'), '') <> 'number'
           or (case when jsonb_typeof(it -> 'dias') = 'number'
                   then (it ->> 'dias')::numeric % 1 <> 0 or (it ->> 'dias')::numeric not between 0 and 365
                   else true end) then
          raise exception 'Sistema Obra: prazo da FVS "%" com dias fora de 0 a 365', it ->> 'id'
            using errcode = 'check_violation';
        end if;
        if coalesce(jsonb_typeof(it -> 'depois_de'), '') <> 'object'
           or coalesce(it -> 'depois_de' ->> 'tipo', '') not in ('concretagem', 'item') then
          raise exception 'Sistema Obra: prazo da FVS "%" sem "depois_de" (concretagem ou item)', it ->> 'id'
            using errcode = 'check_violation';
        end if;
        if it -> 'depois_de' ->> 'tipo' = 'item'
           and it ->> 'ficha' = it -> 'depois_de' ->> 'ficha'
           and (it ->> 'item')::numeric = (it -> 'depois_de' ->> 'item')::numeric then
          raise exception 'Sistema Obra: prazo da FVS "%" conta a partir do próprio item', it ->> 'id'
            using errcode = 'check_violation';
        end if;
        if coalesce(jsonb_typeof(it -> 'texto'), 'string') <> 'string' or length(coalesce(it ->> 'texto', '')) > 500 then
          raise exception 'Sistema Obra: texto do prazo da FVS "%" inválido ou longo demais', it ->> 'id'
            using errcode = 'check_violation';
        end if;
      else
        if it -> 'de' ->> 'ficha' = it -> 'para' ->> 'ficha'
           and (it -> 'de' ->> 'item')::numeric = (it -> 'para' ->> 'item')::numeric then
          raise exception 'Sistema Obra: ligação da FVS "%" liga o item a ele mesmo', it ->> 'id'
            using errcode = 'check_violation';
        end if;
      end if;
    end loop;
  end loop;
  return new;
end;
$$;
create trigger fvs_conferir_regras
  before insert on public.fvs_regras
  for each row execute function public.fvs_conferir_regras();
select nucleo.preparar_tabela('public.fvs_regras', 'gestor', 'nenhuma');

commit;
