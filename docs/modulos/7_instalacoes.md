# Instalações (hidro, sanitário, elétrico, preventivo e SPDA)

Frente aberta em 20/11/2026, com o pedido do Nicolas repassado pelo Professor. Cada disciplina vira um setor do pavimento, com planta própria, como a armadura de laje ("um layer a mais"). O menu do pavimento já mostra sozinho uma disciplina nova, com o nome dela e as plantas (`1_fvs.md`, menu do pavimento genérico).

## Regras vigentes

- **Ponto: opção B, decidida pelo Nicolas em 20/11 ("Sim, no ambiente", pelo Professor).**
  - **Como fica:** o ponto (ralo, caixa, ponto de água, registro) não é peça em `elementos`. Vai no pacote da planta como sobreposição, em `"pontos"`, como as `"barras"`. O id é fixo, calculado da obra, do pavimento, da disciplina e do id do objeto no modelo (`id_do_ponto`). Obra, pavimento e disciplina identificam a planta da disciplina: o mesmo IFC usado em dois pavimentos ou em duas obras não repete id (correção do revisor, 21/11). Não usa o `planta_id` do servidor porque ele muda a cada publicação e o registro ficaria solto.
  - **A ficha:** é a PVS do serviço e fica no ambiente, porque o lote das PES 009 e 010 é por ambiente. O ponto conferido alimenta o item dela.
  - **Banco:** sem migração e sem mudança em `elementos.tipo` nem em `fvs_eventos`. O registro do ponto usa a coluna `barra_id`, que já existe: id do pacote, sem chave estrangeira, com `planta_id`.
  - **`barra_id` vale para "local de sobreposição (barra ou ponto)"** (aprovado pelo Professor em 20/11). Se um dia for preciso coluna nova, a frente para e avisa.
- **No app (aba Pontos):** a planta da disciplina abre direto na aba Pontos, com um círculo por ponto (azul sem conferir, verde OK, vermelho errado).
  - O toque segue o ciclo da barra (21/11): 1 toque OK, 2 toques errado (vermelho e caixa do NC), 3 toques tira a verificação, também com a caixa do NC aberta. O NC só grava com Confirmar. Tem Desfazer. Dois pontos juntos: pede para aproximar. O círculo ganha da linha: o toque na caixa onde o eletroduto termina é da caixa.
  - O registro vai no item da ficha de ambiente marcado com `"pontos": "hidro"`, `"sanitario"`, `"eletrico"` ou `"spda"` (`app/src/fvs/pontos.ts`). Sem esse item na ficha, o toque avisa e não grava.
  - **Ficha:** em `publicar_fichas.py`, `"pontos"` só vale em ficha de ambiente (`aplica_a: ["A"]`) e não junta com furos, barras, parte ou esquadrias.
  - **Menu (21/11, pedido do Nicolas: "sanitário, elétrico, preventivo contra incêndio, tem que ter tudo, suas abas"):** em Instalações, as seções saem nesta ordem: "Hidráulica", "Esgoto", "Elétrico", "Preventivo contra incêndio", "SPDA"; cada planta abre direto na aba Pontos. A linha de cada planta conta "pontos". A ficha de ambiente que tem item de pontos sai de Acabamentos e aparece em Instalações, em "Por ambiente" (abre a planta de ambientes nessa ficha). Testado na bancada (`dev/fvs.html?instalacoes=1`: uma planta de teste por disciplina, com linha no elétrico e no preventivo) em 375 px e tablet: as cinco abrem, o toque grava no item da disciplina.
  - **Alternativa descartada:** um tipo de peça novo, "I", em `elementos`, que precisaria de migração no núcleo.
- **Disciplinas:**
  - `hidro` (setor "Água fria e quente"): ponto de água, registro, hidrômetro.
  - `sanitario` (setor "Esgoto e pluvial"): ralo, caixa sifonada, caixa, ponto de esgoto de aparelho.
  - `eletrico` (setor "Caixas e quadros"): caixa de passagem e ponto de luz (caixa octogonal) na laje, como no PES 009.4, e quadro (PVS 009.x). A ficha da laje elétrica é **suposição**, porque não há PVS dela.
  - `spda` (planta "SPDA"; antes "Captores e descidas"): captor (PVS 009.2.1), descida e caixa de inspeção (PVS 009.2.2), haste de aterramento e conector de aterramento (`conector`, 22/11). A descida é vertical: na planta, aparece como ponto. **Desde 22/11 a planta de pontos funciona como a de furos** (filtro por tipo, "+ Área", caixa do NC, avanço no menu): regras em [1_fvs.md](1_fvs.md), "SPDA igual aos furos".
  - **Eletroduto como linha** (decisão do Nicolas, 21/11: "eletroduto como linha"): no elétrico, o trecho de eletroduto entra na mesma planta, com `"linha"` (começo e fim na folha) além de `"ponto"` (o meio). Na tela é uma linha, como a barra; o toque e o registro são os do ponto (`barra_id`, mesmo item da ficha). A linha sai do eixo do objeto no IFC ("Axis") ou do sólido extrudado do corpo ("Body"); trecho vertical (menos de 5 cm na planta) fica fora. Eletrocalha, leito, perfilado e cabo não entram. O setor passa a se chamar "Caixas, quadros e eletrodutos". Classificação ainda **suposição** até o IFC real.
  - Em `setores.disciplina` o texto é livre.
