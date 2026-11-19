-- =====================================================================
-- Testes do módulo Projetos (supabase/migrations/20261103234000_projetos.sql).
-- Roda depois dos testes do núcleo, no mesmo banco (usa os usuários e obras de lá).
-- Obra 1: b1 gestor, c1 campo, d1 leitura. Obra 2: b1 leitura. e1 não tem acesso.
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela in ('public.empresas', 'public.documentos', 'public.revisoes', 'public.listas_autodoc',
                    'public.escritorio_eventos', 'public.distribuicao_eventos')) = 6,
  'projetos: as seis tabelas do módulo ficam registradas no núcleo');

-- ---------------------------------------------------------------------
-- Cadastro pelo gestor da obra 1 (b1)
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

insert into public.empresas (id, obra_id, nome, dispositivo_id, criado_em_dispositivo) values
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Empreiteira A', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('e1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Empreiteira B', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());

select teste.deve_falhar($$
  insert into public.empresas (obra_id, nome, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', ' empreiteira a ', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'projetos: nome de empresa repetido na obra é recusado (ignora maiúsculas e espaços)');

insert into public.documentos (id, obra_id, codigo, disciplina_sigla, disciplina, numero, nome_curto, titulo, dispositivo_id, criado_em_dispositivo) values
  ('d1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'XPT.ES.112.FORPILOTIS', 'ES', 'Estrutura', '112', 'FORPILOTIS', 'PLANTA DE FORMA DO PILOTIS', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('d1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'XPT.AR.010.PLANTABAIX', 'AR', 'Arquitetura', '010', 'PLANTABAIX', 'PLANTA BAIXA', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('d1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'XPT.HS.020.ESGOTOTERR', 'HS', 'Hidrossanitário', '020', 'ESGOTOTERR', 'ESGOTO TÉRREO', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());

select teste.deve_falhar($$
  insert into public.documentos (obra_id, codigo, disciplina_sigla, numero, nome_curto, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'Planta', 'ES', '112', 'PLANTA', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'projetos: código fora da máscara é recusado');
select teste.deve_falhar($$
  insert into public.documentos (obra_id, codigo, disciplina_sigla, numero, nome_curto, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'XPT.ES.112.FORPILOTIS', 'AR', '112', 'FORPILOTIS', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'projetos: as partes do código têm que bater com o código');
select teste.deve_falhar($$
  insert into public.documentos (obra_id, codigo, disciplina_sigla, numero, nome_curto, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'XPT.ES.112.FORPILOTIS', 'ES', '112', 'FORPILOTIS', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'projetos: código repetido na obra é recusado');

-- Revisões: D1 tem EX 05 e LO 02; D2 tem EX 03 e EX 04; D3 só tem LO 01, obsoleta.
insert into public.revisoes (id, obra_id, documento_id, fase, numero, obsoleta, cadastrada_em_autodoc, vista_em, dispositivo_id, criado_em_dispositivo) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000001', 'EX', '05', false, '2026-10-01 10:00-03', '2026-11-03', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000001', 'LO', '02', false, '2026-09-01 10:00-03', '2026-11-03', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000002', 'EX', '03', false, '2026-09-01 10:00-03', '2026-11-03', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('a1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000002', 'EX', '04', false, '2026-10-01 10:00-03', '2026-11-03', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('a1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000003', 'LO', '01', true,  '2026-08-01 10:00-03', '2026-11-03', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());

select teste.deve_falhar($$
  insert into public.revisoes (obra_id, documento_id, fase, numero, vista_em, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000001', 'Liberado', '02', '2026-11-03', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'projetos: fase tem que ser sigla de duas letras');
select teste.deve_falhar($$
  insert into public.revisoes (obra_id, documento_id, fase, numero, vista_em, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000001', 'LO', '2', '2026-11-03', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'projetos: número da revisão tem dois dígitos');
select teste.deve_falhar($$
  insert into public.revisoes (obra_id, documento_id, fase, numero, vista_em, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000001', 'LO', '02', '2026-11-03', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'projetos: mesma revisão do mesmo documento não entra duas vezes');

-- Vigência
select teste.ok((select id from public.revisoes_vigentes where documento_id = 'd1000000-0000-0000-0000-000000000001')
  = 'a1000000-0000-0000-0000-000000000002', 'vigência: LO 02 vence EX 05');
select teste.ok((select id from public.revisoes_vigentes where documento_id = 'd1000000-0000-0000-0000-000000000002')
  = 'a1000000-0000-0000-0000-000000000004', 'vigência: na mesma fase vale o maior número');
select teste.ok(not exists (select 1 from public.revisoes_vigentes where documento_id = 'd1000000-0000-0000-0000-000000000003'),
  'vigência: documento só com revisão obsoleta não tem vigente');
select teste.ok((select count(*) from public.revisoes_vigentes) = 2, 'vigência: uma linha por documento com vigente');

-- LO 02 de D1 vira obsoleta: EX 05 passa a valer
update public.revisoes set obsoleta = true, data_obsoleta = now() where id = 'a1000000-0000-0000-0000-000000000002';
select teste.ok((select id from public.revisoes_vigentes where documento_id = 'd1000000-0000-0000-0000-000000000001')
  = 'a1000000-0000-0000-0000-000000000001', 'vigência: LO obsoleta não concorre, EX 05 vale');
update public.revisoes set obsoleta = false, data_obsoleta = null where id = 'a1000000-0000-0000-0000-000000000002';

-- Lista importada: só inclusão
insert into public.listas_autodoc (id, obra_id, data_lista, arquivo, linhas, dispositivo_id, criado_em_dispositivo)
values ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2026-11-03', '05_revisoes_vigentes_autodoc_2026-11-03.csv', 6, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.deve_falhar($$
  insert into public.listas_autodoc (obra_id, data_lista, arquivo, linhas, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '2026-11-03', '05_revisoes_vigentes_autodoc_2026-11-03.csv', 6, 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23505', 'projetos: a mesma lista não é importada duas vezes');
select teste.deve_falhar($$update public.listas_autodoc set linhas = 7$$, '42501', 'projetos: lista importada não é alterada');

-- Pasta do escritório: evento, o último vale
insert into public.escritorio_eventos (id, obra_id, documento_id, revisao_id, data_evento, dispositivo_id, criado_em_dispositivo) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2026-10-02', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '2026-10-02 10:00-03'),
  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', '2026-10-03', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '2026-10-03 10:00-03');
select teste.ok((select revisao_id from public.documentos_escritorio where documento_id = 'd1000000-0000-0000-0000-000000000001')
  = 'a1000000-0000-0000-0000-000000000002', 'escritório: vale o último evento');
select teste.ok((select atualizado from public.documentos_escritorio where documento_id = 'd1000000-0000-0000-0000-000000000001'),
  'escritório: com a vigente na pasta, atualizado = true');
select teste.deve_falhar($$
  insert into public.escritorio_eventos (id, obra_id, documento_id, revisao_id, data_evento, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', '2026-10-03', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'escritório: revisão tem que ser do mesmo documento');
reset role;

-- ---------------------------------------------------------------------
-- Campo (c1) registra entregas e devoluções; leitura (d1) não
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.deve_falhar($$
  insert into public.documentos (obra_id, codigo, disciplina_sigla, numero, nome_curto, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', 'XPT.ES.113.FORPILOTIS', 'ES', '113', 'FORPILOTIS', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'projetos: campo não cadastra documento');

-- A: D1 na EX 05 (a vigente é LO 02) -> RECOLHER
insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, colaborador, documento_id, revisao_id, data_evento, dispositivo_id, criado_em_dispositivo) values
  ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000001', 'João', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2026-10-05', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
-- A: D2 na EX 04 (vigente) -> OK
insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, data_evento, dispositivo_id, criado_em_dispositivo) values
  ('f1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', '2026-10-05', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
-- B: D2 duas entregas abertas -> CONFERIR
insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, data_evento, dispositivo_id, criado_em_dispositivo) values
  ('f1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', '2026-10-06', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now()),
  ('f1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', '2026-10-07', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
-- B: D3 (sem vigente) -> CONFERIR
insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, data_evento, dispositivo_id, criado_em_dispositivo) values
  ('f1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000005', '2026-10-08', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());

select teste.ok((select situacao from public.situacao_distribuicao where empresa_id = 'e1000000-0000-0000-0000-000000000001' and documento_id = 'd1000000-0000-0000-0000-000000000001') = 'RECOLHER',
  'situação: entrega em revisão vencida = RECOLHER');
select teste.ok((select situacao from public.situacao_distribuicao where empresa_id = 'e1000000-0000-0000-0000-000000000001' and documento_id = 'd1000000-0000-0000-0000-000000000002') = 'OK',
  'situação: entrega na vigente = OK');
select teste.ok((select situacao from public.situacao_distribuicao where empresa_id = 'e1000000-0000-0000-0000-000000000002' and documento_id = 'd1000000-0000-0000-0000-000000000002') = 'CONFERIR',
  'situação: duas entregas abertas = CONFERIR');
select teste.ok((select situacao from public.situacao_distribuicao where empresa_id = 'e1000000-0000-0000-0000-000000000002' and documento_id = 'd1000000-0000-0000-0000-000000000003') = 'CONFERIR',
  'situação: documento sem vigente = CONFERIR');

-- A devolve D1 -> DEVOLVIDO
insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, entrega_id, data_evento, dispositivo_id, criado_em_dispositivo) values
  ('f1000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'devolucao', 'e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', '2026-10-09', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select situacao from public.situacao_distribuicao where empresa_id = 'e1000000-0000-0000-0000-000000000001' and documento_id = 'd1000000-0000-0000-0000-000000000001') = 'DEVOLVIDO',
  'situação: entrega devolvida = DEVOLVIDO');
select teste.ok((select count(*) from public.situacao_distribuicao) = 4, 'situação: uma linha por empresa e documento');

select teste.deve_falhar($$
  insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, data_evento, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'devolucao', 'e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2026-10-09', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'projetos: devolução sem a entrega é recusada');
select teste.deve_falhar($$
  insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, entrega_id, data_evento, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'devolucao', 'e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000002', '2026-10-09', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'projetos: devolução tem que ser da mesma empresa da entrega');
select teste.deve_falhar($$
  insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, data_evento, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', '2026-10-09', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'projetos: revisão entregue tem que ser do documento entregue');
select teste.deve_falhar($$update public.distribuicao_eventos set colaborador = 'x'$$, '42501', 'projetos: evento de entrega não é alterado');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.deve_falhar($$
  insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, data_evento, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'entrega', 'e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2026-10-09', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'projetos: quem só lê não registra entrega');
select teste.ok((select count(*) from public.situacao_distribuicao) = 4, 'projetos: quem lê a obra vê a situação');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.revisoes_vigentes) = 0 and (select count(*) from public.situacao_distribuicao) = 0,
  'projetos: quem não tem acesso à obra não vê nada nas views');
reset role;

-- Referência entre obras: empresa da obra 1 num documento da obra 2 (como superusuário, para passar da RLS)
select teste.deve_falhar($$
  insert into public.distribuicao_eventos (id, obra_id, tipo, empresa_id, documento_id, revisao_id, data_evento, usuario_id, dispositivo_id, criado_em_dispositivo)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'entrega', 'e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2026-10-09', '00000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23503', 'projetos: evento não aponta para empresa ou documento de outra obra');

-- Exportação: filhos depois dos pais
select teste.ok(
  (select nivel from public.tabelas_para_exportar() where tabela = 'public.distribuicao_eventos')
  > greatest(
      (select nivel from public.tabelas_para_exportar() where tabela = 'public.revisoes'),
      (select nivel from public.tabelas_para_exportar() where tabela = 'public.empresas'))
  and (select nivel from public.tabelas_para_exportar() where tabela = 'public.revisoes')
      > (select nivel from public.tabelas_para_exportar() where tabela = 'public.documentos'),
  'projetos: exportação restaura documentos, revisões, empresas e só depois os eventos');

\echo 'TESTES DO MÓDULO PROJETOS PASSARAM'
