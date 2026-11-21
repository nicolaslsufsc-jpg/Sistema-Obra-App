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
  - No menu do pavimento as seções saem nesta ordem: "Hidráulica", "Sanitário", "Elétrico", "SPDA". A linha de cada planta conta "pontos".
  - **Alternativa descartada:** um tipo de peça novo, "I", em `elementos`, que precisaria de migração no núcleo.
- **Disciplinas:**
  - `hidro` (setor "Água fria e quente"): ponto de água, registro, hidrômetro.
  - `sanitario` (setor "Esgoto e pluvial"): ralo, caixa sifonada, caixa, ponto de esgoto de aparelho.
  - `eletrico` (setor "Caixas e quadros"): caixa de passagem e ponto de luz (caixa octogonal) na laje, como no PES 009.4, e quadro (PVS 009.x). A ficha da laje elétrica é **suposição**, porque não há PVS dela.
  - `spda` (setor "Captores e descidas"): captor (PVS 009.2.1), descida e caixa de inspeção (PVS 009.2.2), haste de aterramento. A descida é vertical: na planta, aparece como ponto.
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
  - Prancha que não encaixa fica fora do fundo, e o relatório diz por quê.
  - Na obra piloto, o setor A do subsolo encaixou com 64 de 66 pilares e erro de até 0,2 cm.
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
  5. Preventivo: não há PES nem PVS, então os itens entram marcados como suposição.