- **De onde vêm os pontos:** do IFC da disciplina (`pipeline/fvs/instalacoes.py`), no nível do pavimento. O nível é o pavimento que contém o objeto ou o "Level" das propriedades. A posição é a do objeto no modelo, em cm.
  - **Nível pela altura, não só pelo nome** (piloto do 2º, 21/11): no IFC do Revit, o modelo do pavimento tipo vinculado do 2º ao 6º vem com cinco níveis de mesmo nome ("2° PAVIMENTO"), cada um na altura real do andar (972, 1296, 1620, 1944 e 2268 cm). Fica o mais baixo dos de mesmo nome, e só os objetos de 150 cm abaixo do piso dele até o nível seguinte acima (sem nível acima: até 400 cm). Sem esse filtro, o 2º vinha com os pontos de cinco andares.
  - No IFC o nome vem com o sinal de grau ("2° PAVIMENTO"), e o `pavimento.json` da estrutura usa o ordinal ("2º PAVIMENTO (NO)"): eles não casam. Em `"instalacoes"`, use em `"nivel"` o nome como está no IFC de instalações.
  - Classificação, conferida no IFC real de hidráulica e de esgoto (21/11). O Revit põe prefixo com sublinhado ("HID_", "SAN_"), que vira espaço antes de comparar. Conexões (IfcFlowFitting: joelho, tê, adaptador) e tubos não entram.
    - sanitário: "SAN_Ralo Linear" → ralo; "HID_Caixa Sifonada" → caixa sifonada; o "Prolongamento para Caixa Sifonada" (acessório) e o "Nicho" ficam fora;
    - hidro (IfcFlowController): "Valvula Esfera", "Registro Gaveta", "Registro Pressao", válvula redutora e de alívio → registro; "Misturador", "Ducha", "Chuveiro", "Torneira" → ponto de água; "Hidrometro" → hidrômetro; filtro, ventosa e flange de incêndio ("PCI_") ficam fora.
  - No elétrico e no SPDA, também suposição, porque ainda não abri os IFC reais. Pelas classes de elétrica (IfcJunctionBox, IfcElectricDistributionBoard, IfcLightFixture...) e pelo nome ("CAIXA DE PASSAGEM", "OCTOGONAL", "QDL", "CAPTOR", "DESCIDA", "CAIXA DE INSPEÇÃO", "HASTE").
  - Trecho de tubo ou cabo só vira ponto no SPDA, e só se o nome disser "descida". O eletroduto vira linha no elétrico (acima).
- **Encaixe (modelo para a folha):** o mesmo dos furos do pavimento, ou `"encaixe"` à mão. Encaixe duvidoso não serve.
  - **Suposição:** os modelos de hidráulica e de sanitário estão nas mesmas coordenadas do modelo de furação, porque saem do mesmo projeto no Revit.
  - Ponto fora da folha não entra e vai para o `relatorio.json` (`instalacoes.<disciplina>.fora_da_folha`).
- **Fundo da planta:** o da folha de forma, por enquanto. As pranchas da disciplina (PDF por setor A a G) ainda não entram, porque precisam de alinhamento.
- **Publicar:** `publicar_planta.py pavimento.json --so-hidro` ou `--so-sanitario` publica só a planta daquela disciplina. A forma, os ambientes e as outras plantas ficam como estão no servidor. É preciso a folha única.

```json
"instalacoes": {"hidro": {"ifc": "../Hidro/modelo.ifc", "nivel": "2º PAVIMENTO"},
                "sanitario": {"ifc": ["../San/embasamento.ifc", "../San/tipo.ifc"], "nivel": ["2º PAVIMENTO"]},
                "encaixe": {...}}
```

### Planta de furação (pedido do Nicolas de 21/11/2026, via Professor)

O Nicolas pediu, nas palavras dele: "usa o mesmo princípio das armaduras de lajes".

- **Planta.** Abrir os furos leva a uma planta só deles (setor "Furação", disciplina `furacao`). Os pontos não vão mais por cima da planta de forma.
- **Fundo.** É a prancha de furação do Autodoc, na pasta **Furação > Modelagem > Projeto Executivo**. A pasta "Furação première" não vale, mesmo sendo mais nova.
  - Uma prancha por setor, que o pipeline cola numa folha só (`pipeline/fvs/furacao_fundo.py`).
- **Encaixe pelos pilares.**
  - Cada prancha é encaixada na folha de forma pelos centros dos pilares (o alinhamento das barras, `pipeline/alinhamento`).
  - As pranchas saem do Revit sem camadas, na escala 1:75. Os pilares são os retângulos cheios de cinza médio.
  - Algumas pranchas desenham o pilar em outro tom (cinza claro, branco com contorno, ou o cinza médio como polígono de linhas). Se o cinza médio em retângulo não encaixa, o pipeline tenta os outros, só com desenhos do tamanho de um pilar (12 a 400 cm de lado). O relatório diz o tom usado.
  - Prancha que não encaixa fica fora do fundo, e o relatório diz por quê. Isso não para os outros setores.
  - **Desempate.** O prédio repete a malha de pilares (torres iguais), e um setor pode encaixar quase igual em dois lugares. O pipeline então fica com a solução que:
    - está na mesma orientação dos setores já encaixados;
    - cai na parte da folha ainda livre (pelo menos 10 pontos percentuais menos sobreposta);
    - tem pelo menos tantos pilares batendo quanto a outra.
  - Na obra piloto, o setor A do subsolo encaixou com 64 de 66 pilares e erro de até 0,2 cm.
- **A conferir (nada é apagado).** O relatório lista, sem tirar da planta:
  - furos fora do contorno da forma: numa das quatro direções não há pilar nem viga a menos de 3 m;
  - pilhas: furos no mesmo ponto (até 5 cm);
  - filas: 5 ou mais furos na mesma linha, a até 50 cm um do outro.
