-- =====================================================================
-- Documentos (PBQP-H / SiAC): a lista mestra com conta (item 3 do núcleo, aprovado em 20/11/2026).
--
-- Até aqui a tabela só existia no banco do navegador (modo sem conta). Com esta migração ela sobe
-- ao servidor e desce para os outros aparelhos da obra, como as outras tabelas sincronizadas.
-- Cada linha é uma revisão de um documento. Só inclusão:
-- - revisão nova = linha nova com o mesmo escopo e código (a anterior fica obsoleta, conta do app);
-- - corrigir, marcar "em revisão" ou cancelar = linha nova com substitui_id = a anterior
--   (como o Concreto). Vale a linha que nenhuma outra substitui.
-- O arquivo (PDF ou foto) vai pelo núcleo: linha em `arquivos` e bytes no bucket `obras`
-- ({obra_id}/documentos/{id}.ext). Gestor e admin incluem; quem lê a obra lê a lista.
-- Os limites de texto são os da tela (documentos/regras.ts, conferirRascunho).
-- =====================================================================

begin;

create table public.doc_documentos (
  id                    uuid primary key,                          -- gerado no aparelho
  obra_id               uuid not null references public.obras (id),
  escopo                text not null check (escopo in ('empresa', 'obra')),
  -- código da categoria (documentos/categorias.ts); categoria nova é uma linha no app, sem migração
  categoria             text not null check (categoria ~ '^[a-z][a-z_]{1,39}$'),
  codigo                text not null check (btrim(codigo) <> '' and length(codigo) <= 40),
  titulo                text not null check (btrim(titulo) <> '' and length(titulo) <= 300),
  revisao               text not null check (btrim(revisao) <> '' and length(revisao) <= 20),
  data_revisao          date not null,
  validade              date check (validade is null or validade >= data_revisao),
  responsavel           text not null check (btrim(responsavel) <> '' and length(responsavel) <= 200),
  situacao              text not null default 'vigente' check (situacao in ('vigente', 'em_revisao')),
  arquivo_id            uuid,
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
  foreign key (arquivo_id, obra_id) references public.arquivos (id, obra_id),
  foreign key (substitui_id, obra_id) references public.doc_documentos (id, obra_id)
    deferrable initially deferred
);
create index doc_documentos_obra on public.doc_documentos (obra_id, escopo, codigo);
select nucleo.preparar_tabela('public.doc_documentos', 'gestor', 'nenhuma');

comment on table public.doc_documentos is
  'Documentos: uma revisão de documento da lista mestra (PBQP-H) por linha. Só inclusão; vale a linha que nenhuma outra substitui.';

commit;
