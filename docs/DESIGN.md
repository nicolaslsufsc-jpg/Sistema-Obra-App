# Guia de estilo do Sistema Obra

Este arquivo define o visual do app. Toda tela nova ou alterada segue estas regras. Se alguma regra entrar em conflito com um pedido, perguntar antes de mudar.

As variáveis de cor e de tamanho ficam em `app/src/tema.css` (paleta do app, desde 21/11/2026).

## Cores

Paleta do app:

| Uso | Nome | Código | Variável |
| --- | --- | --- | --- |
| Cabeçalho, textos principais, botão primário | Azul-marinho | #142332 | `--cor-marinho` |
| Destaques, aba selecionada, linha selecionada | Areia | #DDCCB7 | `--cor-areia` |
| Fundo das telas | Creme | #F9F3E3 | `--cor-creme` |
| Fundo de tabelas e campos | Branco | #FFFFFF | `--cor-branco` |
| Texto secundário | Cinza | #5B6470 | `--cor-cinza` |
| Linhas divisórias | Cinza claro | #D9D4CA | `--cor-cinza-claro` |

Cores de status (usar só para status, nunca para decorar):

| Status | Código | Variável |
| --- | --- | --- |
| Liberado / conforme | #2E7D32 | `--status-liberado` |
| Pendente / em análise | #C98A00 | `--status-pendente` |
| NC / reprovado / atrasado | #C62828 | `--status-nc` |
| Sem dado | #9AA0A6 | `--status-sem-dado` |

Tema claro é o padrão. Tema escuro fica como opção (ícone de lua no topo do menu).

**Planta da FVS:** as cores da planta são regra do módulo, decididas pelo Nicolas: cinza = pendente, laranja = em andamento, azul = liberado para concretar, verde = liberado, vermelho = NC. O verde, o vermelho e o cinza usam as cores de status acima; o azul e o laranja continuam com o mesmo sentido.

## Tipografia

- Fonte: a fonte do sistema.
- Tamanhos: título da tela 20 px, título de seção 16 px, texto e tabela 14 px, legenda 12 px (`--fs-titulo`, `--fs-secao`, `--fs-texto`, `--fs-legenda`).
- Letra base do app: 18 px (aprovado pelo Nicolas em 21/11/2026), porque as alturas de toque (44 px ou mais) dependem dela. Os tamanhos acima (texto e tabela em 14 px) valem nas tabelas e no cabeçalho comum.
- Números de volume, quantidade e data alinhados à direita nas tabelas, com fonte de largura fixa para números (tabular-nums).
- Unidade sempre no cabeçalho da coluna, por exemplo "Volume (m³)", e não repetida em cada linha.

## Layout

- Listas de pavimentos, concretagens, projetos e FVS viram tabela. Nada de um card por item.
- Uma tabela tem cabeçalho fixo, linhas separadas por linha fina e altura de linha de 40 px no mínimo (toque com luva no canteiro, `--linha-tabela`).
- Cantos arredondados de no máximo 4 px (`--raio-max`). Sombra só em menus e janelas que abrem por cima.
- Sem grade de cards com número grande (KPI). Resumo, quando precisar, vai numa linha só no topo da tabela, como "9 vigentes | 4 com revisão nova | 1 atrasado".
- A planta ocupa a tela inteira, com zoom por pinça. Legenda compacta fixa no canto, sempre visível.

## Cabeçalho

- Igual em todas as telas: botão voltar à esquerda (só a seta), nome da obra e do pavimento ou tela no centro, ações à direita.
- O texto do botão voltar é sempre o mesmo. Não alternar entre "Menu" e "Voltar".
- Título nunca cortado com reticências. Se não couber, quebrar em duas linhas.

## Textos

- Linguagem de canteiro, curta: "FVS pendente", "Lote 12", "Liberado para concretagem", "Revisão R03".
- Proibido: emoji, frase de boas-vindas, frase de marketing, parágrafo explicando como usar a tela.
- Ajuda vai num ícone "?" que abre um texto curto, ou na documentação. Nunca no meio da tela.
- Sem dado: mostrar "–" na célula. Não escrever "nenhuma concretagem".
- Datas no formato 20/11/2026. Volumes com uma casa decimal e vírgula: 25,5.
- Siglas da obra (NC, FVS, PC, RT) podem ser usadas sem explicar. Termos internos do app precisam virar algo que qualquer engenheiro entenda, como "Cópia desatualizada".

## Componentes

- Botão primário: fundo azul-marinho, texto creme. Botão secundário: borda azul-marinho, fundo transparente.
- Aba selecionada: fundo areia, texto azul-marinho.
- Campo de arquivo: sempre estilizado como botão "Importar planilha (.xlsx)" com o nome do arquivo ao lado. Nunca o campo padrão do navegador.
- Status em tabela: bolinha ou etiqueta com a cor de status e o texto ao lado. Cor sozinha não basta.
- Botão "Reportar": dentro do menu ou do cabeçalho. Não flutuando por cima do conteúdo.
- Ícones: um único conjunto, traço fino, mesmo tamanho em todo o app.

## Tela de referência: Concreto

Tabela de pavimentos:

| Pavimento | Concretagens | Caminhões | Volume (m³) | Status |
| --- | --- | --- | --- | --- |
| Pavimento pequeno | 1 | 3 | 25,5 | Em andamento |
| Pavimento grande | – | – | – | Sem dado |

Abaixo, seção "Ficha do dia" com a mesma lógica de tabela (data, concretagens, caminhões, volume) e o botão "Importar planilha (.xlsx)". Sem o parágrafo explicando a aba Rastreamento.

## Como aplicar

1. Criar um arquivo de tema com as cores e tamanhos acima como variáveis e trocar todas as cores fixas do código por essas variáveis.
2. Ajustar o cabeçalho comum e reaproveitar nos módulos.
3. Trocar cards por tabela, começando por Concreto e Projetos.
4. Revisar todos os textos da interface pela seção Textos.

As cores dos desenhos sobre a planta (caminhões, tipos de peça, marcações) são desenhadas pelo Leaflet, que não lê variável de CSS. Elas ficam no código do módulo, como paleta de dados, e não mudam com o tema.
