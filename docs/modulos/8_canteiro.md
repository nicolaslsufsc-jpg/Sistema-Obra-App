# Módulo 8: Mapa do canteiro

## Objetivo
Pedido do Nicolas em 26/11/2026: "uma planta que a pessoa tem figuras para poder posicionar elementos no canteiro de obra. É tipo mapa do canteiro de obra. Para a pessoa botar onde vai o caminhão, onde vai a caçamba de limpeza, onde está cada setor da obra... um quadro de canteiro de obra, só que no aplicativo... tem que ter umas imagens genéricas, tipo um caminhãozinho de concreto, caçamba de lixo, uma grua, betoneira".

É o quadro do canteiro dentro do app: uma folha (a planta do pavimento ou uma folha em branco) com figuras, caminhos e áreas que a pessoa coloca, arrasta, gira, aumenta, nomeia, duplica e apaga. Sai como imagem PNG ou PDF A4 para imprimir ou colar em relatório.

## Status (26/11/2026, segunda rodada): pronto na branch, sem push
Branch `claude/mapa-canteiro-911791`. A primeira versão (9ee4767) já está na `trabalho` (0aa0e50); a segunda rodada são commits locais em cima dela. Quem junta é o Professor.
- **No menu** do app de testes, com o selo "beta" (`app/src/modulos.ts`), com e sem conta.
- **Só no aparelho:** o mapa fica num banco próprio do navegador (`sistema-obra-canteiro`). Não vai para o servidor, não entra no "Salvar arquivo" (.obra) nem na sincronização. O núcleo não foi mexido, não há migração e o módulo não consulta servidor nenhum.
- **Não testado em tablet nem celular de verdade:** só no Chrome do PC, com toque e caneta simulados, em 375 x 700 e 768 x 1024.

## Como funciona
- **Folhas:** "Canteiro geral" (toda obra tem) e uma por pavimento cadastrado na obra.
- **Mapas (fases):** cada folha tem o "Mapa principal" e quantos outros a pessoa criar ("Fase estrutura", "Fase acabamento"). Botão **Mapas**: nome do mapa, **Novo mapa** (vazio), **Copiar este mapa** (leva as figuras para a fase seguinte) e **Apagar este mapa** (pede confirmação; o principal não some, fica vazio).
- **Fundo:** folha em branco com grade ou a planta do pavimento que a FVS já guardou no aparelho (mesma fonte que o Concreto usa, `fvs/plantas.ts`; só plantas de estrutura, uma por trecho). Trocar o fundo mantém as figuras no mesmo lugar relativo.
- **23 figuras** desenhadas em SVG para este app, sem ícone de terceiros (`figuras.ts`): caminhão betoneira, bomba de concreto, caçamba de entulho, grua, elevador de obra (guincho), betoneira, andaime, baia de areia, baia de brita, depósito de cimento, almoxarifado, escritório (container), vestiário / banheiro, refeitório, portão de acesso, tapume, extintor, ponto de água, quadro de energia, central de aço, central de fôrmas, área de descarga e setor (retângulo com o nome dentro).
- **Colocar e mexer:** toca na figura da paleta e toca na folha. Arrasta para mover. Na figura escolhida: a bolinha de cima gira (encaixa de 15 em 15 graus), o quadrado do canto muda o tamanho; embaixo ficam o nome, Apagar, girar 15° para cada lado, diminuir, aumentar, **Duplicar**, **Trazer para a frente** e **Mandar para trás**.
- **Caminho** (rota do caminhão, fluxo de pedestre): linha tracejada com seta no fim. Toca em **Caminho**, toca nos pontos na folha e toca em **Concluir** ("Voltar ponto" tira o último). Depois de pronto, cada ponto é uma bolinha que se arrasta.
- **Área** (setor, área de risco, estoque): polígono colorido e transparente, com o nome no alto. Mesmo jeito do caminho, com 3 pontos ou mais.
- **Cor** dos caminhos e áreas: 6 cores (laranja, azul, verde, vermelho, roxo, preto). O botão da bolinha colorida passa para a cor seguinte.
- **Ordem do desenho:** áreas e setores embaixo, caminhos no meio, figuras em cima. "Frente" e "trás" valem dentro do grupo (uma área nunca tampa uma figura).
- **Toque:** ganha a menor figura debaixo do dedo; depois o caminho pela linha; depois a figura mais perto (folga de 14 px); por último a área ou o setor.
- **Desfazer** volta um passo por vez (até 60). Dois dedos: zoom e arrasto da folha; botões +, − (em volta da figura escolhida) e "ver a folha inteira". No PC: roda do mouse, Delete, Ctrl+Z, Ctrl+D (duplicar), Enter (concluir o traçado) e Esc.
- **Guarda sozinho** a cada passo, sem botão de salvar e sem internet.
- **PNG:** `mapa_canteiro_<obra>_<folha>_<mapa>_<data>.png`, 2400 px de largura: título, o mapa e a **legenda** embaixo (uma linha por figura usada, com a quantidade, e uma por caminho ou área de cada cor e nome).
- **PDF A4 deitado:** uma página com título, obra, folha, mapa, data, o mapa (o maior que couber) e a legenda ao lado. Feito sem biblioteca (`pdfDeJpeg`): a prancha vira uma imagem dentro do PDF, então o texto não é selecionável.

