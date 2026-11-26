# Instalações: pontos sem ambiente no pilotis, mezanino e subsolo (25/11/2026)

Pedido do Professor (frente 20 · INST). Análise feita só no PC, com os pacotes e configs da publicação de 25/11
(nada baixado de novo, nada republicado, nenhum código mudado).

## Como foi feito

- Pontos: os mesmos IFC de instalações e a mesma regra da publicação (`ambiente_dos_pontos`: dentro do polígono, ou
  o ambiente mais perto até 30 cm). Ambientes: o pacote Ambientes do chat 22, casado com a prancha de arquitetura
  (1:200) pelas paredes do 2º pavimento, como em `ambientes_do_pacote_casado`.
- Para cada ponto sem ambiente, a prancha de arquitetura vira uma imagem de 10 cm por pixel só com as paredes
  (hachura escura), com os vãos de porta fechados (até ~1 m). Daí o motivo:
  - **na parede**: o ponto cai na parede. Se há cômodo a até 60 cm dos dois lados, "entre dois cômodos"; senão,
    "parede de um lado só" (parede externa, de shaft, de jardim);
  - **shaft**: recinto fechado com menos de 4 m²;
  - **área aberta**: recinto que encosta na borda da prancha ou com mais de 3.000 m² (jardim, deck, circulação
    externa, vazio, e também o que as paredes da prancha não fecharam);
  - **recinto sem ambiente**: recinto fechado, maior que 4 m², onde o pacote não tem ambiente nenhum.
- A conta dá um pouco diferente da publicada (pilotis 5.176 × 5.064, mezanino 1.876 × 1.874, subsolo 70 × 64)
  porque aqui entram pontos que a publicação junta ou descarta; a proporção não muda.
- A conferência foi feita na imagem (pontos coloridos por motivo sobre a prancha), guardada fora do repositório.

## Resultado

| Motivo | Pilotis | Mezanino | Subsolo |
|---|---:|---:|---:|
| Área aberta (fora de cômodo) | 3.190 | 1.582 | 4 |
| Na parede, um lado só | 1.162 | 279 | 3 |
| Na parede, entre dois cômodos | 0 | 0 | 0 |
| Shaft (< 4 m²) | 595 | 0 | 0 |
| Recinto sem ambiente | 229 | 15 | 63 |
| **Total** | **5.176** | **1.876** | **70** |

Por disciplina:

| Pavimento | Motivo | Água | Esgoto | Elétrico | PPCI | SPDA |
|---|---|---:|---:|---:|---:|---:|
| Pilotis | Área aberta | 671 | 1.798 | 656 | 64 | 1 |
| Pilotis | Parede | 517 | 311 | 258 | 53 | 23 |
| Pilotis | Shaft | 425 | 133 | 35 | 2 | 0 |
| Pilotis | Recinto sem ambiente | 153 | 66 | 8 | 2 | 0 |
| Mezanino | Área aberta | 125 | 1.377 | 14 | 45 | 21 |
| Mezanino | Parede | 74 | 130 | 11 | 37 | 27 |
| Mezanino | Recinto sem ambiente | 0 | 0 | 0 | 15 | 0 |
| Subsolo | Recinto sem ambiente | 58 | 0 | 0 | 1 | 4 |
| Subsolo | Área aberta e parede | 2 | 0 | 0 | 1 | 4 |

Tipos que mais aparecem (todos os motivos):

- **Pilotis**: tubo de esgoto 2.196, tubo de água 1.474, eletroduto 497, caixa de parede 408, registro 163,
  coluna de água 93, sinalização 74, ralo 51, caixa de passagem 44, caixa sifonada 31, coluna de esgoto 27,
  iluminação de emergência 24, descida do SPDA 24, ponto de água 24.
- **Mezanino**: tubo de esgoto 1.446, tubo de água 182, sinalização 70, coluna de esgoto 57, descida 27,
  captor 20, iluminação de emergência 19, eletroduto 14, caixa de parede 11.
