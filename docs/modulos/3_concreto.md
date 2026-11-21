# Módulo 3: Concreto

Branch: `app/concreto` (desde 08/11/2026: um chat só para o Concreto; núcleo e migrações pelo chat da FVS)

Histórico e detalhe: docs/historico/3_concreto.md

## Objetivo
Rastreabilidade do concreto por peça. Para cada concretagem: os caminhões (nota fiscal, volume, horários, slump, água, CPs moldados) e **onde cada caminhão foi**, desenhado na planta com a caneta do tablet. A partir do desenho o app gera o relatório das peças concretadas. Tocando no caminhão: os corpos de prova, as datas de rompimento e se o laudo está atrasado ou abaixo do fck.

## Status
Atualizado em 20/11/2026, conferido no `git log` da `main` do repositório público (806adec) e no código.
- **Na `main`:** o rastreio para a FVS (pilar e viga, PR #2; laje pela área da FVS, PR #20) e as áreas de laje da FVS no relatório (PR #23).
- **Commit local (20/11), branch `concreto/fvm-migracao`:** migração do FVM e o FVM ligado com login (pendência 11). Push, PR e a migração no servidor ficam com o Professor.
- **Migrações no servidor de São Paulo:** `20261103230000_concreto.sql` e `20261107210000_concreto_caneta.sql` (`caminhao_areas.alvo`), aplicada em 08/11/2026. A do FVM (`20261120120000_concreto_fvm.sql`) espera o merge.
- **Testes de 20/11 neste PC:** testes SQL (`rodar_testes_windows.py`, 300 checagens), build, `npx vitest run` (742 passaram) e a bancada do Concreto no Chrome (18 passaram, 375 px e 1280). O teste contra o PostgREST (`rodar_integracao.sh`) não roda no Windows: fica para o GitHub.
- **Commit local (21/11), branch `concreto/planilha-controle`:** planilha de controle no modelo da obra (abaixo). Testes de 21/11: `npx vitest run` (831 passaram), build e a bancada do Concreto (19 passaram, 375 px e 1280).
- **Não testado:** no tablet de verdade (pendência 1). A planilha gerada foi conferida pelo `openpyxl`; abrir no Excel de verdade fica com o Nicolas.
- **21/11/2026, carga inicial da obra piloto no servidor:** carga inicial da obra a partir da planilha de controle + sistema oficial, script fora do repositório. Cruzamento por NF (no sistema oficial, o "pedido") e data. Local pelo sistema oficial; fck e datas pela planilha; o resto estimado e marcado na observação. Resultados de 7 e 28 dias da planilha, com "conferir com laudo". Peças não ligadas (as fontes não trazem o nome da peça). Ficaram fora as linhas de total (volume > 20 m³), as sem local e os caminhões só agendados. Carga pelo PostgREST com login de administrador, idempotente (ids fixos, `ignore-duplicates`). Conferida no servidor pelo Professor.
- **21/11/2026, áreas dos caminhões a partir das plantas de concretagem:** as imagens anexadas às fichas no sistema oficial (desenho à mão sobre a planta de fôrmas, "C1, C2..." = nº do caminhão = ordem da planilha) foram alinhadas com a planta do app pelos centros dos pilares (ajuste afim, erro de poucos px) e traçadas à mão; as peças saem da sobreposição com os elementos da planta (fração ≥ 0,2). Tudo marcado como estimado (origem `desenho`). Cores sem número ligadas pela ordem de saída da usina (lista a confirmar fora do repositório). Imagem sem separação por caminhão: a área vale para todos os caminhões da ficha. Blocos de fundação ficaram fora. Carga idempotente pelo PostgREST, scripts fora do repositório.
- **21/11/2026, tela inicial:** pavimentos primeiro, laudos depois (ordem pedida pelo Nicolas).

## Próximo passo
1. Professor: PR da `concreto/fvm-migracao` e, depois do merge, a migração do FVM no servidor (sem ela, o FVM dá erro na baixa com login).
2. Laudo lido sozinho (pendência 4): o Nicolas mandou um laudo de exemplo em 20/11. Montar o leitor com teste de dado fictício (EXE), sem copiar o PDF nem citar laboratório.
3. A FVS liga o rastreio na ficha (03 · FVS-EST) e o Nicolas marca `rastreio_concreto` nas fichas da obra piloto (pendência 8).
4. Depois: o `.xlsx` da ficha pelo modelo da empresa (o Nicolas disse "pode ser depois").
5. Quando o app abrir no tablet (pendência 1): Nicolas testa no tablet com a caneta, sem internet.

## Como testar
- Banco: `python supabase/testes/rodar_testes_windows.py` (no PC do Nicolas) ou `bash supabase/testes/rodar_testes.sh`. Testes do módulo: `supabase/testes/testes_x_concreto.sql` e `testes_x_concreto_fvm.sql`.
- App: `cd app && npm run build` e `npx vitest run` (testes do Concreto em `app/src/concreto/*.test.ts`).
- Bancada no navegador (só no `npm run dev`): `app/dev/concreto.html` abre o módulo com peças de teste, sem login nem servidor. Opções: `?papel=campo`, `?exemplo=1`, `?obra=<id>` (a mesma obra que a bancada da FVS guardou). Teste de tela: `app/testes/concreto_bancada.e2e.test.ts` (375 px e 1280 px).
- Contra o PostgREST: `E2E=1 bash supabase/testes/rodar_integracao.sh` (não roda no Windows; fica para o GitHub).

## Decisões que valem (resumo)
- **Local por peça, desenhado** com a caneta do tablet, uma ou mais áreas por caminhão. O app acha as peças dentro da área: 90% ou mais = inteira, 10% a 90% = parcial (o relatório avisa), menos de 10% = ignorada. Toque com o dedo inclui ou tira a peça e vale mais que o desenho.
- **Duas canetas** (07/11): Pilares e Vigas e laje (esta põe a laje do trecho junto, gravada como `desenho`; Desfazer e Apagar áreas tiram a laje junto).
- **Laje**: uma por trecho, marcada no toque, sem contorno; quem cria é a pessoa no app (só gestor e admin), linha de `elementos` tipo `L`, nome `Laje_Trecho_N`, id fixo UUID v5 (`concreto/lajes.ts`). Na obra, o rastreio e o relatório usam as áreas de laje da FVS (`fvs_areas`), só por cálculo.
- **Construpoint continua sendo o registro oficial** das fichas de rastreabilidade. Laudos: fonte a decidir; o resultado de cada CP guarda a origem (`manual`, `lado37`, `construpoint`).
- **CPs** (provisório, a confirmar): 7 e 28 dias, 2 CPs por idade; rompimento = dia da concretagem + idade; atrasado = mais de 3 dias sem resultado; exemplar = maior valor da idade; só o de 28 dias compara com o fck.
- **FVM** (recebimento de materiais, 5 decisões confirmadas em 20/11): fica dentro do Concreto, sincroniza com o servidor, "liberado com ressalva" exige texto, só gestor e admin tiram do retido; a lista de materiais por enquanto é importada (`materiais.json`).
- **Rastreio para a FVS** (`concreto/rastreio.ts`): peça com caminhão fica C, sem caminhão fica pendente (nunca NC), nada é gravado na FVS.
- **Tabelas** (todas só de inclusão, correção por `substitui_id`): `concretagens`, `caminhoes`, `caminhao_areas` (com `planta_ref` e `alvo`), `caminhao_elementos`, `cp_resultados`; FVM: `materiais_controlados`, `recebimentos`. Migrações: `20261103230000_concreto.sql`, `20261107210000_concreto_caneta.sql`, `20261120120000_concreto_fvm.sql`.
- **Planta**: vem do pacote da FVS (`fontePlantasFvs`, registrada em `telas/ModuloConcreto.tsx`); hoje uma folha por pavimento, da pasta `dados_obra`.
- Texto completo das decisões, do funcionamento, das tabelas, da planta e das ligações: no histórico.

## Pendências abertas (resumo; texto completo no histórico)
1. App no tablet sem internet (núcleo): precisa de https e de um jeito de pôr o pacote da obra piloto no tablet.
4. Ler o laudo sozinho: fonte a decidir; laudo de exemplo recebido em 20/11 (fora do repositório).
6. Laje que entrou com a área antes de 08/11 ficou como toque: a confirmar com o Nicolas se existe dado real assim.
7. Dados só no navegador do tablet: no Android não há salvamento automático em pasta (núcleo).
8. A FVS ligar o rastreio na ficha (03 · FVS-EST) e o Nicolas marcar `rastreio_concreto` nas fichas da obra piloto.
9. Desempenho no tablet: medido só no PC, com 560 peças (o Pilotis tem 845).
11. FVM: falta o merge da `concreto/fvm-migracao` e a migração no servidor (Professor).
- Entregas que faltam: trazer as fichas do Construpoint para o app (só depois do ok da empresa); o modelo da planilha de controle vir no pacote da obra; empreiteira e testemunho.
- Pedidos abertos à FVS: blocos de fundação como peça. Ao núcleo: pendências 1 e 7.

## Perguntas abertas ao Nicolas
- Laje criada só por gestor e admin: basta assim, ou o campo precisa criar (pedido ao núcleo)?
- A coluna "CP" da ficha recebe os CPs moldados do caminhão (4 por padrão): é isso que "CP 4" quer dizer?
- O limite de 10% para peça parcial está bom?
- Quantos CPs por idade o laboratório molda por caminhão?
- Margem de 3 dias para laudo atrasado está boa?
- Procedimento de concreto (para conferir as regras de aceitação).

## Depende de
Núcleo (sincronização, `pavimentos`, `elementos`). FVS entrega 1 (pacote de planta) para desenhar em obra de verdade.
