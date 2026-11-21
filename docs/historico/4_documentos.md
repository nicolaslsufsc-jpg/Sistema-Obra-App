# Documentos: histórico e detalhe (movido de docs/modulos/4_documentos.md em 21/11/2026)

Referência: o que vale hoje está em docs/modulos/4_documentos.md. Aqui ficam os status antigos, o que foi feito por data e o texto completo das seções resumidas lá.

Branch: `claude/app-documentos-112f59` (parte do PR #42).

## Status (20/11/2026)
**Fora do beta (Nicolas, 20/11: "Documentos, tá funcionando também. Tira do beta").** O módulo não tem selo nem aviso de beta nas próprias telas. Quem põe os módulos de volta no menu é a 06 · FRONT (`app/src/modulos.ts`, não mexido aqui).
- **Sem conta:** funciona (lista mestra, revisão, validade, impressão, registros dos módulos, exemplos), conferido na main 806adec em 375 px e tablet.
- **Com login (desde 20/11/2026, item 3 do núcleo, aprovado pelo Nicolas):** abre e sincroniza. Branch `nucleo/documentos-login`; **a migração ainda não foi aplicada no servidor** (o Professor aplica antes do merge).
  - Migração `20261120150000_documentos.sql`: tabela `doc_documentos` como na proposta da seção 3 (só inclusão, gestor e admin incluem, quem lê a obra lê). Os limites de texto são os da tela, e o formulário passou a conferir os mesmos (título 300, revisão 20, responsável 200). Teste do banco em `supabase/testes/testes_x_documentos.sql`.
  - App: a tabela está na lista sincronizada (`documentos/tabelas.ts` e `nucleo/tabelas.ts`, bloco à parte no fim). O módulo grava pelo `sincronizador.registrar` (o `gravar.ts` saiu) e sincroniza enquanto está aberto. O `soSemConta` saiu do `modulos.ts`.
  - Arquivo: o PDF ou a foto vão antes da linha na fila, então chegam antes ao servidor. Depois do envio o núcleo tira os bytes do aparelho. Por isso, na tela do documento, o arquivo que está só no servidor mostra **"Baixar do servidor"** (precisa de internet), para não gastar dados com todas as revisões.
  - Dois achados baixos do revisor de segurança, corrigidos em 20/11/2026 (branch `nucleo/documentos-revisor`, PR à parte depois do merge dos itens 2 e 3):
    - o PDF baixado do servidor só abre se o tamanho e o SHA-256 baterem com a linha de `arquivos`. Se não baterem, a tela diz que o arquivo não é o registrado e não abre;
    - migração `20261120160000_documentos_substitui_uma_vez.sql`: a mesma linha só pode ser substituída uma vez (índice único em `substitui_id`, como na lista de distribuição). Só dois aparelhos sem internet mexendo no mesmo documento chegam a isso: o segundo envio é recusado e fica com erro na fila dele.
  - *Suposições marcadas:*
    - com conta, os exemplos da demonstração não entram. Um exemplo corrigido ou marcado "em revisão" apontaria para uma linha que o servidor não tem;
    - os documentos do pacote da obra continuam só no modo sem conta;
    - "levar para campo" (guardar o PDF no aparelho para abrir sem internet) continua pendente. É mudança do núcleo e precisa do ok do Nicolas. *(Feito em 21/11 sem mexer no núcleo: ver o status de 21/11.)*
  - Testes:
    - banco: 16 checagens;
    - unidade: tabela na lista, gravação pela fila, baixar só quando a tela pede, limites do formulário;
    - integração contra PostgREST (`app/testes/documentos.test.ts`, roda no CI): gestor envia PDF e revisão, leitura baixa e abre o PDF, campo e leitura não cadastram;
    - tela com conta (`telas.e2e.test.ts`): o Documentos aparece no menu, abre sem exemplos e o gestor vê "Cadastrar";
    - tela sem conta: 375 e 1280;
    - "Baixar do servidor": 375 e 768;
    - obra real (dado fora do repositório): os 48 PES da empresa, com o arquivo e a revisão de cada um, entram no Postgres de teste com a migração (teste temporário, fora do git).
- **Pacote da obra:** o `exportar_bancada.py` e, desde 20/11 ("pode" do Nicolas), o `compactar_pacote.py` levam `documentos/` (indice.json + arquivos) e o app lê (`pacote.ts`). No compactar: `--documentos PASTA` (documentos.json, mesma conferência do exportar) ou, sem a opção, o `documentos/indice.json` que já estiver na pasta da obra, com cada arquivo conferido (tipo, 10 MB, SHA-256). Testes em `pipeline/testes/test_fvs_compactar.py`.

## Status (09/11/2026)
**Primeira versão das telas feita e no menu, só no modo sem conta.** A proposta abaixo foi aprovada pelo Professor (o Nicolas o deixou responsável por 1 h), com estas escolhas: empresa/obra pela opção 1; **sem migração** (a tabela fica só no banco do navegador); "levar para campo" fica para depois; 10 MB por arquivo e aviso aos 150 MB; as marcações "conferir na norma" ficam só neste documento, não na tela. **O Nicolas ainda não viu.**

### O que foi feito (`app/src/documentos/`)
- `categorias.ts`: as 14 categorias da tela (a tabela da seção 1 agrupada). Mudar é uma linha.
- `regras.ts`: lista mestra (revisão nova = mesmo código; a anterior fica obsoleta), correção por `substitui_id`, validade (vencido, vence em até 30 dias), filtros, conferência do formulário, limite do arquivo. Testes em `documentos.test.ts`.
- `gravar.ts` + `dados.ts`: como `doc_documentos` não está na lista de tabelas sincronizadas do núcleo (não há migração), o módulo grava a linha do mesmo jeito que o núcleo (registro local + fila de pendentes). Assim o "Salvar arquivo" (.obra) leva e o "Restaurar" traz de volta (testado). O PDF ou a foto vão pelo `registrarArquivo` do núcleo (foto reduzida, como no Diário). Com conta (servidor), a tela só avisa que o módulo funciona no modo sem conta, para nada ir à fila e ser recusado.
- `exemplos.ts`: 17 revisões fictícias da Construtora Exemplo / obra EXE (Manual, política, PS-01 com duas revisões, PS-03 em revisão, PES, FVS, fornecedores vencendo em 20 dias, PQO, plano de controle tecnológico, calibração vencida, ART, alvará), cada uma com um PDF de uma página escrito pelo app ("DOCUMENTO DE EXEMPLO"). Entram ao abrir o módulo, uma vez por obra, fora da fila. Para refazer: apagar `exemplos_documentos:<obra>` da tabela `meta`.
- Telas: lista mestra (abas Empresa e Obra, busca, filtro por categoria, Todos/Vencidos/Em revisão, selos, aviso de vencidos no topo, espaço usado e aviso dos 150 MB), documento (dados, abrir arquivo, foto em miniatura, revisões anteriores com o próprio arquivo, revisão nova, marcar "em revisão"/vigente), cadastrar, revisão nova, imprimir lista mestra (A4).
- Cadastrar e revisar: gestor e admin (no modo sem conta o usuário é admin).
- Teste de tela: `local.e2e.test.ts`, "Documentos", em 375 px e 1280 px: exemplos, filtros, abrir arquivo, revisão nova com PDF, cadastro, imprimir, salvar e restaurar noutro navegador.

### Segunda rodada (09/11/2026, pedida pelo Professor)
- **Registros dos módulos, só leitura** (`ligacoes.ts`, `telas/Registros.tsx`): a aba Obra mostra, abaixo da lista mestra, as fichas da FVS (código, revisão vigente, peças verificadas, marcações e fichas abertas no histórico), as concretagens do Concreto (data, local, fck, caminhões, CPs moldados e rompidos) e os relatórios de Qualidade ainda abertos (NC). Também saem na lista impressa. Nada é gravado nesses módulos e nenhum arquivo deles mudou. Só as funções puras (`vigentes`, `montarDados`, `situacaoDoRelatorio`) são reaproveitadas.
  - **O link direto para abrir o registro no módulo não foi feito.** Precisa de um jeito de um módulo abrir outro (casca, núcleo) e de uma entrada na FVS e no Concreto para abrir já na ficha ou concretagem (arquivos de outros chats). Por enquanto, cada grupo diz "Para abrir: menu da obra › FVS".
- **Documentos da empresa no pacote da obra:**
  - Pipeline: `exportar_bancada.py --documentos PASTA` (opcional). A pasta tem um `documentos.json` e os arquivos (formato no topo do script). O script confere categoria, datas, revisão repetida, arquivo dentro da pasta, PDF ou foto e até 10 MB, e põe tudo em `dados_obra/documentos/` no zip. Testes em `pipeline/testes/test_fvs_entrega.py` (`TestDocumentosDaEmpresa`).
  - App: `documentos/pacote.ts` lê `documentos/indice.json`, confere cada arquivo (tamanho e SHA-256) e grava os documentos com escopo empresa como baixados (fora da fila e do .obra). Um pacote novo troca os do pacote anterior, e o que foi feito no aparelho fica. Testes em `pacote.test.ts`.
  - **Falta ligar:** chamar `semearDocumentosDoPacote` dentro de `prepararObraLocal` (`nucleo/pacote_obra.ts`), umas 5 linhas no núcleo. Esperando o ok.

### Pedido ao núcleo: ligar os documentos do pacote (decisão do Professor, 09/11/2026)
Não feito aqui: o núcleo não é deste chat, e a `app/fvs-espaco` mudou o `pacote_obra.ts` nesta rodada. Entra **depois do merge da `app/fvs-espaco`, com o ok do Nicolas**. O código do app está pronto e desligado (`documentos/pacote.ts`, testado em `pacote.test.ts`).
- **O que entra**, em `app/src/nucleo/pacote_obra.ts`:
  ```ts
  import { semearDocumentosDoPacote } from '../documentos/pacote'
  // em prepararObraLocal, logo depois do bloco `if (anterior?.assinatura !== assinaturaNova) { ... }`
  // (cadastro e histórico já gravados) e antes de guardar as plantas:
  await semearDocumentosDoPacote(banco, obra, (caminho) => fonte.ler(caminho))
  ```
  A função tem a própria assinatura (meta `documentos_pacote:<obra>`): fica fora do `if` da assinatura do cadastro, porque um pacote pode trocar só os documentos. Pacote sem pasta `documentos/` = nada acontece. Pacote com documento estragado = erro com a frase "Gere o pacote de novo no PC", igual à planta estragada.
- **Teste que liga**, em `app/src/nucleo/pacote_obra.test.ts`: um pacote de teste com `documentos/indice.json` e um PDF, depois `prepararObraLocal`. Conferir que o documento aparece em `doc_documentos` com escopo empresa e `pendente 0`, com o arquivo em `conteudos`, e que a fila continua vazia. No `local.e2e.test.ts`, pôr um documento na pasta de teste e conferir que ele aparece na aba Empresa.

### Próximo passo
1. Nicolas ver no Chrome e no tablet e dizer o que muda.
2. Ligar os documentos do pacote no `prepararObraLocal` (núcleo, com ok) e o link "abrir no módulo" (casca, com ok; e um pedido aos chats da FVS e do Concreto).
3. ~~Migração `doc_documentos` e tabela na sincronização~~: feito em 20/11/2026 (branch `nucleo/documentos-login`). Falta o Professor aplicar a migração e fazer o merge.
4. "Levar para campo": guardar no aparelho o PDF dos documentos marcados, para abrir sem internet com conta (núcleo, ok do Nicolas).

## 1. O que o SiAC pede

### De onde vem (conferido em 09/11/2026, só por fontes secundárias)
- O SiAC (Sistema de Avaliação da Conformidade de Empresas de Serviços e Obras) é do PBQP-H. O regimento em vigor é o da **Portaria MDR nº 75, de 15/01/2021**, alterada pela **Portaria nº 577, de 03/2021**.
- Hoje são **dois níveis: B (entrada) e A (completo)**. Os referenciais normativos de Execução de Obras estão nos Anexos 2 (nível A) e 3 (nível B) do regimento consolidado, publicado no site do PBQP-H (gov.br/cidades).
- O referencial segue a estrutura da ISO 9001:2015 (seções 4 a 10), com requisitos próprios de obra (PQO, serviços e materiais controlados, controle tecnológico).
- A Portaria 75/2021 passou a exigir o **Plano de Controle Tecnológico em todas as obras** (art. 4º, segundo o resumo da CBIC).
- **Não li o texto oficial dos anexos.** Tudo marcado "conferir na norma" precisa ser conferido nele antes de virar regra do app. Os percentuais de serviços e materiais controlados por nível aparecem diferentes em cada fonte: **conferir na norma**.

### Lista (E = da empresa, O = de cada obra)

| # | Categoria no app | Documento ou registro | E/O | Nível | Observação |
|---|---|---|---|---|---|
| 1 | Sistema da qualidade | Escopo do sistema de gestão da qualidade | E | A e B | ISO 9001 4.3 |
| 2 | Sistema da qualidade | Política da qualidade | E | A e B | ISO 9001 5.2 |
| 3 | Sistema da qualidade | Objetivos da qualidade e indicadores | E | A e B | ISO 9001 6.2 |
| 4 | Sistema da qualidade | Manual da Qualidade | E | conferir na norma | A ISO 9001:2015 não exige manual; muitas construtoras mantêm |
| 5 | Sistema da qualidade | Riscos e oportunidades | E | conferir na norma | O nível B ganhou o item 1.3 ("mentalidade de risco") em 2021 |
| 6 | Procedimentos do sistema | Controle de documentos e de registros (informação documentada) | E | A e B; se precisa ser procedimento escrito, conferir na norma | ISO 9001 7.5 |
| 7 | Procedimentos do sistema | Auditoria interna (programa, relatórios) | E | A e B | ISO 9001 9.2 |
| 8 | Procedimentos do sistema | Não conformidade e ação corretiva (registros) | E e O | A e B | ISO 9001 10.2; o registro nasce na obra |
| 9 | Procedimentos do sistema | Análise crítica pela direção (atas) | E | A e B | ISO 9001 9.3 |
| 10 | Procedimentos do sistema | Lista mestra de documentos | E e O | conferir na norma | Não é exigida pelo nome na ISO; é o jeito comum de mostrar o controle. O app gera sozinho |
| 11 | Obra | PQO, Plano da Qualidade da Obra | O | A e B | Requisito próprio do SiAC; conteúdo mínimo: conferir na norma |
| 12 | Obra | Plano de Controle Tecnológico | O | A e B | Portaria 75/2021, art. 4º |
| 13 | Obra | Lista de serviços controlados e de materiais controlados | O | A e B, percentual por nível: conferir na norma | O SiAC tem uma lista de referência |
| 14 | Execução | PES, procedimentos de execução de serviço | E | A e B (na proporção do item 13) | Um por serviço controlado |
| 15 | Execução | FVS/PVS, fichas de verificação de serviço (modelo) | E | A e B | O modelo é da empresa; a ficha preenchida é registro da obra |
| 16 | Execução | FVS/PVS preenchidas | O | A e B | **Já existe no módulo FVS** |
| 17 | Materiais | Procedimento de inspeção de materiais e FVM (modelo) | E | A e B | |
| 18 | Materiais | FVM preenchidas (recebimento de material) | O | A e B | O Concreto já registra o recebimento do concreto |
| 19 | Fornecedores | Critérios e registros de qualificação e avaliação de fornecedores | E | A e B | Item 8.4.1.1, ajustado em 2021 |
| 20 | Pessoas | Competência, qualificação e treinamento (listas de presença, certificados) | E e O | A e B | ISO 9001 7.2; treinamento no PES costuma ser na obra |
| 21 | Equipamentos | Calibração e verificação de equipamentos de medição (certificados) | E e O | A e B | ISO 9001 7.1.5; trena, prumo, nível, esquadro |
| 22 | Obra | Projetos e controle de revisões | O | A e B | **Fica no módulo Projetos**; aqui só aparece o link |
| 23 | Obra | Ensaios de controle tecnológico (rompimento de CP, laudos) | O | A e B | **Já existe no Concreto** (CPs) |
| 24 | Cliente | Satisfação do cliente, manual de uso e operação | E e O | conferir na norma | ISO 9001 9.1.2; manual do proprietário pela NBR 14037 |
| 25 | Outros da obra | ART, alvará, licenças, atas de reunião | O | fora do SiAC (exigência legal ou interna) | Ficam numa categoria "Outros", com validade |

## 2. Como guardar cada documento

### Campos
| Campo | Exemplo | Regra |
|---|---|---|
| Escopo | Empresa / Obra | Ver "Empresa ou obra" abaixo |
| Categoria | Execução / PES | Lista fixa da seção 1 (mudar é uma linha em `documentos/categorias.ts`, sem migração) |
| Código | EXE-PES-01 | Livre; único por escopo |
| Título | Execução de alvenaria de vedação | |
| Revisão | 02 | Texto (aceita "R02", "B") |
| Data da revisão | 05/11/2026 | |
| Validade | 05/11/2027 ou vazio | Vazio = não vence |
| Responsável | Eng. Fulano (função) | Texto livre: no modo local não há cadastro de pessoas |
| Status | vigente, em revisão, obsoleto | Ver abaixo |
| Arquivo | PDF ou foto | Um arquivo por revisão |
| Observação | | Opcional |

### Revisão e status sem perder nada
Segue a regra da arquitetura: **só inclusão**, como no Diário e no Concreto.
- Revisão nova = linha nova com o mesmo código. A revisão anterior vira **obsoleto** sozinha (não precisa marcar) e continua aberta para consulta, com a faixa "OBSOLETO".
- Marcar "em revisão", cancelar ou corrigir um erro de digitação = linha nova que substitui a anterior (`substitui_id`), igual ao Concreto.
- Vale a linha que ninguém substituiu.

### Lista mestra automática
Uma tabela por escopo: código, título, revisão vigente, data, validade, responsável, status. Ordem por categoria e código. Filtros: categoria, status, "vencidos". Botão Imprimir (A4, como o RDO), para levar à auditoria.

### Aviso de vencido
- Selo vermelho "Vencido" e amarelo "Vence em X dias" (30 dias antes; número ajustável).
- Contagem no topo do módulo e no botão do menu ("2 vencidos").
- Sem notificação do sistema por enquanto: o aviso aparece quando o app abre.

### O que já existe em outros módulos (aparece ligado, sem copiar)
A lista mestra da obra mostra também, só para ler, com o link para abrir no módulo de origem:
- **FVS:** as fichas (modelo, com código e revisão, do `fichas.json` do pacote) e a contagem de verificações feitas por ficha. Ficha preenchida = registro da qualidade da categoria 16.
- **Concreto:** concretagens e CPs como registros do controle tecnológico (categorias 12, 18, 23).
- **Relatórios:** relatório do tipo "Qualidade" com situação aberta = não conformidade (categoria 8).
- **Projetos:** quando voltar ao menu, as pranchas vigentes (categoria 22).

## 3. Onde ficam os arquivos

### Modo local (hoje)
- Os bytes vão para a tabela local de arquivos do núcleo (`conteudos`, no IndexedDB do navegador) pelo `registrarArquivo`, como as fotos do Diário. Nada sai do aparelho.
- **Limite do navegador:** o Chrome deixa usar boa parte do disco livre (o menu já mostra "Espaço usado: X de Y"), mas o Android pode apagar tudo se o armazenamento não for "protegido" (o app já pede isso ao abrir; instalado, fica protegido).
- **Limite do salvamento:** o `.obra` leva os arquivos dentro, em base64 (um terço maior) e lidos de uma vez na memória. Com PDFs ele cresce rápido. Proposta: **até 10 MB por arquivo** (foto reduzida como no Diário) e aviso quando os documentos passarem de 150 MB no aparelho. **Conferir com um tablet de verdade.**
- Documentos da empresa (Manual, PES, modelos) podem vir **dentro do pacote da obra (.zip)**, como as fichas da FVS hoje: o escritório monta uma vez, o tablet recebe pronto e sem digitar.

### Com servidor (depois)
- Bucket `obras`, caminho `{obra_id}/documentos/{id}.pdf`, linha em `arquivos` (já existe no núcleo).
- **Ponto de atenção (núcleo):** hoje, depois de enviado, o arquivo sai do aparelho. Para PES e projeto no tablet sem internet isso não serve. Proposta: marcar o documento "levar para campo" e o núcleo manter a cópia no aparelho. **Mudança do núcleo: precisa do ok do Nicolas.**

### Tabela nova (proposta, não criada)
`doc_documentos`, sincronizada, só de inclusão (`nucleo.preparar_tabela`), com as colunas padrão do núcleo e:

| Coluna | Tipo |
|---|---|
| `escopo` | `'empresa'` ou `'obra'` |
| `categoria` | texto (código da categoria) |
| `codigo`, `titulo`, `revisao` | texto |
| `data_revisao` | data |
| `validade` | data ou nulo |
| `responsavel` | texto |
| `situacao` | `'vigente'` ou `'em_revisao'` (obsoleto é calculado) |
| `arquivo_id` | `arquivos.id` ou nulo |
| `observacao` | texto |
| `substitui_id`, `cancelado` | como no Concreto |

Permissões: gestor e admin incluem; campo e leitura só veem. A migração só é feita e aplicada com o "pode" do Nicolas.

### Empresa ou obra (decisão do Nicolas)
O banco só conhece obras: não existe tabela de empresa. Duas saídas:
1. **(sugestão para agora)** Tudo fica dentro da obra; os documentos da empresa levam `escopo = 'empresa'` e chegam pelo pacote da obra. Simples, funciona sem servidor. Defeito: cada obra tem a sua cópia.
2. **(depois)** Tabela `empresas` no núcleo e documentos da empresa ligados a ela, uma cópia só para todas as obras. **Mudança de arquitetura do núcleo.**

## 4. Primeira versão das telas (depois do ok)
- **Lista mestra:** abas Empresa e Obra, filtro por categoria e status, selos de vencido.
- **Cadastrar documento** e **revisão nova** (escolher PDF ou tirar foto).
- **Abrir arquivo:** PDF no visualizador do navegador; foto em tela cheia.
- **Imprimir a lista mestra.**
- Exemplos fictícios da Construtora Exemplo / obra EXE (Manual, política, PES de alvenaria, PQO, um certificado de calibração vencido), semeados como os do Diário.
- Testes: regras (status, vencido, obsoleto) e tela no Chrome em 375 px e tablet.

## Pendências e decisões abertas
1. O Nicolas ver a primeira versão (o ok foi do Professor).
2. Migração `doc_documentos` no Supabase: escrita e testada em 20/11/2026 (`20261120150000_documentos.sql`). Falta aplicar (o Professor aplica).
3. Conferir no texto oficial do SiAC os itens marcados "conferir na norma".
4. Núcleo: "levar para campo" (arquivo que fica no aparelho depois de enviado).
5. Limite de tamanho e espaço num tablet de verdade; no Android, o PDF abre pelo leitor do aparelho (não testado).
6. Ligar `semearDocumentosDoPacote` no `prepararObraLocal` e o link "abrir no módulo" (núcleo/casca, esperando o ok).
7. `docs/02_CONTRATO_NUCLEO.md` ainda diz que Documentos e Relatórios estão fora do menu (doc do núcleo: não mexi).

## 12/11/2026: revisão de segurança (Professor)

- Nome de arquivo limpo (`nomeLimpo`): sem pasta, sem caractere de controle ou de inverter o texto, até 120 caracteres. Vale no seletor, no pacote da obra e no `.obra` restaurado.
- `guardarArquivo` confere tipo e tamanho de novo (não só a tela).
- Pendente: o formulário de documento não guarda rascunho. Recarregar no meio perde o que foi digitado (o documento salvo não se perde).

### Demo de 14/11/2026 (Testador, branch `app/demo-documentos-relatorios`)
- Imprimir lista mestra: os documentos de exemplo saem na folha marcados "EXEMPLO ·", com uma nota de que não valem para a auditoria (antes a tela mostrava 7 e a folha dizia "Nenhum documento cadastrado").
- Registros dos módulos: a área de laje (gravada em `area_id`) conta como local verificado; números com ponto do milhar ("11.728").
- A folha cabe na tela: sem largura mínima; abaixo de 700 px cada linha vira cartão com o nome da coluna.
- Obra montada pela Nova obra (`origem: nova_obra` na meta do pacote, #57) não recebe os documentos de exemplo; se o aparelho já tinha semeado, eles saem ao abrir o módulo.
