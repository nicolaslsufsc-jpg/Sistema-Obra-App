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