- **Limite do modelo de furação da obra piloto.** O IFC (R03, de 17/08) só tem furos até o 3º pavimento. No 4º, no 5º, no 6º e na cobertura dá 0 furo, e a cobertura também não tem prancha de forma. Decisão do Nicolas (21/11, via Professor): os furos do 3º valem como tipo no 4º, no 5º e no 6º. O fundo de cada pavimento é o PDF dele, e cada furo é comparado com esse PDF; onde não houver desenho, o furo fica "a conferir", com a contagem no relatório. A cobertura fica de fora até ter planta de forma. Feito em 21/11:
  - no pavimento.json, `"furos": {"nivel": ["3º PAVIMENTO (NO)"], "referencia": <pasta gerada do 3º>}` e `"furacao": {"tipo_de": "3º Pavimento"}`;
  - cada furo leva `furo.tipo_de`, e o que a prancha do pavimento não desenha leva `furo.a_conferir: true`.
- **Furo × símbolo da prancha (todos os pavimentos).** Na prancha, cada furo é um símbolo cheio de cor (um tom por disciplina). Furo do modelo sem símbolo a até 20 cm vai para `a_conferir.sem_desenho` no relatório. No 3º da obra piloto, os 1072 furos acharam o seu.
- **Furos e peças.**
  - Os furos são os mesmos da forma, com os mesmos ids. Saem do modelo de furação, pelo `furos.py`.
  - Cada furo traz a peça: `viga` (furo de viga), `furo.laje` (furo de laje) e, novo, `pilar` (furo ou caixinha de laje que cai dentro do contorno de um pilar).
  - A forma continua com os furos (o item de furação da viga conta por eles), marcada com `furos_separados` para o app não mostrá-los lá.
- **No pavimento.json:** `"furacao": {"pdf": "../04_Furacao/*.FR.EX.01[1-7].*.pdf", "escala": 75}`. Precisa de `"furos"` e da folha única. O `"alinhamento"` pode ser passado à mão, por prancha.
- **Publicação:** `--so-furacao` publica só essa planta.
- **App (com o chat 10, dono da tela):**
  - o furo tocado grava na ficha da peça: viga (item dos furos), pilar ou laje (item `instalacao` da área de laje; sem área, a primeira ficha de laje com o item);
  - a regra de que peça fica com um ponto está em `app/src/fvs/instalacao_no_elemento.ts`.

## Status (21/11/2026)

- **Feito:**
  - levantamento do Autodoc: disciplinas, fases, pranchas e formatos;
  - lista das PVS que existem;
  - proposta, mandada ao Professor;
  - pipeline de `hidro` e `sanitario`, com os testes na EXE;
  - app: aba Pontos (toque OK, errado, sem conferir, Desfazer), testada na bancada em 375 px e em tablet com 40 pontos de teste;
  - `eletrico` e `spda` no pipeline (`--so-eletrico`, `--so-spda`) e no app. Na `main` pelo #52.
  - correção do revisor (21/11): o id do ponto leva obra e pavimento. Branch `instalacoes/id-ponto-planta`. Os pontos publicados antes mudam de id, mas nenhum foi publicado no servidor.
  - 21/11: toque de barras e pontos em 1 verde, 2 vermelho, 3 tira (também com a caixa do NC aberta) e eletroduto como linha. Branch `instalacoes/toque-e-eletroduto`, testada na bancada em 375 px e em tablet, com toques rápidos e lentos.
  - 21/11: download das 125 pranchas e modelos vigentes de HI, SA e EL, guardados e no índice. Piloto do 2º, fora do repositório, com hidráulica e esgoto: 546 pontos de água e 196 de esgoto. O encaixe está certo: 111 das 123 caixas sifonadas caem sobre um furo de laje Ø20 (distância mediana de 0,1 cm). Branch `instalacoes/classificar-ifc-real`.
- **Falta:**
  1. O download das pranchas e modelos vigentes. O Nicolas deu o ok no chat da frente em 20/11.
  2. O piloto no 2º pavimento real, fora do repositório. Depende do download e serve para conferir a classificação e o encaixe; no elétrico e no SPDA, também os nomes reais.
  3. As fichas como dado da obra, fora do repositório, com o item dos pontos marcado:
     - hidro e sanitário: PVS 010.2, 010.4, 010.5 e 010.6;
     - elétrico: PVS 009.x, mais a laje elétrica como suposição;
     - SPDA: PVS 009.2.1 e 009.2.2.
  4. Elétrico no IFC real (piloto do 2º, 21/11): o eletroduto vem como "Conduit with/without Fittings" (IfcFlowSegment, com corpo extrudado; já casa com a regra) e a eletrocalha como "Cable Tray" (fica fora). Caixas na laje: "Tomada de Teto" e "Tomada de Piso" (Conjunto 4x2 e 4x4, IfcBuildingElementProxy), "CAIXA DE PASSAGEM", "Quadro de Distribuição". **Pendente de decisão do Nicolas:** os eletrodutos horizontais do 2º ficam cerca de 36 cm abaixo do piso do 3º (12,60 m; o 3º está em 12,96 m), e a tomada de teto do 2º fica em 12,96 m. Isso é a laje do 3º (embutido) ou o forro do 2º? Conforme a resposta, o elétrico passa a ser escolhido pela altura da laje e não pelo pavimento que contém o objeto. As tomadas e os interruptores de parede vêm uns 15 m acima do andar (erro do IFC) e não entram na laje.
  5. Preventivo: não há PES nem PVS, então os itens entram marcados como suposição. **App pronto (21/11):** disciplina `preventivo` (setor "Hidrantes, extintores e sprinklers"), tipos `hidrante`, `extintor`, `sprinkler`, `detector`, `iluminacao_emergencia`, `alarme`, `sinalizacao` e a tubulação como linha (`tubo_incendio`), item da ficha `"pontos": "preventivo"`; tipo desconhecido aparece com o nome do objeto. **Planta de consulta (decisão do Nicolas, 21/11: "se não tiver [ficha] vamos fazer que nem aço, mas não vai para ficha"):** a planta da disciplina que nenhuma ficha marca (PPCI; SPDA enquanto não tiver ficha) aparece no menu para olhar e conferir no local; o topo diz "Só consulta", o toque mostra o nome do ponto e nada grava em `fvs_eventos`. Marcação "visto" fica para depois, com o Nicolas. **Falta no pipeline** (`instalacoes.py` e `publicar_fichas.py`, que têm de ter a mesma lista de disciplinas): ler o IFC do preventivo e aceitar `"pontos": "preventivo"` na ficha.

