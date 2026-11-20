# Front end: aparência e componentes comuns (frente 06)

Status em 20/11/2026: o menu foi refeito pelas heurísticas de Nielsen (pedido do Nicolas, aprovado pelo Professor) na branch `app/menu-heuristicas`, com commit local e esperando PR. Os testes de tela sem conta, os da Nova obra e os de unidade passam. Os testes com conta (telas e sincronização) só rodam no CI.

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

## Pendências
1. **Um estilo só para aviso, toast e tela vazia.**
   - As telas comuns já não têm cor solta.
   - As repetições estão em `fvs.css` e `concreto.css`.
   - Fica para quando as frentes 03 a 05 fecharem.
2. **Abas dos passos da Nova obra.** No celular elas quebram em duas linhas (`nova_obra.css`). Fica junto com o item 1.
3. **Projetos (#34):** a descrição nova já está em `modulos.ts`. Se o #34 mexer na mesma linha, fica com a descrição desta frente.

## Próximo passo
Uma barra comum em todas as telas, com "‹ Menu" à esquerda, inclusive na planta da FVS. Só depois que o #31 (topo da TelaPlanta, frente 02) entrar na main, e combinado com o Professor.

## Onde ficam os prints
Ficam fora do git, na pasta "Frontend" do PC do Nicolas: o levantamento de 18/11, os prints de `menu_pr1`, `menu_ifc_doc_2026-11-20` e `menu_heuristicas_2026-11-20` (com a proposta).
