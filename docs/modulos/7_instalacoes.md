# Instalações (hidro, sanitário, elétrico, preventivo e SPDA)

Frente aberta em 20/11/2026, com o pedido do Nicolas repassado pelo Professor. Cada disciplina vira um setor do pavimento, com planta própria, como a armadura de laje ("um layer a mais"). O menu do pavimento já mostra sozinho uma disciplina nova, com o nome dela e as plantas (`1_fvs.md`, menu do pavimento genérico).

## Regras vigentes

- **Ponto: suposição provisória, aprovada pelo Professor em 20/11; a decisão final é do Nicolas.**
  - **Como fica:** o ponto (ralo, caixa, ponto de água, registro) não é peça em `elementos`. Vai no pacote da planta como sobreposição, em `"pontos"`, como as `"barras"`. O id é fixo, calculado da disciplina e do id do objeto no modelo.
  - **A ficha:** é a PVS do serviço e fica no ambiente, porque o lote das PES 009 e 010 é por ambiente. O ponto conferido alimenta o item dela.
  - **Banco:** sem migração e sem mudança em `elementos.tipo` nem em `fvs_eventos`. O registro do ponto deve usar a coluna `barra_id`, que já existe: id do pacote, sem chave estrangeira, com `planta_id`.
  - **Antes de pôr no app:** o Professor confere se usar `barra_id` para o ponto vale. Se não valer, ou se for preciso coluna nova, a frente para e avisa.
  - **Alternativa, se o Nicolas preferir:** um tipo de peça novo, "I", em `elementos`. Precisa de migração no núcleo.
- **Disciplinas:**
  - `hidro` (setor "Água fria e quente"): ponto de água, registro, hidrômetro.
  - `sanitario` (setor "Esgoto e pluvial"): ralo, caixa sifonada, caixa, ponto de esgoto de aparelho.
  - Em `setores.disciplina` o texto é livre.
- **De onde vêm os pontos:** do IFC da disciplina (`pipeline/fvs/instalacoes.py`), no nível do pavimento. O nível é o pavimento que contém o objeto ou o "Level" das propriedades. A posição é a do objeto no modelo, em cm.
  - Classificação, **suposição** a conferir com o IFC real: pela classe IFC (IfcWasteTerminal, IfcSanitaryTerminal, IfcValve, IfcFlowMeter...) e pelo nome ("RALO", "CAIXA SIFONADA", "REGISTRO"...).
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

## Status (20/11/2026)

- **Feito:**
  - levantamento do Autodoc: disciplinas, fases, pranchas e formatos;
  - lista das PVS que existem;
  - proposta, mandada ao Professor;
  - pipeline de `hidro` e `sanitario`, com os testes na EXE.
- **Falta:**
  1. O download das pranchas e modelos vigentes. Espera o ok do Nicolas no chat da frente.
  2. O piloto no 2º pavimento real, fora do repositório. Depende do download e serve para conferir a classificação e o encaixe.
  3. O app: desenhar os `"pontos"` na planta da disciplina e o toque OK/NC, como as barras. Os arquivos são de `app/src/fvs/`; falta combinar com o Professor quem faz.
  4. As fichas: PVS 010.2, 010.4, 010.5 e 010.6 como dado da obra, fora do repositório.
  5. Depois: SPDA (PVS 009.2.1 e 009.2.2), elétrico (PVS 009.x; na laje só o PES 009.4) e preventivo (sem PES nem PVS: itens marcados como suposição).
