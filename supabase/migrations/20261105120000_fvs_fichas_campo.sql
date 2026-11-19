-- FVS: histórico vindo do Construpoint (docs/modulos/1_fvs.md, "Histórico do Construpoint").
--
-- O app passa a guardar as verificações que já foram feitas no Construpoint, com a data e a hora
-- originais e o nome de quem marcou. A mesma peça pode ter mais de uma ficha lá (ficha duplicada):
-- cada uma é uma linha de fvs_fichas_campo, e cada registro diz a que ficha pertence, para as
-- duas situações continuarem visíveis em vez de uma apagar a outra.
--
--   fvs_fichas_campo            cadastro do escritório (gestor): uma ficha aberta num local
--   fvs_eventos.ficha_campo_id  a que ficha aberta o registro pertence (vazio = marcado só no app)
--   fvs_eventos.verificado_por  quem marcou, quando a pessoa não tem conta no app
--   fvs_eventos.origem_id       id da verificação no Construpoint: importar de novo não duplica

begin;

create table public.fvs_fichas_campo (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  -- vazio: a ficha não tem peça na planta (laje, bloco, cortina, peça que não está na prancha)
  elemento_id           uuid,
  -- vazio: a ficha modelo ainda não está cadastrada em fichas_modelo
  ficha_id              uuid,
  codigo                text not null check (length(codigo) between 1 and 60),  -- código da ficha no Construpoint
  construpoint_id       bigint,
  local_construpoint    text not null check (length(local_construpoint) between 1 and 300),
  ficha_codigo          text check (length(ficha_codigo) <= 40),                -- ex.: EXE-PVS-001
  ficha_titulo          text check (length(ficha_titulo) <= 200),
  status                text not null check (length(status) between 1 and 40),  -- ex.: Pendente Reinspeção
  inspetor              text check (length(inspetor) <= 120),
  parceiro              text check (length(parceiro) <= 200),
  atualizada_em         timestamptz,                                            -- última alteração no Construpoint
  qtd_a                 integer not null default 0 check (qtd_a >= 0),
  qtd_r                 integer not null default 0 check (qtd_r >= 0),
  qtd_na                integer not null default 0 check (qtd_na >= 0),
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (elemento_id, obra_id) references public.elementos (id, obra_id),
  foreign key (ficha_id, obra_id) references public.fichas_modelo (id, obra_id)
);
create unique index fvs_fichas_campo_codigo on public.fvs_fichas_campo (obra_id, codigo) where not apagado;
create index fvs_fichas_campo_elemento on public.fvs_fichas_campo (obra_id, elemento_id);
select nucleo.preparar_tabela('public.fvs_fichas_campo', 'gestor', 'gestor');

alter table public.fvs_eventos
  add column ficha_campo_id uuid,
  add column verificado_por text check (length(verificado_por) <= 120),
  add column origem_id      text check (length(origem_id) <= 40),
  add foreign key (ficha_campo_id, obra_id) references public.fvs_fichas_campo (id, obra_id);
create unique index fvs_eventos_origem on public.fvs_eventos (obra_id, origem_id) where origem_id is not null;

comment on column public.fvs_eventos.ficha_campo_id is
  'Ficha aberta a que o registro pertence. Vale o último registro de cada peça + ficha + item + ficha aberta.';

commit;
