# pipeline/

Scripts Python da estação no PC: leem as pranchas (PDF exportado do AutoCAD/Eberick), registram revisão, geram planta clicável e detalhes e publicam no Supabase.

- `legado/`: gerador atual de HTML offline da FVS, em uso na obra. Ponto de partida do módulo FVS (ver `legado/LEIAME.md`).

Os PDFs nunca entram no repositório (`.gitignore` bloqueia `*.pdf`, `*.dwg`, `*.dxf` e `dados/`).

Ao gravar no Supabase com a chave secreta (que fica no `.env` do PC), informe `usuario_id` e `dispositivo_id` em cada registro: a chave secreta não tem usuário logado. Ver "Regras de sincronização" em `docs/02_CONTRATO_NUCLEO.md`.

## Exportar uma obra inteira (`exportar_obra.py`)

Tira do Supabase tudo de uma obra: planilhas (CSV para o Excel), dados em JSON, todos os arquivos conferidos pelo SHA-256 e um `restaurar.sql`. Usa o mesmo login do app (código numérico por e-mail), sem chave secreta. Para sair completa, entre como admin ou gestor da obra.

Antes, uma vez: a migração `supabase/migrations/20261103200000_nucleo_exportacao.sql` aplicada no Supabase (`supabase/README.md`, passo 6). Sem ela o script avisa e não cria nada.

No Windows (uma vez): instale o Python pelo botão principal de python.org/downloads ("Python install manager") ou pela Microsoft Store. O script só usa a biblioteca padrão, não precisa de `pip install`. Se o comando `py` abrir a Store em vez de rodar, ative "Python" em Configurações > Aplicativos > Aliases de execução de aplicativo.

1. Baixe o arquivo `pipeline/exportar_obra.py` do GitHub (botão "Download raw file") e guarde em `04_Programas/Sistema Obra/`.
2. Abra o PowerShell nessa pasta (no Explorador: Shift + botão direito > "Abrir janela do PowerShell aqui").
3. Rode, trocando a pasta de destino pela pasta da obra no seu Drive (sem `\` no fim):
   ```
   py exportar_obra.py EXE --saida "G:\Meu Drive\Obras\EXE" --zip
   ```
4. Digite seu e-mail e o código que chegar (3 tentativas; o código aparece na tela ao digitar). No fim aparece o resumo; `PROBLEMA:` indica arquivo que não bateu com o registrado.

Resultado: pasta `AAAA-MM-DD_export-EXE_vNN` (e o `.zip`, com `--zip`). O `LEIAME.txt` dentro dela explica cada parte e como restaurar. Enquanto roda, a pasta se chama `..._vNN.incompleta`; se a internet cair de vez, ela fica com esse nome e pode ser apagada. O login é renovado sozinho em exportações longas. O script recusa salvar dentro de um repositório git: dado de obra não entra no repositório.

Testes: `app/testes/exportacao.test.ts` roda o script contra o PostgREST de verdade (inclusive com login vencendo e queda de conexão) e restaura o `restaurar.sql` num banco novo (`bash supabase/testes/rodar_integracao.sh`).

## Revisões do Autodoc (`projetos/`)

Módulo Projetos (`docs/modulos/2_projetos.md`). Traz a lista vigente do Autodoc para o banco e diz o que fazer: imprimir, entregar, recolher, atualizar a pasta do escritório, conferir.

Antes, uma vez: a migração `supabase/migrations/20261103234000_projetos.sql` aplicada no Supabase.

### Passo 1: exportar a lista do Autodoc (à mão)

O Sistema Obra não entra no Autodoc: quem exporta é a pessoa, com o login dela. No Autodoc, Projetos > **Relatórios**: limpe o filtro de data, escolha o projeto, Pesquisar, **Exportar > Exportar CSV**. Salve o arquivo como `05_revisoes_vigentes_autodoc_AAAA-MM-DD.csv` numa pasta fora do repositório e rode o passo 2.

### Passo 2: importar e relatar (`importar_lista.py`)

```
py pipeline/projetos/importar_lista.py EXE --pasta "C:\...\Exportacoes_Sistema_Obra\autodoc"
py pipeline/projetos/importar_lista.py EXE --csv "C:\...\05_revisoes_vigentes_autodoc_2026-11-03.csv"
```

Com `--pasta`, usa o CSV mais novo com esse nome; se não for de hoje, para (ou `--aceitar-antiga`). Na primeira vez pede o e-mail e o código do app. Com `--sem-perguntar` o script nunca pergunta nada, para rodar agendado.

O que ele faz: lê o CSV (recusa se o Autodoc mudar as colunas), grava documentos e revisões novas e as que viraram obsoletas, registra a lista em `listas_autodoc` (a mesma lista duas vezes não grava nada de novo) e imprime o relatório do dia, também salvo em `relatorio_AAAA-MM-DD.txt` ao lado do CSV. Sem lista de hoje, para com código de saída 2 e avisa: nunca conclui "sem revisão nova" sem a lista. `--sem-gravar` só mostra o que mudaria.

**Ficha de cópias sem abrir o app:** `py pipeline/projetos/exportar_ficha.py EXE --saida "C:\...\Exportacoes_Sistema_Obra\projetos"` gera `ficha-copias-EXE_AAAA-MM-DD.csv` (uma linha por entrega, com devolução e situação; mesmo formato do botão "Exportar ficha" do app). Usa a sessão guardada pelo `importar_lista.py`.

Testes: `python -m unittest discover -s pipeline/testes` (CSV de exemplo inventado em `testes/exemplos/`; rodam sozinhos no GitHub a cada PR).