## No app, 23/11/2026 (chat 10, combinado com o 20)
Divisão: o 20 gera e publica os pacotes (pipeline, só no servidor de testes); o 10 cuida das telas (`app/src/fvs/`). Formato do `PontoPacote` sem mudança; o 20 acrescenta os tipos `conector` (SPDA) e os do preventivo, a disciplina `preventivo` com o trecho "Preventivo" (só consulta) e as `origens` na folha, como na furação. **Planta com muitos pontos:** com mais de 60 pontos visíveis, de longe a planta mostra um número por quadrado ("2 de 40 pontos OK"), que aproxima ao toque; o ponto só se marca de perto (regra em [1_fvs.md](1_fvs.md)). Pacotes reais conferidos no navegador: elétrico do mezanino (908 pontos). **Elétrico do andar-tipo (5.855 pontos no 3º):** medido no PC com a CPU 4x mais lenta, abre em 0,6 s, aproxima e arrasta sem travar (depois da correção de 23/11 na conta do zoom); não precisa juntar trechos por ora. Falta o S23 de verdade.

**5.1 a 5.3 no app (23/11, chat 10, branch `fvs/instalacoes-5-1-a-5-3`):** a tela já lê os tipos `tubo`, `coluna` e `caixa_parede`, o `ambiente` do ponto e o item com `pontos` em lista mais `pontos_tipos`. O toque grava no item da ficha de ambiente que tem a disciplina e o tipo do ponto. Quando duas servem (alvenaria e drywall), pergunta "Qual ficha?" uma vez por ambiente. Tipo sem item é só consulta e não entra na conta. Regras em [1_fvs.md](1_fvs.md).

## SPDA como planta (22/11/2026, feito)

Pedido do Nicolas ("faça a mesma coisa dos furos"): uma planta "SPDA" por pavimento, com fundo das pranchas de SPDA coladas pelos pilares e os pontos do modelo. Decisões dele: a cobertura, sem forma, não entra; a BEP conta como caixa.

- **Fundo:** em `"instalacoes": {"spda": {"ifc", "nivel", "pdf", "escala"}}`, o `"pdf"` traz as pranchas da disciplina. Elas são encaixadas pelos pilares como as da furação (`fundo_das_pranchas` em `publicar_planta.py`, com `furacao_fundo.py`). Prancha que não encaixa fica fora; sem nenhuma, o fundo é a forma. As pranchas de SPDA da obra piloto são 1:100 (`"escala": 100`) e o pilar delas é cinza 0,39 (achado pelo outro tom).
- **Pontos** (nomes do IFC real):
  - captor: "Minicaptor";
  - caixa_inspecao: a BEP ("Caixa de Barramento Equipotencial - BEP1");
  - conector (tipo novo, "Conector de aterramento"): "Conector ATERRINSERT" e "Conector Minigar", que são conexões (IfcFlowFitting) e entram só no SPDA;
  - descida: trecho de eletroduto ("Conduit") vertical, com mais de 50 cm de altura e quase nada na planta. Vira um ponto, e um só por lugar quando há trechos empilhados. O trecho horizontal fica fora.
  - Haste e caixa de inspeção com esse nome não existem no modelo.
- **Pavimento:** no IFC do SPDA a altura do objeto não bate com a do nível. Vale só o nome do nível que o contém (sem a faixa de altura das outras disciplinas).
- **A conferir:** descida a mais de 30 cm do contorno de um pilar vai para `a_conferir.descida_longe_de_pilar` no relatório.
- **Gerado na obra piloto (22/11), sem publicar:** 8 pavimentos (subsolo, pilotis, mezanino, 2º a 6º), 241 pontos: 204 descidas, 20 captores (mezanino), 13 conectores, 4 BEP. Fundo: todas as pranchas encaixaram no mezanino e do 2º ao 6º; no subsolo 2 de 3, no pilotis 1 de 3 (as outras ficam fora). Descidas longe de pilar: 8 no subsolo (todas), 9 no 2º, 5 no mezanino, 5 no 6º, 1 no pilotis.
- **Publicar:** `PUBLICAR_SPDA.bat` na pasta da FVS da obra, fora do repositório. Ele desliga o vigia do Autodoc (mesmo login), publica um pavimento por vez (`--so-spda --aceita-ambientes`), para no primeiro erro e religa o vigia.

## Instalações além dos furos (23/11/2026, frente 20)

Pedido do Professor: as cinco disciplinas da obra piloto, com os dados reais, no **servidor de testes** (nunca no da obra real). Branch `instalacoes/alem-dos-furos`.

- **Preventivo (PPCI) no pipeline:** disciplina `preventivo` ("Preventivo") em `instalacoes.py`, `pacote.py` e `publicar_fichas.py`. Sem ficha: a planta sai "Só consulta" no app. Nomes do IFC real, nesta ordem:
  - placa, sinalização, fotoluminescente → sinalizacao;
  - mangueira (abrigo) fica fora; hidrante → hidrante;
  - gás, aquecedor, chaminé, medidor, cilindro, interfone, grelha, vidro → fora;
  - extintor, sprinkler, detector; "emergência" e "autônomas com faróis" → iluminacao_emergencia; sirene, acionador, alarme, botoeira → alarme.
  - Entram também as classes IfcDistributionControlElement, IfcAlarm, IfcSensor e IfcFireSuppressionTerminal.
  - **Pavimento:** no IFC do PPCI o objeto vem uns 9 m acima do nível; vale a altura do nível que o contém, não a do objeto.
  - O IFC do PPCI é grande. Usa-se uma cópia leve fora do repositório, só com os objetos classificados, sem geometria.
