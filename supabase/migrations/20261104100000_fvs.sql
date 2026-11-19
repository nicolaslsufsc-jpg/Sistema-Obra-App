-- =====================================================================
-- Módulo FVS: fichas de verificação (PVS da empresa) marcadas por clique na planta.
-- Desenho do módulo: docs/modulos/1_fvs.md. Regras: docs/02_CONTRATO_NUCLEO.md.
--
--   fichas_modelo  cadastro do escritório (gestor): a ficha (PVS) com os itens, por revisão
--   plantas        cadastro do escritório (gestor): uma prancha de forma de um trecho, com o
--                  pacote para uso offline (imagem em tiles + contorno das peças + detalhes)
--   fvs_eventos    campo, só inclusão: cada toque em A / R / NA de um item de uma peça
--   fvs_fotos      campo, só inclusão: foto de uma não conformidade (R)
--
-- O contorno das peças e os detalhes NÃO são linhas do banco: ficam no pacote da planta
-- (arquivos no armazenamento, docs/01_ARQUITETURA.md, "Regras de dados").
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Ficha (PVS). Uma linha por código e revisão: revisão nova = linha nova, e os registros
--    antigos continuam apontando para a revisão que foi usada.
-- itens: [{"n": 1, "etapa": "CONDIÇÕES DE INÍCIO", "titulo": "...", "descricao": "...",
--          "dispositivo": "Visual", "tolerancia": "NA"}, ...]
-- ---------------------------------------------------------------------
create table public.fichas_modelo (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  codigo                text not null check (length(codigo) between 1 and 40),        -- ex.: EXE-PVS-001
  titulo                text not null check (length(titulo) between 1 and 200),
  revisao               text not null default '0' check (length(revisao) between 1 and 10),
  tipo_modelo           text check (length(tipo_modelo) <= 60),                      -- ex.: ESTRUTURA
  -- tipos de elemento a que a ficha se aplica (P pilar, V viga, L laje)
  aplica_a              text[] not null check (cardinality(aplica_a) >= 1 and aplica_a <@ array['P', 'V', 'L']),
  itens                 jsonb not null,
  origem                text check (length(origem) <= 60),                           -- ex.: construpoint
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id)
);
create unique index fichas_modelo_codigo_revisao on public.fichas_modelo (obra_id, codigo, revisao) where not apagado;

-- Confere o formato dos itens (gatilho, e não função no check, para não virar função da API).
create function public.fvs_conferir_itens()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  it jsonb;
  numeros integer[] := '{}';
  n integer;
begin
  if jsonb_typeof(new.itens) <> 'array' or jsonb_array_length(new.itens) not between 1 and 300 then
    raise exception 'Sistema Obra: a ficha precisa de 1 a 300 itens'
      using errcode = 'check_violation';
  end if;
  for it in select * from jsonb_array_elements(new.itens) loop
    -- coalesce: campo que falta dá null, e "null <> x" não dispara o if
    if jsonb_typeof(it) <> 'object'
       or coalesce(jsonb_typeof(it -> 'n'), '') <> 'number'
       or coalesce(jsonb_typeof(it -> 'titulo'), '') <> 'string'
       or coalesce(length(it ->> 'titulo'), 0) not between 1 and 500
       or coalesce(jsonb_typeof(it -> 'etapa'), 'string') <> 'string'
       or length(coalesce(it ->> 'etapa', '')) > 120
       or length(coalesce(it ->> 'descricao', '')) > 2000 then
      raise exception 'Sistema Obra: item da ficha sem número ou sem título, ou com texto longo demais'
        using errcode = 'check_violation';
    end if;
    n := (it ->> 'n')::numeric::integer;
    if n::numeric <> (it ->> 'n')::numeric or n not between 1 and 999 or n = any (numeros) then
      raise exception 'Sistema Obra: número de item repetido ou inválido na ficha (%)', it ->> 'n'
        using errcode = 'check_violation';
    end if;
    numeros := numeros || n;
  end loop;
  return new;
end;
$$;
create trigger fvs_conferir_itens
  before insert or update of itens on public.fichas_modelo
  for each row execute function public.fvs_conferir_itens();
select nucleo.preparar_tabela('public.fichas_modelo', 'gestor', 'gestor');

