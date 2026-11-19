-- =====================================================================
-- Módulo Projetos: revisões de projeto (Autodoc) e cópias em campo. PR 1.
--
-- Desenho: docs/modulos/2_projetos.md. Regras do núcleo: docs/02_CONTRATO_NUCLEO.md.
-- Aplicar no editor SQL do Supabase depois das migrações do núcleo (supabase/README.md).
--
-- Tabelas: empresas, documentos, revisoes, listas_autodoc, escritorio_eventos,
-- distribuicao_eventos. Views: revisoes_vigentes, documentos_escritorio,
-- situacao_distribuicao (calculadas pelo banco, ninguém digita).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) empresas: quem recebe cópia de projeto (empreiteiros, fornecedores).
--    Cadastro de escritório: gestor inclui e altera.
-- ---------------------------------------------------------------------
create table public.empresas (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  nome                  text not null check (btrim(nome) <> ''),
  contato               text,
  ativa                 boolean not null default true,
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id)
);
create unique index empresas_nome_unico on public.empresas (obra_id, lower(btrim(nome))) where not apagado;
select nucleo.preparar_tabela('public.empresas', 'gestor', 'gestor');

-- ---------------------------------------------------------------------
-- 2) documentos: uma linha por prancha. A chave é o código SEM fase e SEM revisão
--    (XPT.ES.112.FORPILOTIS para o arquivo XPT.ES.LO.112.FORPILOTIS-R02.pdf).
--    Escrito pelo script de importação (com o login de um gestor) e pela tela do escritório.
-- ---------------------------------------------------------------------
create table public.documentos (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  codigo                text not null check (codigo ~ '^[A-Z0-9]+\.[A-Z]{2,3}\.[0-9]{3,4}\.[A-Z0-9]{1,10}$'),
  disciplina_sigla      text not null check (disciplina_sigla ~ '^[A-Z]{2,3}$'),
  disciplina            text,                                   -- nome que o Autodoc mostra (Estrutura, Furação...)
  numero                text not null check (numero ~ '^[0-9]{3,4}$'),
  nome_curto            text not null check (nome_curto ~ '^[A-Z0-9]{1,10}$'),
  titulo                text,
  pasta_autodoc         text,                                   -- caminho da pasta, como o relatório traz
  link_pasta            text,
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  -- as partes guardadas são as do próprio código
  check (codigo like '%.' || disciplina_sigla || '.' || numero || '.' || nome_curto)
);
create unique index documentos_codigo_unico on public.documentos (obra_id, codigo) where not apagado;
select nucleo.preparar_tabela('public.documentos', 'gestor', 'gestor');

-- ---------------------------------------------------------------------
-- 3) revisoes: cada revisão vista no Autodoc. Nunca some: quando o Autodoc a marca
--    obsoleta, obsoleta = true. Escrita pelo script de importação.
-- ---------------------------------------------------------------------
create table public.revisoes (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  documento_id          uuid not null,
  fase                  text not null check (fase ~ '^[A-Z]{2}$'),   -- EX, LO...
  numero                text not null check (numero ~ '^[0-9]{2}$'), -- "04" do R04
  titulo                text,
  status_autodoc        text,
  obsoleta              boolean not null default false,
  data_obsoleta         timestamptz,
  cadastrada_em_autodoc timestamptz,
  cadastrada_por        text,
  atualizada_em_autodoc timestamptz,
  extensoes             text not null default '',                 -- "dwg,pdf"
  vista_em              date not null,                             -- data da primeira lista em que apareceu
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  unique (id, documento_id),  -- permite exigir "revisão deste documento" nas outras tabelas
  foreign key (documento_id, obra_id) references public.documentos (id, obra_id)
);
create unique index revisoes_unica on public.revisoes (documento_id, fase, numero) where not apagado;
create index revisoes_documento on public.revisoes (obra_id, documento_id);
select nucleo.preparar_tabela('public.revisoes', 'gestor', 'gestor');

