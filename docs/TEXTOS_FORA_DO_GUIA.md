# Textos fora do guia de estilo, por tela

Levantamento de 22/11/2026 (frente 06), na `main` depois do #61. Cada frente troca os textos das telas dela, pela seção "Textos" do `docs/DESIGN.md`.

## Situação em 23/11/2026 (branch `front/guia-fechar`)

**Trocados (98 de 110):** todos os textos das listas abaixo, menos os que estão em "Ficaram" logo a seguir. O que mudou, em resumo:
- "Nenhum..." / "Nenhuma..." virou uma linha curta ("Sem concretagens", "Sem entregas") quando a tela ou a seção ficou vazia, e "–" quando é uma célula ou um campo ("Revisão anterior: –");
- parágrafo explicativo: ficou só a frase que a pessoa precisa ver, e o resto foi para o "?" (`app/src/telas/Ajuda.tsx`), que abre o texto curto ao tocar. Onde a frase curta bastava, o resto saiu;
- emoji ("⚠", "✍", "📍") saiu, e o texto ficou;
- "Escolha…" nas listas de escolher virou "Escolher";
- "PC atrás do Autodoc" virou "Cópia desatualizada no escritório" (painel da obra do Projetos);
- fora da lista, mas pela mesma regra: o aviso de "Ainda não há pranchas" do Projetos sem conta, "Nenhuma entrega com esse filtro" e "Nenhum recebimento registrado" (Concreto, materiais).

**Ficaram, de propósito:**
| Onde | Por quê |
| --- | --- |
| `fvs/telas/TelaPlanta.tsx` (6 textos) | fica para a frente dona: outra frente mexe na planta hoje |
| `fvs/telas/TelaEscoramento.tsx` (3 textos) | fica para a frente dona: outra frente mexe no escoramento hoje |
| `concreto/telas/TelaLaudo.tsx` (1 texto, "Nenhum caminhão registrado nesta concretagem.") | fica para a frente dona: o laudo está com outra frente hoje |
| `telas/Obras.tsx` (2 textos) | o texto das telas de entrada é da 07 · LOGIN (ver `docs/modulos/6_frontend.md`); o teste com servidor (`telas.e2e`) confere a frase |
| "Carregando…", "Gerando…", "Importando…", "Abrindo o PDF…" | o guia deixa as reticências de carregamento |
| mensagens de erro montadas fora das telas (`dados.ts`, `pacote.ts`, `offline.ts`) | não são texto de tela fixo; ficam para a revisão de cada frente |

**Como foi feito:** leitura automática dos textos que aparecem nas telas (`app/src/**/*.tsx`), procurando:
- **parágrafo explicativo:** texto com mais de 90 letras. O guia manda a ajuda para um ícone "?" ou para a documentação;
- **sem dado por extenso:** "Nenhum..." ou "Nenhuma...". O guia pede "–" na célula. Numa tela que ficou vazia, uma frase curta pode ficar: a frente decide caso a caso;
- **emoji, boas-vindas e reticências** (fora de "Carregando…" e parecidos).

**O que a leitura não pega:** termos internos do app (o guia dá o exemplo da "Cópia desatualizada"), datas e volumes fora do formato, e unidade repetida em cada linha. Esses ficam para a revisão de cada frente, tela por tela.

A linha é a do arquivo na `main` em 22/11/2026, e pode andar com as mudanças. Os textos montados com variáveis aparecem só na parte fixa.

## FVS (21)

### `app/src/fvs/telas/BuscaNaObra.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 46 | Nenhuma peça com esse nome nesta obra. | sem dado por extenso |

### `app/src/fvs/telas/IrAtePeca.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 103 | Esta peça não está em nenhuma planta deste pavimento. | sem dado por extenso |

### `app/src/fvs/telas/SobDemanda.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 31 | Isso costuma acontecer logo depois de uma versão nova do app. Nada do que você registrou foi perdido. | parágrafo explicativo |

### `app/src/fvs/telas/TelaEscoramento.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 52 | Só aviso: o prazo conta da concretagem (ou do item que a regra diz) e o app não impede marcar antes. | parágrafo explicativo |
| 59 | A obra não tem prazos nas regras. Quem cuida do cadastro põe no arquivo das regras da obra. | parágrafo explicativo |
| 63 | Nenhuma peça concretada com prazo em aberto. | sem dado por extenso |

### `app/src/fvs/telas/TelaInicio.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 712 | Esta obra ainda não tem fichas (PVS). Quem cuida do cadastro publica pelo PC (pipeline/fvs/publicar_fichas.py). | parágrafo explicativo |
| 716 | Nenhuma planta publicada nesta obra ainda. As plantas são publicadas pelo PC (pipeline/fvs/publicar_planta.py). | sem dado por extenso, parágrafo explicativo |

