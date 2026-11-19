# Nova obra: montar uma obra sem o Nicolas

Status: **proposta (fase 1), sem código.** Escrita em 09/11/2026. Nada aqui foi decidido: espera o ok do Nicolas.

Objetivo: outra pessoa (engenheiro, estagiário, técnico de outra obra ou de outra empresa) monta o pacote de uma obra nova sozinha, sem Python, sem AutoCAD e sem JSON feito à mão.

Fora desta proposta: o módulo Projetos (revisões) e a integração com o Construpoint (vai virar um "galho" removível, em outro chat).

---

## 1. Como é hoje (passo a passo)

Legenda: **[PC]** depende do PC do Nicolas (Python com bibliotecas, AutoCAD, pastas dele). **[PROJ]** depende do jeito da projetista da obra piloto. **[MÃO]** arquivo feito à mão.

| # | Passo | Como se faz hoje | Depende de |
|---|---|---|---|
| 1 | **Baixar as pranchas** de forma, pilares e vigas | À mão, do sistema de projetos, numa pasta `Formas/`, `Pilares/`, `Vigas/`. O nome do arquivo tem que estar no código `OBRA.ES.LO.129.FOR3PAVTIP-R03`, e `Formas/indice.csv` traz o título de cada prancha ("... TRECHO 1"). | [MÃO] [PROJ] |
| 2 | **Separar por pavimento** (`montar_pavimentos.py`) | Uma lista fixa no código diz que "PILOTIS" é o Pilotis, "3PAVTIP" é o 3º etc., na ordem da obra piloto. Regra LO > EX e maior RXX. Trecho tirado do título. Carimbo "Planta: ..." lido para pilares que passam por dois pavimentos. Sai um `pavimento.json` por pavimento. | [PC] [PROJ] |
| 3 | **(Opcional) Plotar o DWG** (`plotar_dwg.py`) | AutoCAD do PC (accoreconsole) plota o Model inteiro num PDF. | [PC] AutoCAD |
| 4 | **Ler as peças** (`publicar_planta.py --so-gerar --folha-unica`, em cima do leitor do `gerador_fvs.py` legado) | Python com `pymupdf`, `numpy`, `scipy`, `pillow`. O leitor só funciona se o PDF tiver: camada `PILAR_CONCRETO` (contorno do pilar) e `VIG_FACES` (faces da viga); nomes SHX exportados **como comentários** do PDF; pilar escrito `P12` com a seção `(20x50)` logo abaixo; viga `V 132` com `a: 14/50`; viga até 70 cm; laje com `h=12+5`; camadas `TABELAS`, `SELO`, `QUADRO_PILAR`, `CORTE_LINHAS_DA_TABELA_DE_DETALHE` nos detalhamentos. | [PC] [PROJ] forte |
| 5 | **Juntar as pranchas numa folha só** (`folha_unica.py`) | Encaixa as janelas de cada prancha pelas peças que aparecem em mais de uma (desloca e corrige escala). Gera os tiles WebP da planta. | [PC] |
| 6 | **Detalhes de pilar e viga** (imagem do detalhamento e tabela de aço) | Lidos das pranchas de pilares e vigas pelas camadas e pelos nomes. Opcional para o app: peça sem detalhe funciona. | [PC] [PROJ] forte |
| 7 | **Ambientes** (`ambientes.py`, parado desde 05/11) | IFC da arquitetura + `ifcopenshell` + `shapely`, uns 6 min por andar, casando paredes do IFC com o PDF. Rótulo do apartamento no padrão da obra piloto. | [PC] [PROJ] |
| 8 | **Fichas** | JSON feito à mão no formato do legado (`{"P": {...}, "V": {...}}`), ou lido da tela do Construpoint. `aplica_a` (P, V, L, A) passado por parâmetro. A etapa de concretagem é achada pelo **nome** da etapa ("CONCRET" sem "ANTES"). | [MÃO] [PC] |
| 9 | **Histórico** (`importar_construpoint.py`) | Relatórios salvos do Construpoint. Fora desta proposta (galho). Obra nova começa sem histórico. | [PC] |
| 10 | **Montar o pacote** (`bancada.py` / `exportar_bancada.py` / `compactar_pacote.py`) | Junta `indice.json` (obra, pavimentos, peças, plantas), `fichas.json`, `historico.json` e um `manifest.json` + `pacote.bin` por planta num `.zip`. | [PC] |
| 11 | **Levar ao tablet** | O `.zip` vai em mãos (ou arquivo), e o app abre pelo botão "Abrir pacote da obra (.zip)". | — (já funciona sem o Nicolas) |

