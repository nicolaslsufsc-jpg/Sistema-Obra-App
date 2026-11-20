-- =====================================================================
-- Projetos: lista de distribuição (quem recebe cada projeto), proposta aprovada em 20/11/2026.
--
-- Uma regra diz: "esta pessoa (empresa + colaborador) recebe N cópias desta disciplina inteira, ou desta
-- pasta do Autodoc dentro dela". A regra da pasta vale mais que a da disciplina (conta feita no app).
-- O destinatário é um nome, sem conta no sistema.
-- Só inclusão: mudar ou desativar uma regra é incluir uma linha nova com substitui_id = a anterior
-- (como o Concreto). Vale a linha que nenhuma outra substitui (view destinatarios_vigentes).
-- Só o gestor inclui (cadastro de escritório). Quem lê a obra lê a lista.
-- =====================================================================

begin;

create table public.distribuicao_destinatarios (
  id                    uuid primary key,                          -- gerado no aparelho
  obra_id               uuid not null references public.obras (id),
  disciplina            text not null check (disciplina ~ '^[A-Z0-9 ]{2,40}$'),   -- sem acento, maiúscula (ESTRUTURAL)
  pasta                 text not null default '' check (length(pasta) <= 200),  -- '' = a disciplina inteira
  empresa               text not null check (btrim(empresa) <> '' and length(empresa) <= 200),
  colaborador           text not null default '' check (length(colaborador) <= 200), -- '' = qualquer pessoa da empresa
  copias                integer not null default 1 check (copias between 1 and 50),
  ativo                 boolean not null default true,
  desde                 date not null,                             -- revisão nova depois disso gera "a entregar"
  substitui_id          uuid check (substitui_id <> id),
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (substitui_id, obra_id) references public.distribuicao_destinatarios (id, obra_id)
    deferrable initially deferred
);
create index distribuicao_destinatarios_obra on public.distribuicao_destinatarios (obra_id, disciplina, pasta);
-- uma linha só pode ser substituída uma vez (senão haveria duas "últimas")
create unique index distribuicao_destinatarios_substitui on public.distribuicao_destinatarios (substitui_id)
  where substitui_id is not null and not apagado;
select nucleo.preparar_tabela('public.distribuicao_destinatarios', 'gestor', 'nenhuma');

-- A regra que vale de cada cadeia: a que nenhuma outra (não apagada) substitui.
create view public.destinatarios_vigentes with (security_invoker = true) as
select d.*
from public.distribuicao_destinatarios d
where not d.apagado
  and not exists (
    select 1 from public.distribuicao_destinatarios n
    where n.substitui_id = d.id and not n.apagado
  );
grant select on public.destinatarios_vigentes to authenticated;

commit;