### `app/src/fvs/telas/TelaLocais.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 54 | Nenhum local fora da planta tem ficha ou marcação nesta obra. | sem dado por extenso |
| 60 | Nenhum local com esse nome. | sem dado por extenso |

### `app/src/fvs/telas/TelaPlanta.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 561 | Nenhuma ficha de laje tem o item desta instalação: o furo fica só para ver. | sem dado por extenso |
| 1390 | Nenhuma peça com o nome dentro do retângulo. | sem dado por extenso |
| 1882 | Nenhuma barra da camada ${NOME_DA_CAMADA[camada].toLowerCase()} aqui. | sem dado por extenso |
| 1928 | Nenhum ponto aqui. | sem dado por extenso |
| 2421 | Nenhuma área de laje nesta planta. | sem dado por extenso |
| 2421 | Nenhuma área de laje nesta planta. Toque em “+ Área” e marque os cantos da parte da laje. | sem dado por extenso |

### `app/src/fvs/telas/TelaRegras.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 44 | Esta obra não tem regras válidas: nenhum prazo e nenhuma ligação. | sem dado por extenso |
| 65 | O C no primeiro item marca C no segundo, na mesma peça, se ele ainda estiver vazio. Dá para desfazer. | parágrafo explicativo |
| 67 | Entre peças: o C no item da área de laje marca C no item de cada pilar e viga dentro dela (vale o centro da peça). | parágrafo explicativo |

### `app/src/fvs/telas/TelaReprovacoes.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 181 | Nenhuma reprovação com estes filtros. | sem dado por extenso |
| 181 | Nenhuma reprovação nesta obra. | sem dado por extenso |

## Concreto (19)

### `app/src/concreto/telas/SobDemanda.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 31 | Isso costuma acontecer logo depois de uma versão nova do app. Nada do que você registrou foi perdido. | parágrafo explicativo |

### `app/src/concreto/telas/TelaCaminhao.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 112 | Nenhuma peça ainda. Desenhe na planta a área que este caminhão encheu. | sem dado por extenso |

### `app/src/concreto/telas/TelaConcretagem.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 38 | Concretagem de EXEMPLO, para a apresentação. Não é concretagem real da obra: fornecedor, código e notas fiscais não valem para a obra. | parágrafo explicativo |
| 93 | Nenhum caminhão registrado. | sem dado por extenso |

### `app/src/concreto/telas/TelaFicha.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 96 | Nenhum caminhão registrado neste dia. | sem dado por extenso |
| 136 | Lacre e A/C não são registrados no app: ficam em branco, como no lançamento à mão. Água adicionada e o local de cada concretagem vão na obse | parágrafo explicativo |

### `app/src/concreto/telas/TelaInicio.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 32 | Nenhum pavimento cadastrado nesta obra ainda. | sem dado por extenso |

### `app/src/concreto/telas/TelaLaudo.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 222 | Nenhum caminhão registrado nesta concretagem. | sem dado por extenso |

### `app/src/concreto/telas/TelaMapa.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 803 | Nenhuma peça ainda | sem dado por extenso |
| 841 | Nenhuma concretagem neste pavimento ainda. Volte e crie uma para desenhar. | sem dado por extenso |
| 963 | Nenhum caminhão registrado nesta peça. | sem dado por extenso |

### `app/src/concreto/telas/TelaPavimento.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 41 | Nenhuma concretagem neste pavimento. | sem dado por extenso |
| 62 | Nenhuma peça cadastrada neste pavimento (a FVS cadastra as peças ao publicar a planta). | sem dado por extenso |
| 67 | Nenhuma concretagem neste pavimento. | sem dado por extenso |
| 67 | Nenhuma concretagem neste pavimento. Toque em Nova concretagem para começar. | sem dado por extenso |

### `app/src/concreto/telas/TelaRelatorio.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 55 | Nenhum caminhão nesta concretagem. | sem dado por extenso |
| 62 | Nenhuma peça desenhada nos caminhões. | sem dado por extenso |
| 171 | Parcial: a área desenhada cobre menos de 90% da peça. Confira se outro caminhão completou a peça. | parágrafo explicativo |

### `app/src/concreto/telas/TelasFvm.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 169 | A obra ainda não tem a lista. Ela vem num arquivo materiais.json (o mesmo que vai no pacote da obra). | parágrafo explicativo |

## Projetos (31)

