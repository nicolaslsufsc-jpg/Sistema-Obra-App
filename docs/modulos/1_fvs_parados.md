# FVS: parados por decisão do Nicolas (PPCI; Ambientes até 18/11)

Arquivos da FVS: [regras](1_fvs.md) (o que o app faz hoje) · [status](1_fvs_status.md) (estado, próximo passo, pendências, pedidos ao núcleo) · [histórico](1_fvs_historico.md) (o que foi feito, por data) · [parados](1_fvs_parados.md) (Ambientes e PPCI).

Nada daqui está em andamento. Só volta com o pedido do Nicolas.

## PPCI (pedida em 05/11; ainda não começada, parada a pedido do Nicolas)
Mesma lógica: a prancha do projeto preventivo de fundo e cada local de inspeção como um ponto ou contorno tocável.
- **Pranchas:** estão no Autodoc (PROJETOS > PPCI ou Preventivo); nenhuma foi baixada ainda. O login do Autodoc no navegador da sessão caiu: depende de o Nicolas entrar de novo.
- **Fichas:** entre os modelos de PVS do Construpoint e os PES da empresa não há nenhum de PPCI (hidrantes, extintores, iluminação de emergência, sinalização, alarme, chuveiros automáticos). Os mais próximos são os de SPDA, de gás e de redes suspensas e colunas. **Falta o Nicolas dizer de onde vem a ficha do PPCI.**
- **Local de inspeção:** a definir vendo a prancha (cada equipamento como um ponto na planta, ou por pavimento/ambiente).

## Ambientes (proposta feita na bancada; adiada em 05/11; **retomada em 18/11/2026**)

> **Retomado em 18/11/2026** (frente "Arquitetura/ambientes"): o que vale hoje está em [1_fvs.md](1_fvs.md), "Ambientes". Respostas do Nicolas às decisões abaixo: (1) ambiente como local tipo A, ao servidor numa migração só com o furo (F), pela frente do login; (2) alvenaria por ambiente primeiro; (3) nome do cômodo por tabela de apartamento-tipo; (4) sala e cozinha juntas ficam um ambiente só; (5) ficha por tipo de cômodo fica para uma fatia seguinte. O texto abaixo é o de 05/11.
A ideia, para os serviços depois da estrutura (alvenaria, reboco, piso, pintura...), é a mesma da forma: **a prancha vigente de fundo e cada local de inspeção como um contorno tocável**. Aqui a prancha é a de arquitetura do pavimento e o local é o ambiente. Tudo o mais é igual: mesmas tabelas, mesmos registros, mesmo pacote, mesma tela. Foi escolhido assim, sem perguntar (noite de 04 para 05/11), e está pronto para ver na bancada; nada disso foi ao servidor.

Como sai a planta de ambientes (`pipeline/fvs/ambientes.py`):
- **Contorno dos ambientes:** do modelo IFC da arquitetura. O da obra piloto (o IFC de arquitetura da torre) não tem os cômodos prontos (IfcSpace), mas tem paredes e portas: com as portas fechadas, cada espaço fechado entre paredes é um ambiente. Ler um andar leva uns 6 minutos; o resultado fica guardado ao lado do IFC e é reaproveitado.
- **Posição na prancha:** as paredes do modelo são casadas com as paredes desenhadas no PDF (desloca até coincidir, na escala da prancha). O script recusa se o casamento ficar fraco.
- **Apartamento de cada ambiente:** o rótulo "303(TIPO C1)" da prancha diz onde fica o apartamento e as portas dizem que ambientes se ligam; a porta de entrada (PM90 ou PCF) separa o apartamento do corredor.
- **Nome:** o nome do cômodo (Living, Suíte...) não está nem no modelo nem na prancha. Os ambientes saem numerados por apartamento, na ordem de leitura: "101-01", "101-02"... (exemplo); área comum, "AC-01"... O app escreve o número por cima da planta.

Resultado no 3º pavimento (único andar com a prancha de arquitetura baixada), na obra piloto, conferido: centenas de ambientes, a maioria nos apartamentos e o resto de área comum, pacote de poucos MB. Contra o Construpoint: a maioria dos apartamentos com o mesmo número de ambientes, os outros com diferença de 1. Outros andares contra o 3º (só o modelo): quase todos iguais.

Fichas por ambiente: `fichas_modelo.aplica_a = ["A"]`. Na bancada foram usadas quatro PVS de verdade lidas do Construpoint (alvenaria em bloco cerâmico comum, reboco interno, revestimento cerâmico de piso, pintura interna), guardadas fora do repositório.

O que fica para o Nicolas decidir (nenhuma destas escolhas é definitiva):
1. **Ambiente como linha de `elementos` (tipo A)**, usando os mesmos registros da estrutura. É o pedido 1 ao núcleo. A alternativa seria uma tabela nova de locais.
2. **Alvenaria por ambiente ou por parede.** O EXE-PES-03 fala em lote por peça (parede); o Construpoint lança por ambiente. A proposta marca por ambiente, igual ao Construpoint. Por parede dá para fazer depois (as paredes estão no modelo), mas parede de 15 cm é difícil de tocar no celular.
3. **Numeração "101-01" (exemplo)** em vez do nome do cômodo. Dar nome exige digitar uma vez por apartamento-tipo e copiar para os andares iguais.
4. **Um polígono que cobre dois locais do Construpoint** (sala + cozinha sem parede entre elas): hoje é um ambiente só.
5. **Fichas de ambiente todas visíveis em todo ambiente** (pintura aparece na sacada, piso cerâmico no quarto). Ligar ficha a tipo de cômodo depende do item 3.


## Pendências de Ambientes
- Ambientes: decisões 1 a 5 de "Ambientes"; pranchas de arquitetura dos outros pavimentos; no modo servidor, `publicar_planta.py` recusa ambiente até o núcleo aceitar (`--aceita-ambientes`).
