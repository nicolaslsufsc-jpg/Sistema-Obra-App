-- =====================================================================
-- Módulo Relatórios: diário de obra (RDO) e relatórios avulsos (problema, limpeza etc.).
-- Desenho do módulo: docs/modulos/5_relatorios.md. Regras: docs/02_CONTRATO_NUCLEO.md.
--
-- Tudo é evento só de inclusão: escrito em campo, sem internet, por várias pessoas no mesmo dia.
-- O diário NÃO tem linha "pai" por dia: cada registro leva a data. Assim dois aparelhos sem
-- internet escrevem o diário do mesmo dia sem conflito.
--
-- Corrigir ou apagar = incluir uma linha nova com substitui_id = linha antiga (cancelado = true
-- para apagar). Vale a linha que nenhuma outra substituiu. Exceções em que vale o último registro
-- da chave: diario_cadastro (obra), diario_clima (data + período), diario_fechamentos (data) e
-- relatorio_andamentos (relatório).
--
-- Quem aponta para um registro corrigível aponta para a RAIZ (primeira versão) dele.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Dados da obra que vão no cabeçalho do diário. Vale o último registro da obra.
-- ---------------------------------------------------------------------
create table public.diario_cadastro (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  endereco              text check (length(endereco) <= 300),
  contratante           text check (length(contratante) <= 200),
  responsavel_tecnico   text check (length(responsavel_tecnico) <= 200),
  art                   text check (length(art) <= 60),
  data_inicio           date check (data_inicio >= '2000-01-01'),
  prazo_fim             date check (prazo_fim >= '2000-01-01'),
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id)
);
select nucleo.preparar_tabela('public.diario_cadastro', 'gestor', 'nenhuma');