### `app/src/projetos/telas/Formularios.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 98 | ⚠ Nenhuma empresa cadastrada. Peça ao gestor para cadastrar em "Empresas". | emoji, sem dado por extenso |
| 104 | Escolha… | reticências |
| 117 | Escolha… | reticências |
| 137 | ⚠ Sem assinatura: a entrega fica registrada, mas sem comprovante assinado. | emoji |
| 250 | Nenhuma cópia desta prancha está em campo. | sem dado por extenso |
| 255 | Escolha… | reticências |

### `app/src/projetos/telas/TelaComprovante.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 57 | A assinatura está guardada, mas a imagem só aparece com internet (ela já subiu deste ou de outro aparelho). | parágrafo explicativo |

### `app/src/projetos/telas/TelaDistribuicao.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 32 | Ainda não há lista de distribuição. Monte na aba Distribuição: quem recebe cada disciplina ou pasta. | parágrafo explicativo |
| 233 | Escolha… | reticências |
| 311 | Colunas: disciplina, pasta, empresa, colaborador, copias, ativo. Confira antes: a lista sugerida sai de quem recebeu cada pasta nos últimos  | parágrafo explicativo |

### `app/src/projetos/telas/TelaEmpresas.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 38 | Nenhuma empresa cadastrada ainda. | sem dado por extenso |
| 96 | Para tirar uma empresa da lista, peça ao administrador (o cadastro não é apagado, só marcado como inativo). | parágrafo explicativo |

### `app/src/projetos/telas/TelaInicio.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 15 | Nenhuma entrega registrada ainda: a ficha sairia vazia. | sem dado por extenso |

### `app/src/projetos/telas/TelaLista.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 47 | Nenhum projeto nesta obra ainda. | sem dado por extenso |
| 70 | Nenhum projeto nesta obra ainda. | sem dado por extenso |

### `app/src/projetos/telas/TelaListasBase.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 156 | Nenhuma prancha. | sem dado por extenso |
| 190 | Nenhuma prancha. | sem dado por extenso |
| 264 | Nenhuma entrega. | sem dado por extenso |
| 300 | Nenhuma entrega. | sem dado por extenso |

### `app/src/projetos/telas/TelaObra.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 69 | Ainda sem a ficha de cópias neste aparelho. Importe em Controle do canteiro → Importar para ver o que está em campo e o que precisa trocar. | parágrafo explicativo |
| 118 | Ainda não há pranchas nesta obra. A lista vem do Autodoc pelo atalho do PC e chega aqui na sincronização. | parágrafo explicativo |

### `app/src/projetos/telas/TelaPainel.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 129 | Nenhuma cópia desatualizada em campo. | sem dado por extenso |
| 163 | Nenhuma pasta do escritório registrada ainda. Abra uma prancha e toque em "Atualizar" quando a pasta estiver com a vigente. | sem dado por extenso |
| 240 | Nenhuma. | sem dado por extenso |
| 364 | Os arquivos ficam só neste aparelho e não entram no "Salvar arquivo". Quando a ficha ou o índice mudar, importe de novo: o painel é refeito. | parágrafo explicativo |
| 368 | A revisão vigente vem do servidor (a lista do Autodoc publicada pelo PC). A lista vigente em CSV só vale sem conta. | parágrafo explicativo |

### `app/src/projetos/telas/TelaPessoas.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 175 | Nenhuma cópia em campo. | sem dado por extenso |

### `app/src/projetos/telas/TelaPrancha.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 81 | Nenhuma entrega registrada para esta prancha. | sem dado por extenso |
| 99 | ✍ assinada · comprovante | emoji |
| 142 | Nenhuma revisão conhecida. | sem dado por extenso |

### `app/src/projetos/telas/TelaPranchaBase.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 127 | Nenhuma cópia em campo. | sem dado por extenso |

## Documentos (10)

### `app/src/documentos/telas/Registros.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 27 | Nenhuma ficha no aparelho. | sem dado por extenso |
| 49 | Nenhuma concretagem registrada. | sem dado por extenso |
| 71 | Nenhuma NC aberta. | sem dado por extenso |

### `app/src/documentos/telas/TelaDocumento.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 62 | O arquivo que veio do servidor não é o que foi registrado. Não abri. Avise o gestor da obra. | parágrafo explicativo |
| 183 | Nenhuma: esta é a primeira revisão cadastrada. | sem dado por extenso |

### `app/src/documentos/telas/TelaImprimir.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 67 | Nenhum documento cadastrado. | sem dado por extenso |
| 126 | Só a revisão vigente de cada documento. As revisões anteriores ficam no aplicativo, marcadas como obsoletas. | parágrafo explicativo |

### `app/src/documentos/telas/TelaLista.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 72 | Nenhum documento com estes filtros. | sem dado por extenso |
| 133 | Nenhum documento cadastrado aqui ainda. | sem dado por extenso |
| 133 | Nenhum documento com estes filtros. | sem dado por extenso |

