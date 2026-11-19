# Front end: aparência e componentes comuns (frente 06)

Status em 19/11/2026: o PR #9 está aberto e vai entrar junto com o CI do PR #8.

**O que esta frente cuida:** casca do app, menu, entrada, tema (escuro e modo sol), estilos comuns em `app/src/style.css` e `app/src/tema.css`, e a regra de 375 px e tablet.
- Cada tela de módulo nasce e muda na frente do próprio módulo. A 06 só aponta o problema para a frente dona.
- O texto das telas de entrada (`Entrar.tsx`, `Codigo.tsx`, `Obras.tsx`) é da 07 · LOGIN. O estilo dessas telas é da 06.

## Feito
- **#59, tema:** todas as cores passam por `tema.css`. O escuro é o padrão, e o "Modo sol (claro)" fica no menu e é lembrado pelo aparelho.
- **#61, tela inicial:** cópia de segurança e dados do aparelho ficam num bloco recolhido.
- **#9:**
  - menu mais curto no celular: o tema fica na linha do nome da obra, e os cartões dos módulos ficam mais baixos;
  - os pavimentos aparecem em etiquetas;
  - o botão principal desativado fica cinza;
  - o cartão que começa por um título não tem mais espaço vazio no topo;
  - teste de tela "telas comuns", que confere entrada, Nova obra, menu e menu com a cópia aberta, nos dois temas, em 375, 768 e 1024 px. Ele exige contraste de 4,5:1 ou mais, toque de 44 px ou mais, nenhuma rolagem para o lado e nenhum erro na página.

## Pendências
1. **Um estilo só para aviso, toast e tela vazia.**
   - As telas comuns já não têm cor solta.
   - As repetições estão em `fvs.css` e `concreto.css`.
   - Fica para quando as frentes 03 a 05 fecharem.
2. **Abas dos passos da Nova obra.** No celular elas quebram em duas linhas (`nova_obra.css`). Fica junto com o item 1.
3. **Bloco "Este aparelho".** "Código do aparelho" e "Dados protegidos contra limpeza automática" são termos técnicos. Avaliar se passam para um "Detalhes". Está em `Menu.tsx`, que é tela comum.

## Próximo passo
Revisar, em 375 px e no tablet, os PRs que chegarem das outras frentes.

## Onde ficam os prints
Ficam fora do git, na pasta "Frontend" do PC do Nicolas: o levantamento de 18/11 e os prints de `menu_pr1`.
