begin;

-- FVS: o resultado de um item passa a ser C (conforme), NC (não conforme) ou NA (não aplicável),
-- no lugar de A (aprovado), R (reprovado) e NA. Decisão do Nicolas em 08/11/2026 ("Trocar tudo").
--
-- Nada é apagado:
-- 1) as linhas que já estão no servidor são convertidas (A → C, R → NC);
-- 2) um gatilho converte A e R que ainda cheguem depois desta migração: fila pendente de um aparelho
--    com o app antigo, .obra antigo restaurado, historico.json antigo publicado pelo publicar_historico.py.
--    Sem ele, esses registros seriam recusados pela regra nova.
-- O app novo também lê A e R como C e NC (normalizarResultado em app/src/fvs/situacao.ts).

-- fvs_eventos é só de inclusão (o gatilho sinc_alterar recusa UPDATE). A conversão abaixo é a única
-- exceção, feita aqui pelo dono do banco e com a regra antiga já retirada.
alter table public.fvs_eventos drop constraint fvs_eventos_resultado_check;

alter table public.fvs_eventos disable trigger sinc_alterar;
update public.fvs_eventos
   set resultado = case resultado when 'A' then 'C' when 'R' then 'NC' end
 where resultado in ('A', 'R');
alter table public.fvs_eventos enable trigger sinc_alterar;

alter table public.fvs_eventos
  add constraint fvs_eventos_resultado_check check (resultado in ('C', 'NC', 'NA'));

create function public.fvs_converter_resultado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.resultado = 'A' then
    new.resultado := 'C';
  elsif new.resultado = 'R' then
    new.resultado := 'NC';
  end if;
  return new;
end;
$$;
create trigger fvs_converter_resultado
  before insert on public.fvs_eventos
  for each row execute function public.fvs_converter_resultado();

commit;