Outros pontos presos à obra piloto, dentro do app:
- **Escala 1:50 fixa** na conta de m² das áreas de laje (`app/src/fvs/areas.ts`). Obra com forma em 1:75 dá metragem errada.
- **Lista de pavimentos e nomes** só saem do passo 2; não há tela para cadastrar ou mudar a ordem.
- **Código da obra** sai do `indice.json` gerado pelo script; não há tela para criar a obra (a "Nova obra" saiu do app em 07/11).

**Resumo:** o que já é genérico é o **formato do pacote** e o **app de campo** (abre qualquer `.zip` nesse formato). Tudo antes do `.zip` depende do PC do Nicolas, e a leitura das peças (passos 4 e 6) depende do jeito de desenhar da projetista da obra piloto.

---

## 2. Proposta: assistente "Nova obra"

### Opções

| | A. Kit do PC melhorado | **B. Assistente dentro do app (recomendada)** | C. Leitura no servidor |
|---|---|---|---|
| O que é | Os scripts Python viram um programa `.exe` com janelas simples; fichas por planilha; "perfil da projetista" num arquivo | Telas novas no próprio app: sobe os PDFs, o app lê no navegador, a pessoa confere e corrige, sai o `.zip` | O app manda os PDFs ao servidor, que lê e devolve as peças |
| Instala algo? | Sim (o `.exe`; antivírus/TI pode barrar) | Não: só o Chrome | Não |
| Precisa de internet? | Não | Não | Sim, para ler |
| Projetista diferente | Editar arquivo de perfil (ainda técnico) | Ensina a leitura com toques na planta | Igual à B, mas no servidor |
| Conferir e corrigir peças | Fora do programa, depois, no app | Na mesma tela, antes de gerar o pacote | Na tela do app |
| Prazo | ~1 semana | ~3 a 4 semanas | B + infraestrutura e custo; o servidor está parado até o ok da empresa |
| Risco | Continua "programa de PC do Nicolas" | Reescrever o leitor em TypeScript (há gabarito: o Python e a obra piloto) | Limite de tempo das funções do Supabase; custo mensal |

**Recomendação: B**, com o Python guardado como gabarito (para comparar o resultado) e como caminho do Nicolas enquanto o assistente não estiver pronto. C pode vir depois, reaproveitando o mesmo leitor, se ler no tablet for lento demais.

Isso muda a arquitetura (`docs/01_ARQUITETURA.md` diz que a leitura das pranchas é da "Estação no PC", em Python). **Precisa do ok do Nicolas.**

### Como fica para quem monta a obra (B)

Menu sem conta > **Nova obra**. Cinco passos, cada um salvo no aparelho (dá para parar e voltar):

