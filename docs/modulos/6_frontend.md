# Front end: aparência e componentes comuns (frente 06)

Status em 21/11/2026: o menu refeito pelas heurísticas (#38) e a faixa "Instale o app" (#41) estão na main. Na branch `app/projetos-com-conta`, com commit local, o Projetos aparece no menu também com conta. Ela só sobe depois que o #44 (lista de distribuição no servidor) entrar. Na branch `app/fvs-navegacao`, com commit local, a FVS abre em 3 níveis: pavimento, disciplina e opção.

**O que esta frente cuida:** casca do app, menu, entrada, tema (escuro e modo sol), estilos comuns em `app/src/style.css` e `app/src/tema.css`, e a regra de 375 px e tablet.
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
Ficam fora do git, na pasta "Frontend" do PC do Nicolas: o levantamento de 18/11, os prints de `menu_pr1`, `menu_ifc_doc_2026-11-20` e `menu_heuristicas_2026-11-20` (com a proposta) e `fvs_niveis_2026-11-21` (os 3 níveis da FVS em 375 px e tablet).
