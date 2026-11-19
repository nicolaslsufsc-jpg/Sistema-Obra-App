-- =====================================================================
-- Testes da migração "relógio do aparelho adiantado" (C3). Roda depois de testes_nucleo.sql
-- (mesmo banco: usa as pessoas, obras e a tabela teste_eventos criadas lá).
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

-- aparelho 1 h adiantado: grava a hora do servidor
insert into public.teste_eventos (id, obra_id, elemento, resultado, dispositivo_id, criado_em_dispositivo)
values ('c3000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'R1', 'NC',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now() + interval '1 hour');
select teste.ok(
  (select criado_em_dispositivo = criado_em_servidor from public.teste_eventos where id = 'c3000000-0000-0000-0000-000000000001'),
  'relógio: hora do aparelho no futuro vira a hora do servidor');

-- marcação feita sem internet há 3 h e enviada agora: a hora do aparelho fica
insert into public.teste_eventos (id, obra_id, elemento, resultado, dispositivo_id, criado_em_dispositivo)
values ('c3000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'R2', 'C',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', now() - interval '3 hours');
select teste.ok(
  (select criado_em_servidor - criado_em_dispositivo = interval '3 hours' from public.teste_eventos
   where id = 'c3000000-0000-0000-0000-000000000002'),
  'relógio: hora do aparelho no passado (sem internet) é preservada');
reset role;

-- obras usa o mesmo gatilho e não tem criado_em_dispositivo: continua inserindo
insert into public.obras (codigo, nome) values ('RELOGIO', 'Obra do teste do relógio');
select teste.ok((select count(*) from public.obras where codigo = 'RELOGIO') = 1, 'relógio: gatilho continua servindo para obras');
