# Módulo 3: Concreto

Branch: `app/concreto` (desde 08/11/2026: um chat só para o Concreto; núcleo e migrações pelo chat da FVS)

## Objetivo
Rastreabilidade do concreto por peça. Para cada concretagem: os caminhões (nota fiscal, volume, horários, slump, água, CPs moldados) e **onde cada caminhão foi**, desenhado na planta com a caneta do tablet. A partir do desenho o app gera o relatório das peças concretadas. Tocando no caminhão: os corpos de prova, as datas de rompimento e se o laudo está atrasado ou abaixo do fck.

## Decisões com o Nicolas (03/11/2026)
- **Local por peça, desenhado.** O Nicolas desenha na planta, com a caneta do tablet, a área que cada caminhão encheu. **Uma ou mais áreas por caminhão.** O app acha as peças dentro da área e gera o relatório (caminhão → peças e peça → caminhões).
- **Caneta e nada travando.** O traço segue a caneta sem atraso; o dedo continua arrastando e ampliando a planta; nada congela a tela.
- **Construpoint continua sendo o registro oficial** das fichas de rastreabilidade (Rastreabilidade > Painel de Controle). Na obra piloto, em 03/11: 145 Agendado, 2 Em Andamento, 56 Aguardando Laudo, 1 Aceito. O local da ficha lá é só o trecho ("Pilotis \ Trecho 2 \ Vigas", "Infra estrutura \ Residencial 1 \ Bloco P99"): a peça não existe no Construpoint, por isso o desenho.
- **Laudos: fonte a decidir depois** (Nicolas, 03/11). O portal da concreteira (sem https) não respondeu em 03/11 e os laudos não chegam no Gmail pessoal dele. O app guarda o resultado de cada CP com a origem (`manual`, `lado37`, `construpoint`): qualquer fonte preenche a mesma tabela.

## Decisões com o Nicolas (04/11/2026, confirmada em 07/11/2026)
- **Laje como peça: uma por trecho, marcada no toque, sem contorno.** A forma traz pilares e vigas como peças, mas não traz o contorno da laje (nem por cubeta). Por isso, numa concretagem de laje, a laje entra no relatório como uma peça por trecho ("Laje do Trecho 2"), marcada por toque. A área desenhada com a caneta continua valendo para pilares e vigas.
- **Quem cria a laje é a pessoa, no app** (Nicolas, 07/11: "as lajes a pessoa que vai criar"). A FVS não publica laje. O primeiro toque na laje de um trecho cria a peça em `elementos`; os toques seguintes usam a mesma.

## Decisões provisórias (minhas; a confirmar com o Nicolas)
- **Idades e CPs:** padrão 7 e 28 dias, 2 CPs por idade, por caminhão. Muda por concretagem.
- **Data de rompimento:** dia da concretagem + idade. Os horários do caminhão valem só pela hora (corrigir a data da concretagem leva os CPs junto).
- **Situação do CP de cada idade:**
  - `previsto`: a data ainda não chegou.
  - `rompe hoje`.
  - `aguardando laudo`: a data passou há até 3 dias e não há resultado.
  - `atrasado`: a data passou há mais de 3 dias e não há resultado.
  - `ok` / `abaixo do fck`: com resultado. O exemplar é o **maior** valor entre os CPs da mesma idade (NBR 5738 / NBR 12655). Só o de 28 dias é comparado com o fck; o de 7 dias é informativo.
- **Peça dentro da área:** o app mede quanto da peça ficou dentro do desenho. 90% ou mais = peça inteira; de 10% a 90% = **parcial** (o relatório avisa); menos de 10% = ignorada (traço de raspão). Um toque com o dedo numa peça inclui ou tira a peça do caminhão (correção manual, vale mais que o desenho).

## Como funciona
1. **Concreto** no menu da obra > escolhe o pavimento > **Nova concretagem**: data, local (texto do sistema oficial), código da ficha no sistema oficial (o campo só aparece quando o pacote da obra tem `sistema_oficial`; ver [integracoes.md](integracoes.md)), fornecedor, fck, slump e tolerância, idades.
2. **Caminhões** da concretagem: **+ Caminhão** com sequência, NF, volume, horários (saída da usina, chegada, início e fim da descarga), slump medido, água adicionada, CPs moldados, observação. Funciona sem internet.
3. **Desenhar**: escolhe o caminhão e desenha com a caneta. Dedo arrasta e amplia. Cada caminhão tem uma cor.
   - **Duas canetas** (desde 07/11): **Pilares** (a área só pega pilares) e **Vigas e laje** (pega vigas e põe a laje junto). O app lembra a última escolhida.
   - Botões: **Desfazer** (a última área do caminhão na planta aberta) e **Apagar áreas** (todas do caminhão na planta aberta). Peça marcada no toque continua.
   - **Laje**: no painel do caminhão, o botão **Laje do Trecho N** (do trecho aberto) põe ou tira a laje daquele caminhão. Sem caminhão escolhido, o mesmo botão mostra os caminhões que foram na laje.
   - A área da caneta **Vigas e laje** põe a laje do trecho junto ("com a área"). Ela fica enquanto o caminhão tiver área dessa caneta no trecho: **Desfazer** e **Apagar áreas** tiram a laje junto com as vigas. A laje marcada no toque vale mais e não sai com a área.
   - **Sem caminhão escolhido:** vista **Mapa de concretagens** (uma cor por concretagem, nas peças e nas áreas; a área das vigas e laje é tracejada) ou **Laudos (CPs)** (cor da situação dos CPs). O toque numa peça mostra os caminhões dela.
4. **Relatório**: peças por caminhão e caminhões por peça, com % e aviso de parcial. A laje aparece depois dos pilares e vigas, sem %, com origem "toque" ou "desenho" (a que veio com a área). Copiar como CSV (Excel em português) e imprimir.
5. **Corpos de prova**: em cada caminhão, as idades com data e situação. Na lista do pavimento, os atrasados aparecem primeiro. Lançar resultado: digitado (por enquanto).

Sem internet tudo funciona (registro no aparelho, envio depois), lançar resultado de laudo inclusive. Lançar resultado é só para gestor e admin; no app local sem login a pessoa é admin (`nucleo/pacote_obra.ts`).

## Tabelas
Todas são **eventos só de inclusão** (`nucleo.preparar_tabela(..., 'nenhuma')`), como manda o contrato para o que é escrito em campo. Corrigir ou apagar = registrar uma linha nova com `substitui_id` apontando para a linha antiga (e `cancelado = true` para apagar). Vale a linha que ninguém substituiu. Se dois aparelhos corrigirem a mesma linha sem internet, vale a correção mais recente (hora do aparelho) e a outra fica no histórico.