-- ---------------------------------------------------------------------
-- 2) Planta: uma prancha de forma de um trecho de um pavimento, numa revisão.
--    O pacote (manifest.json + pacote.bin) fica no armazenamento, em
--    {obra_id}/fvs/plantas/{planta_id}/, e tem a linha dele em "arquivos".
--    Revisão nova da prancha = planta nova com substitui_id = a antiga.
-- ---------------------------------------------------------------------
create table public.plantas (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  pavimento_id          uuid not null,
  setor_id              uuid not null,                                   -- trecho da prancha (setores.nome_projeto)
  prancha               text not null check (length(prancha) between 1 and 160), -- ex.: EXE.ES.LO.129.FOR3PAVTIP-R03
  revisao               text not null check (length(revisao) between 1 and 10),   -- ex.: R03
  largura               numeric not null check (largura > 0 and largura < 100000),
  altura                numeric not null check (altura > 0 and altura < 100000),
  manifest_id           uuid not null,
  pacote_id             uuid not null,
  elementos             integer not null default 0 check (elementos >= 0),
  substitui_id          uuid check (substitui_id <> id),
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
  foreign key (manifest_id, obra_id) references public.arquivos (id, obra_id),
  foreign key (pacote_id, obra_id) references public.arquivos (id, obra_id),
  -- conferida só no fim da transação: o restaurar.sql da exportação carrega em qualquer ordem
  foreign key (substitui_id, obra_id) references public.plantas (id, obra_id) deferrable initially deferred
);
create index plantas_pavimento on public.plantas (obra_id, pavimento_id);
select nucleo.preparar_tabela('public.plantas', 'gestor', 'gestor');

-- ---------------------------------------------------------------------
-- 3) Registro de campo: um toque num item da ficha de uma peça.
--    resultado A (aprovado), R (reprovado), NA (não se aplica) ou vazio (desmarcado).
--    rodada: 1 = V01; reinspeção de um item reprovado = rodada seguinte (V02, V03...).
--    lote_id: marcações feitas juntas (etapa inteira ou pincel), para saber que foram em lote.
--    planta_id: a planta (revisão da prancha) que estava na tela.
--    Vale o último registro (criado_em_dispositivo) de cada peça + ficha + item.
-- ---------------------------------------------------------------------
create table public.fvs_eventos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  elemento_id           uuid not null,
  ficha_id              uuid not null,
  item                  integer not null check (item between 1 and 999),
  resultado             text check (resultado in ('A', 'R', 'NA')),
  rodada                integer not null default 1 check (rodada between 1 and 20),
  observacao            text check (length(observacao) <= 2000),
  planta_id             uuid,
  lote_id               uuid,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (elemento_id, obra_id) references public.elementos (id, obra_id),
  foreign key (ficha_id, obra_id) references public.fichas_modelo (id, obra_id),
  foreign key (planta_id, obra_id) references public.plantas (id, obra_id)
);
create index fvs_eventos_elemento on public.fvs_eventos (obra_id, elemento_id, ficha_id, criado_em_dispositivo);

-- O item marcado tem que existir na ficha (o gatilho fica desligado na restauração, como os do núcleo).
create function public.fvs_conferir_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.fichas_modelo f, jsonb_array_elements(f.itens) it
    where f.id = new.ficha_id and f.obra_id = new.obra_id and (it ->> 'n')::numeric = new.item
  ) then
    raise exception 'Sistema Obra: o item % não existe nesta ficha', new.item
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;
create trigger fvs_conferir_item
  before insert on public.fvs_eventos
  for each row execute function public.fvs_conferir_item();
select nucleo.preparar_tabela('public.fvs_eventos', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- 4) Foto de não conformidade: liga um registro (normalmente um R) a um arquivo.
-- ---------------------------------------------------------------------
create table public.fvs_fotos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  evento_id             uuid not null,
  arquivo_id            uuid not null,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (evento_id, obra_id) references public.fvs_eventos (id, obra_id),
  foreign key (arquivo_id, obra_id) references public.arquivos (id, obra_id)
);
create index fvs_fotos_evento on public.fvs_fotos (obra_id, evento_id);
select nucleo.preparar_tabela('public.fvs_fotos', 'campo', 'nenhuma');

commit;