-- ---------------------------------------------------------------------
-- Clima por período do dia. Vale o último registro de cada data + período.
-- tempo vazio = desmarcado.
-- ---------------------------------------------------------------------
create table public.diario_clima (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  data                  date not null check (data >= '2000-01-01'),
  periodo               text not null check (periodo in ('manha', 'tarde', 'noite')),
  tempo                 text check (tempo in ('sol', 'nublado', 'chuva_fraca', 'chuva_forte')),
  condicao              text check (condicao in ('praticavel', 'impraticavel')),
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id)
);
create index diario_clima_data on public.diario_clima (obra_id, data);
select nucleo.preparar_tabela('public.diario_clima', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Mão de obra do dia.
-- ---------------------------------------------------------------------
create table public.diario_efetivo (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  data                  date not null check (data >= '2000-01-01'),
  empresa               text check (length(empresa) <= 120),
  funcao                text not null check (length(funcao) between 1 and 120),
  quantidade            integer not null check (quantidade between 0 and 5000),
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
  foreign key (substitui_id, obra_id) references public.diario_efetivo (id, obra_id)
    deferrable initially deferred
);
create index diario_efetivo_data on public.diario_efetivo (obra_id, data);
select nucleo.preparar_tabela('public.diario_efetivo', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Equipamentos no dia.
-- ---------------------------------------------------------------------
create table public.diario_equipamentos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  data                  date not null check (data >= '2000-01-01'),
  nome                  text not null check (length(nome) between 1 and 120),
  quantidade            integer not null check (quantidade between 0 and 1000),
  situacao              text not null default 'operando' check (situacao in ('operando', 'parado', 'manutencao')),
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
  foreign key (substitui_id, obra_id) references public.diario_equipamentos (id, obra_id)
    deferrable initially deferred
);
create index diario_equipamentos_data on public.diario_equipamentos (obra_id, data);
select nucleo.preparar_tabela('public.diario_equipamentos', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Materiais recebidos no dia.
-- ---------------------------------------------------------------------
create table public.diario_materiais (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  data                  date not null check (data >= '2000-01-01'),
  material              text not null check (length(material) between 1 and 200),
  quantidade            numeric(12, 3) check (quantidade >= 0),
  unidade               text check (length(unidade) <= 20),
  fornecedor            text check (length(fornecedor) <= 200),
  nota_fiscal           text check (length(nota_fiscal) <= 60),
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
  foreign key (substitui_id, obra_id) references public.diario_materiais (id, obra_id)
    deferrable initially deferred
);
create index diario_materiais_data on public.diario_materiais (obra_id, data);
select nucleo.preparar_tabela('public.diario_materiais', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Serviço executado no dia. Onde ele foi fica em rel_marcas (planta) e/ou em local_texto.
-- ---------------------------------------------------------------------
create table public.diario_servicos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  data                  date not null check (data >= '2000-01-01'),
  descricao             text not null check (length(descricao) between 1 and 1000),
  empresa               text check (length(empresa) <= 120),
  situacao              text not null default 'em_andamento'
                        check (situacao in ('iniciado', 'em_andamento', 'concluido', 'paralisado')),
  avanco_pct            integer check (avanco_pct between 0 and 100),
  local_texto           text check (length(local_texto) <= 300),
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
  foreign key (substitui_id, obra_id) references public.diario_servicos (id, obra_id)
    deferrable initially deferred
);
create index diario_servicos_data on public.diario_servicos (obra_id, data);
select nucleo.preparar_tabela('public.diario_servicos', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Ocorrência do dia: interrupção, acidente, visita, orientação etc.
-- tipo sem lista no banco: lista nova no app não precisa de migração (app/src/relatorios/tipos.ts).
-- ---------------------------------------------------------------------
create table public.diario_ocorrencias (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  data                  date not null check (data >= '2000-01-01'),
  tipo                  text not null check (tipo ~ '^[a-z_]{1,40}$'),
  descricao             text not null check (length(descricao) between 1 and 2000),
  horas_paradas         numeric(5, 1) check (horas_paradas >= 0 and horas_paradas <= 24),
  local_texto           text check (length(local_texto) <= 300),
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
  foreign key (substitui_id, obra_id) references public.diario_ocorrencias (id, obra_id)
    deferrable initially deferred
);
create index diario_ocorrencias_data on public.diario_ocorrencias (obra_id, data);
select nucleo.preparar_tabela('public.diario_ocorrencias', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Fechar e reabrir o dia (só gestor e admin). Vale o último registro da data.
-- numero: número do RDO, dado no primeiro fechamento e mantido se o dia for reaberto.
-- ---------------------------------------------------------------------
create table public.diario_fechamentos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  data                  date not null check (data >= '2000-01-01'),
  acao                  text not null check (acao in ('fechado', 'reaberto')),
  numero                integer not null check (numero between 1 and 100000),
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
create index diario_fechamentos_data on public.diario_fechamentos (obra_id, data);
select nucleo.preparar_tabela('public.diario_fechamentos', 'gestor', 'nenhuma');

-- ---------------------------------------------------------------------
-- Relatório avulso: problema na obra, limpeza, segurança...
-- itens: lista de conferência do tipo, [{"item": "Entulho removido", "resultado": "ok|atencao|ruim"|null}]
-- ---------------------------------------------------------------------
create table public.relatorios (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  tipo                  text not null check (tipo ~ '^[a-z_]{1,40}$'),
  data                  date not null check (data >= '2000-01-01'),
  titulo                text not null check (length(titulo) between 1 and 200),
  descricao             text check (length(descricao) <= 4000),
  gravidade             text check (gravidade in ('baixa', 'media', 'alta')),
  responsavel           text check (length(responsavel) <= 200),
  prazo                 date check (prazo >= '2000-01-01'),
  local_texto           text check (length(local_texto) <= 300),
  itens                 jsonb not null default '[]'::jsonb
                        check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 100),
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
  foreign key (substitui_id, obra_id) references public.relatorios (id, obra_id)
    deferrable initially deferred
);
create index relatorios_data on public.relatorios (obra_id, data);
select nucleo.preparar_tabela('public.relatorios', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Andamento do relatório. A situação atual é a do último registro do relatório (raiz).
-- ---------------------------------------------------------------------
create table public.relatorio_andamentos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  relatorio_id          uuid not null,
  situacao              text not null check (situacao in ('aberto', 'em_andamento', 'resolvido')),
  comentario            text check (length(comentario) <= 2000),
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  foreign key (relatorio_id, obra_id) references public.relatorios (id, obra_id)
);
create index relatorio_andamentos_relatorio on public.relatorio_andamentos (obra_id, relatorio_id);
select nucleo.preparar_tabela('public.relatorio_andamentos', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Onde foi: marca na prancha de forma de um serviço, ocorrência ou relatório.
--   forma 'peca'  : uma peça (elementos). planta_ref vazia = marcada na lista, sem planta.
--   forma 'area'  : contorno desenhado, [[x, y], ...] em pixels da planta (x para a direita, y para baixo).
--   forma 'ponto' : um ponto, [[x, y]].
-- planta_ref: "<trecho>@<revisão>", a prancha que estava na tela (toda conferência guarda a revisão).
-- ---------------------------------------------------------------------
create table public.rel_marcas (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  servico_id            uuid,
  ocorrencia_id         uuid,
  relatorio_id          uuid,
  pavimento_id          uuid not null,
  planta_ref            text check (length(planta_ref) between 1 and 300),
  forma                 text not null check (forma in ('peca', 'area', 'ponto')),
  elemento_id           uuid,
  contorno              jsonb,
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
  constraint rel_marcas_um_alvo check (num_nonnulls(servico_id, ocorrencia_id, relatorio_id) = 1),
  constraint rel_marcas_forma check (
    (forma = 'peca' and elemento_id is not null and contorno is null)
    or (forma = 'area' and elemento_id is null and planta_ref is not null
        and jsonb_typeof(contorno) = 'array' and jsonb_array_length(contorno) between 3 and 5000)
    or (forma = 'ponto' and elemento_id is null and planta_ref is not null
        and jsonb_typeof(contorno) = 'array' and jsonb_array_length(contorno) = 1)
  ),
  foreign key (servico_id, obra_id) references public.diario_servicos (id, obra_id),
  foreign key (ocorrencia_id, obra_id) references public.diario_ocorrencias (id, obra_id),
  foreign key (relatorio_id, obra_id) references public.relatorios (id, obra_id),
  foreign key (pavimento_id, obra_id) references public.pavimentos (id, obra_id),
  foreign key (elemento_id, obra_id) references public.elementos (id, obra_id),
  foreign key (substitui_id, obra_id) references public.rel_marcas (id, obra_id)
    deferrable initially deferred
);
create index rel_marcas_pavimento on public.rel_marcas (obra_id, pavimento_id);
select nucleo.preparar_tabela('public.rel_marcas', 'campo', 'nenhuma');

-- ---------------------------------------------------------------------
-- Foto: do dia (sem alvo) ou de um serviço, ocorrência ou relatório.
-- ---------------------------------------------------------------------
create table public.rel_fotos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  data                  date not null check (data >= '2000-01-01'),
  servico_id            uuid,
  ocorrencia_id         uuid,
  relatorio_id          uuid,
  arquivo_id            uuid not null,
  legenda               text check (length(legenda) <= 300),
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
  constraint rel_fotos_no_maximo_um_alvo check (num_nonnulls(servico_id, ocorrencia_id, relatorio_id) <= 1),
  foreign key (servico_id, obra_id) references public.diario_servicos (id, obra_id),
  foreign key (ocorrencia_id, obra_id) references public.diario_ocorrencias (id, obra_id),
  foreign key (relatorio_id, obra_id) references public.relatorios (id, obra_id),
  foreign key (arquivo_id, obra_id) references public.arquivos (id, obra_id),
  foreign key (substitui_id, obra_id) references public.rel_fotos (id, obra_id)
    deferrable initially deferred
);
create index rel_fotos_data on public.rel_fotos (obra_id, data);
select nucleo.preparar_tabela('public.rel_fotos', 'campo', 'nenhuma');

commit;