1. **Obra:** código (ex. `EX2`), nome, empresa. Gera o id fixo pelo código, como hoje.
2. **Pavimentos:** lista com nome e ordem (arrastar para ordenar). Atalho "Subsolo, Térreo, 1º ... Nº, Cobertura" para preencher rápido.
3. **Plantas:** para cada pavimento, sobe um ou mais PDFs de forma. O app mostra a folha, a pessoa marca a **janela** (o desenho, sem carimbo e notas) e a **escala** (1:50, 1:75, 1:100; o app tenta ler do carimbo e pergunta). Mais de uma prancha no pavimento: o app junta numa folha só (encaixe pelas peças repetidas, como o `folha_unica.py`) e mostra o resultado para conferir.
4. **Peças:** o app lê pilares e vigas e mostra tudo colorido na planta, com a lista ao lado: achadas, **sem contorno**, **nome repetido**, **estranhas** (ex. "V40" que é painel de laje). A pessoa toca para corrigir: renomear, apagar, juntar, desenhar o contorno à mão, criar peça que faltou tocando no nome. Se a leitura automática não achar nada (projetista diferente), o app pede para **ensinar**: "toque num pilar", "toque numa viga". Com dois ou três toques ele descobre a camada, o jeito de escrever o nome e onde fica a seção, e lê de novo. Esse jeito fica guardado como **perfil da projetista** (dado, não código), reaproveitado na próxima obra dela. PDF sem camadas ou escaneado: só o modo manual (tocar nos nomes ou desenhar), que já resolve.
5. **Fichas:** editor na tela: código, título, revisão, a que se aplica (pilar, viga, laje, ambiente), itens (etapa, título, descrição, dispositivo, tolerância). **Colar do Excel** (copiar as colunas da planilha da empresa e colar) para não digitar item por item. A pessoa marca qual etapa é a **concretagem** (hoje o app adivinha pelo nome da etapa). Copiar ficha de outra obra.

No fim: **Conferir e salvar** mostra o resumo (pavimentos, peças por pavimento, fichas, MB) e gera o `.zip` no formato de hoje. O mesmo `.zip` abre em qualquer tablet pelo "Abrir pacote da obra (.zip)", sem mudar nada no campo. Quando o servidor voltar: botão **Publicar** em vez do `.zip`.

Detalhes de pilar e viga (passo 6 de hoje) ficam para uma etapa à parte: a peça funciona sem eles. Ambientes (passo 7) continuam parados, como decidido em 05/11.

### O que roda onde

| Onde | O quê |
|---|---|
| **Tablet ou celular** | Criar obra, pavimentos e fichas; conferir e corrigir peças; abrir o `.zip`. Ler PDF grande funciona, mas pode ser lento e pesado de memória: medir no Android antes de prometer. |
| **PC (só o Chrome, qualquer PC)** | Recomendado para os passos 3 e 4: subir os PDFs, ler as peças, gerar os tiles da planta. Nada instalado. |
| **Servidor** | Nada obrigatório. Depois: guardar e distribuir o pacote (Publicar), e opcionalmente a leitura (opção C). |
| **PC do Nicolas (Python, AutoCAD)** | Só gabarito e caminho alternativo (DWG). Não é mais passagem obrigatória. |

### Como o app lê o PDF

- **pdf.js** (licença Apache, livre para usar no app): dá os textos com posição, os comentários (onde ficam os nomes SHX do AutoCAD), as camadas do PDF e os traços, e desenha a página para gerar os tiles WebP.
- Não usar o MuPDF no app: o Python usa o PyMuPDF só no PC do Nicolas, mas a licença dele (AGPL) obrigaria a abrir o código do app ao distribuir.
- DWG direto no navegador: não. Pedir à projetista o PDF exportado **com camadas** (é uma opção do AutoCAD/Eberick na hora de plotar). O assistente avisa quando o PDF vem sem camadas.

### Pedidos ao núcleo (só com o ok do Nicolas)

1. Tela "Nova obra" no modo sem conta (a casca e `local.ts` são do núcleo).
2. Escala por planta no pacote (`manifest.json` ganha `escala`), e o app usa ela na conta de m² em vez do 1:50 fixo. Pacote antigo sem o campo continua 1:50.
3. `etapa_concretagem` (opcional) na ficha: quando vier, vale ela; sem ela, o app continua adivinhando pelo nome.

Os três são acréscimos: pacote e fichas de hoje continuam abrindo.

---

## 3. Etapas, prazo e testes

Prazo em dias de trabalho de sessão; cada etapa é um PR pequeno, revisado pelo Nicolas antes da próxima. Com as revisões, umas **4 semanas de calendário** até a etapa 5.