## O que foi feito
### 26/11/2026, primeira versão (9ee4767)
Tela, 23 figuras, colocar, arrastar, girar, tamanho, renomear, apagar, desfazer, fundo com planta ou grade, banco próprio por obra e folha, PNG, testes e bancada.

### 26/11/2026, segunda rodada
Usei o módulo em 768 x 1024 e 375 x 700 com 13 figuras (capturas a cada passo) e consertei, um commit por conserto:
1. `03b9512` **Toque pegava a figura vizinha.** Extintor, ponto de água e quadro de energia juntos: o toque no extintor pegava o quadro, colocado por último. Agora ganha a menor figura debaixo do dedo.
2. `2f60f3e` **Zoom tirava a figura da tela.** O + ampliava o meio da folha. Agora o zoom dos botões é em volta da figura escolhida.
3. `f65ab00` **Nome ilegível no celular.** Com a folha inteira em 375 px o nome ficava com uns 5 px. Na tela o nome tem pelo menos 11 px (a imagem exportada continua proporcional).
4. `175e9f9` Botões de 42 px passaram a 44; no celular as ações ficam em duas filas (nome e Apagar; depois os botões) e no tablet numa só; as 25 figuras da paleta cabem em três filas no tablet; o nome da área fica no alto (no centro sumia atrás da figura). No mesmo commit as funções novas: caminho, área, cores, duplicar, ordem, mapas por fase, legenda e PDF A4.

## Decisões desta versão (minhas, para o Nicolas confirmar)
- **Medida da folha:** toda folha tem 1000 de largura e a altura segue a proporção do fundo. Não há escala em metros: a figura não tem o tamanho real do caminhão.
- **Um mapa é substituído inteiro a cada passo** (não é evento de inclusão como a FVS).
- **Figuras vistas de lado** (pictograma), não em planta: são mais fáceis de reconhecer num quadro.
- **Caminho e área por toques** (ponto a ponto), não à mão livre: sai reto e dá para ajustar cada ponto depois.
- **Cor por um botão que troca para a seguinte**, e não uma fila de seis: cabe no celular com alvo de 44 px.
- **O "Setor" da paleta continua** (retângulo rápido, gira e muda de tamanho); a **Área** é para forma livre e cor.
- **Camadas ligar/desligar não entraram:** ficou a ordem (frente / trás) e os mapas por fase. Se o Nicolas quiser esconder um grupo (só segurança, só logística), é o próximo passo natural.
- **Cores das figuras** ficam no SVG, não no tema: a folha é papel branco na tela, no tema escuro e na impressão.

## Arquivos
- `app/src/canteiro/`: `figuras.ts` (os desenhos), `logica.ts` (posicionar, mover, girar, tamanho, renomear, apagar, traçados, duplicar, ordem, desfazer, toque, zoom, legenda), `banco.ts` (banco próprio, mapas por folha), `fundo.ts` (planta em pedaços ou grade), `exportar.ts` (SVG do mapa, legenda, prancha, PNG e PDF), `canteiro.css`, `telas/ModuloCanteiro.tsx`.
- Fora da pasta do módulo (só na primeira versão; a segunda rodada não tocou em nada de fora): a linha e o tipo em `app/src/modulos.ts`, a lista em `app/src/modulos.test.ts`, o ícone do menu em `app/src/telas/icones.tsx` e a contagem de selos "beta" em `app/testes/local.e2e.test.ts` e `app/testes/telas.e2e.test.ts` (o `telas.e2e` precisa do servidor de teste e só roda no GitHub: não rodei aqui).
- Bancada: `app/dev/canteiro.html` e `canteiro.tsx` (obra fictícia EXE, dois pavimentos com planta de teste).