- **Fundo das pranchas por disciplina:** `"pdf"` e `"escala"` valem em qualquer disciplina de `"instalacoes"`, com o encaixe pelos pilares da furação. No preventivo (1:50, pilar cinza 0,12) e no SPDA (1:100, cinza 0,39) as pranchas encaixam. Nas de hidráulica, esgoto e elétrico o pilar vem só com contorno, sem preenchimento, e não encaixa: essas três ficam com o fundo da forma.
- **Nomes para o encarregado** (achado do 10 no 2º): sai o prefixo do Revit (HID_, SAN_, PCI_, SPDA_, ELE_, também com "x_" ou "z_NAO_USAR_"), o número colado no fim do nome e o inglês ("Conduit" → "Eletroduto", "Pipe" → "Tubo", "Cable Tray" → "Eletrocalha").
- **Água junta por lugar:** na hidráulica, pontos a menos de 20 cm viram um só, com a contagem no nome ("2 Valvula Esfera Vermelha"). Fica o id do menor, o tipo mais importante (ponto de água > hidrômetro > registro) e a posição média. No 2º: de 546 para 341.
- **SPDA longe da estrutura:** descida ou conector a mais de 2 m de qualquer pilar sai da planta e vai para `a_conferir.fora_da_estrutura` no relatório (no 2º, 18 pontos que caíam na diagonal da folha).
- **Login por servidor:** o login do pipeline fica num arquivo por servidor (`sessao_supabase.json` para o da obra real, `sessao_supabase_<ref>.json` para os outros). Entrar no de testes não apaga o login da obra real.
- **Fora do repositório (pasta da FVS da obra):** configs `pavimentos_instalacoes_2026-11-21\*_todas.json`, pacotes gerados em `pacotes_instalacoes_2026-11-23`, `LOGIN_SERVIDOR_TESTES.bat` e `PUBLICAR_TESTES_INSTALACOES.bat` (desliga o vigia do Autodoc, publica um pavimento por vez no servidor de testes, para no erro, religa o vigia). O `PUBLICAR_SPDA.bat` de 22/11 (obra real) foi renomeado para não rodar.
- **Gerado na obra piloto (23/11), sem publicar, 9 pavimentos** (pontos por planta):

  | Pavimento | Água | Esgoto | Elétrico | Preventivo | SPDA |
  |---|---|---|---|---|---|
  | Subsolo | 36 | – | – | 13 | 12 |
  | Térreo comercial | 64 | 150 | 18 | 178 | – |
  | Pilotis | 133 | 109 | 549 | 377 | 33 |
  | Mezanino | 77 | 57 | 908 | 123 | 58 |
  | 2º | 341 | 207 | 1223 | 176 | 23 |
  | 3º | 341 | 206 | 5855 | 176 | 23 |
  | 4º | 339 | 207 | 5844 | 176 | 22 |
  | 5º | 335 | 211 | 5844 | 176 | 22 |
  | 6º | 329 | 195 | 5890 | 176 | 29 |

  - Do 3º ao 6º, o elétrico tem uns 5.800 pontos (quase todos trechos de eletroduto); o 10 mede o desempenho no app.
  - Fundo do preventivo: as pranchas encaixam do 2º ao 5º; no subsolo, térreo, pilotis, mezanino e 6º nenhuma encaixa (0 pilar em comum) e fica a forma. Fundo do SPDA: encaixam todas no mezanino e do 2º ao 6º; 2 de 3 no subsolo e 1 de 3 no pilotis.
  - SPDA a conferir: descidas longe de pilar no subsolo (7), pilotis (1), mezanino (5) e 6º (5); fora da estrutura (fora da planta) no 2º (18) e no subsolo (1).
- **Pendente (Nicolas):** o "visto" do PPCI; o elétrico da laje ou do forro (item 4 do status de 21/11).

## Redes, alvenaria e drywall: 5.1 a 5.3 (23/11/2026, frente 20)

Pedido do Professor: hidráulica e elétrica na FVS além dos furos, com o 2º pavimento como piloto. Branch `instalacoes/fichas-5-1-a-5-3`, commit f2e03b4. A tela é do 10 (`fvs/instalacoes-5-1-a-5-3`).

- **Tipos novos no pacote:**
  - `tubo`: trecho deitado, desenhado como linha, igual ao eletroduto.
  - `coluna`: a prumada. São os trechos em pé no mesmo lugar (grade de 10 cm) que, somados, passam de 2,5 m. A descida curta até o aparelho fica fora.
  - `caixa_parede`: tomada, interruptor, pulsador e dimmer. A tomada de teto ou de piso continua `caixa_passagem`.
- **Ambiente do ponto:** o modelo de instalações está nas mesmas coordenadas da arquitetura. Cada ponto ganha `ambiente`, que é o id do elemento A onde ele cai; o ponto na parede fica com o ambiente mais perto, até 30 cm. Sem ambiente, o ponto vai sem esse campo. O config aceita `"instalacoes": {"ambientes": <pavimento_ambientes.json>}`.
- **Fichas:** `"pontos"` aceita uma lista de disciplinas e `"pontos_tipos"` diz quais tipos o item marca. O mesmo tipo não pode marcar dois itens da mesma ficha. `publicar_fichas --trocar-itens` troca os itens de uma ficha já publicada; é recusado no servidor da obra.
- **Marcas** (arquivo `fichas_instalacoes_2026-11-23\fichas_5_1_a_5_3.json`, fora do repositório):
  - 010.4 (redes suspensas e colunas): item 10 água [tubo, coluna]; item 17 esgoto [tubo, coluna]; item 19 esgoto [ralo, caixa sifonada, caixa, ponto de esgoto].
  - 010.6 (dreno suspenso): nenhuma marca.
  - 010.5 (alvenaria e drywall): item 6 água [ponto de água, registro, hidrômetro].
  - 009.6: item 4 [caixa de parede]. 009.7: item 5 [caixa de parede].
  - O ponto de esgoto fica só na 010.4, por decisão do Nicolas em 23/11 ("só uma delas").
