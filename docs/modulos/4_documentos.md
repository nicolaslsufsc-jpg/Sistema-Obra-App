# Módulo 4: Documentos (PBQP-H / SiAC)

Histórico e detalhe: docs/historico/4_documentos.md (status antigos, o que foi feito por data, lista completa do SiAC, campos, tabela e propostas já decididas).

## Objetivo
Guardar e controlar os documentos e registros que o PBQP-H (SiAC, Execução de Obras) pede, do jeito que o auditor confere: código, revisão, data, quem é o responsável, se está vigente e onde está o arquivo. Mostrar a **lista mestra** sozinha, avisar o que venceu e ligar o que já existe na FVS e no Concreto (eles já são registros da qualidade).

Não é um GED completo e não substitui o controle de revisão de pranchas: isso é do módulo Projetos (parado).

## Status (21/11/2026): baixar para usar offline, opcional
Branch `app/documentos-com-conta` (saiu da `main` 192df40). Pedido do Nicolas, repassado pelo Professor: "quero q seja opcional baixar projetos e ifcs docs e tals". Documentos e Projetos já aparecem no menu com conta desde a 192df40.
- **Com conta, nada baixa sozinho.** Na tela do documento há o botão **"Baixar para usar offline (X KB)"**. Em cada pasta (categoria) da lista há o **"Baixar a pasta para usar offline · N arquivos, X KB"**. Quem já baixou vê **"Apagar do aparelho"** (ou "Apagar a pasta do aparelho"), que pede confirmação e avisa que o arquivo continua no servidor. Na lista, o documento baixado ganha o selo "No aparelho" e o rodapé mostra quanto está baixado. Sem internet, o botão avisa "Sem internet agora. Baixe quando tiver sinal."
- **Onde fica:** no Cache Storage do navegador, num cache só do módulo (`sistema-obra-documentos-offline`, arquivo `app/src/documentos/offline.ts`). **O núcleo não foi mexido:** não é o banco local nem o cache do service worker. Cada arquivo baixado é conferido por tamanho e SHA-256 com a linha de `arquivos`, como no IFC (#53); se não conferir, não guarda e a tela manda avisar o gestor. A pasta é baixada um arquivo de cada vez, pula o que já está no aparelho, e um erro não para os outros.
- **Sem conta:** nada muda. Os arquivos já estão no aparelho, e os botões não aparecem.
- **Testes:**
  - `offline.test.ts`: nada baixa sozinho; pasta com SHA-256, pular e erro isolado; o baixado abre sem internet; apagar;
  - bancada `app/dev/documentos.html` (com conta, obra EXE, servidor falso): baixar e apagar por documento e por pasta, em 375 e 768.
- **Escopo por empresa:** a RLS do `doc_documentos` é por obra. Quem tem acesso à obra vê os documentos dela, tanto os "obra" quanto os "empresa", que são cópias por obra. Ver os da própria empresa em todas as obras precisa de vínculo pessoa→empresa no núcleo. A proposta foi para o Professor, sem código.
- **Projetos:** avisado em 21/11. Ainda não se aplica: hoje o Projetos não guarda PDF de prancha, só os dados da folha a partir de duas listas CSV. Quando tiver conta e PDF do servidor, segue o mesmo padrão: cache próprio `sistema-obra-projetos-offline`, conferência por SHA-256, botões por folha e por pasta.

## Como testar
- App: `cd app && npm install && npm run build`; testes de unidade do módulo em `app/src/documentos/` (`documentos.test.ts`, `pacote.test.ts`, `offline.test.ts`).
- Bancada com conta: `app/dev/documentos.html` (obra EXE, servidor falso), em 375 e 768 px.
- Telas: `local.e2e.test.ts` ("Documentos", sem conta, 375 e 1280 px) e `telas.e2e.test.ts` (com conta).
- Integração contra PostgREST: `app/testes/documentos.test.ts` (roda no CI).
- Banco: `supabase/testes/testes_x_documentos.sql`.
- Pacote da obra: `pipeline/testes/test_fvs_entrega.py` (`TestDocumentosDaEmpresa`) e `pipeline/testes/test_fvs_compactar.py`.

## Decisões que valem (resumo)
- **Fora do beta** desde 20/11/2026 (Nicolas). Quem põe no menu é a 06 · FRONT (`app/src/modulos.ts`).
- **Sem conta:** lista mestra, revisão, validade, impressão, registros dos módulos e exemplos fictícios da obra EXE. Os bytes ficam no banco local do núcleo (`conteudos`) e vão no `.obra`.
- **Com conta:** tabela `doc_documentos` sincronizada, só inclusão; gestor e admin incluem, quem lê a obra lê. Migrações `20261120150000_documentos.sql` e `20261120160000_documentos_substitui_uma_vez.sql`. O módulo grava pelo `sincronizador.registrar`. Com conta, os exemplos não entram e os documentos do pacote continuam só no modo sem conta. PDF baixado do servidor só abre se tamanho e SHA-256 baterem.
- **Revisão sem perder nada:** revisão nova = linha nova com o mesmo código (a anterior fica obsoleta sozinha); "em revisão", cancelar ou corrigir = linha nova com `substitui_id`. Vale a linha que ninguém substituiu.
- **Validade:** selo "Vencido" e "Vence em X dias" (30 dias antes); aviso só quando o app abre.
- **Categorias:** 14 na tela (`documentos/categorias.ts`, mudar é uma linha). A lista do SiAC (25 itens, E = empresa, O = obra) está no histórico; o que está marcado "conferir na norma" não vira regra do app.
- **Empresa ou obra:** opção 1, tudo dentro da obra, documentos da empresa com `escopo = 'empresa'`, chegando pelo pacote da obra (uma cópia por obra).
- **Arquivo:** PDF ou foto, até 10 MB por arquivo, aviso aos 150 MB no aparelho. Nome de arquivo limpo (`nomeLimpo`) e `guardarArquivo` confere tipo e tamanho.
- **Registros dos módulos (só leitura):** a aba Obra mostra fichas da FVS, concretagens do Concreto e relatórios de Qualidade abertos (`ligacoes.ts`, `telas/Registros.tsx`). Nada é gravado nesses módulos.
- **Pacote da obra:** `exportar_bancada.py --documentos PASTA` e `compactar_pacote.py` levam `documentos/` (indice.json + arquivos); o app lê em `documentos/pacote.ts`.
- Arquivos principais: `app/src/documentos/` (`regras.ts`, `dados.ts`, `tabelas.ts`, `pacote.ts`, `offline.ts`, `ligacoes.ts`, `exemplos.ts`, `telas/`).

## Próximo passo
1. Nicolas ver no Chrome e no tablet e dizer o que muda.
2. Testar o "Baixar para usar offline" num tablet de verdade.
3. Esperar a resposta do Professor sobre o escopo por empresa (vínculo pessoa→empresa no núcleo).

## Pendências abertas
1. O Nicolas ver o módulo (o ok da primeira versão foi do Professor).
2. Migrações `doc_documentos`: em 20/11 faltava o Professor aplicar no servidor. Conferir se já foram.
3. Conferir no texto oficial do SiAC os itens marcados "conferir na norma".
4. Limite de tamanho e espaço num tablet de verdade; no Android, o PDF abre pelo leitor do aparelho (não testado).
5. Ligar `semearDocumentosDoPacote` no `prepararObraLocal` (núcleo) e o link "abrir no módulo" (casca, e pedido aos chats da FVS e do Concreto), esperando o ok. O código do núcleo pedido está no histórico.
6. O formulário de documento não guarda rascunho: recarregar no meio perde o que foi digitado.
7. Escopo por empresa: ver os documentos da própria empresa em todas as obras precisa de vínculo pessoa→empresa no núcleo (proposta com o Professor).
8. `docs/02_CONTRATO_NUCLEO.md` ainda diz que Documentos e Relatórios estão fora do menu (doc do núcleo: não mexi).
