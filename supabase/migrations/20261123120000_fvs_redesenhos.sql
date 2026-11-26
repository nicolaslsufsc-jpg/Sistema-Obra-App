-- =====================================================================
-- FVS: contorno de pilar ou viga redesenhado à mão na planta (pedido do Nicolas, 23/11/2026,
-- item 3.7 da lista de pendências). Regra em docs/modulos/1_fvs.md, "Redesenhar a peça".
--
-- Às vezes o contorno que saiu da prancha fica levemente errado. No fim da ficha da peça, "Redesenhar":
-- a pessoa toca nos cantos e o app liga com linhas retas. O desenho novo vale para todos na obra e entra
-- no lugar do original na planta (cores, toque e contagem). O original continua no pacote da planta:
-- "voltar ao original" é uma linha nova cancelando, nunca apagar.
--
--   fvs_redesenhos  campo, só inclusão. Redesenhar de novo ou voltar ao original: linha nova com
--                   substitui_id = a linha que estava valendo. Vale a ponta mais nova da cadeia
--                   (criado_em_dispositivo, depois id), por peça e trecho.
--
-- As coordenadas só valem no trecho (setor) da planta em que foi desenhado, como nas áreas de laje.
-- planta_id guarda a revisão da prancha que estava na tela: com revisão nova, o app avisa que existe
-- um redesenho manual e não apaga nada sozinho.
-- =====================================================================

begin;

create table public.fvs_redesenhos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  elemento_id           uuid not null,
  -- o trecho da planta: as coordenadas só valem nele
  setor_id              uuid not null,
  -- a planta (revisão da prancha) que estava na tela
  planta_id             uuid,
  -- [[x, y], ...]: pontos do PDF, y para baixo, as coordenadas do pacote da planta. Vazio só ao cancelar.
  contorno              jsonb,
  -- a linha que esta corrige (redesenho de novo ou volta ao original)
  substitui_id          uuid,
  -- true = voltar ao contorno original do projeto
  cancelado             boolean not null default false,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (elemento_id, obra_id) references public.elementos (id, obra_id),
  foreign key (setor_id, obra_id) references public.setores (id, obra_id),
  foreign key (planta_id, obra_id) references public.plantas (id, obra_id),
  -- conferida só no fim da transação: o restaurar.sql da exportação carrega em qualquer ordem
  foreign key (substitui_id, obra_id) references public.fvs_redesenhos (id, obra_id) deferrable initially deferred
);
create index fvs_redesenhos_elemento on public.fvs_redesenhos (obra_id, elemento_id);

-- Confere o contorno (gatilho, e não função no check, para não virar função da API).
create function public.fvs_conferir_redesenho()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p jsonb;
begin
  if new.cancelado then
    if new.substitui_id is null then
      raise exception 'Sistema Obra: voltar ao original precisa apontar para o redesenho que estava valendo'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.contorno is null or jsonb_typeof(new.contorno) <> 'array' or jsonb_array_length(new.contorno) not between 3 and 500 then
    raise exception 'Sistema Obra: o contorno redesenhado precisa de 3 a 500 pontos'
      using errcode = 'check_violation';
  end if;
  for p in select * from jsonb_array_elements(new.contorno) loop
    -- coalesce: posição que falta dá null, e "null <> x" não dispara o if
    if jsonb_typeof(p) <> 'array'
       or jsonb_array_length(p) <> 2
       or coalesce(jsonb_typeof(p -> 0), '') <> 'number'
       or coalesce(jsonb_typeof(p -> 1), '') <> 'number' then
      raise exception 'Sistema Obra: ponto do contorno redesenhado tem que ser [x, y]'
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;
create trigger fvs_conferir_redesenho
  before insert on public.fvs_redesenhos
  for each row execute function public.fvs_conferir_redesenho();

select nucleo.preparar_tabela('public.fvs_redesenhos', 'campo', 'nenhuma');

comment on table public.fvs_redesenhos is
  'Contorno de pilar ou viga redesenhado à mão (só inclusão; substitui_id corrige, cancelado volta ao original).';

commit;