## Como testar
- `cd app && npm run build && npx vitest run` (unidade: `logica.test.ts`, `tracados.test.ts`, `banco.test.ts`, `exportar.test.ts`).
- Telas no Chrome: `SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/canteiro_bancada.e2e.test.ts` (dedo em 375 px, caneta em 768 x 1024, pinça, planta de fundo, caminho, área, duplicar, ordem, mapas por fase, PNG e PDF baixados e conferidos). Entra sozinho no `SO_E2E=1` do GitHub.
- Na mão: `cd app && npm run dev` e abrir `http://localhost:5173/dev/canteiro.html`.

## Sincronizar depois (proposta, nada feito)
Hoje dois aparelhos não veem o mesmo mapa. Para ver, seria preciso, com o ok do Nicolas e pela dona do núcleo (frente de sincronização):
1. **Migração** `canteiro_mapas`, a partir de `supabase/modelos/tabela_de_modulo.sql`: colunas obrigatórias do núcleo + `pavimento_id` (nulo = canteiro geral), `mapa_id` (uuid do mapa, o mesmo em todas as versões dele), `nome`, `fundo` (texto) e `itens` (jsonb com figuras, caminhos e áreas). Só inclusão, como as outras de campo: `select nucleo.preparar_tabela('public.canteiro_mapas', 'campo', 'nenhuma')`. Cada vez que a pessoa sai da tela (ou a cada X minutos), uma linha nova com o mapa inteiro; vale a mais nova por `mapa_id`; apagar um mapa = linha nova com `apagado`. Assim não há conflito e fica o histórico de como o canteiro mudou.
2. **App:** acrescentar a tabela em `app/src/nucleo/tabelas.ts` e em `BLOCOS_SINCRONIZADOS`; trocar `banco.ts` para gravar com `sincronizador.registrar()` e ler com `sincronizador.linhas()`; o banco próprio vira só rascunho entre um registro e outro.
3. **Teste SQL** `supabase/testes/testes_x_canteiro.sql`; o `.obra` passa a levar o mapa sozinho (ele salva a fila do núcleo).
Pergunta em aberto para essa etapa: dois aparelhos mexendo no mesmo mapa ao mesmo tempo. Com "vale a mais nova", o de quem saiu por último cobre o do outro.

## Próximo passo
1. O Nicolas testar no tablet de verdade (dedo e caneta) e dizer o que muda nas figuras, nos tamanhos e nas cores.
2. Decidir se sincroniza (proposta acima) antes de usar em obra com mais de um aparelho.

## Pendências
1. **Aparelho de verdade não testado** (toque com luva, caneta do tablet, baixar o PNG e o PDF no Android).
2. **O mapa não sai do aparelho:** não entra no .obra, no backup nem no servidor. Limpar os dados do navegador apaga o mapa. Trocar de pessoa no aparelho não apaga (o banco é do módulo, por obra).
3. **Sem escala em metros** e sem medir distância. Se for preciso (raio da grua, largura do portão), usar a escala da planta (`manifest.escala`) é o caminho.
4. Planta de arquitetura ou de implantação como fundo: hoje só entram as plantas de estrutura que a FVS entrega. Uma imagem escolhida pela pessoa (foto do terreno, implantação em PDF) como fundo fica para depois.
5. **PDF:** o texto vai como imagem (não dá para selecionar nem buscar). A legenda do A4 mostra até 23 linhas; o que passar vira "e mais N".
6. **Caminho e área:** não dá para acrescentar nem tirar um ponto depois de concluído (só arrastar os que existem); para mudar a forma, apagar e traçar de novo. Sem traço à mão livre e sem curva.
7. **Nomes que se cruzam:** duas figuras encostadas ficam com os nomes um em cima do outro. O app não afasta sozinho; a pessoa separa as figuras ou apaga um nome.
8. No celular em pé a folha fica pequena; com a pinça fica bom. Girar o aparelho ou usar o tablet resolve.
9. Faltam, se o Nicolas quiser: camadas ligar/desligar, texto solto sem figura, girar a área inteira, copiar um mapa de um pavimento para outro.
10. `docs/03_BACKLOG.md` e `docs/02_CONTRATO_NUCLEO.md` não foram mexidos (o item novo no backlog e a lista de módulos do menu são do Professor e do núcleo).