| Etapa | O que entrega | Dias | Já serve para |
|---|---|---|---|
| 0. Obra fictícia 2 | Gerador (fora do app) de uma "Obra Exemplo 2" de **outra projetista inventada**: PDFs com camadas de nomes diferentes (`PILARES`, `VIGAS`), nomes `P-12` e `VT3`, seção ao lado do nome, textos normais (não comentários), escala 1:75, dois pavimentos, um deles em duas pranchas com sobra. Mais um PDF sem camadas e um "escaneado". Fica nos testes do repositório (é fictícia). | 1 | Medir tudo o que vem depois |
| 1. Cadastro pela tela | Nova obra, pavimentos, editor de fichas com colar do Excel, etapa de concretagem, salvar `.zip` (ainda sem planta). | 2–3 | Fichas e pavimentos sem JSON |
| 2. Planta do PDF + peças à mão | Subir PDF, escolher janela e escala, gerar tiles no navegador; criar peça tocando no nome ou desenhando. `.zip` completo. | 3–4 | **Qualquer obra, qualquer projetista**, mesmo PDF escaneado (com mais trabalho manual) |
| 3. Leitura automática + conferência | Leitor em TypeScript (porte do `estrutura.py`/legado), perfil da projetista ensinado por toques, tela de conferência com as listas de problemas. | 4–5 | Obra grande em minutos, não horas |
| 4. Várias pranchas no pavimento | Folha única no navegador (porte do `folha_unica.py`). | 2–3 | Pavimentos divididos em trechos |
| 5. Detalhes de pilar e viga | Recorte do detalhamento por toque e, com o perfil, automático. | 2–3 | O painel da peça com o detalhe, como hoje |
| 6. Publicar no servidor | Quando o servidor voltar a ser usado e com os pedidos ao núcleo aprovados. | 2 | Sem `.zip` em mãos |

**Recomendação de corte:** as etapas 0 a 2 (~1,5 semana) já tiram o Nicolas do caminho para qualquer obra, com trabalho manual nas peças. A 3 é a que faz valer a pena numa obra grande.

### O que testar com a segunda obra fictícia

1. **Do zero, sem o Nicolas:** alguém que não conhece o código monta a Obra Exemplo 2 só com as telas e um papel de instruções de uma página. Anotar onde travou.
2. **Leitura com outra projetista:** com o perfil ensinado (até 3 toques), achar todas as peças da obra fictícia, sem peça a mais. Sem ensinar, o app tem que avisar "não achei peças, me ensine", e não gerar planta vazia calada.
3. **PDF sem camadas e escaneado:** o modo manual monta a obra inteira.
4. **Escala 1:75:** a área de laje desenhada dá o m² certo (hoje daria errado).
5. **Duas pranchas no mesmo pavimento:** encaixe certo, sem peça duplicada na emenda.
6. **Fichas coladas do Excel:** mesmos itens, etapas e acentos; a etapa de concretagem marcada à mão deixa a peça azul na hora certa.
7. **Gabarito da obra piloto (fora do repositório, no PC do Nicolas):** o leitor novo tem que dar os mesmos números do Python: 4.348 peças nos 9 pavimentos, as mesmas 10 sem contorno. Diferença = defeito do porte.
8. **O `.zip` gerado abre no app de campo** igual ao de hoje (tablet e 375 px), e um `.zip` antigo continua abrindo.
9. **Android de verdade:** tempo e memória para ler um pavimento grande no tablet (para saber se o passo 4 pode ser feito na obra ou só no PC).
10. **Trava de nomes:** nada da obra piloto nos testes nem no build (`nomes_proibidos.txt`).

---

## Status

