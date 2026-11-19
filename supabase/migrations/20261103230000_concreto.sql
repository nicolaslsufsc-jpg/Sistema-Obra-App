-- =====================================================================
-- Módulo Concreto: rastreabilidade do concreto por peça.
-- Desenho do módulo: docs/modulos/3_concreto.md. Regras: docs/02_CONTRATO_NUCLEO.md.
--
-- Tudo aqui é evento só de inclusão (escrito em campo, sem internet). Corrigir ou apagar =
-- incluir uma linha nova com substitui_id = linha antiga (cancelado = true para apagar).
-- Vale a linha que nenhuma outra substituiu.
--
-- A referência substitui_id é da mesma tabela e da mesma obra (chave composta), conferida
-- só no fim da transação (deferrable): o restaurar.sql da exportação pode carregar as
-- linhas de uma tabela em qualquer ordem.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Concretagem: uma ficha de rastreabilidade (um dia, um local, um fornecedor).
-- ---------------------------------------------------------------------
create table public.concretagens (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  pavimento_id          uuid not null,
  data                  date not null,
  local_descricao       text not null default '' check (length(local_descricao) <= 300),
  codigo_construpoint   text check (length(codigo_construpoint) <= 100),
  fornecedor            text check (length(fornecedor) <= 200),
  fck_mpa               numeric(5, 1) not null check (fck_mpa > 0 and fck_mpa <= 150),
  slump_cm              numeric(4, 1) check (slump_cm >= 0 and slump_cm <= 30),
  slump_tolerancia_cm   numeric(4, 1) check (slump_tolerancia_cm >= 0 and slump_tolerancia_cm <= 10),
  idades_dias           integer[] not null default '{7,28}'
                        check (cardinality(idades_dias) between 1 and 6
                               and 1 <= all (idades_dias) and 365 >= all (idades_dias)),
  cps_por_idade         integer not null default 2 check (cps_por_idade between 1 and 6),
  observacao            text check (length(observacao) <= 2000),
  substitui_id          uuid check (substitui_id <> id),
  cancelado             boolean not null default false,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (pavimento_id, obra_id) references public.pavimentos (id, obra_id),
  foreign key (substitui_id, obra_id) references public.concretagens (id, obra_id)
    deferrable initially deferred
);
create index concretagens_pavimento on public.concretagens (obra_id, pavimento_id, data);
select nucleo.preparar_tabela('public.concretagens', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Caminhão (betoneira) recebido numa concretagem.
-- ---------------------------------------------------------------------
create table public.caminhoes (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  concretagem_id        uuid not null,
  sequencia             integer not null check (sequencia between 1 and 200),
  nota_fiscal           text check (length(nota_fiscal) <= 40),
  volume_m3             numeric(5, 2) check (volume_m3 > 0 and volume_m3 <= 20),
  saida_usina           timestamptz,
  chegada_obra          timestamptz,
  inicio_descarga       timestamptz,
  fim_descarga          timestamptz,
  slump_medido_cm       numeric(4, 1) check (slump_medido_cm >= 0 and slump_medido_cm <= 30),
  agua_adicionada_l     numeric(6, 1) check (agua_adicionada_l >= 0 and agua_adicionada_l <= 1000),
  cps_moldados          integer check (cps_moldados between 0 and 24),
  observacao            text check (length(observacao) <= 2000),
  substitui_id          uuid check (substitui_id <> id),
  cancelado             boolean not null default false,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (concretagem_id, obra_id) references public.concretagens (id, obra_id),
  foreign key (substitui_id, obra_id) references public.caminhoes (id, obra_id)
    deferrable initially deferred
);
create index caminhoes_concretagem on public.caminhoes (obra_id, concretagem_id);
select nucleo.preparar_tabela('public.caminhoes', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Área desenhada na planta: onde o caminhão foi. Contorno em pixels da planta
-- (x para a direita, y para baixo), lista de [x, y].
-- planta_ref: qual planta (e revisão) estava na tela quando a área foi desenhada.
-- ---------------------------------------------------------------------
create table public.caminhao_areas (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  caminhao_id           uuid not null,
  planta_ref            text not null check (length(planta_ref) between 1 and 300),
  contorno              jsonb not null
                        check (jsonb_typeof(contorno) = 'array'
                               and jsonb_array_length(contorno) between 3 and 5000),
  substitui_id          uuid check (substitui_id <> id),
  cancelado             boolean not null default false,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (caminhao_id, obra_id) references public.caminhoes (id, obra_id),
  foreign key (substitui_id, obra_id) references public.caminhao_areas (id, obra_id)
    deferrable initially deferred
);
create index caminhao_areas_caminhao on public.caminhao_areas (obra_id, caminhao_id);
select nucleo.preparar_tabela('public.caminhao_areas', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Peça que recebeu o caminhão. Vale o último registro (hora do aparelho) de cada par
-- caminhão + peça: incluido = false tira a peça. origem 'manual' (toque na peça) vale
-- mais que 'desenho' (regra no app, docs/modulos/3_concreto.md).
-- ---------------------------------------------------------------------
create table public.caminhao_elementos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  caminhao_id           uuid not null,
  elemento_id           uuid not null,
  origem                text not null check (origem in ('desenho', 'manual')),
  fracao                numeric(4, 3) check (fracao >= 0 and fracao <= 1),
  incluido              boolean not null,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (caminhao_id, obra_id) references public.caminhoes (id, obra_id),
  foreign key (elemento_id, obra_id) references public.elementos (id, obra_id)
);
create index caminhao_elementos_caminhao on public.caminhao_elementos (obra_id, caminhao_id);
create index caminhao_elementos_elemento on public.caminhao_elementos (obra_id, elemento_id);
select nucleo.preparar_tabela('public.caminhao_elementos', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Resultado de rompimento de um corpo de prova (laudo). Escritório: gestor inclui.
-- origem diz de onde veio o número; laudo_arquivo_id aponta para o PDF, quando houver.
-- ---------------------------------------------------------------------
create table public.cp_resultados (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  caminhao_id           uuid not null,
  idade_dias            integer not null check (idade_dias between 1 and 365),
  numero_cp             integer not null check (numero_cp between 1 and 24),
  data_ensaio           date,
  resistencia_mpa       numeric(5, 1) not null check (resistencia_mpa >= 0 and resistencia_mpa <= 200),
  origem                text not null default 'manual' check (origem in ('manual', 'lado37', 'construpoint')),
  laudo_arquivo_id      uuid,
  observacao            text check (length(observacao) <= 2000),
  substitui_id          uuid check (substitui_id <> id),
  cancelado             boolean not null default false,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (caminhao_id, obra_id) references public.caminhoes (id, obra_id),
  foreign key (laudo_arquivo_id, obra_id) references public.arquivos (id, obra_id),
  foreign key (substitui_id, obra_id) references public.cp_resultados (id, obra_id)
    deferrable initially deferred
);
create index cp_resultados_caminhao on public.cp_resultados (obra_id, caminhao_id);
select nucleo.preparar_tabela('public.cp_resultados', 'gestor', 'nenhuma');

commit;