- **2º gerado** (pacotes em `pacotes_instalacoes_5x_2026-11-23\05_2_pavimento`):
  - água: tubo 5208, coluna 222, registro 189, ponto de água 145, hidrômetro 7;
  - esgoto: tubo 3175, coluna 256, caixa sifonada 124, ralo 73, caixa 10 (541 pontos sem ambiente);
  - elétrico: caixa de parede 2440, eletroduto 1120, caixa de passagem 103.
- **Login do pipeline no servidor de testes:** a conta de teste do `.env` (`SUPABASE_TESTES_*`), só em memória, sem sessão guardada. Nunca vale para o servidor da obra.
- **No servidor de testes (24/11):**
  - fichas 010.4, 010.6, 010.5, 009.6 e 009.7: 4 novas e 1 com os itens trocados;
  - instalações do 2º: água 5771 locais, esgoto 3638, elétrico 3663, preventivo 176 e SPDA 23.
- **Falta:** a conferência na tela, com o Professor quando o Nicolas entrar.
- **Caixas empilhadas (24/11, achado do 10, commit bd17ee4):** o "módulo ... não listável" saía como ponto à parte, no mesmo lugar do conjunto. Agora não vira ponto. No 2º, as caixas de parede foram de 2440 (509 grupos empilhados) para 1396, sem nenhum. O elétrico do 2º foi republicado nos testes: 2619 locais, e o 10 conferiu na tela.
- **Pendência (app):** a planta republicada com a mesma prancha mantém a revisão (R02), e o menu mostra "Revisão nova… Baixar R02". A proposta é o app comparar pelo id da planta e dizer "Planta atualizada". O pipeline não muda a revisão, porque o planta_ref do Concreto depende dela.

## Estrutura no servidor de testes (23 e 24/11/2026, frente 20)

Pedido do Professor: forma + furação de todos os pavimentos e a armadura de laje no servidor de testes, pelo `publicar_planta.py --folha-unica --aceita-ambientes`, com a conta de teste. Configs: `pavimentos_instalacoes_2026-11-21\*_furacao*.json` (a mesma lista do `PUBLICAR_TESTES_INSTALACOES.bat`) e `pavimentos_armadura_2026-11-20\*.json` (`--so-armadura`). Script: `pavimentos_instalacoes_2026-11-21\pub_testes_estrutura.sh` (fora do repositório), um pavimento por vez.

- **Publicado (24/11 de manhã; o Subsolo foi em 23/11):**

  | Pavimento | Forma (peças novas) | Furos | Armadura (locais nas 4 plantas) |
  |---|---|---|---|
  | Subsolo | R14: 440 | 13 | sem config |
  | Térreo comercial | R01: 305 | 104 | 7 / 4 / 3 / 2 |
  | Pilotis | R02: 1502 | 658 | 483 / 397 / 454 / 491 |
  | Mezanino | R00: 1281 | 683 | 434 / 420 / 358 / 365 |
  | 2º | R02: 1537 | 1114 | 538 / 534 / 590 / 574 |
  | 3º | R03: 1462 | 1072 | 549 / 549 / 577 / 564 |
  | 4º | R02: 1466 | 1073 | 504 / 537 / 576 / 552 |
  | 5º | R01: 1476 | 1070 | falta prancha |
  | 6º | R01: 1451 | 1070 | falta prancha |

  A armadura está na ordem transversal superior / transversal inferior / longitudinal superior / longitudinal inferior.
- **Ambientes do 22 intactos:** os 5 setores "Ambientes" (2º ao 6º) e os elementos A e E (301/724, 306/732, 303/722, 307/732, 294/717) seguem iguais, e nada foi apagado. A planta "Blocos" do Subsolo é do chat 03.
- **5º e 6º sem detalhe e sem armadura:** o PC (índice de projetos do PC) só tem as formas. Faltam PIL5PAVTIP, PIL6PAVTIP, VIG5PAVTIP, VIG6PAVTIP, LAJ5PAVTIP e LAJ6PAVTIP. Nada foi baixado; o Professor decide.
- **Vigia do Autodoc:** desligado durante a publicação.
- **Concreto, TRAVADO:** as 276 `caminhao_areas` (eram 245 em 23/11) guardam `planta_ref` da produção. Cada id antigo, o id novo nos testes (mesma revisão, folha do mesmo tamanho) e o pavimento:
  - 004b772f… → 619bb992… (Subsolo);
  - 2abf095a… → 405aaaa5… (Pilotis);
  - 9c1f5082… → 3d8bf1df… (Mezanino, planta);
  - 5d74d93d… → 40b765c4… (Mezanino, setor);
  - 025647b0… → 8c103047… (2º).

  O UPDATE é recusado pelo núcleo ("caminhao_areas é só de inclusão"). Nada foi trocado. O desfazer está pronto em `pavimentos_instalacoes_2026-11-21\DESFAZER_planta_ref_caminhao_areas_2026-11-24.sql`. Decisão do Professor (24/11): caminho (b), feito pelo 04 (Concreto) pelo caminho do app, com este mapeamento. O `b6593cf2…@R00` (5 áreas) é um setor que já existe nos testes e não se mexe.