- 09/11/2026: proposta escrita (fase 1).
- **09/11/2026: opção B aprovada pelo Professor (com o Nicolas fora por 1 h); falta confirmar com o Nicolas.** Isso vale também para a mudança "leitura no navegador", que fica registrada só aqui: `docs/01_ARQUITETURA.md` e `02_CONTRATO_NUCLEO.md` não mudaram. O Professor liberou as etapas 0 e 1, com commits locais (sem push, PR nem migração).
- 09/11/2026: o Professor liberou a etapa 2 (PDF, janela, escala no manifest, tiles com pdf.js, peças à mão), sem mexer no `areas.ts`, no núcleo nem nos menus. Feita, só commit local.
- 09/11/2026: o Nicolas pediu mais uma rodada de melhorias e o Professor liberou a etapa 3 (leitura automática, perfil por toques, conferência). Antes, a branch da limpeza de nomes (commit df47b44: pasta `dados_obra/` e trava de nomes mais rígida) foi juntada nesta. Feita em 3 partes, só commits locais.

### Feito (branch `claude/app-nova-obra-dc37ae`, só commits locais)

**Etapa 0, Obra Exemplo 2** (`app/testes/obra_exemplo2.ts`): gerador em TypeScript, sem biblioteca. Não foi em Python porque o GitHub não tem PyMuPDF, e o leitor da etapa 3 vai rodar no navegador.
- Faz cinco PDFs da "projetista B": camadas `PILARES`, `VIGAS`, `TEXTO-PILARES`, `TEXTO-VIGAS`, `CARIMBO` e `FOLHA`; nomes `P-01` e `VT-01` com a seção ao lado, em texto normal; escala 1:75. O Tipo 1 vem em duas pranchas com uma fila de pilares repetida e deslocada. O Térreo vem também sem camadas e "escaneado" (só imagem).
- Junto vem o gabarito de cada peça e as fichas em TSV para colar.
- Conferido no PyMuPDF: nenhum aviso e as 6 camadas certas.
- Para ver os PDFs: `OBRA2_SAIDA=<pasta fora do repo> npx vitest run testes/obra_exemplo2.test.ts`.

**Etapa 1, cadastro pela tela** (`app/nova_obra.html` + `app/src/nova_obra/`):
- Página própria, em 4 passos: Obra, Pavimentos, Fichas e Salvar.
  - **Obra:** o código já sai no formato do banco.
  - **Pavimentos:** atalho que preenche a lista "Subsolo / Térreo / Nº / Cobertura"; dá para renomear, subir, descer e tirar. A lista aparece de cima para baixo, como no prédio.
  - **Fichas:** editor com **colar do Excel**. Com a linha de títulos, as colunas podem vir em qualquer ordem; célula mesclada repete a etapa de cima; texto com quebra de linha entre aspas funciona.
  - **Salvar:** mostra o que falta acertar (as mesmas regras do banco) e gera `obra_<CÓDIGO>_<data>.zip` com `indice.json` e `fichas.json`, sem planta.
- O rascunho fica no navegador: dá para fechar e voltar.
- **Etapa da concretagem:** o editor tem três escolhas: "descobrir pelo nome", "não tem concretagem" ou uma etapa da ficha. A escolha vai **nos itens** (`concretagem: true` nos itens da etapa e `false` nos outros), porque `itens` já é JSON livre no banco: não precisa de migração nem de mudar o núcleo. `itensAntesDaConcretagem` (`app/src/fvs/situacao.ts`) usa a marca quando ela existe. Ficha sem marca continua adivinhando pelo nome, como antes.
- **O .zip abre no app** pelo "Abrir pacote da obra (.zip)" de sempre. A FVS abre sem erro numa obra ainda sem planta.
- Um pacote antigo (sem `gerado_em` e sem a marca) continua abrindo igual (teste de unidade).
- `vite.config.ts` ganhou a segunda página, e `sem_dados_de_obra.ts` aceita `nova_obra.html`.

Testes: `src/nova_obra/modelo.test.ts` (11), `testes/obra_exemplo2.test.ts` (7) e `testes/nova_obra.e2e.test.ts` (tablet 1280 e celular 375: monta a obra, cola a ficha, salva, recarrega, abre o .zip no app e entra na FVS; confere que nada passa da largura da tela e que todo botão tem pelo menos 44 px). Na rodada de 09/11: build verde, 370 testes de unidade e 45 de tela (nova obra, app sem conta e bancada da FVS).