## Relatórios (beta, fora do menu) (8)

### `app/src/relatorios/telas/Fotos.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 37 | Nenhuma foto. | sem dado por extenso |
| 50 | 📍 Pingar onde foi | emoji |

### `app/src/relatorios/telas/TelaDia.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 159 | Nenhum relatório neste dia. | sem dado por extenso |

### `app/src/relatorios/telas/TelaInicio.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 60 | Os registros com o selo EXEMPLO (três dias de diário, relatórios, uma concretagem com caminhões e a laje dela) são da apresentação. Não saem | parágrafo explicativo |
| 132 | Nenhum dia anterior registrado. | sem dado por extenso |
| 217 | Nenhum relatório ainda. | sem dado por extenso |
| 217 | Nenhum relatório com este filtro. | sem dado por extenso |

### `app/src/relatorios/telas/TelaRelatorio.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 215 | Nenhum andamento registrado. | sem dado por extenso |

## IFC (5)

### `app/src/ifc/telas/IfcsDaObra.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 84 | Nenhum IFC enviado para esta obra ainda. | sem dado por extenso |

### `app/src/ifc/telas/ModelosDaObra.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 165 | Nenhuma lista de modelos carregada para esta obra. | sem dado por extenso |

### `app/src/ifc/telas/ModuloIfc.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 192 | Escolha um ou mais arquivos .ifc do projeto (ou arraste para cá). Eles aparecem um por cima do outro, com busca e cortes. Tudo fica só neste | parágrafo explicativo |

### `app/src/ifc/telas/PainelBusca.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 158 | Nenhuma peça com estes filtros. Tire um filtro ou troque a palavra. | sem dado por extenso |

### `app/src/ifc/telas/PainelModelos.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 116 | Quando os arquivos não vêm na mesma coordenada, um cai longe do outro. Marque o mesmo ponto nos dois (um canto de pilar, por exemplo). | parágrafo explicativo |

## Nova obra (6)

### `app/src/nova_obra/NovaObra.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 65 | Monte a obra aqui e salve o pacote (.zip). Depois abra o .zip no tablet pelo botão "Trocar de obra / abrir pacote (.zip)". Nada sai deste ap | parágrafo explicativo |
| 202 | Nenhuma ficha ainda. Cada ficha tem os itens que a equipe confere em cada peça. | sem dado por extenso |
| 288 | Na planilha, selecione as colunas (Etapa, Título, Descrição, Dispositivo, Tolerância), copie e cole aqui. Com a linha de títulos, as colunas | parágrafo explicativo |

### `app/src/nova_obra/TelaPlantas.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 114 | Para cada pavimento, o PDF da planta de forma. Dá para pular e voltar depois: a obra também sai sem planta. | parágrafo explicativo |
| 272 | Arraste sobre a folha para marcar só o desenho, sem carimbo e notas. Toque fora para ver a folha inteira de novo. | parágrafo explicativo |
| 677 | Nenhum nome aqui. Toque em cima do nome da peça, ou use "Desenhar". | sem dado por extenso |

## Telas comuns (menu, entrada, pessoas) (8)

### `app/src/telas/BarraLocal.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 80 | Nenhum registro ainda. | sem dado por extenso |
| 132 | Salvamento automático: nenhuma pasta. | sem dado por extenso |

### `app/src/telas/Menu.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 378 | Nenhum pavimento baixado ainda. | sem dado por extenso |
| 413 | Sem instalar, o navegador pode apagar os dados deste aparelho quando faltar espaço, inclusive o que ainda não foi enviado. | parágrafo explicativo |

### `app/src/telas/Obras.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 53 | Nenhuma obra neste aparelho. Abra o app pela pasta da obra. | sem dado por extenso |
| 57 | Sua conta ainda não tem acesso a nenhuma obra. | sem dado por extenso |

### `app/src/telas/PlantasSemInternet.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 92 | O aparelho está sem espaço para as plantas que faltam. Libere espaço e toque em "Baixar plantas". | parágrafo explicativo |

### `app/src/telas/SobDemanda.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 36 | Isso costuma acontecer logo depois de uma versão nova do app. Nada do que você registrou foi perdido. | parágrafo explicativo |

## Reportar (2)

### `app/src/reportes/BotaoReportar.tsx`

| Linha | Texto | Fora do guia |
| --- | --- | --- |
| 165 | Conte o que aconteceu e, se puder, junte um print (tire o print do aparelho antes de tocar aqui) ou uma foto. | parágrafo explicativo |
| 243 | Nenhum. | sem dado por extenso |
