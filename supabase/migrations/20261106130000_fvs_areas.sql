-- FVS: áreas de laje desenhadas na planta (docs/modulos/1_fvs.md, "Áreas de laje").
--
-- A laje não é concretada de uma vez e não existe como peça na forma. Quem abre a ficha desenha na hora
-- um polígono na planta, a parte da laje a que ela se refere, e liga a uma ficha. A área fica na cor
-- da situação da ficha, como as peças.
--
--   fvs_areas               campo, só inclusão. Mudou o contorno ou apagou: linha nova com o mesmo
--                           area_id. Vale a mais nova (criado_em_dispositivo, depois id).
--   fvs_eventos.area_id     marcação numa área. Um registro é de uma peça ou de uma área, nunca dos dois.
--
-- Campo cria área sem passar pelo cadastro: em "elementos" só o gestor inclui, e quem abre a ficha na
-- obra é o campo. Por isso a área é tabela do módulo, e não uma linha de "elementos" tipo L.

begin;

create table public.fvs_areas (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  -- a área: a primeira linha aponta para si mesma; as marcações apontam sempre para ela
  area_id               uuid not null,
  pavimento_id          uuid not null,
  -- o trecho (setores) da planta em que foi desenhada: as coordenadas só valem nele
  setor_id              uuid not null,
  -- a planta (revisão da prancha) que estava na tela
  planta_id             uuid,
  nome                  text not null check (length(nome) between 1 and 60),
  ficha_id              uuid not null,
  -- código da ficha no Construpoint, se a pessoa já abriu lá
  codigo_ficha          text check (length(codigo_ficha) <= 60),
  -- [[x, y], ...]: pontos do PDF, y para baixo, as coordenadas do pacote da planta
  contorno              jsonb not null,
  cancelada             boolean not null default false,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (pavimento_id, obra_id) references public.pavimentos (id, obra_id),
  foreign key (setor_id, obra_id) references public.setores (id, obra_id),
  foreign key (planta_id, obra_id) references public.plantas (id, obra_id),
  foreign key (ficha_id, obra_id) references public.fichas_modelo (id, obra_id),
  -- conferida só no fim da transação: o restaurar.sql da exportação carrega em qualquer ordem
  foreign key (area_id, obra_id) references public.fvs_areas (id, obra_id) deferrable initially deferred
);
create index fvs_areas_pavimento on public.fvs_areas (obra_id, pavimento_id);
create index fvs_areas_area on public.fvs_areas (obra_id, area_id);

-- Confere o contorno (gatilho, e não função no check, para não virar função da API).
create function public.fvs_conferir_contorno()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p jsonb;
begin
  if jsonb_typeof(new.contorno) <> 'array' or jsonb_array_length(new.contorno) not between 3 and 500 then
    raise exception 'Sistema Obra: o contorno da área precisa de 3 a 500 pontos'
      using errcode = 'check_violation';
  end if;
  for p in select * from jsonb_array_elements(new.contorno) loop
    -- coalesce: posição que falta dá null, e "null <> x" não dispara o if
    if jsonb_typeof(p) <> 'array'
       or jsonb_array_length(p) <> 2
       or coalesce(jsonb_typeof(p -> 0), '') <> 'number'
       or coalesce(jsonb_typeof(p -> 1), '') <> 'number' then
      raise exception 'Sistema Obra: ponto do contorno da área tem que ser [x, y]'
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;
create trigger fvs_conferir_contorno
  before insert on public.fvs_areas
  for each row execute function public.fvs_conferir_contorno();

select nucleo.preparar_tabela('public.fvs_areas', 'campo', 'nenhuma');

alter table public.fvs_eventos
  alter column elemento_id drop not null,
  add column area_id uuid,
  add foreign key (area_id, obra_id) references public.fvs_areas (id, obra_id),
  add constraint fvs_eventos_um_local check (num_nonnulls(elemento_id, area_id) = 1);
create index fvs_eventos_area on public.fvs_eventos (obra_id, area_id, ficha_id, criado_em_dispositivo) where area_id is not null;

comment on column public.fvs_eventos.area_id is
  'Marcação numa área de laje (fvs_areas.area_id). O registro é de uma peça ou de uma área, nunca dos dois.';

commit;
