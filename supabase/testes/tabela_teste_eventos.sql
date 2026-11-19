-- Tabela de evento de exemplo, como um módulo faria (só inclusão, campo registra).
-- Usada pelos testes de integração e pelo teste de restauração da exportação.
create table public.teste_eventos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  elemento              text not null,
  resultado             text not null check (resultado in ('C', 'NC', 'NA')),
  observacao            text,
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false
);
select nucleo.preparar_tabela('public.teste_eventos', 'campo', 'nenhuma');