**Etapa 2, planta a partir do PDF e peças à mão** (liberada pelo Professor em 09/11; `src/nova_obra/pdf.ts`, `planta.ts`, `guardados.ts`, `TelaPlantas.tsx`):
- Novo passo **3. Plantas** (agora são 5 passos). Em cada pavimento: "+ PDF da planta". O PDF fica guardado no aparelho (IndexedDB), não vai para servidor nenhum.
- **pdf.js 6.4.299** (licença Apache), versão fixa pelo npm, sem CDN; o worker entra no cache do app (funciona sem internet). A 5.x tinha uma falha de segurança conhecida (GHSA-hq66-cqwq-w95j); a 6.4.299 sai com 0 alertas no `npm audit` de produção.
- **Escala:** o app lê do carimbo quando acha uma só ("ESCALA 1:75"); senão a pessoa escolhe. Vai para o `manifest.json` como campo novo `escala` (pacote antigo, sem o campo, continua abrindo).
- **Janela:** arrastar o dedo sobre a folha marca só o desenho (sem carimbo). "Folha inteira" volta.
- **Desenhar a planta:** gera os tiles no navegador, no mesmo formato do `folha_unica.py` (512 px, WebP, níveis até a folha caber em 1024 px, tile branco não entra). Tem "Parar".
- **Peças:** Pilar, Viga ou Laje e depois "Tocar no nome" (o app lê o texto do PDF: "P-01  20x50" vira nome P-01, seção 20x50) ou "Desenhar" (dois toques nos cantos; é o modo do PDF escaneado, que o app detecta e avisa). Cada peça abre um quadro para corrigir tipo, nome e seção, desenhar o contorno ou tirar.
- **Salvar:** o .zip leva `manifest.json` + `pacote.bin` de cada planta, no formato de hoje. A mesma peça em dois trechos do pavimento vira uma peça só. Abre no app e a FVS mostra a planta.
- Erro achado no teste de 375 px e corrigido: no celular, a folga do toque numa peça já marcada pegava o nome da vizinha. Agora a ordem é: peça exatamente embaixo do dedo, depois o texto mais perto, depois peça dentro da folga.

**Medida pedida pelo Professor** (prancha A1 pesada da Obra Exemplo 2: 1.500 pilares, ~2.900 vigas, ~4.400 textos e ~22.700 linhas de hachura; 375 px; CPU 4x mais lenta; Chrome do PC): em 3 rodadas, **3,9 a 4,6 s** no total e **180 a 205 MB** a mais somando todos os processos do Chrome (memória JavaScript da página: pico de 64 a 88 MB). Saem 98 imagens, 3,7 MB. Bem abaixo do limite (1 min e 300 MB). Para repetir: `SO_MEDIR=1 ... npx vitest run testes/nova_obra_medida.e2e.test.ts`. Ressalva: é o PC freado, não um tablet de verdade.

Testes: `src/nova_obra/planta.test.ts` (10, inclusive o .zip com 2 plantas aberto pelo app e pela FVS) e `testes/nova_obra.e2e.test.ts` (tablet e 375 px: sobe o PDF do Térreo, confere a escala 1:75, marca a janela, desenha, toca em P-01, VT-01 e P-02, sobe o PDF escaneado no Tipo 1 e desenha P-101 à mão, salva, abre o .zip no app e vê os tiles na FVS). Na rodada de 09/11: build verde, 380 testes de unidade e 47 de tela (nova obra, app sem conta e bancada da FVS).