-- ---------------------------------------------------------------------
-- 4) listas_autodoc: uma linha por lista (CSV) importada. Só inclusão.
-- ---------------------------------------------------------------------
create table public.listas_autodoc (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  data_lista            date not null,
  arquivo               text not null,
  emitida_em            timestamptz,                               -- "Data de emissão" do cabeçalho do CSV
  linhas                integer not null check (linhas >= 0),
  documentos_novos      integer not null default 0,
  revisoes_novas        integer not null default 0,
  obsoletas_novas       integer not null default 0,
  conferir              integer not null default 0,
  resultado             text,
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  unique (obra_id, data_lista, arquivo)
);
select nucleo.preparar_tabela('public.listas_autodoc', 'gestor', 'nenhuma');

-- ---------------------------------------------------------------------
-- 5) escritorio_eventos: "a pasta do escritório passou a ter a revisão X".
--    Evento do gestor, só inclusão; o último vale (view documentos_escritorio).
-- ---------------------------------------------------------------------
create table public.escritorio_eventos (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  documento_id          uuid not null,
  revisao_id            uuid not null,
  data_evento           date not null,
  observacao            text,
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (documento_id, obra_id) references public.documentos (id, obra_id),
  foreign key (revisao_id, documento_id) references public.revisoes (id, documento_id)
);
create index escritorio_eventos_documento on public.escritorio_eventos (obra_id, documento_id, criado_em_dispositivo);
select nucleo.preparar_tabela('public.escritorio_eventos', 'gestor', 'nenhuma');

-- ---------------------------------------------------------------------
-- 6) distribuicao_eventos: entrega de cópia a uma empresa, ou devolução dela.
--    Evento de campo (offline), só inclusão. A devolução aponta para a entrega.
-- ---------------------------------------------------------------------
create table public.distribuicao_eventos (
  id                    uuid primary key,                          -- gerado no aparelho
  obra_id               uuid not null references public.obras (id),
  tipo                  text not null check (tipo in ('entrega', 'devolucao')),
  empresa_id            uuid not null,
  colaborador           text,
  documento_id          uuid not null,
  revisao_id            uuid not null,
  entrega_id            uuid,                                      -- na devolução: a entrega devolvida
  data_evento           date not null,                             -- data do formulário formulário de entrega
  foto_id               uuid,                                      -- foto do formulário assinado (arquivos)
  observacao            text,
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (empresa_id, obra_id) references public.empresas (id, obra_id),
  foreign key (documento_id, obra_id) references public.documentos (id, obra_id),
  foreign key (revisao_id, documento_id) references public.revisoes (id, documento_id),
  foreign key (foto_id, obra_id) references public.arquivos (id, obra_id),
  check ((tipo = 'entrega') = (entrega_id is null))
);
create index distribuicao_eventos_empresa on public.distribuicao_eventos (obra_id, empresa_id, documento_id);
create index distribuicao_eventos_entrega on public.distribuicao_eventos (entrega_id) where entrega_id is not null;

-- A devolução aponta para uma entrega da mesma obra, empresa e documento. É um gatilho, e não uma
-- chave estrangeira para a própria tabela, porque a restauração da exportação carrega as linhas em
-- ordem de id (aleatória) com as chaves estrangeiras ligadas: uma devolução antes da sua entrega
-- quebraria a carga. O gatilho é "user" e fica desligado durante a restauração, como os do núcleo.
create function public.distribuicao_conferir_entrega()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Devolução sem entrega_id cai no check da tabela (23514); aqui só se confere a entrega apontada.
  if new.tipo = 'devolucao' and new.entrega_id is not null and not exists (
    select 1 from public.distribuicao_eventos e
    where e.id = new.entrega_id and e.tipo = 'entrega'
      and e.obra_id = new.obra_id and e.empresa_id = new.empresa_id and e.documento_id = new.documento_id
  ) then
    raise exception 'Sistema Obra: a devolução tem que apontar para uma entrega da mesma obra, empresa e documento'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;
create trigger distribuicao_conferir_entrega
  before insert on public.distribuicao_eventos
  for each row execute function public.distribuicao_conferir_entrega();
