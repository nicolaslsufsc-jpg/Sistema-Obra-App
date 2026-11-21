-- Leitura completa do sistema oficial da obra para o Sistema Obra (docs/02_CONTRATO_NUCLEO.md,
-- "Dados lidos de um sistema oficial"; docs/modulos/integracoes.md). Aprovada pelo Nicolas em 21/11/2026.
--
-- O sistema oficial (hoje, um galho de pipeline/integracoes/) tem locais que não são peça da planta:
-- apartamentos, ambientes, casas, lojas, blocos. As fichas e verificações desses locais eram
-- descartadas na importação. Agora ficam:
--
--   locais_sistema               árvore de locais do sistema oficial (cadastro do escritório)
--   fvs_eventos.local_id         verificação num local do sistema que não é peça nem área de laje
--   fvs_fichas_campo.local_id    ficha aberta num desses locais
--   fvs_fichas_campo.agendada_em, reinspecao_em, medicao   o que faltava da ficha aberta
--   concretagens.status_sistema  situação da ficha de concreto no sistema oficial
--   importacoes                  cada leitura publicada: de qual sistema, quando foi lida, quantas linhas
--
-- Só de ida: o app não escreve no sistema oficial. O nome do sistema é dado (coluna "sistema"),
-- nunca nome de coluna.

begin;

create table public.locais_sistema (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  -- id do galho em app/src/integracoes/ e pipeline/integracoes/
  sistema               text not null check (sistema ~ '^[a-z0-9_-]{1,40}$'),
  -- id do local no sistema oficial, e o do local pai (vazio = raiz)
  origem_id             text not null check (length(origem_id) between 1 and 40),
  origem_pai_id         text check (length(origem_pai_id) between 1 and 40),
  nome                  text not null check (length(nome) between 1 and 300),
  nome_completo         text not null check (length(nome_completo) between 1 and 600),
  nivel                 integer not null default 0 check (nivel between 0 and 20),
  -- apagado lá, mas ainda com fichas: fica para não perder o histórico
  apagado_no_sistema    boolean not null default false,
  -- o mesmo local na planta, quando é peça (pilar, viga) ou pavimento
  pavimento_id          uuid,
  elemento_id           uuid,
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (pavimento_id, obra_id) references public.pavimentos (id, obra_id),
  foreign key (elemento_id, obra_id) references public.elementos (id, obra_id)
);
create unique index locais_sistema_origem on public.locais_sistema (obra_id, sistema, origem_id) where not apagado;
create index locais_sistema_pai on public.locais_sistema (obra_id, sistema, origem_pai_id);
create index locais_sistema_elemento on public.locais_sistema (obra_id, elemento_id) where elemento_id is not null;
select nucleo.preparar_tabela('public.locais_sistema', 'gestor', 'gestor');

-- Verificação: de uma peça, de uma área de laje, de uma barra ou de um local do sistema. Sempre um só.
alter table public.fvs_eventos
  add column local_id uuid,
  add foreign key (local_id, obra_id) references public.locais_sistema (id, obra_id),
  drop constraint fvs_eventos_um_local,
  add constraint fvs_eventos_um_local check (num_nonnulls(elemento_id, area_id, barra_id, local_id) = 1);
create index fvs_eventos_local on public.fvs_eventos (obra_id, local_id, ficha_id, criado_em_dispositivo) where local_id is not null;

comment on column public.fvs_eventos.local_id is
  'Verificação num local do sistema oficial que não é peça nem área de laje (locais_sistema). Um registro é de um só: peça, área, barra ou local.';

alter table public.fvs_fichas_campo
  add column local_id      uuid,
  add column agendada_em   timestamptz,
  add column reinspecao_em timestamptz,
  add column medicao       text check (length(medicao) <= 200),
  add foreign key (local_id, obra_id) references public.locais_sistema (id, obra_id);
create index fvs_fichas_campo_local on public.fvs_fichas_campo (obra_id, local_id) where local_id is not null;

comment on column public.fvs_fichas_campo.local_id is
  'Local da ficha no sistema oficial (locais_sistema), também quando não é peça da planta.';

alter table public.concretagens
  add column status_sistema text check (length(status_sistema) between 1 and 40);

comment on column public.concretagens.status_sistema is
  'Situação da ficha de concreto no sistema oficial (ex.: Agendado, Aguardando Laudo, Aceito). Só leitura de lá.';

-- Cada leitura do sistema oficial publicada no servidor: o app mostra "dados do sistema de dd/mm".
create table public.importacoes (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  sistema               text not null check (sistema ~ '^[a-z0-9_-]{1,40}$'),
  -- quando os dados foram lidos lá (a publicação é criado_em_servidor)
  lida_em               timestamptz not null,
  -- {"locais": 4223, "fvs_eventos": 24000, ...}
  contagens             jsonb not null default '{}'::jsonb check (jsonb_typeof(contagens) = 'object'),
  observacao            text check (length(observacao) <= 2000),
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id)
);
create index importacoes_obra on public.importacoes (obra_id, sistema, lida_em desc);
select nucleo.preparar_tabela('public.importacoes', 'gestor', 'nenhuma');

commit;