| Tabela | Quem inclui | Colunas do módulo |
|---|---|---|
| `concretagens` | campo | pavimento_id, data, local_descricao, codigo_construpoint, fornecedor, fck_mpa, slump_cm, slump_tolerancia_cm, idades_dias, cps_por_idade, observacao, substitui_id, cancelado |
| `caminhoes` | campo | concretagem_id, sequencia, nota_fiscal, volume_m3, saida_usina, chegada_obra, inicio_descarga, fim_descarga, slump_medido_cm, agua_adicionada_l, cps_moldados, observacao, substitui_id, cancelado |
| `caminhao_areas` | campo | caminhao_id, planta_ref, contorno (lista de pontos x,y em pixels da planta, y para baixo), alvo (`pilares`/`vigas_laje`/vazio = todas, desde 07/11), substitui_id, cancelado |
| `caminhao_elementos` | campo | caminhao_id, elemento_id, origem (`desenho`/`manual`), fracao (0 a 1; vazia no toque e na laje que veio com a área), incluido (sim/não). Vale o último registro de cada par caminhão + peça. Gravado a partir do desenho, para o relatório e a FVS não precisarem da geometria. |
| `cp_resultados` | gestor | caminhao_id, idade_dias, numero_cp, data_ensaio, resistencia_mpa, origem (`manual`/`lado37`/`construpoint`), laudo_arquivo_id, substitui_id, cancelado |

**FVM (recebimento de materiais, desde 18/11, SEM MIGRAÇÃO ainda: só o app sem conta usa):**

| Tabela | Quem inclui | Colunas do módulo |
|---|---|---|
| `materiais_controlados` | gestor (importa a lista) | codigo, nome, unidade, estrutural, exige_ensaio, via (`concreto` = recebido pelo caminhão), itens (json: codigo, texto, valor {min, max}), documentos (json), ordem, substitui_id, cancelado |
| `recebimentos` | campo | material_codigo, material_nome, unidade, data, fornecedor, nota_fiscal, lote, quantidade, itens (json: a conferência, com cópia do texto), documentos (json: nome, veio), fotos (ids em `arquivos`), situacao (`liberado`/`liberado_ressalva`/`retido`/`devolvido`), motivo, observacao, liberado_por, liberado_em, substitui_id, cancelado |

As duas ficam **fora** da lista de sincronização do app (`TABELAS_FVM` em `concreto/tabelas.ts`, não em `TABELAS_CONCRETO`): não entram na baixa nem no envio do servidor. Elas são gravadas por um sincronizador próprio do FVM (`fvm_dados.ts`), que usa a mesma fila e o mesmo banco do aparelho, então entram no `.obra`, mas nunca baixa nada. **Com a migração**, passam para `TABELAS_CONCRETO` e o sincronizador próprio sai (pendência 11).

`planta_ref` guarda qual planta (e revisão) foi usada no desenho (regra da arquitetura: toda conferência guarda a revisão da prancha).

**Laje do trecho** (`app/src/concreto/lajes.ts`): é uma linha de `elementos` (tabela do núcleo), tipo `L`, que o app cria no primeiro toque. Não muda nenhuma tabela.
- Nome no banco sem espaço, como manda o contrato: `Laje_Trecho_2`. As telas, o relatório e o CSV mostram "Laje do Trecho 2". Planta que não se chama "Trecho N" fica "Laje (nome da planta)".
- O id é fixo para o pavimento e o trecho (UUID v5). Dois aparelhos sem internet que criam a mesma laje mandam o mesmo id, e o servidor guarda uma só. Em Python: `uuid.uuid5(UUID("6b0fc8e1-37dc-4d8b-a806-2564efba583b"), f"{pavimento_id}|L|{nome no banco}")`.
- Só gestor e admin criam (o banco só deixa eles cadastrarem peça). Quem é de campo marca a laje que já existe. Se ela ainda não foi criada naquele trecho, o botão fica desligado e avisa.
- A laje não tem contorno: não entra no cálculo do desenho nem na planta de teste. No caminhão:
  - marcada no botão: registro `manual` em `caminhao_elementos`, como o toque numa peça;
  - vinda com a área da caneta Vigas e laje (desde 08/11): registro `desenho` com `fracao` vazia (`pecas.ts`, `mudancaDaLajeDoDesenho`). Ela fica no caminhão enquanto houver área dessa caneta no trecho. Laje que entrou com a área antes de 08/11 ficou gravada como `manual` e só sai no toque.