**Etapa 3, leitura automática e conferência** (`src/nova_obra/desenho.ts`, `leitor.ts`, `perfis.ts`; tela em `TelaPlantas.tsx`):
- **O que o app tira do PDF** (`desenho.ts`): textos (inclusive girados), comentários (onde ficam os nomes SHX do AutoCAD), traços com a camada de cada um e os nomes das camadas. É o que o PyMuPDF dá ao leitor do PC.
- **Leitor** (`leitor.ts`): porte do `gerador_fvs.py` (pilares, vigas, faixa entre as faces) e do `estrutura.py` (painel de laje "V40 + h=", viga larga, viga inclinada). O que lá é fixo da projetista da obra piloto virou **perfil da projetista** (dado): padrão do nome, camada dos contornos e das faces, onde fica a seção. As larguras de viga são convertidas pela escala; as distâncias entre nome e desenho são de papel e ficam iguais.
- **Na tela:** "Ler as peças sozinho" tenta os perfis conhecidos (os ensinados neste aparelho e o da obra piloto). Se nenhum acha peça: "Não achei peças nesta planta. Me ensine" e pede **2 toques**, no nome de um pilar e no de uma viga. Toque fora de nome pede o mesmo toque de novo. Um **3º toque** opcional ensina um nome escrito de outro jeito. O perfil fica guardado no aparelho (`nova_obra:perfis`) e lê sozinho as outras plantas da mesma projetista.
- Peça lida fica marcada; "ler de novo" troca só as lidas, e as marcadas ou corrigidas à mão ficam.
- **Conferência** embaixo da planta: parece nome mas não li, sem contorno, nome repetido (inclusive pilar em dois lugares), sem seção, e o que virou painel de laje. Tocar leva o mapa até a peça e abre; texto não lido vira peça.
- Com muitas peças e a planta afastada, só a peça escolhida mostra o nome (no celular os nomes se amontoavam).
- **pdf.js pelo build "legacy"**: o normal exige Chrome 140+ (usa `Uint8Array.toHex`) e quebraria em tablet com Chrome desatualizado. O legacy também roda nos testes do Node.

**Critério do Professor, Obra Exemplo 2:** sem ensinar, não acha nada e pede para ensinar. Ensinada com 2 toques, acha **todas** as peças do gabarito, sem peça a mais, com seção e contorno certos, nas 3 pranchas com camadas e na sem camadas. Escaneada: só o modo à mão.

**Gabarito da obra piloto** (fora do repositório, na pasta "Nova obra" ao lado dos pacotes da obra piloto no PC do Nicolas, com LEIA-ME): com o perfil da piloto, **as 5.080 peças das 49 pranchas saem iguais às do Python** (são as 4.348 dos 9 pavimentos, contando cada trecho), com nome, seção e contorno, e as mesmas 65 sem contorno. Leva uns 0,4 s por prancha no Node.

**Achado para o Nicolas decidir:** a regra do PC estende a viga para o vão seguinte quando o nome da próxima viga está longe do começo dele. Na Obra Exemplo 2 (uma viga por vão, nome no meio) isso fazia a viga invadir a vizinha. Fiz uma regra a mais, **"viga por vão"**: para no pilar se o vão seguinte tem o nome de outra viga na mesma fila de nomes. Ela fica ligada só nos perfis ensinados. No perfil da piloto fica desligada, porque mudaria o contorno de 75 vigas. Olhei 3 delas: na V18 o PC claramente erra (cobre a V17 inteira), na V209 erra pouco, e na V53 não dá para dizer pelo desenho. As imagens estão na pasta acima. Ligar ou não na piloto é decisão do Nicolas.

Testes: `src/nova_obra/leitor.test.ts` (8, com o pdf.js no Node: extração, sem ensinar, ensinado, sem camadas, escaneado, toque fora, janela e o perfil pronto numa prancha fictícia no jeito da piloto, com viga em pé, larga, inclinada e painel), `planta.test.ts` (+2: leitura aplicada e conferência) e `testes/nova_obra.e2e.test.ts` (+1 por tamanho: ensina no Térreo com 2 toques, o Tipo 1 sai lido sozinho, salva e confere o .zip; e a lista "Sem contorno" abre a peça). Na rodada de 09/11: build verde, 392 testes de unidade e 49 de tela (nova obra, app sem conta e bancada da FVS).