select nucleo.preparar_tabela('public.distribuicao_eventos', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- 7) Views. security_invoker: valem as regras de acesso das tabelas (quem lê a obra vê).
-- ---------------------------------------------------------------------

-- Revisão vigente de cada documento: LO vence EX (e as duas vencem qualquer outra fase);
-- na mesma fase vale o maior número; revisão obsoleta no Autodoc não concorre.
create view public.revisoes_vigentes with (security_invoker = true) as
select distinct on (r.documento_id) r.*
from public.revisoes r
where not r.apagado and not r.obsoleta
order by r.documento_id,
         (case r.fase when 'LO' then 2 when 'EX' then 1 else 0 end) desc,
         r.numero desc,
         r.cadastrada_em_autodoc desc nulls last,
         r.id;
grant select on public.revisoes_vigentes to authenticated;

-- Revisão que está na pasta do escritório (último evento) e se ela é a vigente.
create view public.documentos_escritorio with (security_invoker = true) as
select e.obra_id, e.documento_id, e.revisao_id, e.data_evento,
       (v.id is not null and v.id = e.revisao_id) as atualizado
from (
  select distinct on (documento_id) *
  from public.escritorio_eventos
  where not apagado
  order by documento_id, criado_em_dispositivo desc, id desc
) e
left join public.revisoes_vigentes v on v.documento_id = e.documento_id;
grant select on public.documentos_escritorio to authenticated;

-- Situação de cada empresa em cada documento, como na ficha de controle:
--   OK        uma entrega aberta, na revisão vigente
--   RECOLHER  uma entrega aberta, em revisão que não é a vigente
--   DEVOLVIDO nenhuma aberta, pelo menos uma devolvida
--   CONFERIR  duas ou mais entregas abertas, ou documento sem revisão vigente
-- Entrega aberta = entrega sem devolução.
create view public.situacao_distribuicao with (security_invoker = true) as
with abertas as (
  select e.obra_id, e.empresa_id, e.documento_id,
         count(*)::integer as entregas_abertas,
         (array_agg(e.revisao_id order by e.data_evento desc, e.criado_em_dispositivo desc, e.id))[1] as revisao_em_campo_id,
         max(e.data_evento) as ultimo_evento
  from public.distribuicao_eventos e
  where e.tipo = 'entrega' and not e.apagado
    and not exists (
      select 1 from public.distribuicao_eventos d
      where d.tipo = 'devolucao' and d.entrega_id = e.id and not d.apagado)
  group by e.obra_id, e.empresa_id, e.documento_id
),
devolvidas as (
  select d.obra_id, d.empresa_id, d.documento_id, max(d.data_evento) as ultimo_evento
  from public.distribuicao_eventos d
  where d.tipo = 'devolucao' and not d.apagado
  group by d.obra_id, d.empresa_id, d.documento_id
),
pares as (
  select obra_id, empresa_id, documento_id from abertas
  union
  select obra_id, empresa_id, documento_id from devolvidas
)
select p.obra_id, p.empresa_id, p.documento_id,
       case
         when coalesce(a.entregas_abertas, 0) >= 2 then 'CONFERIR'
         when a.entregas_abertas = 1 and v.id is null then 'CONFERIR'
         when a.entregas_abertas = 1 and a.revisao_em_campo_id = v.id then 'OK'
         when a.entregas_abertas = 1 then 'RECOLHER'
         else 'DEVOLVIDO'
       end as situacao,
       a.revisao_em_campo_id,
       v.id as revisao_vigente_id,
       coalesce(a.entregas_abertas, 0) as entregas_abertas,
       greatest(a.ultimo_evento, d.ultimo_evento) as ultimo_evento
from pares p
left join abertas a on a.obra_id = p.obra_id and a.empresa_id = p.empresa_id and a.documento_id = p.documento_id
left join devolvidas d on d.obra_id = p.obra_id and d.empresa_id = p.empresa_id and d.documento_id = p.documento_id
left join public.revisoes_vigentes v on v.documento_id = p.documento_id;
grant select on public.situacao_distribuicao to authenticated;

commit;