- **Subsolo**: tubo de água 44, registro 12, descida 5, ponto de água 4, conector 2, detector, caixa de inspeção
  e iluminação de emergência (1 cada).

## O que cada motivo é, na prancha

1. **Pilotis, a faixa das casas.** A maior parte da "área aberta" e quase todo o "shaft" e a "parede" do pilotis
   ficam nas casas da faixa de cima e da faixa da direita. O chat 22 deixou as casas fora do pacote (a prancha não
   tem a etiqueta de área delas), então ali não existe ambiente nenhum. Os montes de pontos são banheiros e
   cozinhas das casas: tubo, registro, ralo, caixa sifonada, caixa de parede. É o maior grupo do pilotis.
2. **Área aberta de verdade.** Jardins, deck e borda da piscina, circulação externa, rampas. No mezanino é quase
   tudo tubo de esgoto (1.336) correndo na laje em volta da piscina e no vazio entre os blocos, mais colunas,
   sinalização do PPCI e captores do SPDA.
3. **Parede de um lado só.** Ponto a mais de 30 cm do cômodo, dentro de parede externa, de shaft ou de mureta
   de jardim: colunas, descidas do SPDA, caixas de parede da fachada, sinalização na parede.
4. **Parede entre dois cômodos: não acontece.** A regra dos 30 cm já resolve (vai para o mais perto).
5. **Shaft.** Pilotis: 595 pontos em recintos de menos de 4 m², quase todos água e esgoto (tubo, registro,
   caixa sifonada). Na maioria, shafts das casas.
6. **Recinto sem ambiente.** Recinto fechado sem ambiente no pacote. No subsolo, 63 dos 70: a sala do alçapão
   de acesso aos reservatórios (tubos e registros de água) e a casa de bombas. No mezanino, 15 pontos de PPCI
   (sinalização e emergência) em escadas e antecâmaras. No pilotis, 229, a maioria dentro das casas.

## Regra proposta por motivo

| Motivo | Regra proposta | Quem decide |
|---|---|---|
| Casas do pilotis sem ambiente | O chat 22 cria um ambiente por casa (como as UN-01..09 do mezanino), desenhado à mão se a prancha não der a área. Os pontos de dentro passam a ter ambiente pela regra de hoje. | Pergunta de engenharia (1) |
| Shaft | O ponto do shaft vai para o cômodo vizinho mais perto (até 1 m), porque a FVS do shaft é feita de dentro do banheiro ou da cozinha. | Pergunta de engenharia (2) |
| Parede de um lado só | Subir a distância de 30 cm para 60 cm só para tubo, coluna, descida e caixa de parede; o que passar disso fica sem ambiente. Medir quantos entram antes de mudar. | Pergunta de engenharia (2) |
| Área aberta (jardim, deck, laje, vazio) | Fica sem ambiente e vai para o item da laje, como já vale para a elétrica. | Pergunta de engenharia (3) |
| Recinto sem ambiente (reservatórios, casa de bombas, escadas) | O chat 22 cria esses ambientes no pacote (são cômodos de verdade). Não é regra nova. | Só técnica (chat 22) |
| Entre dois cômodos | Nada a fazer. | — |

Código: nenhum conserto óbvio. Todas as mudanças acima mexem na regra de que ficha recebe o ponto, então
esperam a resposta do Nicolas.

## Perguntas de engenharia para o Nicolas

1. **Casas do pilotis.** Os banheiros e cozinhas das casas têm FVS por casa (um ambiente por casa, como no
   mezanino) ou por cômodo de cada casa?
2. **Shaft e parede.** O tubo, o registro e a coluna dentro do shaft ou na parede do banheiro são conferidos na
   ficha do banheiro (cômodo do lado) ou numa ficha própria de shaft/prumada?
3. **Fora de cômodo.** O que está fora de qualquer cômodo (jardim, deck da piscina, laje do mezanino, vazio) vai
   para o item da laje, como a elétrica? Isso vale também para água, esgoto, PPCI e SPDA? A descida e o captor
   do SPDA na fachada ficam no item da laje ou numa ficha do SPDA por prumada?
