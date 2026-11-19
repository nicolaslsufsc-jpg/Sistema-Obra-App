-- =====================================================================
-- Sistema Obra: núcleo, caminho de arquivo seguro (v1)
--
-- Onde aplicar: editor SQL do Supabase, depois das migrações anteriores. Uma vez.
--
-- O caminho de um arquivo vira pasta e nome de arquivo no PC de quem exporta a obra.
-- Quem registra em campo pode gravar linhas em "arquivos" e enviar ao armazenamento,
-- então o formato é conferido pelo banco: id da obra e trechos só com letras sem acento,
-- números, ponto, hífen e sublinhado, cada trecho começando com letra ou número.
-- Sem ".", "..", barra invertida, dois-pontos nem espaço. O nome original fica em
-- arquivos.nome_original.
-- =====================================================================

begin;

create function nucleo.caminho_seguro(p_caminho text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_caminho ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/[A-Za-z0-9][A-Za-z0-9._-]{0,254})+$'
     and length(p_caminho) <= 1024;
$$;

alter table public.arquivos
  add constraint arquivos_caminho_seguro check (nucleo.caminho_seguro(caminho));

drop policy sistema_obra_enviar on storage.objects;
create policy sistema_obra_enviar on storage.objects for insert to authenticated
  with check (
    bucket_id = 'obras'
    and nucleo.caminho_seguro(name)
    and nucleo.pode_registrar(nucleo.obra_do_caminho(name))
  );

commit;
