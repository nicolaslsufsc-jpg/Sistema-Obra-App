-- =====================================================================
-- Concreto/FVM: onde o lote recebido foi usado (rastreabilidade lote → local, ideia 2 de 25/11).
--
-- PROPOSTA: escrita em 25/11/2026 na branch concreto/fvm-editor, NÃO APLICADA em servidor nenhum.
-- Só vai para o servidor de testes (e depois para o oficial) com o "pode" do Nicolas.
--
-- Cada linha diz: "parte do recebimento X foi usada no pavimento Y" (e, se a pessoa quiser, na peça Z
-- ou num local escrito, como "alvenaria do eixo 3"). É marcado à mão, como a ligação entre fichas
-- da FVS. Um recebimento pode ter vários usos; o mesmo local pode ter lotes de vários recebimentos.
--
-- Só tabela do Concreto: nenhuma tabela do núcleo muda (usa nucleo.preparar_tabela, como as outras
-- migrações de módulo). Evento só de inclusão: corrigir ou desfazer = linha nova com
-- substitui_id = linha antiga (cancelado = true para desfazer).
--
-- recebimento_id aponta para a PRIMEIRA versão do recebimento (a raiz): as correções do recebimento
-- (tirar do retido, por exemplo) não mudam o uso já marcado.
-- =====================================================================

begin;

create table public.recebimento_usos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  recebimento_id        uuid not null,
  pavimento_id          uuid not null,
  elemento_id           uuid,
  local_texto           text check (length(local_texto) <= 200),
  quantidade            numeric(12, 3) check (quantidade is null or (quantidade > 0 and quantidade <= 10000000)),
  data                  date not null,
  observacao            text check (length(observacao) <= 1000),
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
  foreign key (recebimento_id, obra_id) references public.recebimentos (id, obra_id),
  foreign key (pavimento_id, obra_id) references public.pavimentos (id, obra_id),
  foreign key (elemento_id, obra_id) references public.elementos (id, obra_id),
  foreign key (substitui_id, obra_id) references public.recebimento_usos (id, obra_id)
    deferrable initially deferred
);
create index recebimento_usos_recebimento on public.recebimento_usos (obra_id, recebimento_id);
create index recebimento_usos_local on public.recebimento_usos (obra_id, pavimento_id, elemento_id);

-- quem recebe no portão também marca onde o material foi usado
select nucleo.preparar_tabela('public.recebimento_usos', 'campo', 'nenhuma');

commit;
