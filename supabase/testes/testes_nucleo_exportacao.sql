-- =====================================================================
-- Testes da migração de exportação. Roda depois de testes_nucleo.sql (mesmo banco:
-- usa o schema "teste" e a tabela teste_eventos criados lá).
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- Uma tabela que depende de outra tabela sincronizada (como fvs_fotos -> arquivos).
create table public.teste_fotos (
  id                    uuid primary key,
  obra_id               uuid not null references public.obras (id),
  arquivo_id            uuid not null,
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  foreign key (arquivo_id, obra_id) references public.arquivos (id, obra_id)
);
select nucleo.preparar_tabela('public.teste_fotos', 'campo', 'nenhuma');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

-- Tabelas de módulo que não dependem de outra sincronizada (ex.: empresas, documentos)
-- também ficam no nível 0, por isso "contém" e não "é igual a".
select teste.ok(
  (select array_agg(tabela order by tabela) from public.tabelas_para_exportar() where nivel = 0)
  @> array['public.arquivos', 'public.pavimentos', 'public.teste_eventos']
  and not exists (select 1 from public.tabelas_para_exportar() where nivel = 0 and tabela in ('public.elementos', 'public.setores')),
  'exportação: nível 0 = tabelas que não dependem de outra sincronizada');
select teste.ok(
  (select nivel from public.tabelas_para_exportar() where tabela = 'public.elementos') = 1
  and (select nivel from public.tabelas_para_exportar() where tabela = 'public.setores') = 1,
  'exportação: elementos e setores vêm depois de pavimentos');
select teste.ok(
  (select nivel from public.tabelas_para_exportar() where tabela = 'public.teste_fotos')
  > (select nivel from public.tabelas_para_exportar() where tabela = 'public.arquivos'),
  'exportação: tabela de módulo vem depois da tabela que ela referencia');
reset role;

set role anon;
select teste.deve_falhar($$select * from public.tabelas_para_exportar()$$, '42501',
  'exportação: visitante sem login não chama a função');
reset role;

drop table public.teste_fotos;
delete from nucleo.tabelas_sincronizadas where tabela = 'public.teste_fotos';

\echo 'TESTES DE EXPORTAÇÃO PASSARAM'
