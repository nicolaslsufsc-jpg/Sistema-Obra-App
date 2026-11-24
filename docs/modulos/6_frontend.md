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
