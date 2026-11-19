-- =====================================================================
-- MODELO de migração de módulo (Sistema Obra). Não é aplicado sozinho.
--
-- Como usar (sessão do módulo):
--   1. Copie para supabase/migrations/AAAAMMDDHHMMSS_<modulo>.sql
--      (data e hora depois da última migração existente).
--   2. Troque "exemplo" pelo nome do módulo (fvs, projetos, concreto, documentos) e as
--      colunas do módulo pelas suas. NÃO tire as colunas obrigatórias do núcleo.
--   3. No app, acrescente as tabelas em app/src/nucleo/tabelas.ts (pais antes dos filhos).
--   4. Escreva supabase/testes/testes_<modulo>.sql (veja testes_x_modelo_modulo.sql) e
--      rode bash supabase/testes/rodar_testes.sh.
-- Regras: docs/02_CONTRATO_NUCLEO.md. Precisa de algo diferente? "Pedidos ao núcleo".
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Tabela de CADASTRO (escritório, com internet): gestor inclui e altera.
--    Ex.: fichas_modelo, documentos, revisoes.
-- ---------------------------------------------------------------------
create table public.exemplo_fichas (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  -- colunas do módulo
  titulo                text not null,
  itens                 jsonb not null default '[]'::jsonb,
  -- colunas obrigatórias do núcleo (não mexer)
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id)
);
select nucleo.preparar_tabela('public.exemplo_fichas', 'gestor', 'gestor');

-- ---------------------------------------------------------------------
-- 2) Tabela de EVENTO de campo (offline, só inclusão): campo inclui, ninguém altera.
--    Corrigir = registrar evento novo. Ex.: fvs_eventos, caminhoes.
-- ---------------------------------------------------------------------
create table public.exemplo_eventos (
  id                    uuid primary key,       -- sempre gerado no aparelho
  obra_id               uuid not null references public.obras (id),
  -- colunas do módulo
  elemento_id           uuid not null,
  ficha_id              uuid not null,
  foto_id               uuid,                   -- foto de NC (tabela arquivos), opcional
  resultado             text not null check (resultado in ('C', 'NC', 'NA')),
  observacao            text,
  -- colunas obrigatórias do núcleo (não mexer)
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  -- chave composta (x_id, obra_id): a referência é sempre da MESMA obra
  foreign key (elemento_id, obra_id) references public.elementos (id, obra_id),
  foreign key (ficha_id, obra_id) references public.exemplo_fichas (id, obra_id),
  foreign key (foto_id, obra_id) references public.arquivos (id, obra_id)
);
-- índice para a consulta mais comum do módulo (ex.: último evento de cada elemento)
create index exemplo_eventos_elemento on public.exemplo_eventos (obra_id, elemento_id, criado_em_dispositivo);
select nucleo.preparar_tabela('public.exemplo_eventos', 'campo', 'nenhuma');

commit;
