-- =====================================================================
-- FVS: tratativa de não conformidade (ideia 1 da lista de ideias, aprovada pelo Nicolas em 25/11/2026:
-- "pode criar a fvs_tratativas no servidor de testes"). Regra em docs/modulos/1_fvs.md, "Tratativa do NC".
--
-- O item marcado NC ficava solto: só a foto e o "O que fazer?". A norma (PBQP-H, SiAC nível A) pede
-- quem resolve, até quando, a causa, se foi aceito sob concessão (e quem decidiu), a reinspeção e a
-- verificação de eficácia. A reinspeção continua sendo o C na rodada seguinte, em fvs_eventos.
--
--   fvs_tratativas  campo, só inclusão. Vale a mais nova (criado_em_dispositivo, depois id) de cada NC.
--                   Mudar um campo = linha nova com tudo, como no fvs_eventos.
--
-- evento_nc_id é o registro NC que abriu a rodada (o primeiro NC da rodada daquele item): dele saem o
-- local, a ficha, o item e a rodada. O prazo só avisa (regra de 18/11): nada é bloqueado por ele.
-- =====================================================================

begin;

create table public.fvs_tratativas (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  -- o registro NC da rodada (fvs_eventos)
  evento_nc_id          uuid not null,
  -- quem resolve: empreiteiro ou equipe (texto livre por enquanto)
  responsavel           text check (length(responsavel) <= 120),
  -- até quando: só avisa
  prazo                 date,
  -- causa: lista curta da norma
  causa                 text check (causa in ('mao_de_obra', 'material', 'projeto', 'outro')),
  causa_obs             text check (length(causa_obs) <= 500),
  -- "há casos parecidos?"
  casos_parecidos       text check (length(casos_parecidos) <= 500),
  -- aceito sob concessão: fecha o NC sem reinspeção, com quem decidiu
  concessao             boolean not null default false,
  concessao_por         text check (length(concessao_por) <= 120),
  -- verificação de eficácia, depois da reinspeção C
  eficacia              text check (eficacia in ('eficaz', 'nao_eficaz')),
  eficacia_obs          text check (length(eficacia_obs) <= 500),
  -- colunas obrigatórias do núcleo
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id),
  constraint fvs_tratativas_concessao_com_quem check (not concessao or length(btrim(coalesce(concessao_por, ''))) > 0),
  -- conferida só no fim da transação: o restaurar.sql da exportação carrega em qualquer ordem
  foreign key (evento_nc_id, obra_id) references public.fvs_eventos (id, obra_id) deferrable initially deferred
);
create index fvs_tratativas_evento on public.fvs_tratativas (obra_id, evento_nc_id, criado_em_dispositivo);

-- A tratativa é de um NC (gatilho, desligado na restauração como os outros da obra).
create function public.fvs_conferir_tratativa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- a chave estrangeira fica para o fim da transação; aqui o NC já tem que existir, nesta obra
  if not exists (
    select 1 from public.fvs_eventos e
    where e.id = new.evento_nc_id and e.obra_id = new.obra_id and e.resultado = 'NC'
  ) then
    raise exception 'Sistema Obra: a tratativa é de um registro NC desta obra'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger fvs_conferir_tratativa
  before insert on public.fvs_tratativas
  for each row execute function public.fvs_conferir_tratativa();

select nucleo.preparar_tabela('public.fvs_tratativas', 'campo', 'nenhuma');

comment on table public.fvs_tratativas is
  'Tratativa de um NC da FVS: quem resolve, prazo (só avisa), causa, concessão e eficácia. Só inclusão; vale a mais nova por evento_nc_id.';

commit;