## Instalações de todos os pavimentos no servidor de testes (24/11/2026, sessão 6 do plano)

Pedido do Professor: SPDA, PPCI, água, esgoto e elétrico em todos os pavimentos, no padrão do 2º. Só no servidor de testes, sempre por `com_vigia_desligado.py`, um pavimento por vez.
- **Configs:** `pavimentos_instalacoes_2026-11-23\*_todas.json`, fora do repositório, montadas iguais à do 2º. Usam as cópias leves de 23/11 do IFC de água, esgoto e elétrico (com geometria e com as caixas de parede) e o arquivo de ambientes, que só existe do 2º ao 6º.
- **Primeira rodada errada:** o 3º e o 4º saíram antes com as configs de 21/11 (IFC sem geometria nem caixas de parede). Foram republicados no padrão do 2º, e as plantas novas substituíram essas.
- **SPDA:** as decisões do Nicolas (pranchas coladas pelos pilares; BEP como caixa) já estavam no código desde 22/11.
- **Nada baixado:** todas as pranchas e IFCs já estavam no PC.
- **Locais por planta:**

  | Pavimento | Água | Esgoto | Elétrico | Preventivo | SPDA |
  |---|---|---|---|---|---|
  | Subsolo | 158 | – | – | 13 | 12 |
  | Térreo comercial | 529 | 1080 | 86 | 178 | – |
  | Pilotis | 1936 | 3082 | 967 | 377 | 33 |
  | Mezanino | 1044 | 2488 | 1146 | 123 | 58 |
  | 2º (23/11) | 5771 | 3638 | 2619 | 176 | 23 |
  | 3º | 5763 | 3573 | 7251 | 176 | 23 |
  | 4º | 5741 | 2829 | 7240 | 176 | 22 |
  | 5º | 5731 | 2842 | 7240 | 176 | 22 |
  | 6º | 5679 | 2946 | 7474 | 176 | 29 |

- **Caixas de parede:** no 3º são 1.396, nenhuma empilhada (conferido no IFC).
- **Ponto sem ambiente**, só do 3º ao 6º:

  | Pavimento | Esgoto | Elétrico | Água |
  |---|---|---|---|
  | 3º | 164 | 8 | 0 |
  | 4º | 206 | 8 | 0 |
  | 5º | 165 | 8 | 0 |
  | 6º | 268 | 19 | 2 |

- **Fundo da forma**, sem as pranchas da disciplina: PPCI do 6º, do mezanino, do pilotis, do térreo e do subsolo (as pranchas não encaixam).
- **Falta:** conferir no app o desempenho do elétrico de ~7.200 pontos (o 10) e o "visto" do PPCI (Nicolas).

## Vigia sempre religado (24/11/2026, achado do revisor)

- **O defeito:** se a publicação parasse no meio (erro, Ctrl+C, janela fechada), a tarefa agendada que usa o mesmo login (o vigia) ficava desligada. Quem religava era só a última linha do .bat.
- **A correção:** `pipeline/fvs/com_vigia_desligado.py` desliga a tarefa, espera ela parar e roda o comando. Depois religa sempre: no fim, em erro, no Ctrl+C e com a janela fechada.
  - Se for interrompido, encerra antes o comando e os filhos dele.
  - Um segundo Ctrl+C não corta a limpeza.
  - No fim mostra o estado da tarefa e avisa se ela não ficou ligada.
  - O nome da tarefa entra por `--tarefa`.
- **O .bat:** o .bat de publicação (fora do repositório) chama `com_vigia_desligado.py --tarefa ... -- "%~f0" passos`. O próprio .bat roda os passos.
- **Quando nada segura:** só matar o Python à força ou desligar o PC. Nesse caso a próxima rodada avisa que a tarefa já estava desligada, e há um `RELIGAR_VIGIA.bat` ao lado do .bat.
- **Testes:** `pipeline/testes/test_com_vigia_desligado.py`, 10 testes, um deles com processo de verdade.

## Maciços (capitel) completos no 3º e no 4º (24/11/2026, frente 20, achado de campo #1 e #3)

Commit c59cfbd, em `pipeline/fvs/partes.py`.
- **Recorte:** antes, entrava só o grupo de desenho colado ao título; o P66 do 3º saía só com as barras N1. Agora entram todos os desenhos que ficam embaixo e à direita do título; cada um vai para o título mais perto acima e à esquerda. O selo da prancha (achado pelo quadro de revisões) e a tabela de aço ficam fora.
- **Títulos:** dois títulos no mesmo bloco de texto agora contam como dois. Por isso o P67 e o P122 (LO.4109) se perdiam. Também passou a ler "P200 P213" sem traço.
- **P67a:** o título diz "P67", e o nome casa com o P67a da forma pela base do nome. Volta a ter capitel.
- **P50a:** não aparece em nenhuma prancha de maciço do PC, nem do 3º nem do 4º. Falta o detalhe; não é o sufixo.
- **Contagem nas pranchas** (pilares nos títulos / com imagem):

  | Pavimento | Antes | Depois |
  |---|---|---|
  | 3º | 123 / 101 | 129 / 129 |
  | 4º | 116 / 106 | 118 / 118 |

  Os recortes únicos passaram de 47 para 56 no 3º e de 34 para 43 no 4º.
