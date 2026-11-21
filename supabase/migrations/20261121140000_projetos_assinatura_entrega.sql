-- =====================================================================
-- Projetos: assinatura de quem retira a cópia (entrega com assinatura)
--
-- Pedido do Nicolas (21/11/2026): "cadastro de projeto entregue com
-- assinatura do responsável por retirar"; "dedo ou caneta, registro de data
-- hora projeto e assinatura única"; assinatura opcional com aviso.
--
-- Como funciona:
--   - A assinatura é desenhada na tela do aparelho e vira um PNG guardado em
--     public.arquivos (como as fotos), no caminho {obra_id}/projetos/...
--   - UMA assinatura por entrega: se a pessoa leva várias pranchas de uma vez,
--     todas as linhas daquela entrega apontam para o mesmo assinatura_id.
--   - Data e hora: criado_em_dispositivo do evento e do arquivo.
--   - Linhas antigas ficam com assinatura_id vazio (opcional).
--
-- Só acrescenta uma coluna e a chave estrangeira; nada é apagado nem alterado.
-- Aprovado pelo Nicolas em 21/11/2026 (via Professor).
-- Onde aplicar: editor SQL do Supabase. Roda numa transação.
-- =====================================================================

begin;

alter table public.distribuicao_eventos add column assinatura_id uuid;

alter table public.distribuicao_eventos
  add constraint distribuicao_eventos_assinatura_fk
  foreign key (assinatura_id, obra_id) references public.arquivos (id, obra_id);

comment on column public.distribuicao_eventos.assinatura_id is
  'Assinatura (PNG em arquivos) de quem retirou a cópia. Uma por entrega: várias pranchas levadas juntas usam o mesmo id.';

commit;
