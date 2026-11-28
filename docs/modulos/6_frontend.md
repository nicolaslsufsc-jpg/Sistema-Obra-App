# Front end: aparência e componentes comuns (frente 06)

Status em 21/11/2026: o menu refeito pelas heurísticas (#38) e a faixa "Instale o app" (#41) estão na main. Na branch `app/projetos-com-conta`, com commit local, o Projetos aparece no menu também com conta. Ela só sobe depois que o #44 (lista de distribuição no servidor) entrar. A FVS em 3 níveis está no PR #56. Na branch `app/exportar-pdf`, com commit local, entra o botão "Exportar PDF" na FVS, no Concreto, no Projetos e no Documentos. Na branch `front/guia-estilo` (commits locais), o guia de estilo do Nicolas (`docs/DESIGN.md`): passo 1 (tema) pronto; passo 2 (cabeçalho comum) num commit WIP em cima dele.

**O que esta frente cuida:** casca do app, menu, entrada, tema (claro e escuro), estilos comuns em `app/src/style.css` e `app/src/tema.css`, e a regra de 375 px e tablet.
- Cada tela de módulo nasce e muda na frente do próprio módulo. A 06 só aponta o problema para a frente dona.
- O texto das telas de entrada (`Entrar.tsx`, `Codigo.tsx`, `Obras.tsx`) é da 07 · LOGIN. O estilo dessas telas é da 06.

## Feito
- **#59, tema:** todas as cores passam por `tema.css`. O escuro é o padrão, e o "Modo sol (claro)" fica no menu e é lembrado pelo aparelho.
- **#61, tela inicial:** cópia de segurança e dados do aparelho ficam num bloco recolhido.
- **#9:**
  - menu mais curto no celular;
  - o botão principal desativado fica cinza;
  - o cartão que começa por um título não tem mais espaço vazio no topo;
  - teste de tela "telas comuns", que confere entrada, Nova obra, menu e menu com a cópia aberta, nos dois temas, em 375, 768 e 1024 px. Ele exige contraste de 4,5:1 ou mais, toque de 44 px ou mais, nenhuma rolagem para o lado e nenhum erro na página.
- **#13:** o bloco "Este aparelho" ficou em linguagem simples, e o que só serve ao suporte foi para "Detalhes técnicos".
- **IFC no menu (20/11):** o IFC voltou ao menu sem o selo "beta".
- **Menu pelas heurísticas (20/11, branch `app/menu-heuristicas`):**
  - topo em uma linha: a obra à esquerda, e "Instalar app" e o tema (ícone de sol ou lua) à direita;
  - tocar no nome da obra abre o menu da obra, com Trocar de obra (ou o pacote .zip, sem conta), Pessoas da obra, Sair e Fechar. Ele fecha no Esc e ao tocar fora;
  - os módulos vêm logo abaixo, com descrições novas (a FVS cita lajes, furos e ambientes);
  - a lista de pavimentos saiu da tela e foi para "Detalhes técnicos";
  - os avisos vêm depois da sincronização ou da cópia de segurança;
  - na primeira tela de cada módulo, o botão de voltar virou "‹ Menu" (FVS, Concreto, Documentos e IFC). O topo da planta da FVS não mudou;
  - caixas dos módulos com a mesma altura (a da maior da grade), descrição em até 2 linhas e "Abrir ›" sempre no mesmo lugar. O teste de tela confere isso em 375, 384, 768 e 800 px;
  - ícones em `app/src/telas/icones.tsx` (um por módulo, mais o de instalar), sempre com o texto junto. Foram desenhados no próprio código, sem biblioteca nem arquivo de fora, então não pedem crédito nem trazem licença de terceiros. O Flaticon ficou de fora porque os ícones grátis de lá exigem crédito ao autor.

- **Faixa "Instale o app" com o app já instalado (20/11, branch `app/instalado`, achado do testador):**
  - a faixa e a frase "Instale o app para proteger" não aparecem mais quando o app já está instalado, nem na aba do Chrome;
  - o app se dá por instalado em três casos: quando está aberto como app; quando o Chrome responde que está instalado (`getInstalledRelatedApps`, com o manifesto listando a si mesmo); ou quando há a marca guardada no aparelho no momento em que o Chrome avisa que instalou;
  - se o Chrome volta a oferecer a instalação, o app foi desinstalado: a marca sai e a faixa volta;
  - o código fica em `app/src/telas/instalado.ts`, e o núcleo não mudou;
  - o teste de tela confere os quatro casos em 375 px e no tablet (na main pelo #41).

- **FVS em 3 níveis (21/11, branch `app/fvs-navegacao`, pedido do Nicolas):**
  - nível 1: a lista de pavimentos na ordem da obra, com o andamento e se já está no aparelho ("No aparelho", "Ainda não baixado"). Busca, reprovações, avisos e "Baixar a obra" continuam nesta tela;
  - nível 2: as disciplinas daquele pavimento (Estrutura, Alvenaria, Acabamentos, Instalações), só as que têm dados. "Baixar este pavimento" e "⋯ Mais" (tirar do aparelho) ficam aqui;
  - nível 3: as opções da disciplina. Na Estrutura são Pilares, Vigas, Lajes, Furos de viga, Barras de laje, a armadura e a furação de laje. Cada opção abre a planta que já existia, na aba certa;
  - cada nível tem o botão de voltar, e o voltar do celular passa pelos três;
  - o agrupamento vem dos dados (`disciplina` da planta e o título das opções de ambientes), em `app/src/fvs/navegacao.ts`, sem nada fixo de obra;
  - o menu principal e a tela da planta não mudaram;
  - os testes de tela da FVS (`fvs_bancada`, `local`, `nova_obra`) passaram a entrar pelos 3 níveis, com os ajudantes em `app/testes/fvs_inicio.ts`.

- **Exportar PDF nas telas de consulta (21/11, branch `app/exportar-pdf`, liberado pelo Nicolas):**
  - uma folha padrão para todos os módulos: cabeçalho com a obra, a data e a hora e quem gerou (nome do perfil, o e-mail, ou "este aparelho (sem conta)"), título, números principais e tabelas legíveis em A4. Tabela larga sai deitada;
  - sai pelo Imprimir do navegador ("Salvar como PDF"), sem biblioteca nova. O nome do arquivo sugerido é `MODULO_OBRA_TITULO_DATA`;
  - onde está o botão:
    - FVS: no pavimento (nível 2) e na obra inteira (nível 1). A folha tem as fichas por peça (situação, C, NC, NA, itens vazios, % conforme, última marcação e quem) e as não conformidades;
    - Concreto: no pavimento (concretagens) e nas peças concretadas (por caminhão e por peça). Aqui o "Imprimir" antigo virou "Exportar PDF";
    - Projetos: nas abas Pranchas e Entregas (com a busca e o filtro, a lista inteira) e na lista de projetos antiga;
    - Documentos: na lista mestra, com os filtros da tela. O "Imprimir lista mestra" continua como estava;
  - o código fica em `app/src/telas/ExportarPdf.tsx`, `folha_pdf.ts` e `exportar_pdf.css`; os dados de cada módulo saem dos mesmos cálculos da tela (a FVS em `app/src/fvs/pdf.ts`). As cores do papel (`--papel-*`) ficam no `tema.css` e não mudam no tema escuro;
  - a folha fica escondida na tela e só ela sai na impressão. Ela sai da página no próximo toque ou tecla, e não no "terminou de imprimir", porque no Chrome do Android esse aviso pode vir antes de o PDF ser desenhado;
  - as impressões que os módulos já tinham (ficha de concreto deitada, lista mestra) não mudaram: a folha usa páginas com nome (`@page folha` e `deitada`);
  - o teste de tela (`local.e2e`, "Exportar PDF...") confere, em 375 px e no tablet, nos quatro módulos: o botão com 44 px ou mais, sem rolagem para o lado, o cabeçalho, o conteúdo e a limpeza depois. No tablet ele gera os PDFs de verdade.

- **Guia de estilo, passo 1 pronto e passo 2 em WIP (21/11, branch `front/guia-estilo`, pedido do Nicolas):**
  - o guia foi para `docs/DESIGN.md`, sem o nome da marca (no repositório ela é a "paleta do app");
  - tema: a paleta do app (azul-marinho, areia, creme, cinzas) e as cores de status ficam no topo de `tema.css` (`--cor-*`, `--status-*`), com os tamanhos (`--fs-*`, `--raio-max` 4 px, `--linha-tabela` 40 px). As variáveis antigas (`--fundo-ffffff`...) apontam para as cores do guia;
  - o claro passou a ser o padrão; o escuro fica no ícone de lua do topo do menu, lembrado pelo aparelho. Quem não tinha escolhido nada passa para o claro;
  - a letra da raiz continua em 18 px, porque as alturas de toque dependem dela; os tamanhos do guia valem no cabeçalho e nas tabelas;
  - na planta da FVS o azul (liberado para concretar) e o laranja (em andamento) não mudaram, por regra do módulo; o verde e o vermelho usam as cores de status;
  - as cores dos desenhos sobre a planta (caminhões, tipos de peça) ficam no código, porque o Leaflet não lê variável de CSS;
  - cabeçalho comum em `app/src/telas/Cabecalho.tsx`: só a seta "‹" à esquerda (igual em toda tela; o leitor de tela lê "Voltar" ou "Voltar ao menu"), título que quebra em duas linhas, nunca cortado, e ações à direita. Os `Topo` do Concreto, do Projetos e do Documentos usam ele; as telas da FVS (menos a planta) usam as mesmas classes;
  - o "Reportar" do Concreto saiu de flutuante e foi para o cabeçalho de cada tela (no celular, só o "!"). No mapa do Concreto ele continua no canto, como antes;
  - falta: o topo da planta da FVS (depois da junção da 10), o mapa do Concreto e os passos 3 a 5 (tabelas, Concreto, textos).
- **Guia de estilo, depois do #61 (22/11):**
  - o tema, o cabeçalho comum e a tabela comum (passo 3, ainda sem uso em tela) estão na main pelo #61;
  - prints do cabeçalho em 375 px e no tablet, nos dois temas, na pasta `cabecalho_2026-11-22` (Concreto, Projetos, Documentos e FVS);
  - lista dos textos fora do guia, por tela: `docs/TEXTOS_FORA_DO_GUIA.md` (110 textos). Só a lista; cada frente troca os textos das telas dela;
  - falta: o topo da planta da FVS, o mapa do Concreto, a tabela nas telas (Concreto e Projetos, depois das frentes 04, 10 e 11) e a troca dos textos.
- **Guia de estilo fechado (23 e 24/11, branch `front/guia-fechar`, item 0b):**
  - tabelas: no Concreto, os pavimentos (Pavimento | Concretagens | Caminhões | Volume (m³) | Status), as concretagens do pavimento e a "Ficha do dia"; no Projetos, o painel da obra e o controle do canteiro viraram linha de resumo e tabela, e as pastas e pranchas também;
  - textos: 98 dos 110 de `docs/TEXTOS_FORA_DO_GUIA.md` trocados ("–" onde não há dado, "Cópia desatualizada no escritório", sem parágrafo de ajuda). A ajuda foi para o botão "?" (`telas/Ajuda.tsx`). Ficaram os da planta e do escoramento da FVS, do laudo do Concreto (frentes donas) e os da tela Obras (07 · LOGIN);
  - campo de arquivo: `telas/BotaoArquivo.tsx`, um botão "Importar planilha (.xlsx)" (ou "Importar lista (.csv)", "Importar foto", "Importar arquivo") com o nome do arquivo ao lado. Usado na planilha do Concreto, nos três arquivos do painel do Projetos, na foto da entrega e no cadastro do Documentos. Os campos que já ficavam escondidos atrás de um botão não mudaram;
  - ícones: `telas/icones.tsx` é o conjunto único, com traço de 1,75 px. Os de ação (`<Icone id="avancar" />`, "abrir", "fora", "feito", "mais"...) entraram no lugar de "▾", "▸", "↗", "✓" e "›" escritos como texto no Projetos e no mapa do Concreto. A seta "‹" do voltar continua como texto, igual em todas as telas;
  - prints em `guia_fechar_2026-11-23`.

## Pendências
1. **Um estilo só para aviso, toast e tela vazia.**
   - As telas comuns já não têm cor solta.
   - As repetições estão em `fvs.css` e `concreto.css`.
   - Fica para quando as frentes 03 a 05 fecharem.
2. **Abas dos passos da Nova obra.** No celular elas quebram em duas linhas (`nova_obra.css`). Fica junto com o item 1.
3. **Projetos com conta (branch `app/projetos-com-conta`):** saiu o `soSemConta` só do Projetos em `modulos.ts`, e ele continua com o selo "beta". O teste de unidade e o teste de tela com conta (`telas.e2e`) foram ajustados. Esperando o #44.

## Próximo passo
Uma barra comum em todas as telas, com "‹ Menu" à esquerda, inclusive na planta da FVS. Só depois que o #31 (topo da TelaPlanta, frente 02) entrar na main, e combinado com o Professor.

## Onde ficam os prints
Ficam fora do git, na pasta "Frontend" do PC do Nicolas: o levantamento de 18/11, os prints de `menu_pr1`, `menu_ifc_doc_2026-11-20` e `menu_heuristicas_2026-11-20` (com a proposta) `fvs_niveis_2026-11-21` (os 3 níveis da FVS em 375 px e tablet) e `exportar_pdf_2026-11-21` (os PDFs gerados e os botões no celular), `guia_estilo_2026-11-21`, `cabecalho_2026-11-22` e `guia_fechar_2026-11-23` (o guia de estilo nos dois temas; no último, `*_antes`, `*_passo1` e `*_final`).

## Versão PC (proposta de 23/11/2026, esperando a aprovação do Nicolas)

**É proposta, não decisão.** Muda a arquitetura de tela, então só vale depois do "pode" do Nicolas. O protótipo está na branch `claude/front-versao-pc-3d2069` (sai do `trabalho`), com commit local. Ele fica **desligado**: só aparece para quem clica em "Experimentar a versão PC", no canto do menu, num PC.

Pedido dele: "uma versão no pc que tenha mais abas, meio que um núcleo sendo o pc e no mobile simplificado (como está hoje)", com acesso fácil ao conteúdo, aos PDFs e aos relatórios.

### A ideia em uma frase
O celular e o tablet continuam a tela de campo de hoje. O PC vira o escritório: uma barra lateral sempre à vista, três páginas que só ele tem (painel, relatórios, pranchas e PDFs) e as telas dos módulos ao lado.

### O que muda acima de 1100 px
- **Quando vale:** janela com 1100 px ou mais **e** com mouse (`hover` e ponteiro fino). O tablet deitado tem 1280 px, mas é de toque: fica como hoje. Estreitar a janela do PC volta à tela de hoje na hora.
- **Barra lateral fixa** (à esquerda, na cor principal do tema): a obra, se há internet, "Início", o grupo "Escritório" (Painel da obra, Relatórios, Pranchas e PDFs) e o grupo "Módulos" (os mesmos do menu, vindos de `modulos.ts`; o Instalações entra sozinho quando virar módulo). Embaixo, o tema e "Voltar à versão de hoje".
- **Conteúdo à direita:** a tela de sempre do módulo, sem mudança. O que o módulo prende na tela (topo da planta, avisos, painéis) fica preso à área do conteúdo e não cobre a barra.
- **Abas no topo:** já na página de Relatórios (uma aba por módulo). Dentro de cada módulo, as abas são trabalho da frente dona (ver "O que falta").
- **Tabelas largas:** a tabela comum do guia (`telas/Tabela.tsx`) em toda página do PC, com os números à direita.
- **Painel lateral de detalhe:** na página de pranchas, clicar na linha abre o detalhe à direita, sem sair da lista.
- **Voltar do navegador:** igual ao celular. O histórico fica "início + uma tela"; trocar de tela pela barra troca a de cima.

### O que o PC tem a mais
1. **Painel da obra.** Os números de cada módulo numa tela: fichas da FVS e NCs abertas, concretagens, caminhões e volume, pranchas e cópias em campo, documentos e validades. Cada bloco abre o módulo.
2. **Central de relatórios.** Uma aba por módulo e os mesmos filtros em todas (pavimento, de, até), com a prévia em tabela. Usa só as exportações que já existem:
   - FVS: o PDF das fichas e NCs (`fvs/pdf.ts`) e a planilha da situação (.csv), agora por pavimento e por período;
   - Concreto: a planilha de controle (.xlsx, no modelo da obra ou no de exemplo) e um PDF das concretagens;
   - Projetos: o PDF das entregas do período e a ficha de entrega (ou o comprovante) da entrega escolhida na tabela;
   - Documentos: o PDF da lista mestra.
3. **Pranchas e PDFs.** Uma busca só (código, título, disciplina, revisão; sem acento) nas pranchas do Projetos, nos documentos da lista mestra e nas plantas da FVS. O detalhe abre o PDF guardado, a pasta da prancha (com internet) ou o módulo.

### O que continua só no celular (e não pode piorar)
- A tela de campo: menu em cartões, FVS em 3 níveis, planta tocável, Concreto com as canetas. Nada disso mudou.
- O código das páginas do PC fica num arquivo separado, carregado só quando a pessoa abre uma delas: o celular não gasta memória com ele.
- Conferido: os prints do menu e da FVS em 375 px e em 768 px saíram **iguais, ponto a ponto**, antes e depois.

### Como foi feito
- Tudo novo em `app/src/pc/`: `versao_pc.ts` (quando vale), `CascaPc.tsx` e `pc.css` (barra e área do conteúdo), `PaginaPainel.tsx`, `PaginaRelatorios.tsx`, `PaginaPranchas.tsx`, `busca.ts`, `dados_pc.ts` e o teste `pc.test.ts`.
- Em `app.tsx`: uma tela nova (`pc`) e o trecho que envolve o início, os módulos e as páginas do PC na casca. Menu, estilos comuns e módulos não mudaram. O núcleo não mudou.
- As páginas leem o banco do aparelho pelos mesmos `carregar` dos módulos. Só leitura: nada grava na obra. Se um módulo falha, só o bloco dele avisa.
- Cores só pelas variáveis do `tema.css` (claro e escuro).

### O que foi conferido (23/11, Chrome do PC, obra EXE)
- 1440 e 1280 px com mouse: início, painel, relatórios (as 4 abas), pranchas com busca e detalhe, FVS até a planta, Concreto. Sem rolagem para o lado e sem erro na página.
- A planilha do Concreto e o .csv da FVS baixaram; o PDF da FVS saiu só com a folha (sem a barra).
- Sem internet (app recarregado offline): a casca e as três páginas abrem. O único pedido que falha é o de sempre (`dados_obra/indice.json`, a procura da pasta da obra).
- 768 e 375 px (toque): o botão da versão PC não aparece e as telas são as de hoje.
- `tsc`, `vitest` e `npm run build` passam.

### O que falta e o que o Nicolas decide
1. **Aprovar ou não a ideia** (barra lateral no PC, três páginas de escritório).
2. **Ligada por padrão no PC?** Hoje é só para quem clica em "Experimentar".
3. **Abas dentro de cada módulo** (FVS: Pavimentos, Reprovações, Avisos; Concreto: Concretagens, Peças, Laudos; Projetos já tem). É da frente de cada módulo, depois da aprovação.
4. **Relatórios (Diário) e Instalações na barra:** entram quando voltarem ao menu.
5. **Abrir a prancha em PDF direto da busca:** hoje só os documentos têm o arquivo no app. As pranchas do Projetos ficam na pasta da obra; ligar uma coisa à outra é com a frente dos Projetos.
6. **Não testado:** obra grande de verdade (a prévia da FVS corta em 300 linhas), com conta e servidor, tema escuro nas páginas novas (usa as variáveis, mas não tirei print), Opera GX, e a memória de "onde eu estava" dos módulos, que no PC passa a rolar dentro da área do conteúdo.
7. **Teste de tela automático** (`*.e2e`) para a versão PC: fica para depois da aprovação; por ora há o teste de unidade e o roteiro de prints.

Prints: pasta `versao_pc_2026-11-23` (fora do git), com o antes e o depois nas 4 larguras.

### 2ª volta: caixas no Painel da obra (24/11/2026)
Retorno do Nicolas olhando o Painel no PC (app de testes): "isso aqui ta legal mas precisa de umas caixas ta um monte de info voando".
- **Uma caixa por indicador:** dentro do cartão de cada módulo, cada número fica na sua caixa (fundo do tema e borda fina), com o número em cima e o rótulo embaixo, em grade de 2 colunas.
- **Grade alinhada:** o número tem altura fixa de uma linha e o rótulo sempre a altura de duas, então rótulo curto e rótulo comprido não desalinham.
- **Data inteira numa linha:** a "última concretagem" sai em letra menor, no formato do guia (24/11/2026). Antes quebrava em duas linhas na tela larga.
- **Faixa "Ações":** "Gerar relatórios" e "Procurar prancha ou PDF" ficam numa caixa com título, embaixo dos cartões.
- **Cartões ocupam a largura toda:** 2 por linha em 1280 px e 4 em 1920 e 2000 px (antes sobrava um vazio à direita).
- O texto ao lado do título ficou curto ("Neste aparelho em 24/11/2026").
- Conferido em 1280, 1920 e 2000 px, tema claro e escuro, com uma concretagem cadastrada pela tela do Concreto: sem número cortado ou quebrado e sem rolagem para o lado. `tsc`, `vitest` e `npm run build` passam. Prints em `versao_pc_2026-11-24`.
- **Ponto para o Nicolas decidir:** o guia (`docs/DESIGN.md` › Layout) diz "Sem grade de cards com número grande (KPI)". O Painel é exatamente isso, e ele pediu as caixas. Ficou como ele pediu, com o número menor que antes (27 px). Falta ele dizer se o Painel da obra é a exceção do guia ou se prefere outro formato (tabela, por exemplo).

### 3ª volta: a tela inicial vira o Avanço da obra, por residencial (24/11/2026)
Pedido do Nicolas: "quem é o foco de uso dele é o meu chefe ... a gente divide por residencial ... quantos pilares do residencial D estão prontos? Gráficos. ... Qual laje está pronta para concretar? ... Quantos por cento do meu aço", e depois "coloca a concretagem também".
- **O que mudou na casca:** a versão PC abre no **Avanço da obra** (o primeiro item da barra). O painel de contagem do aparelho (as caixas da 2ª volta) saiu; o estilo das caixas ficou nos indicadores do Avanço. O menu de sempre virou o item "Menu da obra".
- **Agrupamento vem dos dados:** os botões do topo são "Obra inteira" e os residenciais da lista `residenciais` das regras da FVS (`fvs_regras`, a mesma dos avisos de escoramento). Não foi preciso migração nem mexer no núcleo. Pilar entra pelo nome; viga e laje, pelos pilares que as apoiam (lidos das plantas guardadas no aparelho); peça na divisa conta nos dois. Obra sem a lista mostra só "Obra inteira", por pavimento.
- **Pilares e vigas:** prontos de um total (pronto = a ficha toda conferida, a mesma regra do verde da planta), com barra por pavimento e as colunas "para concretar", "andamento", "com NC" e "pendentes".
- **Lajes:** liberada para concretar = a ficha da laje com os itens de antes da concretagem conferidos e todos os pilares e vigas dela também. Para as outras, a tabela diz o que falta, com o nome das peças. Laje com a ficha toda conferida ou com caminhão no Concreto sai como feita. Sem a planta do pavimento no aparelho, a laje não sai como liberada e a tabela avisa.
- **Armação:** % de peças com todos os itens de armadura da ficha conferidos. O item de armadura é o marcado com `barras` ou o que fala de armadura, armação, aço, ferragem ou estribo na etapa ou no título (texto da ficha da obra). Por peso fica para quando houver o quantitativo de aço.
- **Concretagem:** volume (m³), concretagens, caminhões e a última, no residencial e na obra; por pavimento, pilares e vigas concretados × previstos e lajes concretadas × previstas. Vem do Concreto, só leitura. O Concreto liga o caminhão às peças, então dá para chegar ao residencial; o que ele **não** tem é o volume por peça: caminhão que concretou peças de dois residenciais entra com o volume inteiro nos dois (a tela conta quantos são), e caminhão sem peça marcada só entra na obra inteira.
- **Gráfico pavimento × etapa:** barras empilhadas por situação, com as cores da planta da FVS, e ao lado a barra de concretado × previsto. Legenda, número dentro do segmento quando cabe, dica ao passar o mouse e as tabelas embaixo com os mesmos números. Cores conferidas com o validador de paleta nos dois temas (o cinza de "pendente" é neutro de propósito).
- **Imprimir / PDF:** a folha padrão do "Exportar PDF", com o residencial escolhido.
- **De onde vêm os dados:** do banco do aparelho, que a sincronização do núcleo enche com o que a equipe registrou no servidor. A tela liga a sincronização de sempre, mostra "Dados do servidor às HH:MM" e tem o botão "Atualizar". Ela não lê o servidor por fora do núcleo. Sem conta, mostra só o aparelho e diz isso.
- **Arquivos:** `pc/avanco.ts` (as contas, com `avanco.test.ts`), `pc/avanco_dados.ts` (liga à FVS e ao Concreto), `pc/PaginaAvanco.tsx`. Saiu `pc/PaginaPainel.tsx`.
- **Conferido** (Chrome, obra EXE de 3 pavimentos e 2 residenciais montada só para o teste, sem conta): 1280 e 1920 px, obra inteira e residencial, tema claro e escuro, PDF gerado, dica do gráfico, obra sem residencial, e recarregado sem internet. Os números da tela batem com os esperados do roteiro. `tsc`, `vitest` e `npm run build` passam. Prints em `versao_pc_2026-11-24_avanco`.
- **Não testado:** com conta e servidor (a linha "Dados do servidor" e o "Atualizar"), obra grande de verdade, laje desenhada como área na FVS, laje concretada pela caneta "Vigas e laje".
- **Para o Nicolas decidir:** (1) o item de armadura sai pelo texto da ficha; se as fichas da obra usarem outra palavra, o certo é marcar o item na ficha; (2) continua valendo a pergunta do guia sobre caixas com número grande.

### 4ª volta: índice de apoios, para o Avanço não depender de baixar planta (24/11/2026)
Problema: o servidor passou do limite de download por causa das plantas (10 a 24 MB cada). O Avanço precisava delas só para saber quem apoia cada viga e cada laje. O PC do chefe não pode depender disso.
- **O que é:** um índice pequeno, por pavimento, com os pilares e as vigas que apoiam cada viga e cada laje, pelo nome das peças. Na obra de teste (3 pavimentos, 24 vigas e lajes) deu 810 bytes; são uns 35 bytes por viga ou laje.
- **Onde fica:** na linha de regras da FVS da obra (`fvs_regras`), numa chave nova `apoios`. **Sem migração e sem mexer no núcleo:** a tabela já existe, já é sincronizada e aceita chave nova (o gatilho só confere `prazos` e `ligacoes`). Sem conta, vai no `config_fvs.json` do pacote, que o app já grava inteiro como as regras.
- **Formato:** `"apoios": {"gerado_em": "...", "pavimentos": {"2º Pavimento": {"V:V1": [["P1","P2"], []], "L:L1": [["P1","P2"], ["V1"]]}}}`. Cada peça: [pilares, vigas]. O residencial de cada viga e laje sai daí e da lista `residenciais`, pela mesma regra de antes.
- **Como o app usa:** a planta guardada no aparelho, se houver, passa na frente (é a medida de agora); o índice cobre as peças sem planta aqui. Tudo lido do banco do aparelho: a tela não baixa nada. Sem planta e sem índice, vigas e lajes ficam fora dos residenciais e a tabela das lajes avisa.
- **Como gerar:** num aparelho que já tem as plantas, o Avanço mostra em "Ações" o botão **"Baixar índice de apoios (.json)"**. O arquivo sai pronto para juntar às regras da obra. Quem publica as regras (hoje o Professor) põe a chave `apoios` na linha de `fvs_regras`. Tem que gerar de novo quando a forma de um pavimento mudar.
- **Arquivos:** `pc/avanco.ts` (`indiceDeApoios`, `lerIndiceDeApoios`, `apoiosDoIndice`, `juntarApoios`, com teste), `pc/avanco_dados.ts` (`indiceDeApoiosDaObra`), `pc/PaginaAvanco.tsx`. Nenhum arquivo da FVS mudou.
- **Conferido** (Chrome, obra EXE de teste, sem conta, servidor local): (1) aparelho com as plantas, baixei o índice; (2) pus o índice nas regras e apaguei todas as plantas do aparelho: indicadores e tabela de lajes iguais aos de (1), na obra inteira e no Residencial B; (3) sem planta e sem índice: a tela avisa. `tsc`, `vitest` e `npm run build` passam.
- **Limites:** área de laje desenhada no app depois de gerar o índice não está nele (precisa da planta ou de gerar de novo). O índice vai por nome: peça renomeada na revisão da forma sai do índice até gerar de novo. Não testado com conta nem com a obra de verdade.
- **Proposta para depois (não feita, é de outra frente):** calcular o índice na publicação das plantas (pipeline), para não depender de alguém lembrar do botão. A conta de quem apoia quem está em `fvs/escoramento_residencial.ts`; teria que existir igual no pipeline.

### 5ª volta: o índice de apoios sai do pipeline, sem botão e sem servidor (24/11/2026)
- **Gerador:** `pipeline/fvs/indice_apoios.py`. Lê os `manifest.json` dos pacotes de planta que já estão no PC (a pasta dos pacotes da obra, a da bancada ou um `dados_obra/`), sem o `pacote.bin` e sem entrar em servidor. Grava `{"apoios": {...}}`, igual ao arquivo do botão do app. Com `--juntar-em config_fvs.json`, grava as regras com a chave `apoios` trocada e o resto igual. Recusa saída dentro do repositório. Não publica nada.
  - `py pipeline/fvs/indice_apoios.py "PASTA_DOS_PACOTES" --saida "FORA_DO_REPOSITORIO\apoios.json"`
- **A conta é a mesma do app** (`fvs/escoramento_residencial.ts`), escrita de novo em Python: viga pelos pilares e vigas que toca, laje do pacote pelos centros de dentro, a planta com mais pilares e vigas por pavimento, peça só de detalhe fora. Mudou num lado, tem que mudar no outro.
- **Teste cruzado:** os manifests da obra EXE em `pipeline/testes/exemplos/apoios_exe/` e o `apoios_esperado.json` são lidos pelos dois lados: `pipeline/testes/test_fvs_indice_apoios.py` (o pipeline) e `app/src/pc/apoios_pipeline.test.ts` (a conta do botão do app). Os dois têm que dar o mesmo arquivo. O exemplo tem viga que para antes da face do pilar, viga que só apoia em viga, pilar só de detalhe, laje e uma planta de armadura que tem que ser ignorada.
- **Conferido a mais, fora do repositório:** (1) o pipeline rodado na obra EXE do roteiro deu o mesmo arquivo que o botão do app tinha baixado no navegador; (2) nos pacotes da obra de verdade, a conta do app e a do pipeline deram o mesmo índice.
- **Obra de verdade:** o JSON ficou numa pasta fora do repositório, com um LEIA-ME. Só vigas: as lajes da obra são áreas desenhadas no app, que não estão nos pacotes (ver o limite abaixo).
- **Limite (resolvido na 7ª volta):** laje desenhada no app não entra no índice. Num PC sem as plantas, essas lajes não entram em residencial e não saem como "liberadas para concretar". Proposta (não feita): o índice levar também o centro de cada pilar e viga por pavimento; com o contorno da área, que já é sincronizado e é leve, o app acha os apoios da laje sem a planta.


### 6ª volta: o Avanço segue o verde novo da planta (24/11/2026, noite)
- **O que mudou:** desde o `13b4921` (achado #2, decisão do Nicolas), pilar, viga e laje só ficam verdes na planta com 90% da peça ou da área numa concretagem cadastrada no Concreto. O Avanço usava a regra antiga (ficha toda marcada = pronto) e por isso mostrava mais peças prontas do que a planta. Agora usa a mesma conta (`d.concretadas` da FVS, `concretadaDe`): **pronto = conferido e concretado**. A ficha toda marcada sem concretagem conta como "liberada para concretar". A linha embaixo dos indicadores explica isso, e o subtítulo dos indicadores de pilares e vigas separa "liberados p/ concretar" de "em andamento".
- **Concretagem:** "concretados" no gráfico e na tabela agora são os mesmos 90% da planta. A peça com caminhão abaixo de 90% não conta, e o resumo da Concretagem diz quantas são ("com caminhão abaixo de 90%"). Continua só leitura do Concreto, sem tabela nova.
- **Lajes liberadas:** a regra não mudou. O pilar ou a viga azul (ficha marcada, sem concretagem) conta como conferido para liberar a laje.
- **Arquivos:** `pc/avanco_dados.ts`, `pc/avanco.ts` (campo `parcial`, nome "Pronto (concretado)"), `pc/PaginaAvanco.tsx` e o teste novo `pc/avanco_dados.test.ts`.
- **Conferido** (Chrome, obra EXE do roteiro da 3ª volta, com um caminhão desenhado pela tela do Concreto em volta dos pilares do Residencial A no 1º pavimento): 4 de 24 pilares prontos, 11 liberados p/ concretar, 15,5 m³. Na 3ª volta eram 10 prontos, contados pela ficha. Residencial B com 0 concretado, em 1280 e 1920 px. `tsc`, `vitest` e `npm run build` passam. Prints em `versao_pc_2026-11-24_verde` (fora do git).
- **Decidido pelo Nicolas (25/11, "1 verde"):** "pronto" no Avanço é o verde da planta (conferido e concretado), como ficou. Não há mais dúvida aqui.

### 7ª volta: lajes desenhadas no app no índice de apoios, pelos centros (25/11/2026)
Decisão do Nicolas (25/11): "5 blz" (fazer a proposta da 6ª volta) e "4 unicos 2026 11 18" (o índice da obra sai da pasta de pacotes de 18/11).
- **O que é:** o índice ganhou a chave `centros`: por pavimento, a planta escolhida (a forma, a mesma dos apoios) e o centro de cada pilar e viga, pelo nome, em px da planta, arredondado ao inteiro. Formato: `"centros": {"2º Pavimento": {"planta": "<planta_id>", "pecas": {"P:P1": [x, y], "V:V1": [x, y]}}}`. Nome repetido no pavimento leva os centros um atrás do outro (`[x1, y1, x2, y2]`).
- **Como o app usa:** para cada área de laje desenhada (`fvs_areas`, que já é sincronizada e é leve), os pilares e as vigas com o centro dentro do contorno. É a regra da laje do pacote (`apoiosDoManifest`). Vale a forma do pavimento da área, como quando a planta da área não está no aparelho. A planta no aparelho continua passando na frente. Com um índice antigo, sem centros, a área continua avisando "sem a planta".
- **Arquivos:** `pipeline/fvs/indice_apoios.py` (`centros_dos_manifests`, `apoios_das_areas`, `conferir` dos centros), `pc/avanco.ts` (`centrosDasPlantas`, `lerCentrosDeApoios`, `apoiosDasAreasPeloIndice`), `pc/avanco_dados.ts`, `pc/PaginaAvanco.tsx`. O botão "Baixar índice de apoios" também grava os centros. **Sem migração e sem núcleo:** continua dentro de `apoios`, em `fvs_regras`.
- **Teste cruzado:** em `pipeline/testes/exemplos/apoios_exe/`, o `apoios_esperado.json` ganhou os centros. Entraram `areas_exe.json` (seis áreas: retângulos, uma em L, uma de pavimento sem centros e uma de 2 pontos) e `areas_esperado.json`. O pipeline (`test_fvs_indice_apoios.py`) e o app (`apoios_pipeline.test.ts`) têm que dar o mesmo resultado, e o app ainda confere o mesmo pela conta com a planta (`apoiosDaObra`).
- **Conferido na tela** (Chrome, obra EXE do roteiro, sem conta): duas lajes desenhadas no app, no 2º e no 3º pavimento. (1) Com as plantas: a tabela das lajes e o Residencial B. (2) Plantas apagadas e sem índice: as duas avisam "sem a planta". (3) Com o índice baixado do botão nas regras e sem planta: as mesmas linhas de (1), inclusive a "Laje desenhada B" no Residencial B. Prints em `versao_pc_2026-11-25_centros` (fora do git).
- **Obra de verdade** (fora do repositório, `indice_apoios_2026-11-25`, com LEIA-ME): o índice continua leve (os centros o deixam umas duas vezes maior; tamanhos no LEIA-ME). Nos pacotes reais, o app e o pipeline calculam os mesmos centros. Em 216 lajes de teste espalhadas pelas formas, 212 dão o mesmo que a planta. Nas 4 restantes, o centro de uma peça fica a menos de meio pixel da borda (é o arredondamento ao inteiro; uma laje desenhada à mão não chega a isso).
- **Publicar:** `PUBLICAR_SO_NO_SERVIDOR_DE_TESTES_apoios.sql`, na mesma pasta, para o SQL Editor do projeto de testes. Ele copia a linha de regras que vale e grava uma nova igual, com a chave `apoios` trocada. Para sem gravar nada se a obra não existir ou não tiver regras. Conferido num Postgres local de mentira. **Não publicado**; quem publica é o Professor.
- **Limites:** área desenhada numa revisão da forma com outro enquadramento sai deslocada até gerar o índice de novo. Peça renomeada na revisão sai até gerar de novo. Cada aparelho baixa a linha nova de regras uma vez (é leve).

### 8ª volta: página Qualidade, indicadores da qualidade (25/11/2026, ideia 6)

Aprovada pelo Nicolas no chat 29 (ideia 6). Página nova **Qualidade** no menu do escritório (entre o Avanço e os Relatórios), só leitura, só com o que a FVS e o Concreto já têm no aparelho. Sem tabela nova, sem migração. Contas em `app/src/pc/qualidade.ts` (com `qualidade.test.ts`, 13 testes), tela em `app/src/pc/PaginaQualidade.tsx`.

- Filtros: pavimento, De e Até (como nos Relatórios). Botão "PDF dos indicadores" (folha deitada com as seis tabelas), que serve como o PDF mensal da ideia 6: é só escolher o mês no De/Até.
- No topo, quatro números: itens conformes (%), NC abertas (com as faixas até 7 / 8 a 30 / mais de 30 dias), mediana de dias entre começar e liberar a ficha, concretagens com laudo.
- Tabelas com barra fina e ordenada (sem pizza): conformidade por ficha (pior primeiro) e por pavimento; NC abertas (mais antiga primeiro); começar até liberar por ficha (mais demorada primeiro) e fichas liberadas por semana (últimas 12); concretagens e laudos; andamento por apartamento.
- Regras das contas (decididas pelo jeito mais conservador, para o Nicolas conferir):
  - **Conformidade:** cada inspeção de item conta uma vez: a última marcação do item na peça, por ficha, ficha aberta e rodada. Corrigir não conta duas vezes; a reinspeção depois de um NC (outra rodada) conta. NA e marcação desfeita ficam fora. O item que o Concreto marca sozinho também fica fora. O período corta pela data da marcação.
  - **NC abertas:** a mesma lista da tela de reprovações (último registro do item ainda NC). O período não corta: é a situação de hoje.
  - **Começar até liberar:** da primeira marcação da ficha na peça até a última marcação dos itens de antes da concretagem (ficha sem etapa de concretagem: a última marcação da ficha). Só conta ficha liberada ou liberada para concretar (regra do verde de 24/11).
  - **Laudo:** pela idade de controle (a maior, em geral 28 dias) de cada caminhão. Com laudo = todos os caminhões com resultado; abaixo do fck e atrasado (3 dias depois da data de romper) passam na frente. Concretagem de exemplo fica fora.
  - **Apartamento:** cômodos (tipo A da planta) agrupados como na tela da FVS (grupo do pacote da planta, ou o número antes do hífen).
- Conferido: vitest 1146 verde, build verde, tela no Chrome do PC em 1280 e 1920 com a obra EXE (cômodos com NC antiga, três concretagens: com laudo, aguardando e atrasado; filtros de pavimento e período). Tablet 768 e 1024 com toque: a versão PC não aparece e não há rolagem para o lado (a página só existe na versão PC).
- PDF conferido (25/11, pedido do Professor): o botão monta a folha na própria página e abre a tela de imprimir do Chrome ("Salvar como PDF"). Com De/Até de um mês, a folha diz o período e o nome sugerido do arquivo leva o mês (`Qualidade_EXE_Indicadores-da-qualidade-de-01-11-2026-a-30-11-2026_...`). Teste gerou o PDF de verdade: 2 páginas deitadas, as seis tabelas.
- Fica para depois (não pedido): "fck rompido × pedido" por concretagem já aparece como "menor exemplar" na tabela de laudos; um gráfico por mês só se o Nicolas pedir.
