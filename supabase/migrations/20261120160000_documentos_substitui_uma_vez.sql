-- =====================================================================
-- Documentos: uma linha só pode ser substituída uma vez (achado do revisor de segurança, 20/11/2026).
--
-- Corrigir ou marcar "em revisão" é incluir uma linha nova com substitui_id = a anterior, e vale a
-- linha que nenhuma outra substitui. Duas linhas substituindo a mesma deixariam duas "últimas".
-- Mesmo índice da lista de distribuição (20261120130000_projetos_destinatarios.sql).
-- No app a tela sempre substitui a linha que vale, então só dois aparelhos sem internet mexendo no
-- mesmo documento chegam aqui: o segundo envio é recusado (23505) e fica com erro na fila dele.
-- =====================================================================

begin;

create unique index doc_documentos_substitui on public.doc_documentos (substitui_id)
  where substitui_id is not null and not apagado;

commit;
