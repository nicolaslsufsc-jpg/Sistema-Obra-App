-- Núcleo: relógio do aparelho adiantado (C3 do plano de sincronização, 18/11/2026).
-- MEXE NO NÚCLEO: só aplicar no Supabase com o "pode" do Nicolas.
--
-- Quem vale quando dois aparelhos marcam o mesmo item é o registro com a hora do aparelho mais nova
-- (criado_em_dispositivo). Um aparelho com o relógio adiantado (ex.: 1 h) ganhava de marcações feitas
-- depois dele, em aparelhos com a hora certa.
--
-- Regra nova: a hora do aparelho nunca pode ser depois da hora em que o servidor recebeu. Se vier no
-- futuro, o servidor grava a hora dele. Assim:
-- - relógio adiantado: o registro fica com a hora real de chegada, e não ganha de quem marcou depois;
-- - marcação feita sem internet e enviada horas depois: continua com a hora do aparelho (que é do
--   passado), então a ordem real das marcações se mantém. Usar sempre a hora do servidor quebraria
--   este caso: quem ficou sem internet "ganharia" de quem marcou depois dele com internet.
-- Relógio atrasado não dá para descobrir por um registro só; fica no roteiro de teste.
--
-- Vale para todas as tabelas sincronizadas (o mesmo gatilho sinc_inserir de nucleo.preparar_tabela),
-- sem mudar nada no app. A tabela obras usa o mesmo gatilho e não tem criado_em_dispositivo.

create or replace function nucleo.sinc_antes_inserir()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.criado_em_servidor := now();
  new.atualizado_em := now();
  if to_jsonb(new) ? 'criado_em_dispositivo' then
    if new.criado_em_dispositivo > now() then
      new.criado_em_dispositivo := now();
    end if;
  end if;
  return new;
end;
$$;