## Planta (pacote da FVS)
**Hoje (app local, desde 07/11):** as plantas da obra piloto vêm da pasta `dados_obra`, o mesmo pacote que a FVS usa (`nucleo/pacote_obra.ts` põe as plantas no aparelho; o Concreto lê pela `fontePlantasFvs`). É **uma folha por pavimento** (folha única, PR #22), com o trecho "Planta inteira". Conferido em 08/11 no mapa do Pilotis. Consequência: a laje virou uma só por pavimento, "Laje (Planta inteira)" (pendência 3).

Como foi pensado em 04/11 (continua valendo no código para pavimento com mais de uma planta):

O desenho usa o pacote de planta da FVS. Combinado com a sessão FVS em 04/11: o gerador é dela (branch `modulo/fvs`, `pipeline/fvs/` e `app/src/fvs/pacote.ts`). **Um pacote por trecho**, porque cada prancha de forma tem o próprio sistema de coordenadas. O pacote traz os tiles e o contorno de cada peça, com o `id` de `elementos`, no formato do HTML legado (`pipeline/legado/modelo_app.html`: pixels, y para baixo, `polys` por peça).
- No app (`app/src/concreto/planta.ts`), `carregarPlantas()` junta as "fontes de plantas" registradas com `registrarFonteDePlantas`. A da FVS (`fontePlantasFvs`, `app/src/fvs/plantas.ts`) é registrada em `telas/ModuloConcreto.tsx`, que só carrega quando o módulo abre. Só vem o trecho que já está no aparelho: quem baixa é a tela inicial da FVS. Sem planta de verdade, a obra TESTE usa uma planta esquemática e as outras obras mostram a lista de peças.
- O mapa deixa escolher o trecho e abre no trecho da última área do caminhão.
- `caminhao_areas.planta_ref` guarda `"<id da planta>@<revisão>"`. Por isso:
  - cada área só aparece e só conta peças na planta dela;
  - pilar da emenda (que está nos dois trechos) fica com a maior fração;
  - Desfazer e Apagar áreas valem só para a planta aberta;
  - área desenhada numa revisão anterior da mesma planta aparece com aviso.
- Sem planta, mas com peças cadastradas: as peças são marcadas por lista.

**Formas baixadas do Autodoc** (04/11/2026, só leitura, sem plotar nada). Ficam fora do repositório; cada pasta tem um `indice.csv` (código, etapa, revisão, título, tamanho, sha256).
- `(pasta da obra piloto, fora do repositório)\Estrutura\Formas`: 49 PDFs vigentes (regra LO > EX):
  - Subsolo LO R14 (6 trechos), Térreo Comercial LO R01 (6), Pilotis LO R02 (6), Mezanino LO R00 (6);
  - 2º LO R02 (5), 3º LO R03 (5), 4º **EX R02** (5), 5º EX R01 (5), 6º EX R01 (5).
- `(pasta da obra piloto, fora do repositório)\Fundacao\Plantas`: planta de fundação EXE.FU.LO.004 a 009 R11 e níveis dos blocos 014 R06, para as concretagens de blocos da infraestrutura.
- O que faltou:
  - 4º LO R01 e Cobertura EX R01 estão "Em Análise", e o Autodoc não deixa baixar nesse estado. Por isso o 4º foi na EX R02.
  - O Barrilete não tem forma.
  - A prancha EXE.ES.EX.145 (6º, trecho 2 no Autodoc) diz "TRECHO 1" no carimbo.
- Os caminhos foram passados à sessão FVS (gerador de planta). Como baixar de novo: a memória de como baixar as formas (fora do repositório).

## Ligações
- Item 13 da ficha de viga e item 18 da ficha de pilar (controle de concreto e rastreabilidade, procedimento de concreto da empresa): o item marcado com `rastreio_concreto: true` na ficha (dado da obra) fica C quando a peça tem caminhão. **Rastreio na FVS (19/11/2026):** o lado do Concreto está em `concreto/rastreio.ts`. Ele tem `caminhoesDasPecas(obraId)`, que devolve os caminhões de cada pilar e viga em ordem de data e sequência e lê o banco do aparelho, sem cache, e `situacaoDoRastreio`, uma regra pura. Ficam de fora o caminhão e a concretagem cancelados, o EXEMPLO e a laje (por enquanto). Peça com caminhão fica C. A peça parcial fica C com aviso só quando a soma das frações não fecha a peça; incluída à mão vale inteira. Caminhão sem NF conta C. Sem caminhão fica pendente, nunca NC. Tudo é só calculado e nada é gravado na FVS. O texto da tela e a ligação na ficha são da FVS (03 · FVS-EST). Decisões do Nicolas: 18/11 e 19/11/2026.
- Skill `rastreabilidade-concreto-construpoint` (conta do Nicolas): foto da ficha de papel concreteira → Construpoint → ficha de concreto. Campos da ficha de papel: Seq, Betoneira, Volume, NF, Fck, Faixa de abatimento, Lacre, Água (L), Aditivo, Saída central, Chegada obra, Início descarga, Fim descarga, Slump, Flow.

## Depende de
Núcleo (sincronização, `pavimentos`, `elementos`). FVS entrega 1 (pacote de planta) para desenhar em obra de verdade.

## Status
Atualizado em 18/11/2026, conferido no `git log` da `main` (1323092) e no código.
- **Tudo do Concreto está na `main`.** Não há branch do módulo com trabalho fora dela; a `app/concreto` foi levada à `main` em 18/11 (o WIP antigo do laudo, já substituído, ficou só na tag local `guardado/wip-laudo-antigo`).
- **Entraram desde 09/11:** #44 (laudo com vários CPs e validação dos números), #52 (data de ensaio no futuro ou antes da moldagem), #56 (sem conta, sem aviso "esperando envio"), #66 (dicas de Nova concretagem sem nome de sistema), #39 (faixa "só neste aparelho · Salvar" e caminhões numa linha no celular), exemplos da demo com 5 concretagens (0dfb81e) e #71 (planta preta ao desenhar a área no PC).
- **Migrações no servidor de São Paulo:** `20261103230000_concreto.sql` e `20261107210000_concreto_caneta.sql` (`caminhao_areas.alvo`), aplicada em 08/11/2026. Nenhuma migração nova do Concreto desde então.
- **Demo de 17/11:** o Concreto foi mostrado aos chefes no app sem conta, com os exemplos.
- **Testes de 18/11 neste PC:** build, `npx vitest run` (582 passaram) e a bancada do Concreto mais o app sem conta no Chrome (47 passaram).
- **FVM** (recebimento de materiais controlados, dentro do Concreto): proposta de 14/11 fora do repositório (`09_ESTAGIO\PBQP-H\fvm_proposta.md`). Telas feitas em 18/11 (commit local na `app/concreto`, sem push), **só no app sem conta e sem migração**, com as recomendações da proposta nas 5 decisões, que o Nicolas ainda confirma (Perguntas ao Nicolas).
- **Commits locais de 18/11 (sem push):** doc do módulo, PDF do laudo e FVM.
- **Não testado:** no tablet de verdade (pendência 1).

## Feito
**18/11/2026, Reportar problema, versão sem servidor** (branch `concreto/reportar-problema`, da `main` aa7e1e7; commit local, sem push; o merge espera a sincronização sólida):
- Botão "Reportar" fixo embaixo, à esquerda, em todas as telas do Concreto. No mapa, só um "!" na beira esquerda, para não cobrir o painel nem o zoom.
- Janela: "O que aconteceu?" (obrigatório), gravidade (atrapalha / impede) e até 3 imagens. A imagem é um print tirado antes no aparelho, ou uma foto. Ela é reduzida para JPEG de 1600 px, o que também apaga os metadados, inclusive o GPS. SVG e PDF são recusados.
- "Ver o que vai junto": tela (módulo/tela), versão do app (nome do arquivo do build), obra (código e id), id do usuário, sem conta ou não, navegador resumido e tamanho da tela, fila de envio e os últimos 20 erros do app. Os erros vêm do `console.error` e dos erros não tratados, sem e-mail, token, chave, id nem parâmetro de endereço. Não vão nome, e-mail, localização nem o que está digitado.
- Guarda no aparelho, num banco próprio do navegador (`sistema-obra-reportes`). Não é o banco do núcleo nem tabela do servidor. Guarda até 30 reportes; passando disso, sai o mais antigo.
- "Guardar e baixar .zip": a pasta do reporte leva `reporte.txt` (para ler e colar no chat), `reporte.json` e as imagens. A lista "Guardados neste aparelho" baixa cada um ou todos e apaga.
- Arquivos: `src/reportes/` (`coleta.ts`, `erros.ts`, `zip.ts` (o .zip sem dependência nova), `guarda.ts`, `imagem.ts`, `BotaoReportar.tsx`, `reportes.css`). No Concreto, só 2 linhas em `ModuloConcreto.tsx`.
- Testes: `reportes.test.ts` e `guarda.test.ts` (filtro de dado pessoal, anel de 20 erros, CRC e leitura do .zip, guardar/limite/apagar, imagem) e um caso na bancada em 375 e 1280 px. O caso da bancada faz o reporte com print e erro, baixa o .zip e confere o conteúdo, recarrega a página e o reporte continua lá, e confere que o botão não cobre zoom nem painel no mapa. O .zip também foi aberto pelo `zipfile` do Python.
- **Proposta (não feito):**
  - **toda tela do app:** uma linha na casca (`app.tsx`, núcleo) põe o mesmo `BotaoReportar` fora do Concreto;
  - **captura automática da tela:** biblioteca nova;
  - **envio pelo servidor:** tabela `reportes` e Storage, ou seja, núcleo e migração;
  - **tela "Reportes" para o admin.**

  O plano completo está nas notas do Professor (`plano_reportar_problema.md`).
**18/11/2026, FVM: recebimento de materiais** (passo 3, liberado pelo Nicolas via Professor; só no app sem conta e no ambiente de desenvolvimento, sem migração):
- **Lista de materiais:** o gestor importa um `materiais.json` (o formato que o pacote da obra vai trazer) em "Materiais controlados". Material com problema fica de fora com a explicação. Importar de novo inclui o novo, corrige o que mudou e retira o que saiu; os recebimentos ficam. A lista é dado, nunca código.
- **Ficha de recebimento:** material (botões grandes; o de `via: concreto` manda para o caminhão), data (não depois de hoje), fornecedor, NF, lote (obrigatório em material estrutural), quantidade, documentos que vieram, C/NC/NA por item (item medido: o número dentro da faixa marca C e fora marca NC sozinho; NC pede o que estava errado), até 5 fotos (`registrarArquivo`, mesmas regras dos Documentos) e o resultado.
- **Resultado:** o app sugere (NC → devolver; exige ensaio ou faltou documento → reter; senão, liberar) e a pessoa escolhe. Com NC não há "Liberado" puro, só "Liberado com ressalva" com o motivo. Material que exige ensaio não sai liberado do portão.
- **Retido:** faixa vermelha "N materiais retidos — não usar" no início do Concreto e na lista, com retidos no topo. Só gestor e admin tiram do retido (liberar, liberar com ressalva ou devolver, com motivo); fica como correção, com quem e quando.
- Arquivos: `concreto/fvm.ts` (regras), `fvm_dados.ts` (gravar e ler), `telas/TelasFvm.tsx`, rotas em `ModuloConcreto.tsx`, seção em `TelaInicio.tsx`, estilos em `concreto.css`. Testes: `fvm.test.ts` (12), `fvm_tabelas.test.ts` (FVM fora da lista do servidor) e 2 casos na bancada (375 e 1280 px: importar, NC no aço, bloco retido, gestor libera; campo não troca a lista).
- **Simplificação em relação à proposta:** itens conferidos, documentos e fotos ficam dentro da linha do recebimento (json), não em tabelas filhas. A ficha fica fiel ao que foi conferido mesmo se a lista mudar.
- **Fora desta rodada:** ligar o recebimento ao caminhão do Concreto (PR 4 da proposta), relatório/CSV do FVM, a lista vindo do pacote pelo núcleo e o nome do menu "Concreto e materiais".

**18/11/2026, PDF do laudo:** na tela do laudo, campo "Arquivo do laudo (PDF ou foto, opcional)". O arquivo vai pelo `registrarArquivo` do núcleo (módulo `concreto`) e fica ligado aos resultados daquela idade pela coluna `cp_resultados.laudo_arquivo_id`, que já existia: **sem migração**. Dá para anexar depois de digitar (o resultado ganha só o arquivo, como correção). Regras de arquivo iguais às dos Documentos (`documentos/regras.ts`: só PDF, JPG, PNG, WEBP ou HEIC, até 10 MB, tipo conferido pelos bytes). Ao voltar ao laudo, "Abrir o laudo anexado". Arquivos: `concreto/laudo_arquivo.ts`, `laudo.ts` (`planejarLaudo` com `laudoArquivoId`, `laudoDaIdade`), `telas/TelaLaudo.tsx`. Testes: unidade em `laudo.test.ts` e caso na bancada em 375 e 1280 px.
- Limite conhecido: depois que o arquivo vai para o servidor, o conteúdo sai do aparelho (regra do núcleo) e a tela diz "o arquivo não está neste aparelho"; abrir pelo servidor fica para quando o login entrar. Foto não é reduzida (o laudo costuma ser PDF).

**13/11/2026, app sem conta sem aviso de envio** (achado do teste da obra de demonstração): no app sem conta o Concreto mostrava "N registro(s) esperando envio" sem haver servidor. Agora a faixa some quando `estado.local` (`concreto/aviso_sync.ts`, igual à FVS), com teste de unidade e uma conferência no `testes/local.e2e.test.ts` (celular e tablet).

**13/11/2026, data do ensaio** (achado do teste da obra de demonstração: aceitou ensaio de CP em 20/11 com hoje 13/11):
- Data do ensaio depois de hoje (relógio do aparelho, 1 dia de folga) ou antes da moldagem é recusada, com a mensagem embaixo do campo, no laudo e no resultado avulso da tela do caminhão (`erroDaDataDeEnsaio` em `concreto/laudo.ts`). O campo de data também limita o calendário (min/max).
- O laudo sugeria a data prevista do rompimento mesmo quando ela ainda não chegou; agora sugere no máximo hoje.
- Testes: unidade em `laudo.test.ts` e caso na bancada em 375 px e 1280 px.

**12/11/2026, varredura de bugs** (branch `app/concreto-rodada`):
- **Horários fora de ordem**: antes só avisava fim antes do início. Agora avisa toda a sequência saída da usina → chegada → início → fim (`concreto/horarios.ts`, com teste e caso na bancada). Continua aviso, não bloqueia: a ficha de papel pode estar certa (caminhão que passa da meia-noite).
- **Gravação sem tratamento de erro**: salvar concretagem, caminhão (botão Salvar e correção) e resultado de CP não tinham `catch`. Se a gravação falhasse, o botão ficava travado e ninguém sabia que não gravou. Agora o botão volta e aparece "Não salvou: … Confira e tente de novo." (faixa vermelha no caminhão).
- Conferido e sem problema: os números têm faixa (volume 0,01–20 m³, slump 0–30 cm, água 0–1000 L, CPs 0–24, fck 1–150, MPa 0–200); os textos livres têm limite (local 300, observação 2000, NF 40); os outros `catch` do módulo tratam o erro.

**09/11/2026, rodada para a demonstração aos chefes** (pedido do Nicolas: "uma rodada de aprimoramento"):
- Concretagem completa na bancada, como engenheiro novo, no tablet (1280 px) e no celular (375 px): concretagem, dois caminhões, CP de 7 dias, as duas canetas, ficha do dia e relatório. As 3 coisas que mais atrapalharam, corrigidas (commit f320bdb):
  1. **"Salvar e próximo caminhão" apagava o que se digitava logo depois** (NF e slump do caminhão seguinte), porque o formulário só era limpo depois de gravar o anterior. O caminhão 2 ficava sem NF e a ficha avisava "Há caminhão sem nota fiscal". Agora limpa no toque; se a gravação falhar, os dados do anterior voltam.
  2. **Concretagem sem local** salvava e virava "sem local" nas listas, no seletor do mapa e na ficha (duas do mesmo dia ficavam iguais). Agora o Local é obrigatório.
  3. **Celular:** o botão "Tirar" da laje quebrava em "Tir / ar". Não encolhe mais.
  Teste de tela novo cobre as três; com cada correção desfeita de propósito, ele acusa.
- Pedido do Front end: pavimento sem concretagem diz o próximo passo ("Toque em Nova concretagem para começar"; quem só lê vê só "Nenhuma concretagem neste pavimento").
- **Laudo: vários CPs de uma vez** (commit e485cad): botão "Lançar laudo" na concretagem (gestor e admin, com caminhão). Uma aba por idade, uma data do ensaio, uma linha por caminhão com uma caixa por CP, Enter passa para a próxima caixa, coluna Exemplar (maior valor) e "abaixo do fck" em vermelho só na idade de controle. Caixa vazia não grava nem apaga; valor diferente vira correção. Trocar de aba com valor não salvo pergunta antes. No celular a tabela rola de lado dentro da caixa. Teste de tela em 375 e 1280 px.
- Visto e deixado como está: o aviso que cobre o zoom no mapa do celular (corrigido pelo Front end na `app/frontend-avisos`); a barra do mapa no celular corta "Desfazer" à direita (rola de lado; é do Front end, `TelaMapa.tsx`).

**08/11/2026, segurança da informação (achados 3 e 6 do Revisor):**
- A concretagem de exemplo agora aparece com EXEMPLO na frente do nome em todas as telas do Concreto (listas, títulos, mapa, relatório, caminhão), com um aviso na tela da concretagem. Na ficha de concreto, toda linha dela começa com EXEMPLO na Observação (sai também no CSV, no Copiar e no Imprimir), e a ficha avisa para não copiar. O app a reconhece pelo id que o `exemplos.ts` dá a ela (`concreto/exemplo.ts`), sem mexer no núcleo.
- Notas fiscais e códigos do Construpoint dos testes e da bancada trocados por números fictícios (900001/900002, `FIC-0000...`).
- **Não feito (núcleo):** trocar o código RAS e o fornecedor "concreteira" no próprio `relatorios/exemplos.ts`. Pedido ao chat da FVS (pendência 2).
- Testes: `src/concreto/exemplo.test.ts` (novo), 1 caso novo em `for008.test.ts` e 1 caso de tela em `testes/concreto_bancada.e2e.test.ts` (375 e 1280 px, com `dev/concreto.html?exemplo=1`).

**08/11/2026, Desfazer deixava a laje no caminhão** (rodada de teste de 08/11, gravidade média):
- Defeito: com a caneta Vigas e laje, a laje do trecho entrava junto com a área, mas gravada como toque (`manual`). O toque vale mais que o desenho, então Desfazer e Apagar áreas tiravam as vigas e deixavam a laje, que seguia no relatório e na ficha de concreto.
- Correção, sem coluna nova nem migração: a laje que vem com a área é gravada como `desenho`, sem fração (`pecas.ts`, `mudancaDaLajeDoDesenho`). Depois de desenhar, desfazer ou apagar áreas, o mapa confere se o caminhão ainda tem área da caneta Vigas e laje no trecho (`TelaMapa.tsx`, `acertarLaje`) e põe ou tira a laje. O aviso diz "A Laje do Trecho 1 também saiu". No painel, no caminhão e na lista de caminhões da peça, essa laje aparece como "com a área" (`relatorio.ts`, `comoEntrou`).
- Testes: 1 caso novo em `src/concreto/lajes.test.ts` (entra, outra área não grava de novo, sai, toque vale mais) e 1 caso novo de tela com caneta em `testes/concreto_bancada.e2e.test.ts` (desenha, desfaz, duas áreas, Apagar áreas, laje no toque continua).
- Rodado neste PC: `npm run build`, `npm test`, os 7 casos da bancada no Chrome (tablet 1280 px e celular 375 px) e os testes do banco (239 checagens).

**07/11/2026 à noite, duas canetas e mapa de concretagens** (PR #26, branch `app/local`):
- Pedido do Nicolas: "duas funções de caneta, uma para pilar e uma para viga e laje; depois do cadastro completo tudo vira uma área de uma cor que, quando a pessoa abre, vira o mapa de concretagem anterior".
- `caminhao_areas.alvo` (`pilares` | `vigas_laje` | vazio = todas; migração `20261107210000_concreto_caneta.sql`, testada no Postgres local e aplicada no servidor em 08/11/2026). `COLUNAS.caminhao_areas` leva `alvo` nas correções.
- `TelaMapa.tsx`: botões "Caneta: Pilares | Vigas e laje" (lembrado por obra). A área dos pilares só pega pilares; a das vigas e laje pega vigas e põe a laje do trecho no caminhão (cria a laje se precisar). O recálculo agrupa as áreas por caneta e a peça fica com a maior fração.
- Sem caminhão escolhido: vista "Mapa de concretagens" (uma cor por concretagem nas peças e nas áreas; a das vigas e laje tracejada; legenda com data, local, caminhões, m³ e peças, que escolhe a concretagem) ou "Laudos (CPs)" (a vista de antes). "Mapa do pavimento" abre em todas as concretagens.
- Exemplo: uma concretagem de ontem no Pilotis com 3 caminhões, áreas das duas canetas e a laje. Vem de `relatorios/exemplos.ts` (semeado pela casca, `app.tsx`) e aparece no Concreto como dado real (pendência 2).
- Testes: `concreto_bancada.e2e` 6/6 no Chrome; SQL `alvo` fora da lista é recusado.

**07/11/2026, aviso de envio:**
- Defeito, achado olhando a bancada com a forma real do 2º pavimento: o aviso "N registro(s) esperando envio" ficava com o número de quando o módulo abriu (mostrava 3 com 96 na fila). Com internet, o que foi gravado só ia ao servidor no ciclo seguinte, até 5 min depois. Nada se perdia.
- Correção em `telas/ModuloConcreto.tsx`: o `recarregar` que as telas chamam depois de gravar também chama `sincronizarAgora`, sem esperar o envio terminar. Dado novo vindo do servidor só relê a tela, sem enviar de novo. Vale para tudo o que o módulo grava, a laje inclusive.
- Teste: o caso do tablet em `testes/concreto_bancada.e2e.test.ts` confere que o aviso mostra o número da fila do aparelho. Tirando a correção de propósito, o teste acusa.
- Conferido na bancada: depois de tirar uma peça do caminhão, o aviso foi de 96 para 97 em 0,1 s.
- Rodado neste PC: `npm run build`, `npm test` (115 passaram) e os 6 casos da bancada no Chrome.

**07/11/2026, laje por trecho** (decisão acima):
- `app/src/concreto/lajes.ts`: nome da laje (banco e tela) e id fixo (UUID v5, igual ao do Python).
- `dados.ts`: ao ler, troca `Laje_Trecho_2` por "Laje do Trecho 2". `garantirLaje` cria a laje no primeiro toque; `podeCriarLaje` libera só gestor e admin.
- Mapa: botão da laje do trecho aberto no painel do caminhão. Um toque põe, outro tira, com o aviso "Laje do Trecho 2 entrou no caminhão 1". Sem caminhão escolhido, mostra os caminhões da laje.
- Relatório e CSV: sem mudança no código. A laje sai depois de pilares e vigas, com tipo `L`, sem % e origem "toque".
- Bancada: `dev/concreto.html?papel=campo` abre com outro papel na obra (padrão: admin).
- Testes:
  - `src/concreto/lajes.test.ts` (8 casos, no `npm test`): nome, id conferido com o Python, quem cria, segundo toque sem linha nova, laje que veio do servidor com outro id, relatório e CSV.
  - 2 casos novos em `testes/concreto_bancada.e2e.test.ts`: o toque em dois trechos, uma linha só por laje, o modo "ver", o relatório e o CSV baixado; e quem é de campo, que não cria a laje mas marca a que existe.
  - 4 checagens novas em `supabase/testes/testes_x_concreto.sql`: campo não cria a laje, nome com espaço é recusado, mesmo id de dois aparelhos fica uma linha só, campo marca a laje no caminhão.
  - 3 defeitos colocados de propósito, os 3 acusados: nome do banco direto na tela, id aleatório, campo criando laje.
- Rodado neste PC: `npm test` (114 passaram, 77 pulados porque precisam de PostgREST ou de navegador), `npm run build`, os 6 casos da bancada no Chrome e os testes do banco (220 checagens). Conferido nas capturas de tela: tablet 1280 px e celular 375 px, sem rolagem lateral e com botões de 44 px ou mais.
- Não testado: com plantas vindas do servidor e no tablet de verdade.

**06/11/2026, pranchas da FVS no mapa do Concreto:**
- Defeito: `fontePlantasFvs` existia desde o PR #14, mas nenhum arquivo do app a registrava. Na obra piloto o mapa mostraria "Este pavimento ainda não tem planta neste aparelho" mesmo com o pacote baixado; a obra TESTE caía na planta esquemática e escondia o problema. Confirmado por teste antes de corrigir.
- Correção: `telas/ModuloConcreto.tsx` registra a fonte uma vez, quando carrega. Esse arquivo só carrega quando o módulo abre. No app compilado, o código dos pacotes da FVS fica fora do arquivo principal, num arquivo dividido entre os dois módulos que também vai para o cache do app na instalação. Abrir o Concreto não carrega as telas da FVS.
- Testes: `src/concreto/plantas_da_fvs.test.ts` (roda no `npm test`) e um caso novo em `testes/concreto_bancada.e2e.test.ts`: a bancada da FVS guarda os pacotes e `dev/concreto.html?obra=<id>` abre a mesma obra sem ser a TESTE. Tirando o registro de propósito, os dois acusam.
- Conferido uma vez com as pranchas reais do 2º pavimento (5 trechos, LO R02), fora do repositório e sem nada sair do PC: baixadas pela tela da FVS (`dev/fvs.html?pasta=...`) e abertas pelo Concreto (`dev/concreto.html?obra=b0000000-0000-0000-0000-0000000000cc`). O traço de caneta em volta do P338, no Trecho 1, contou o pilar inteiro e as duas vigas encostadas como parciais, com `planta_ref` no trecho e na revisão R02. Tablet 1280 px e celular 375 px sem rolagem lateral da página.

**04/11/2026, prévia com forma real, revisão do mapa e app mais leve:**
- Prévia local com os 5 trechos do 2º pavimento (LO R02), lidos pelo leitor de pranchas da FVS: 274 pilares e 207 vigas somados entre as pranchas, em cerca de 30 s. Desenho, peças, CPs, relatório e ficha conferidos sobre a forma real, com caminhões de teste. Os arquivos ficam fora do repositório; a bancada abre com `dev/concreto.html?plantas=<endereço local>`.
- Defeitos achados e corrigidos:
  - Caneta encostando com a planta ainda deslizando (inércia do dedo): a área gravava fora do lugar. Agora a planta para na hora.
  - Soltar a caneta podia travar a tela: um traço enorme em zigue-zague levava 33 s para simplificar. Agora o número de pontos é limitado antes (menos de 0,2 s) e o traço sempre cabe no limite do banco.
  - Botão lateral e borracha da caneta desenhavam.
  - Toque curto da caneta exigia acertar a viga fina e não achava pilar cortado na emenda: agora tem folga e vale também o nome (rótulo), que ficou tocável, como no HTML da FVS.
  - Planta abria com a prancha inteira, com a estrutura pequena: agora abre enquadrada nas peças.
  - Relatório quebrava número de nota no meio da célula.
  - "N peças entraram" contava peças que já estavam no caminhão.
  - Registro recusado pelo servidor não aparecia dentro do módulo.
  - Mapa do pavimento ficava bloqueado sem concretagem.
- App mais leve: o arquivo principal caiu de 580 KB para 368 KB. O Concreto e o Leaflet só carregam quando o módulo abre, e continuam abrindo sem internet (conferido com o app compilado).
- Sem planta, a tela aponta para a tela inicial da FVS, que baixa os pacotes. Caminhão com área num trecho não baixado mostra aviso.
- Testes: 3 defeitos de propósito nas correções (inércia, botão lateral, rótulo), os 3 acusados pelo teste de tela.

**04/11/2026, formas do Autodoc e plantas por trecho:**
- 56 PDFs baixados do Autodoc (seção "Planta" acima). Cada um foi conferido pelo título do carimbo (pavimento e trecho) ou pelo tamanho, e os caminhos foram passados à sessão FVS.
- Mapa com várias plantas por pavimento (seção "Planta"), pronto para o pacote da FVS. A bancada ganhou um "Pavimento em 2 trechos".
- Teste de tela da bancada no Chrome (`app/testes/concreto_bancada.e2e.test.ts`, roda no GitHub junto com as outras telas). Cobre:
  - caneta de verdade (eventos "pen" do Chrome), toque do dedo, Desfazer e relatório;
  - pavimento em dois trechos;
  - celular (375 px) sem rolagem lateral e com botões de 44 px ou mais.
- Três defeitos colocados de propósito, os três acusados pelo teste: áreas em outra camada de desenho, área contando em todos os trechos, Desfazer apagando área de outro trecho.
- 3 testes de unidade novos (planta_ref, frações por planta, fontes de plantas).

**04/11/2026, entrega 5 (ficha de concreto):**
- `app/src/concreto/ficha_concreto.ts`: monta a ficha "Concreto usinado" de um dia com os caminhões de todas as concretagens do dia (todos os pavimentos), na ordem de colunas do modelo da empresa (Data | fck | Lacre | Caminhão | NF | Volume | A/C | Slump | CP | 4 horários | Observação). Concretagens ordenadas pela chegada do primeiro caminhão; a primeira linha de cada uma leva pavimento, local e código do Construpoint na observação; água adicionada vai na observação. Avisos quando o dia mistura fck, fornecedor ou slump, ou falta NF/volume.
- Tela **Ficha de concreto**: entra pelo início do módulo ("Ficha de concreto por dia", últimos 10 dias) ou pelo botão "Ficha de concreto do dia" na concretagem. Botões: **Copiar para o modelo (Excel)** (só as linhas, separadas por tabulação: colar na célula A12 do modelo), **Baixar CSV** (com cabeçalho da ficha) e **Imprimir** (A4 deitado). No celular a tabela rola de lado.
- O modelo `.xlsx` da empresa (com logo) não entra no repositório, então o app não gera o arquivo pronto: gera o conteúdo para colar. Lacre, A/C e brita não existem no app e ficam em branco (pergunta abaixo).
- Bancada (`app/dev/concreto.html`) ganhou uma concretagem de ontem com 3 caminhões, para ver a ficha e os CPs sem digitar nada.
- 6 testes de unidade novos (`for008.test.ts`). Build, 34 testes de unidade e os testes SQL (núcleo + Concreto + Projetos, 150 checagens) passando na `main` depois dos 3 merges.

**03/11/2026, entrega 1:**
- Migração `20261103230000_concreto.sql`: as 5 tabelas, todas só de inclusão, com correção por `substitui_id` (referência à mesma obra, conferida no fim da transação para o `restaurar.sql`).
- Testes do banco `supabase/testes/testes_x_concreto.sql` (18 checagens: papéis, só inclusão, outra obra, valores inválidos, correção, ordem da exportação). Rodados aqui num Postgres 17 temporário junto com os do núcleo: 121 checagens passando. 3 defeitos de propósito na migração, os 3 acusados.
- App (`app/src/concreto/`):
  - Menu da obra > **Concreto** > pavimentos (com alerta de laudos atrasados ou abaixo do fck) > concretagens > caminhões > CPs.
  - Formulários de concretagem e caminhão, com "Salvar e próximo caminhão", aviso de NF repetida ou fora da sequência, e correção/apagar (linha nova, histórico fica).
  - Corpos de prova: datas de 7 e 28 dias, situação (previsto, rompe hoje, aguardando, atrasado, OK, abaixo do fck), lançar resultado (gestor e admin).
  - **Mapa do pavimento:** caneta desenha a área do caminhão; dedo arrasta, amplia e, com toque curto, inclui ou tira peça; palma ignorada enquanto a caneta está encostada; Desfazer; mouse desenha ou move no PC. Sem caminhão escolhido, as peças ficam com a cor da situação dos CPs e o toque mostra os caminhões da peça.
  - Relatório por caminhão e por peça, CSV para o Excel, copiar e imprimir.
  - Bancada `app/dev/concreto.html` (só no `npm run dev`): abre o módulo com peças de teste, sem login nem servidor.
- Medido na bancada com 560 peças: cada ponto do traço leva até 0,1 ms, soltar a caneta 0,9 ms, e o cálculo e a gravação de 289 peças não travaram a tela (nenhuma tarefa acima de 50 ms).
- Defeitos achados no teste na tela e corrigidos: depois da primeira área o dedo deixava de marcar peça (duas camadas de desenho); a planta abria pequena (zoom calculado antes de a tela ter tamanho); corrigir a data da concretagem não levava os CPs junto; viga comprida entrava no caminhão encostando só 7% (amostragem grossa, achado pelo teste de integração no GitHub).
- Testes do app: 18 de unidade (correções, CPs, geometria, peças, relatório) e 1 de integração contra o PostgREST (`app/testes/concreto.test.ts`, roda no GitHub).

## Próximo passo
1. PDF do laudo: feito em 18/11 (commit local na `app/concreto`, sem push). Abrir pelo servidor fica para quando o login entrar.
2. FVM: feito em 18/11 no app sem conta (commit local). Falta o Nicolas confirmar as 5 decisões (Perguntas ao Nicolas) e decidir a migração antes de qualquer PR (pendência 11).
3. Esperando o Nicolas: a laje com folha única (pendência 3) e a moldagem com lacre e código do CP (pendência 5, pede migração).
4. Quando o app abrir no tablet (pendência 1): Nicolas testa no tablet com a caneta, sem internet.

## Próximas entregas
1. **Feita (03/11):** tabelas, telas de concretagem e caminhão, CPs com situação, desenho com caneta, relatório. Planta de teste.
2. **Feita no código (06/11, na `main` pelo PR #20):** planta de verdade, com o pacote da FVS no aparelho. Desde 07/11 vem da pasta `dados_obra` do app local. Se ainda vale conferir com plantas publicadas no servidor: a confirmar com o Nicolas (o rumo atual é o app local, `docs/03_APP_LOCAL.md`).
3. Trazer as fichas do Construpoint para o app (leitura pela tela, como no Autodoc; a API nova exige token, que não usamos). Só depois do ok da empresa para dados da obra piloto no servidor.
4. Laudos: **feito (09/11)** lançar vários CPs de uma vez; **feito (18/11)** anexar o PDF. Falta ler o laudo sozinho (fonte a decidir; pendência 4).
5. **Feita (04/11), versão para colar:** ficha de concreto gerado pelo app. Falta, se o Nicolas quiser: gerar o `.xlsx` pronto a partir do modelo da empresa (o modelo ficaria no Supabase, na pasta da obra, nunca no repositório).

## Pendências
1. **App no tablet sem internet** (núcleo, pelo chat da FVS). *16/11: branch `demo/rede-17-11` faz o app abrir pelo IP da rede (substitutos de `crypto.randomUUID`/`crypto.subtle`) e traz o `ABRIR_NA_REDE.bat` com QR; o offline (service worker) continua pedindo https.* Hoje o app só abre no PC (`ABRIR_SISTEMA_OBRA.bat`; o `servidor.ps1` atende só o próprio PC). Pelo IP da rede, sem https, o navegador não deixa gravar (`crypto.randomUUID`) nem funcionar sem internet (service worker). Precisa de um endereço https e de um jeito de pôr o pacote da obra piloto (uns 120 MB) no tablet sem publicar dados da empresa. O testador relatou em 08/11 que o servidor do PC também troca de porta sem avisar.
2. **Exemplo misturado com dado real: resolvido (09/11).** A concretagem de exemplo aparece com EXEMPLO no Concreto e na ficha (08/11), e a PR #42 trocou código e fornecedor por `EXEMPLO-0001` e "Concreteira Exemplo". Se a chave `conc:1` do `exemplos.ts` mudar, mudar também `concreto/exemplo.ts`. Tirar antes do uso na obra continua valendo.
3. **Laje com folha única** (decisão do Nicolas). Com uma planta por pavimento, a laje virou uma só por pavimento, "Laje (Planta inteira)". Opções: usar as áreas de laje que a FVS desenha (`fvs_areas`), desenhar a laje no Concreto ou outro jeito. A confirmar com o Nicolas.
4. **Laudos do laboratório.**
   - Lançar vários CPs de uma vez: **feito (09/11).**
   - Guardar o PDF do laudo: **feito (18/11)**, pelo `registrarArquivo` do núcleo, sem migração.
   - Ler o laudo sozinho: fonte a decidir.
   - Preciso de um laudo em PDF de exemplo e de uma foto da ficha de papel do caminhão.
5. **Moldagem dos CPs.** O app guarda só a quantidade de CPs moldados. Betoneira, lacre, aditivo, flow e o código do CP da concreteira (chave para ligar o laudo ao caminhão) precisam de coluna nova, ou seja, migração pelo chat da FVS, se o Nicolas quiser.
6. **Laje que entrou com a área antes de 08/11** ficou gravada como toque e só sai no toque. Se já existe algum dado real assim: a confirmar com o Nicolas (até onde sei, só dados de teste).
7. **Dados só no navegador do tablet.** No Android não há salvamento automático em pasta (`showDirectoryPicker`), só o "Salvar arquivo" manual (núcleo).
8. **FVS lendo `caminhao_elementos`** (itens 13 e 18 das fichas): o lado do Concreto está pronto (`concreto/rastreio.ts`, 19/11). Falta a FVS ligar na ficha (03 · FVS-EST) e o Nicolas pôr a marca `rastreio_concreto` nas fichas da obra piloto.
9. **Desempenho no tablet:** medido só no PC, com 560 peças. O Pilotis tem 845.
10. **Tela preta ao desenhar a área (relatos do Nicolas, 16/11/2026): resolvida, na `main` pelo #71 (d1730f8).** No PC, com mouse: nova concretagem, + Caminhão (sem horário), desenhar a área: a prancha inteira ficava preta enquanto desenhava, a área era gravada e, ao voltar, aparecia marcada. O horário do caminhão não tem relação. Causa (confirmada pelo Nicolas em 16/11 no Opera GX do PC dele: a versão antiga ficava preta, a corrigida não; no Chrome do mesmo PC nunca ficou): a "tinta" do traço (`caneta.ts`) usava canvas de baixa latência (`desynchronized`), que nesse navegador perde a transparência. Agora ela só vale no Android; no PC a tinta é um canvas comum. Testes: `src/concreto/caneta.test.ts` e conferência no `concreto_bancada.e2e.test.ts`.

11. **FVM sem migração (18/11).** Na primeira versão (770381b) as tabelas do FVM estavam na lista de sincronização. No CI do PR #78, a baixa do servidor deu erro nelas e o app nunca chegou a "Sincronizado hoje" (2 testes de `telas.e2e.test.ts`). Corrigido no mesmo dia: o FVM saiu da lista e grava por um sincronizador próprio, só no aparelho (Tabelas, acima). As telas só aparecem no app sem conta. Limite: um registro do FVM feito sem conta e depois mandado ao servidor com login ficaria "com erro" na fila até a migração existir. **Falta:** a migração do FVM (chat da FVS, com o ok do Nicolas) antes de ligar o FVM com login.

## Perguntas ao Nicolas
- **FVM, as 5 decisões (usei as minhas recomendações em 18/11; confirmar):**
  1. Migração: depois, junto com o servidor. Até lá, só no app sem conta.
  2. Lista de materiais: no futuro vem no pacote da obra, pelo núcleo. Por enquanto o gestor importa o `materiais.json` na tela.
  3. Dentro do Concreto, não módulo novo. O nome do menu continua "Concreto" (trocar para "Concreto e materiais" mexe no núcleo).
  4. "Liberado com ressalva" existe e exige escrever a ressalva.
  5. Só gestor e admin tiram um material do retido; o campo registra o recebimento.
- **Laje com folha única** (pendência 3): usar as áreas de laje da FVS, desenhar a laje no Concreto ou outro jeito?
- **Laje criada por quem é de campo:** hoje só gestor e admin criam a laje de um trecho (regra do banco para cadastro de peça). Quem é de campo só marca a laje depois que um gestor ou admin tocou nela uma vez naquele trecho. Basta assim? Se o campo precisar criar, é um pedido ao núcleo (abaixo).
- Ficha de concreto: o app não registra **lacre**, **brita** nem **A/C**. Vale acrescentar lacre no caminhão e brita na concretagem (mudança só nas tabelas do Concreto)? Ou continuam em branco, como no lançamento à mão?
- Na ficha, a coluna "CP" recebe os CPs moldados do caminhão (4 por padrão). É isso que a coluna "CP 4" do modelo quer dizer?
- Peça que fica só 10% a 90% dentro da área entra como **parcial** (o relatório avisa). O limite de 10% é de propósito inclusivo: se um CP der abaixo do fck, é melhor listar uma peça a mais do que deixar uma de fora. Está bom assim?
- Quantos CPs por idade o laboratório molda por caminhão? (A ficha de concreto tem a coluna "CP 4" e o Construpoint mostra 4 valores por idade.)
- Margem de 3 dias para considerar laudo atrasado está boa?
- Procedimento de concreto (para conferir as regras de aceitação).

## Pedidos à FVS
- Pacote de planta por trecho, com o contorno de cada peça e o `id` dela em `elementos`, no formato do HTML legado. **Entregue no PR #14:** tabela `plantas` e `app/src/fvs/plantas.ts` devolvendo as plantas do pavimento já no formato `PlantaPavimento`. Ligado no Concreto em 06/11.
- Blocos de fundação como peça (camadas BLOCO DE COROAMENTO e ESTACA das plantas de fundação), para as concretagens da infraestrutura. Perguntado em 04/11.
- Para ciência (07/11), nenhum pedido: o Concreto cria lajes em `elementos` (tipo `L`, nome `Laje_Trecho_N`, sem contorno nem pacote). `pipeline/fvs/publicar_planta.py` não muda: ele só cria as peças que lê na prancha, e a laje não conflita com pilar nem viga. Se a FVS listar as peças de `elementos`, a laje vai aparecer.

## Pedidos ao núcleo (desde 08/11, pelo chat da FVS)
Abertos em 08/11: pendências 1 (app no tablet), 7 (salvar no Android) e, se o Nicolas quiser, 5 (colunas novas). A 2 (exemplo) foi resolvida na PR #42.

Antes (07/11): nenhum pedido de tabela. Pedido possível, só se o Nicolas quiser (pergunta acima): deixar quem é de campo incluir em `elementos` linhas de tipo `L` (hoje a inclusão em `elementos` é só de gestor e admin).

Para ciência da sessão Núcleo (07/11): o Concreto passa a criar linhas em `elementos` pelo `sincronizador.registrar`, só para a laje do trecho, com id fixo (UUID v5). O nome segue a regra sem espaço (`Laje_Trecho_2`).

Sugestão ao núcleo (07/11), sem pressa: o aviso de envio da FVS e do Projetos tem o mesmo defeito que o Concreto tinha (os módulos não chamam `sincronizarAgora` nem `recontar` depois de gravar). O Concreto corrigiu só no módulo dele. Uma correção para todos seria o `usarSincronizacao` saber sozinho quando a fila muda (por exemplo, um aviso do `sincronizador.registrar`).

Para ciência da sessão Núcleo: o Concreto mexeu o mínimo na casca do app para abrir o módulo: `Menu.tsx` ganhou `aoAbrirModulo` (botão do módulo pronto fica ativo), `app.tsx` ganhou a tela `concreto` e o voltar do Android para ela, e `nucleo/tabelas.ts` recebeu as tabelas do Concreto (como manda o contrato).
