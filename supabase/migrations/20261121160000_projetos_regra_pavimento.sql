-- =====================================================================
-- Projetos: regra de quem recebe os projetos por PAVIMENTO
--
-- Pedido do Nicolas (21/11/2026, "pode" via Professor): "é para você receber
-- os projetos do segundo pavimento". A regra da lista de distribuição ganha
-- um pavimento opcional, com o mesmo nome que o painel usa (pavimentoDe:
-- "Pilotis", "3º pavimento", "Geral"...). Vazio = todos os pavimentos (como
-- as regras de hoje).
--
-- Só acrescenta a coluna (com padrão ''); nada é apagado nem alterado.
-- Onde aplicar: editor SQL do Supabase. Roda numa transação.
-- =====================================================================

begin;

alter table public.distribuicao_destinatarios
  add column pavimento text not null default '' check (length(pavimento) <= 60);

comment on column public.distribuicao_destinatarios.pavimento is
  'Pavimento da regra (o mesmo nome do painel); vazio = todos os pavimentos.';

commit;
