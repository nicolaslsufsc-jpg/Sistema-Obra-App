-- =====================================================================
-- Projetos: formulário próprio da obra para a entrega de cópias (23/11/2026)
--
-- Pedido do Nicolas: "o relatório de entrega tem que ser no formato do
-- formulário" da empresa, só na obra que tem esse formulário. O modelo é
-- DADO da obra (nunca código): título, código e datas do formulário,
-- setores, disciplinas com as siglas que marcam cada caixa e o logo
-- (imagem pequena em data URL). Obra sem linha aqui = comprovante de sempre.
--
--   projetos_formularios  cadastro do escritório (gestor), só inclusão: vale a
--                         linha mais nova da obra para cada tipo. Mudar o
--                         modelo = incluir linha nova com tudo.
--
-- modelo: {"titulo": ["..."], "referencia": "...", "emissao": "...",
--          "revisao": "...", "versao": "...", "tipo": "...", "setores": "...",
--          "logo": "data:image/png;base64,...", "empresa": "...",
--          "disciplinas": [{"nome": "...", "siglas": ["ES"], "outros": false}],
--          "linhas_por_pagina": 15}
-- O app confere o resto (projetos/ficha_entrega.ts, lerModelo); o banco
-- confere o mínimo: objeto, título e disciplinas em lista, e o tamanho.
--
-- Só acrescenta uma tabela; nada é apagado nem alterado.
-- Onde aplicar: editor SQL do Supabase. Roda numa transação.
-- =====================================================================

begin;

create table public.projetos_formularios (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id),
  -- para que serve o formulário; hoje só 'entrega'
  tipo                  text not null default 'entrega' check (tipo in ('entrega')),
  modelo                jsonb not null check (
                          jsonb_typeof(modelo) = 'object'
                          and jsonb_typeof(modelo -> 'titulo') = 'array'
                          and jsonb_typeof(modelo -> 'disciplinas') = 'array'
                          and pg_column_size(modelo) <= 400000
                        ),
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id)
);

create index projetos_formularios_obra_recente on public.projetos_formularios (obra_id, tipo, criado_em_servidor desc);

comment on table public.projetos_formularios is
  'Formulário próprio da obra (hoje: entrega de cópias). Só inclusão; vale a linha mais nova por tipo.';

select nucleo.preparar_tabela('public.projetos_formularios', 'gestor', 'nenhuma');

commit;