- **Republicado no servidor de testes:** só a Planta inteira do 3º e do 4º (configs `*_so_forma.json`, sem a furação), com o vigia desligado nesse tempo.
- **Anel do capitel no tamanho real** (campo #1, commit 7609405): antes era um quadrado fixo de 0,5 m em volta do pilar. Agora as cotas do desenho da armadura dão o tamanho: o maior trecho reto escrito deitado é a largura, o maior em pé é a altura. O P66 do 3º dá 235 × 327 cm, e o anel fica centrado no pilar.
  - Sem as duas cotas, ou com medida menor que o pilar, volta ao anel de 0,5 m.
  - Todos os 129 maciços do 3º e os 118 do 4º têm medida.
- **Aviso de maciço sem prancha** (pedido do Professor, LISTA DE CAMPO #3): a publicação lê as cubetas da forma (camada `LJ_NERV*`). Pilar com cubetas nos quatro lados, todas a pelo menos 0,55 m dele, tem maciço. Se não ganhou capitel, o resumo avisa "ATENÇÃO: maciço na forma e em nenhuma prancha de maciços". É só aviso; a planta não muda.
  - 3º: P64b e P237.
  - 4º: P64b, P74, P86, P87, P90, P95a, P100a, P198a, P237, P322a e P327a. Conferir na forma; o 4º tem só 3 pranchas de maciço no PC.
  - O P67a, o P122a e o P78aa do 3º já ganham capitel com a leitura nova.
- **5º e 6º:** sem pranchas de maciço no PC (LO.4156–4159 e 4180–4183 estavam "Em Análise").

## Plano do SPDA como aba (22/11/2026, só o plano)

Pedido do Professor: listar o que falta para o SPDA da obra entrar como aba. Nada foi publicado nem rodado contra o servidor.

**O que já existe:** a disciplina `spda` ("Captores e descidas") no pipeline (`--so-spda`) e no app; a aba Pontos; a planta "Só consulta" quando nenhuma ficha marca o SPDA.

**O que a pasta do SPDA da obra traz (33 arquivos, fora do repositório):**
- um IFC geral;
- 32 PDFs:
  - lista mestra e memorial;
  - 2 isométricos;
  - plantas por pavimento e setor: subsolo, térreo, mezanino, tipo, 5º, 6º e cobertura, 3 setores cada;
  - reservatório e topo da cobertura;
  - 3 cortes, detalhe e norma.

**O IFC real contra a regra de hoje** (`classificar` em `instalacoes.py`, ainda suposição):

| Objeto no IFC (classe, quantidade) | Regra de hoje | O que fazer |
|---|---|---|
| "Minicaptor em barra chata de alumínio" (proxy, 116) | captor (casa por CAPTOR) | manter |
| "Caixa de Barramento Equipotencial - BEP" (proxy, 6) | caixa_inspecao (casa por BEP) | manter; talvez tipo próprio "BEP" |
| "Conector ATERRINSERT" (conexão, 61) | não entra (ATERR não casa com ATERRAMENTO) | é o ponto de medição/aterramento da descida? conferir no memorial e no detalhe; se for, vira `caixa_inspecao` ou `haste` |
| "Terminal" (conexão, 69) | não entra | conferir: terminal aéreo do captor ou da descida |
| barra chata, barra redonda, cabo de cobre nu e curvas (conexão, centenas) | não entra | são a malha da cobertura e as descidas; trecho vertical vira um ponto `descida`, horizontal fica fora ou vira linha |
| "Conduit without Fittings" (segmento, 1568) | não entra | conferir se algum é a descida embutida no pilar; os demais ficam fora |
| clips, parafusos, porcas, redutores, adesivo de alerta | não entra | fora (acessório) |

Não há objeto chamado "descida", "caixa de inspeção" nem "haste": a descida tem de sair da geometria (trecho vertical) e a caixa, do conector.

**Passos, em ordem:**
1. Ler o memorial e o detalhe (PDF, sem servidor) para fixar o que é descida, caixa de inspeção e aterramento neste projeto.
2. Ajustar a regra do SPDA em `instalacoes.py` com os nomes reais, sem tirar os atuais; teste na EXE com um IFC de mentira nos nomes novos.
3. Descida pela geometria: trecho de barra, cabo ou conduíte do SPDA quase vertical (mais de 1 m de altura) vira um ponto `descida` no pavimento onde passa; teste na EXE.
4. Pavimento de cada objeto: o IFC tem os mesmos nomes de pavimento dos outros modelos ("2° PAVIMENTO" etc.); vale o filtro por altura que o elétrico já usa. O subsolo aparece duas vezes no IFC: escolher pelo nome com a altura.
5. Encaixe IFC → folha: pelos pilares da forma, como nas outras disciplinas; conferir no 2º e em mais um pavimento, olhando a distância das descidas aos pilares.
6. **Cobertura (decisão do Nicolas):** quase todos os captores e a malha ficam na cobertura, e a cobertura não tem forma. Opções:
   - a) fundo das plantas de SPDA da cobertura (3 setores), coladas pelos pilares como na furação;
   - b) esperar a forma da cobertura;
   - c) deixar a cobertura fora e publicar só as descidas e caixas dos pavimentos.

   Sugestão: a), porque as plantas existem e a colagem já foi feita na furação.
7. Fundo dos demais pavimentos: a forma serve, e as plantas de SPDA (3 por pavimento) podem entrar como na furação, se o Nicolas preferir ver o desenho do projetista.
8. Config por pavimento (dado da obra, fora do repositório): `"instalacoes": {"spda": {"ifc": ..., "nivel": [...]}}`, junto dos configs de instalações já existentes.
9. Gerar sem publicar, um pavimento por vez, e conferir a contagem por tipo contra a lista mestra ou o isométrico.
10. Fichas PVS 009.2.1 (captores) e 009.2.2 (descidas e caixas) como dado da obra, com o item `"pontos": "spda"`. Enquanto não houver ficha, a aba aparece como "Só consulta".
11. Publicar, um pavimento por vez, só quando o Professor liberar o login.

**Perguntas para o Nicolas:** a cobertura (passo 6); se a BEP é um tipo próprio ou entra como caixa de inspeção.
