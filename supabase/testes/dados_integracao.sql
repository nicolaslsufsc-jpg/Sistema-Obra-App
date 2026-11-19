-- =====================================================================
-- Dados para os testes de integração do app (supabase/testes/rodar_integracao.sh).
-- Mesmos ids de app/testes/dados.ts. Nunca aplicar no Supabase de verdade.
-- =====================================================================
\set ON_ERROR_STOP 1

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@teste.local',   '{"nome": "Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'gestor@teste.local',  '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'campo@teste.local',   '{}'),
  ('00000000-0000-0000-0000-0000000000d1', 'leitura@teste.local', '{}'),
  ('00000000-0000-0000-0000-0000000000e1', 'fora@teste.local',    '{}');
update public.perfis set papel = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
-- Todos já entraram no app pelo menos uma vez.
update auth.users set last_sign_in_at = now();

insert into public.obras (id, codigo, nome, criado_por) values
  ('11111111-1111-1111-1111-111111111111', 'OBRA1', 'Obra 1', '00000000-0000-0000-0000-0000000000a1'),
  ('22222222-2222-2222-2222-222222222222', 'OBRA2', 'Obra 2', '00000000-0000-0000-0000-0000000000a1');

insert into public.acessos (usuario_id, obra_id, papel) values
  ('00000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'gestor'),
  ('00000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'leitura'),
  ('00000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'campo'),
  ('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', 'leitura');

insert into public.pavimentos (obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo)
select '11111111-1111-1111-1111-111111111111', p.nome, p.ordem,
       '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now()
from (values ('Térreo', 1), ('2º Pavimento', 2), ('Cobertura', 3)) as p (nome, ordem);

insert into public.pavimentos (obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo)
values ('22222222-2222-2222-2222-222222222222', 'Térreo', 1,
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', now());

-- Tabela de evento de exemplo, como um módulo faria (só inclusão, campo registra).
\ir tabela_teste_eventos.sql
