# Instalações: ambiente dos pontos sem ambiente (regra de 25 e 26/11/2026)

Como o pipeline escolhe o ambiente (cômodo) de cada ponto de instalação nos pavimentos sem IFC de arquitetura,
e o que acontece com o ponto que não cai em cômodo nenhum. Os números da obra de verdade ficam fora do
repositório (pasta da obra no PC); aqui só a regra e um exemplo da obra fictícia EXE.

## Por que um ponto fica sem ambiente

Para achar o motivo, a prancha de arquitetura vira uma imagem de 10 cm por pixel só com as paredes (hachura
escura), com os vãos de porta fechados (até ~1 m). O vazio entre as paredes forma os recintos. Motivos:

- **na parede**: o ponto cai dentro da parede, longe do cômodo;
- **shaft**: recinto fechado com menos de 4 m²;
- **área aberta**: recinto encostado na borda da prancha ou com mais de 3.000 m² (jardim, deck, laje, vazio);
- **recinto sem ambiente**: recinto fechado que a planta de ambientes não tem;
- **casa sem ambiente**: unidade que a planta de ambientes do pavimento não desenhou, mas a de outro
  pavimento tem (casa de dois andares).

## Decisões do Nicolas (25/11/2026, ~22:45, página de perguntas, repassadas pelo Professor)

1. **Casas:** FVS **por casa**.
2. **Shaft e parede:** **cômodo vizinho**: shaft até 1 m, parede até 60 cm.
3. **Fora de cômodo:** vai para o **item da laje**, em **todas** as disciplinas.
4. **SPDA de fachada** (descida, captor): **laje**.
5. **Cômodos sem nome:** o programa tenta achar o nome; se não conseguir, fica **pendência para editar o nome**.

Sem resposta, regra mais simples (anotada): ponto na parede entre duas casas vizinhas fica com a casa onde está o
centro do ponto; se o centro cair na parede, a casa mais perto.

## Como funciona no pipeline (desde 26/11, já é o padrão)

No bloco `instalacoes.ambientes` do pavimento.json:

- `AMBIENTE_PERTO_CM` = 60 (era 30): o ponto fora de qualquer ambiente fica com o mais perto até 60 cm. Vale para
  todos os pavimentos; `"perto_cm"` troca.
- Só com o `"pacote"` (ambientes tirados do PDF):
  - `SHAFT_PERTO_CM` = 100: ponto no shaft vai para o cômodo vizinho até 1 m. `"shaft_perto_cm": 0` desliga.
  - Recintos fechados sem ambiente e com ponto dentro viram ambientes. O nome vem do texto da prancha dentro do
    recinto (a linha mais alta que não é área, cota, nível ou acabamento). Sem texto: `"Recinto sem nome N"`,
    pendência para o Nicolas editar. `"recintos_sem_nome": false` desliga.
  - `"casas": {"pacote", "prancha", "grupo": "Casa"}`: os ambientes do grupo "Casa" da planta de ambientes de
    outro pavimento (o de cima da mesma casa) entram como ambientes deste, com a prancha dele casada pelo mesmo
    andar tipo.
- Ponto dentro de dois ambientes: fica com o primeiro (as salas do pacote, depois as casas, depois os recintos).
- Fora de cômodo e SPDA de fachada: o pipeline manda o ponto sem ambiente; quem põe no item da laje é o app.
- Para o ponto levar o ambiente no app, o ambiente novo (casa, recinto) precisa existir como elemento A na
  planta de ambientes do pavimento; senão o publicador manda o ponto sem ambiente (`ambiente_pelo_id`).

Funções: `instalacoes.recintos_da_prancha`, `nomear_recintos`, `nome_pelo_texto`, `textos_da_prancha` e
`ambiente_dos_pontos`; no publicador, `regra_dos_ambientes` e `shaft_perto`. Testes em `TestRecintosEShaft`.

## Exemplo (obra fictícia EXE, números inventados)

> Exemplo, não é medição. Pilotis da EXE com 1.000 pontos.

| Situação | Antes (30 cm) | Com as decisões |
|---|---:|---:|
| Num ambiente do pacote | 300 | 340 (parede até 60 cm e shaft) |
| Numa casa (do pavimento de cima) | 0 | 400 |
| Num recinto novo | 0 | 20 ("Sala de Bombas" pelo texto; "Recinto sem nome 1" sem texto) |
| Sem ambiente (vai para o item da laje no app) | 700 | 240 |

## O que o app precisa (FVS-3)

1. Ponto de instalação sem ambiente vai para o item da laje do pavimento, em todas as disciplinas.
2. O SPDA de fachada segue a mesma regra.
3. Ficha por casa: o ambiente do ponto é a casa, e a FVS de instalação da casa junta os pontos dela.
4. "Recinto sem nome N" é provisório: a tela deixa o Nicolas editar o nome.
5. O pacote não muda: o ponto tem "ambiente" = id do elemento A, ou não tem o campo.

## O que entrou no app (26/11/2026, FVS-AMB)

- **Peça 1, fora de cômodo vai para a laje:** na planta de pontos em que o pipeline calculou o ambiente (algum
  ponto tem `"ambiente"`), o ponto sem ambiente grava no item da instalação da ficha de laje, em todas as
  disciplinas, sem perguntar. Água → item de água; esgoto → esgoto; elétrico e SPDA (inclusive descida e captor
  de fachada) → elétrica; preventivo: rede de água (hidrante, sprinkler, tubulação, registro, coluna) → água, o
  resto → elétrica. Dúvida de engenharia anotada (seguiu o mais simples): a ficha de laje não tem item de PPCI nem
  de SPDA; se o Nicolas quiser um item próprio, entra na ficha de laje da obra (montagem, sem código). Pacote sem
  ambiente calculado: nada muda. Teste de tela: `?instalacoes=1&fora=1&furoslaje=1` na bancada (375, 768, 1024).
- **Peça 2, casas e recintos como ambientes A (pipeline, só local, nada publicado):** a publicação das
  instalações (`--so-gerar`) grava `ambientes_novos.json` com as casas (`"casas"`) e os recintos sem ambiente, já
  nas coordenadas da prancha do pavimento (`ambientes_novos_na_prancha`). No `"ambientes"` da planta de ambientes do
  mesmo pavimento, `"ambientes_novos": "<esse arquivo>"` cria um elemento A para cada um, depois dos "AC-xx" (os
  ids de antes não mudam), com o mesmo nome que o ponto leva: a casa com o grupo e o cômodo dela ("Casa 1"), o
  recinto como área comum, e o "Recinto sem nome N" com `"pendencia": "nome"` no pacote. Nome repetido com um
  ambiente da planta para a geração com erro. FVS por casa: a casa é um ambiente só; o ponto dentro dela leva o
  ambiente da casa e grava na ficha de ambiente, como em qualquer cômodo (decisão mais simples, anotada: a tela
  não soma os pontos por casa; cada ponto continua com o registro dele). Ordem para publicar: instalações
  (`--so-gerar`) → planta de ambientes com `"ambientes_novos"` → instalações de novo (o ponto acha o id).
  Teste de tela: `?casas=1` na bancada.
