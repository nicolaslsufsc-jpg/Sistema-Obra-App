-- =====================================================================
-- Concreto: FVM, recebimento de materiais controlados (docs/modulos/3_concreto.md, pendência 11).
-- As 5 decisões foram confirmadas pelo Nicolas em 20/11/2026:
--   1. migração agora (o FVM passa a sincronizar com o servidor);
--   2. a lista de materiais é dado da obra: o gestor importa o materiais.json (depois, pelo pacote);
--   3. fica dentro do Concreto, não é módulo novo;
--   4. "liberado com ressalva" existe e exige escrever a ressalva;
--   5. só gestor e admin tiram um material do "retido"; o campo registra o recebimento.
--
-- Só tabelas do Concreto: nenhuma tabela do núcleo muda (usa nucleo.preparar_tabela e
-- nucleo.pode_gerir, como as outras migrações de módulo).
--
-- Evento só de inclusão, como o resto do Concreto: corrigir ou apagar = linha nova com
-- substitui_id = linha antiga (cancelado = true para apagar). Os itens conferidos, os documentos
-- e as fotos ficam dentro da linha do recebimento (json), com cópia do texto de cada item: a ficha
-- fica fiel ao que foi conferido mesmo se a lista de materiais mudar depois.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Lista de materiais controlados da obra (o gestor importa o materiais.json).
-- itens: [{codigo, texto, valor?: {min, max}}]   documentos: ["Certificado do lote", ...]
-- via 'concreto': material recebido pelo caminhão (fluxo do Concreto), não por esta ficha.
-- ---------------------------------------------------------------------
create table public.materiais_controlados (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  codigo                text not null check (length(btrim(codigo)) between 1 and 40),
  nome                  text not null check (length(btrim(nome)) between 1 and 120),
  unidade               text not null default 'un' check (length(btrim(unidade)) between 1 and 20),
  estrutural            boolean not null default false,
  exige_ensaio          boolean not null default false,
  via                   text check (length(via) <= 20),
  itens                 jsonb not null default '[]'
                        check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 200),
  documentos            jsonb not null default '[]'
                        check (jsonb_typeof(documentos) = 'array' and jsonb_array_length(documentos) <= 50),
  ordem                 integer not null default 0 check (ordem between 0 and 10000),
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
  -- material sem itens só se vier por outro fluxo (via)
  check (via is not null or jsonb_array_length(itens) > 0 or cancelado),
  foreign key (substitui_id, obra_id) references public.materiais_controlados (id, obra_id)
    deferrable initially deferred
);
create index materiais_controlados_codigo on public.materiais_controlados (obra_id, codigo);
select nucleo.preparar_tabela('public.materiais_controlados', 'gestor', 'nenhuma');

-- ---------------------------------------------------------------------
-- Recebimento de um material (a ficha preenchida no portão).
-- material_codigo/material_nome/unidade: cópia do material na hora (sem chave para a lista).
-- itens: [{codigo, texto, resultado: C|NC|NA, valor, observacao}]
-- documentos: [{nome, veio}]   fotos: ["<id em arquivos>", ...]
-- situacao: liberado | liberado_ressalva | retido | devolvido. Fora de "liberado", o motivo
-- (ou a ressalva) é obrigatório. liberado_por/liberado_em: quem tirou do "retido" e quando.
-- ---------------------------------------------------------------------
create table public.recebimentos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  material_codigo       text not null check (length(btrim(material_codigo)) between 1 and 40),
  material_nome         text not null check (length(btrim(material_nome)) between 1 and 120),
  unidade               text not null check (length(btrim(unidade)) between 1 and 20),
  data                  date not null,
  fornecedor            text not null check (length(btrim(fornecedor)) between 1 and 200),
  nota_fiscal           text not null check (length(btrim(nota_fiscal)) between 1 and 40),
  lote                  text check (length(lote) <= 60),
  quantidade            numeric(12, 3) not null check (quantidade > 0 and quantidade <= 10000000),
  itens                 jsonb not null default '[]'
                        check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 200),
  documentos            jsonb not null default '[]'
                        check (jsonb_typeof(documentos) = 'array' and jsonb_array_length(documentos) <= 50),
  fotos                 jsonb not null default '[]'
                        check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 20),
  situacao              text not null check (situacao in ('liberado', 'liberado_ressalva', 'retido', 'devolvido')),
  motivo                text check (length(motivo) <= 500),
  observacao            text check (length(observacao) <= 2000),
  liberado_por          uuid,
  liberado_em           timestamptz,
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
  -- decisão 4: fora de "liberado", escrever o motivo (a ressalva, no "liberado com ressalva")
  check (situacao = 'liberado' or length(btrim(coalesce(motivo, ''))) > 0),
  -- quem libera e quando andam juntos
  check ((liberado_por is null) = (liberado_em is null)),
  foreign key (substitui_id, obra_id) references public.recebimentos (id, obra_id)
    deferrable initially deferred
);
create index recebimentos_data on public.recebimentos (obra_id, data);

-- Decisão 5: só gestor e admin tiram um material do "retido". Vale para quem grava pela API
-- (papel authenticated). O restaurar.sql da exportação (dono do banco) não passa por aqui, e pode
-- trazer a correção antes da linha corrigida: sem a linha antiga, não há o que conferir.
create function public.concreto_conferir_recebimento()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_antes text;
begin
  if current_user <> 'authenticated' or new.substitui_id is null then
    return new;
  end if;
  select r.situacao into v_antes
  from public.recebimentos r
  where r.id = new.substitui_id and r.obra_id = new.obra_id;
  if v_antes = 'retido' and new.situacao <> 'retido' and not new.cancelado then
    if not nucleo.pode_gerir(new.obra_id) then
      raise exception 'Sistema Obra: só gestor ou admin tira um material do retido'
        using errcode = 'insufficient_privilege';
    end if;
    if new.liberado_por is distinct from new.usuario_id then
      raise exception 'Sistema Obra: quem tira do retido fica em liberado_por (a própria pessoa)'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger concreto_conferir_recebimento
  before insert on public.recebimentos
  for each row execute function public.concreto_conferir_recebimento();
select nucleo.preparar_tabela('public.recebimentos', 'campo', 'nenhuma');

commit;
