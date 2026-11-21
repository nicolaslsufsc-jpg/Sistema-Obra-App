# Instalações (hidro, sanitário, elétrico, preventivo e SPDA)

Frente aberta em 20/11/2026, com o pedido do Nicolas repassado pelo Professor. Cada disciplina vira um setor do pavimento, com planta própria, como a armadura de laje ("um layer a mais"). O menu do pavimento já mostra sozinho uma disciplina nova, com o nome dela e as plantas (`1_fvs.md`, menu do pavimento genérico).

## Regras vigentes

- **Ponto: opção B, decidida pelo Nicolas em 20/11 ("Sim, no ambiente", pelo Professor).**
  - **Como fica:** o ponto (ralo, caixa, ponto de água, registro) não é peça em `elementos`. Vai no pacote da planta como sobreposição, em `"pontos"`, como as `"barras"`. O id é fixo, calculado da obra, do pavimento, da disciplina e do id do objeto no modelo (`id_do_ponto`). Obra, pavimento e disciplina identificam a planta da disciplina: o mesmo IFC usado em dois pavimentos ou em duas obras não repete id (correção do revisor, 21/11). Não usa o `planta_id` do servidor porque ele muda a cada publicação e o registro ficaria solto.
  - **A ficha:** é a PVS do serviço e fica no ambiente, porque o lote das PES 009 e 010 é por ambiente. O ponto conferido alimenta o item dela.
  - **Banco:** sem migração e sem mudança em `elementos.tipo` nem em `fvs_eventos`. O registro do ponto usa a coluna `barra_id`, que já existe: id do pacote, sem chave estrangeira, com `planta_id`.
  - **`barra_id` vale para "local de sobreposição (barra ou ponto)"** (aprovado pelo Professor em 20/11). Se um dia for preciso coluna nova, a frente para e avisa.
- **No app (aba Pontos):** a planta da disciplina abre direto na aba Pontos, com um círculo por ponto (azul sem conferir, verde OK, vermelho errado).
  - O toque segue o ciclo da barra: OK, depois errado (pede o que está errado antes de gravar), depois sem conferir. Tem Desfazer. Dois pontos juntos: pede para aproximar.
  - O registro vai no item da ficha de ambiente marcado com `"pontos": "hidro"`, `"sanitario"`, `"eletrico"` ou `"spda"` (`app/src/fvs/pontos.ts`). Sem esse item na ficha, o toque avisa e não grava.
  - **Ficha:** em `publicar_fichas.py`, `"pontos"` só vale em ficha de ambiente (`aplica_a: ["A"]`) e não junta com furos, barras, parte ou esquadrias.
  - No menu do pavimento as seções saem nesta ordem: "Hidráulica", "Sanitário", "Elétrico", "SPDA". A linha de cada planta conta "pontos".
  - **Alternativa descartada:** um tipo de peça novo, "I", em `elementos`, que precisaria de migração no núcleo.
- **Disciplinas:**
  - `hidro` (setor "Água fria e quente"): ponto de água, registro, hidrômetro.
  - `sanitario` (setor "Esgoto e pluvial"): ralo, caixa sifonada, caixa, ponto de esgoto de aparelho.
  - `eletrico` (setor "Caixas e quadros"): caixa de passagem e ponto de luz (caixa octogonal) na laje, como no PES 009.4, e quadro (PVS 009.x). A ficha da laje elétrica é **suposição**, porque não há PVS dela.
  - `spda` (setor "Captores e descidas"): captor (PVS 009.2.1), descida e caixa de inspeção (PVS 009.2.2), haste de aterramento. A descida é vertical: na planta, aparece como ponto.
  - **Eletroduto fica fora:** é linha, não ponto. Se for preciso conferir o eletroduto, ele entraria como linha, igual às barras. Essa decisão fica para depois.
  - Em `setores.disciplina` o texto é livre.
- **De onde vêm os pontos:** do IFC da disciplina (`pipeline/fvs/instalacoes.py`), no nível do pavimento. O nível é o pavimento que contém o objeto ou o "Level" das propriedades. A posição é a do objeto no modelo, em cm.
  - Classificação, **suposição** a conferir com o IFC real: pela classe IFC (IfcWasteTerminal, IfcSanitaryTerminal, IfcValve, IfcFlowMeter...) e pelo nome ("RALO", "CAIXA SIFONADA", "REGISTRO"...).
  - No elétrico e no SPDA, também suposição, porque ainda não abri os IFC reais. Pelas classes de elétrica (IfcJunctionBox, IfcElectricDistributionBoard, IfcLightFixture...) e pelo nome ("CAIXA DE PASSAGEM", "OCTOGONAL", "QDL", "CAPTOR", "DESCIDA", "CAIXA DE INSPEÇÃO", "HASTE").
  - Trecho de tubo, cabo ou eletroduto só vira ponto no SPDA, e só se o nome disser "descida".
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

## Status (21/11/2026)

- **Feito:**
  - levantamento do Autodoc: disciplinas, fases, pranchas e formatos;
  - lista das PVS que existem;
  - proposta, mandada ao Professor;
  - pipeline de `hidro` e `sanitario`, com os testes na EXE;
  - app: aba Pontos (toque OK, errado, sem conferir, Desfazer), testada na bancada em 375 px e em tablet com 40 pontos de teste;
  - `eletrico` e `spda` no pipeline (`--so-eletrico`, `--so-spda`) e no app. Na `main` pelo #52.
  - correção do revisor (21/11): o id do ponto leva obra e pavimento. Branch `instalacoes/id-ponto-planta`. Os pontos publicados antes mudam de id, mas nenhum foi publicado no servidor.
- **Falta:**
  1. O download das pranchas e modelos vigentes. O Nicolas deu o ok no chat da frente em 20/11.
  2. O piloto no 2º pavimento real, fora do repositório. Depende do download e serve para conferir a classificação e o encaixe; no elétrico e no SPDA, também os nomes reais.
  3. As fichas como dado da obra, fora do repositório, com o item dos pontos marcado:
     - hidro e sanitário: PVS 010.2, 010.4, 010.5 e 010.6;
     - elétrico: PVS 009.x, mais a laje elétrica como suposição;
     - SPDA: PVS 009.2.1 e 009.2.2.
  4. Decidir se o eletroduto entra como linha.
  5. Preventivo: não há PES nem PVS, então os itens entram marcados como suposição.
