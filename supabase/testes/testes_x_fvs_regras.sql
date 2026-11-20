-- =====================================================================
-- Testes da migração das regras da FVS (20261119120000_fvs_regras.sql).
-- Roda depois de testes_nucleo.sql (usa as pessoas e obras de lá).
--   ...b1 gestor da obra 1   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

select teste.ok(
  (select count(*) from nucleo.tabelas_sincronizadas
   where tabela = 'public.fvs_regras' and inclusao = 'gestor' and alteracao = 'nenhuma') = 1,
  'fvs_regras: registrada no núcleo, gestor inclui, ninguém altera');

-- ---------------------------------------------------------------------
-- gestor (b1) cadastra as regras da obra 1
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

insert into public.fvs_regras (id, obra_id, regras, dispositivo_id, criado_em_dispositivo)
values ('f7000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        '{"prazos": [
            {"id": "escoramento", "ficha": "EXE-PVS-001", "item": 12, "dias": 21, "depois_de": {"tipo": "concretagem"},
             "texto": "Retirar escoras só depois de 21 dias"},
            {"id": "reescoramento", "ficha": "EXE-PVS-001", "item": 13, "dias": 0,
             "depois_de": {"tipo": "item", "ficha": "EXE-PVS-001", "item": 12}}],
          "ligacoes": [
            {"id": "forma-armacao", "de": {"ficha": "EXE-PVS-001", "item": 5}, "para": {"ficha": "EXE-PVS-002", "item": 2}},
            {"id": "forma-concreto", "de": {"ficha": "EXE-PVS-001", "item": 5}, "para": {"ficha": "EXE-PVS-003", "item": 1}},
            {"id": "laje-viga", "entre": "area", "de": {"ficha": "EXE-PVS-004", "item": 25}, "para": {"ficha": "EXE-PVS-003", "item": 15}}]}',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_regras) = 1,
  'fvs_regras: gestor cadastra prazos e ligações (mesma origem para dois destinos vale)');
-- ligação entre peças (20/11/2026): o campo a mais "entre" passa na conferência e fica guardado como veio
select teste.ok(
  (select regras -> 'ligacoes' -> 2 ->> 'entre' from public.fvs_regras where id = 'f7000000-0000-0000-0000-000000000001') = 'area',
  'fvs_regras: ligação entre peças ("entre": "area") é aceita e guardada');

insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
values ('11111111-1111-1111-1111-111111111111', '{}', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
values ('11111111-1111-1111-1111-111111111111', '{"prazos": [], "ligacoes": []}', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now());
select teste.ok((select count(*) from public.fvs_regras) = 3, 'fvs_regras: configuração vazia vale (listas podem faltar)');

-- formatos recusados (23514 = check_violation)
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '[]', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: regras têm que ser objeto');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '{"prazos": {}}', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: prazos têm que ser lista');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 1, "dias": 1, "depois_de": {"tipo": "concretagem"}},
                       {"id": "a", "ficha": "F", "item": 2, "dias": 1, "depois_de": {"tipo": "concretagem"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: id repetido na lista é recusado');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "", "ficha": "F", "item": 1, "dias": 1, "depois_de": {"tipo": "concretagem"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: id vazio é recusado');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 0, "dias": 1, "depois_de": {"tipo": "concretagem"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: item 0 é recusado');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 1.5, "dias": 1, "depois_de": {"tipo": "concretagem"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: item quebrado é recusado');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": "x", "dias": 1, "depois_de": {"tipo": "concretagem"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: item em texto é recusado com a mensagem do sistema (não erro de conversão)');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 1, "dias": "abc", "depois_de": {"tipo": "concretagem"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: dias em texto é recusado com a mensagem do sistema');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"ligacoes": [{"id": "l", "de": {"ficha": "F", "item": "5"}, "para": {"ficha": "G", "item": 5}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: item da ligação em texto é recusado com a mensagem do sistema');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "item": 1, "dias": 1, "depois_de": {"tipo": "concretagem"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: prazo sem ficha é recusado');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 1, "dias": 366, "depois_de": {"tipo": "concretagem"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: mais de 365 dias é recusado');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 1, "dias": -1, "depois_de": {"tipo": "concretagem"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: dias negativos são recusados');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 1, "dias": 1, "depois_de": {"tipo": "desforma"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: depois_de só aceita concretagem ou item');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 1, "dias": 1}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: prazo sem depois_de é recusado');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 1, "dias": 1, "depois_de": {"tipo": "item", "item": 3}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: depois de item sem ficha é recusado');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 1, "dias": 1, "depois_de": {"tipo": "item", "ficha": "F"}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: depois de item sem número é recusado');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"prazos": [{"id": "a", "ficha": "F", "item": 1, "dias": 1, "depois_de": {"tipo": "item", "ficha": "F", "item": 1}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: prazo contado do próprio item é recusado');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"ligacoes": [{"id": "l", "de": {"ficha": "F", "item": 5}, "para": {"ficha": "F", "item": 5}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: ligação do item com ele mesmo é recusada');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111',
          '{"ligacoes": [{"id": "l", "de": {"ficha": "F", "item": 5}}]}',
          'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '23514', 'fvs_regras: ligação sem destino é recusada');

-- só inclusão: nem o gestor altera (sem privilégio de update pela API)
select teste.deve_falhar($$update public.fvs_regras set regras = '{}'$$, '42501',
  'fvs_regras: linha não é alterada; regra nova = linha nova');
reset role;

-- ---------------------------------------------------------------------
-- campo (c1) e leitura (d1) leem, não incluem; sem acesso (e1) não vê
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.ok((select count(*) from public.fvs_regras) = 3, 'fvs_regras: campo lê as regras da obra');
select teste.deve_falhar($$
  insert into public.fvs_regras (obra_id, regras, dispositivo_id, criado_em_dispositivo)
  values ('11111111-1111-1111-1111-111111111111', '{}', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now())
$$, '42501', 'fvs_regras: campo não cadastra regras');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.fvs_regras) = 3, 'fvs_regras: leitura lê as regras da obra');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.fvs_regras) = 0, 'fvs_regras: quem não tem acesso não vê nada');
reset role;