**Ajustes de 09/11 (Revisor e Testador):**
- **Limites do PDF** (`limites.ts`):
  - O PDF abre sem eval.
  - Imagem acima de 50 Mpx dentro do PDF é pulada, e se a planta sai em branco a tela explica.
  - Página acima de 14.400 pt de lado ou de 25 milhões de pt² (umas 3 A0) é recusada, com a medida em metros.
  - Arquivo acima de 200 MB não abre.
  - Os erros do pdf.js (senha, PDF inválido) aparecem em português.
- **Salvar avisa sem travar:** "N vigas sem ficha" (e pilares e lajes) e "N peças sem contorno".
- **Contorno na marcação à mão:** a peça marcada pelo nome ganha o contorno da leitura automática quando o perfil da projetista é conhecido.
- **Nomes pequenos na tela:** aparece uma dica com o tamanho em pixels e o botão "Aproximar". Os rótulos só aparecem com o texto acima de 7 px.
- **Trecho:** vem do título da prancha ("TRECHO B" vira "Trecho B").
- **Caixas de marcar:** alvo de 44 x 44 px.
- **"0 de 22 peças" no Térreo:** a 22ª peça é a laje que os exemplos do Relatórios (`semearExemplos`, chamado no `app.tsx`) criam em toda obra aberta. O .zip tem 21. Esses exemplos também põem diário, caminhões e relatórios de mentira numa obra de verdade.

### Pedidos ao chat da FVS (para o Nicolas aprovar)

1. **`app/src/fvs/areas.ts` usar `manifest.escala`.** Hoje a conta de m² usa 1:50 fixo (`METROS_POR_PONTO`, linha 95). Uma planta 1:75 montada pela Nova obra vai dar m² errado (1:75 dá 2,25 vezes a área de 1:50). Pedido: quando o manifest tiver `escala`, usar ela; sem o campo, continuar 1:50. Não mexi: o Professor proibiu tocar no `areas.ts`.
2. O aviso "Nenhuma planta publicada... pelo PC (pipeline/fvs/publicar_planta.py)" apontar para a Nova obra.
3. `situacao.ts` ganhou 3 linhas na etapa 1 (a marca de concretagem): juntar com cuidado com a `app/fvs`.

### Pendências

1. **Botão "Nova obra" no menu sem conta e na tela de entrada (núcleo: `telas/Entrar.tsx` e `telas/Menu.tsx`).** Não foi mexido: pela regra do `CLAUDE.md`, o núcleo é do chat da `app/fvs` com o ok do Nicolas. Até lá, a página abre pelo endereço `/nova_obra.html`.
2. Celular e tablet de verdade (Android) ainda não testados: só o Chrome do PC em 375 px e 1280 px.
3. PDF escaneado com compressão JBIG2 ou JPEG 2000 pode precisar do módulo wasm do pdf.js, que ainda não está configurado. Os de teste usam JPEG comum.
4. Até o `areas.ts` mudar (pedido 1, agora com o chat da FVS), planta que não seja 1:50 dá m² errado na FVS.
5. Os perfis ensinados ficam só no aparelho onde foram ensinados (não vão no .zip nem para o servidor).
6. Regra "viga por vão" no perfil da obra piloto: decisão do Nicolas (ver o achado acima).
7. Nome de peça partido em dois textos no PDF (ex. "P" e "12" separados) ainda não é juntado pelo leitor; o Python também não junta.
8. **Exemplos do Relatórios em obra nova** (fora da Nova obra, `app.tsx` e `relatorios/exemplos.ts`): eles entram em toda obra aberta, inclusive numa obra montada pela Nova obra. Decisão do Nicolas: desligar para obra real ou deixar só para a demonstração.

**Próximo passo:** o Nicolas confirma a opção B, a mudança "leitura no navegador", os pedidos à FVS e a regra "viga por vão"; depois, a etapa 4 (várias pranchas no pavimento, folha única no navegador), se liberada.
