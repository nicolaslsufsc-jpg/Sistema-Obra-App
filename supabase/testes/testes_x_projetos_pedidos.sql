-- =====================================================================
-- Testes do pedido de atualização do Autodoc (20261121150000_projetos_pedidos_atualizacao.sql).
-- Roda depois de testes_nucleo.sql (usa as pessoas e obras de lá).
--   ...b1 gestor da obra 1   ...c1 campo na obra 1   ...d1 leitura na obra 1   ...e1 sem acesso
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- campo e leitura não pedem
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.deve_falhar($$insert into public.projetos_pedidos_atualizacao (obra_id) values ('11111111-1111-1111-1111-111111111111')$$,
  '42501', 'pedidos: campo não pede atualização');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.deve_falhar($$insert into public.projetos_pedidos_atualizacao (obra_id) values ('11111111-1111-1111-1111-111111111111')$$,
  '42501', 'pedidos: leitura não pede atualização');

-- gestor pede: o banco preenche quem, quando e o estado
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.projetos_pedidos_atualizacao (id, obra_id) values ('7e000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
select teste.ok((select estado = 'pendente' and pedido_por = '00000000-0000-0000-0000-0000000000b1' and iniciado_em is null
                 from public.projetos_pedidos_atualizacao where id = '7e000000-0000-0000-0000-000000000001'),
  'pedidos: gestor pede; fica pendente, com quem pediu');
select teste.deve_falhar($$insert into public.projetos_pedidos_atualizacao (obra_id) values ('11111111-1111-1111-1111-111111111111')$$,
  '23505', 'pedidos: um pedido aberto por obra');
select teste.deve_falhar($$insert into public.projetos_pedidos_atualizacao (obra_id, estado) values ('11111111-1111-1111-1111-111111111111', 'pronto')$$,
  '42501', 'pedidos: o app não escolhe o estado');
select teste.deve_falhar($$update public.projetos_pedidos_atualizacao set estado = 'pronto'$$,
  '42501', 'pedidos: ninguém altera por update direto');

-- só o gestor (o PC entra com o login do gestor) pega o pedido
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select teste.deve_falhar($$select * from public.projetos_pegar_pedido('11111111-1111-1111-1111-111111111111')$$,
  '42501', 'pedidos: campo não pega pedido');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select teste.ok((select estado = 'buscando' and iniciado_em is not null from public.projetos_pegar_pedido('11111111-1111-1111-1111-111111111111')),
  'pedidos: o PC pega o pendente, que vira buscando');
select teste.ok((select count(*) from public.projetos_pegar_pedido('11111111-1111-1111-1111-111111111111')) = 0,
  'pedidos: sem outro pendente, o PC não pega nada');

-- conclui com o resumo (novas, baixadas e as que falharam, com o código)
select teste.ok((select estado = 'pronto' and concluido_em is not null and (resumo -> 'falharam' -> 0 ->> 'codigo') = 'EXE.ES.EX.200.PILSUBSOLO'
                 from public.projetos_concluir_pedido('7e000000-0000-0000-0000-000000000001', true,
                   '{"revisoes_novas": 3, "baixadas": 2, "falharam": [{"codigo": "EXE.ES.EX.200.PILSUBSOLO", "motivo": "tamanho não confere"}]}', null)),
  'pedidos: o PC conclui com o resumo, inclusive as que falharam');
select teste.deve_falhar($$select public.projetos_concluir_pedido('7e000000-0000-0000-0000-000000000001', true, '{}', null)$$,
  '22023', 'pedidos: pedido pronto não é concluído de novo');

-- erro com o motivo
insert into public.projetos_pedidos_atualizacao (id, obra_id) values ('7e000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111');
select count(*) from public.projetos_pegar_pedido('11111111-1111-1111-1111-111111111111');
select teste.ok((select estado = 'erro' and erro = 'login do Autodoc vencido: entre no PC'
                 from public.projetos_concluir_pedido('7e000000-0000-0000-0000-000000000002', false, null, 'login do Autodoc vencido: entre no PC')),
  'pedidos: erro guarda o motivo');

-- pedido preso em 'buscando' há mais de 30 min: o próximo pedido o destrava como 'interrompido'
insert into public.projetos_pedidos_atualizacao (id, obra_id) values ('7e000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111');
select count(*) from public.projetos_pegar_pedido('11111111-1111-1111-1111-111111111111');
reset role;
update public.projetos_pedidos_atualizacao set iniciado_em = now() - interval '31 minutes' where id = '7e000000-0000-0000-0000-000000000003';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.projetos_pedidos_atualizacao (id, obra_id) values ('7e000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111');
select teste.ok((select estado = 'erro' and erro like 'interrompido%' from public.projetos_pedidos_atualizacao where id = '7e000000-0000-0000-0000-000000000003'),
  'pedidos: buscando há mais de 30 min vira erro "interrompido"');
select teste.ok((select estado = 'pendente' from public.projetos_pedidos_atualizacao where id = '7e000000-0000-0000-0000-000000000004'),
  'pedidos: e o gestor consegue pedir de novo');

-- quem lê: membros da obra sim; sem acesso, nada
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select teste.ok((select count(*) from public.projetos_pedidos_atualizacao) = 4, 'pedidos: leitura vê os pedidos da obra');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select teste.ok((select count(*) from public.projetos_pedidos_atualizacao) = 0, 'pedidos: sem acesso não vê nada');
reset role;
