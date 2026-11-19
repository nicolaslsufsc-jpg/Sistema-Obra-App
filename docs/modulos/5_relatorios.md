# Módulo 5: Relatórios (diário de obra + relatórios avulsos)

Branch: `modulo/relatorios`

## Objetivo
Pedido do Nicolas em 06/11/2026: "um módulo que na verdade são dois".
- **Diário de obra (RDO):** o registro do dia, nos padrões de um diário de obra, com vínculo às pranchas de forma, no estilo da FVS, para marcar onde foi cada serviço.
- **Relatórios avulsos:** problemas na obra, limpeza e outros tipos, também marcados na planta.

## Decisões tomadas sem perguntar (revisar)
O Nicolas pediu para não ser interrompido e disse para decidir sozinho. Nada abaixo é definitivo. As marcadas com **(dele)** dependem de informação que só ele tem.

1. **"Padrão de diário de obra" (dele).** Não existe modelo de RDO da empresa nos PES nem uma lista oficial conferida. Os campos vêm do que é comum nos modelos públicos e no protótipo PVS de agosto: cabeçalho com número, data, dia da semana e obra; clima de manhã e de tarde (acrescentei noite) com praticável ou impraticável; mão de obra; equipamentos; serviços; materiais; ocorrências; fotos; assinatura do responsável técnico e do fiscal. Se a empresa tiver um modelo, ajustar por ele.
2. **Isto não é o Livro de Ordem do CREA.** A Resolução Confea 1.094/2017 foi revogada pelo plenário em 2023, segundo o CREA-SC, mas há fonte conflitante sobre a situação atual. **Não foi conferido o texto em vigor.** O app não diz em lugar nenhum que atende a norma.
3. **Lista de conferência de limpeza e de segurança (dele).** Não há modelo nos PES da empresa. As listas em `app/src/relatorios/tipos.ts` são proposta minha. Mudar é uma linha, sem migração.
4. **Tipos de relatório:** Problema na obra, Limpeza e organização, Segurança do trabalho, Qualidade, Material e estoque, Outro. Tipo novo também é uma linha em `tipos.ts`.
5. **O diário não tem linha "dia".** Cada registro leva a data. Assim dois aparelhos sem internet escrevem o mesmo dia sem conflito e nada se perde. É a regra da arquitetura: evento só de inclusão.
6. **Número do RDO:** nasce ao fechar o dia (o maior número já dado + 1) e fica o mesmo se o dia for reaberto. Antes de fechar, o dia não tem número. Assim, escrever um dia atrasado não renumera os outros. Limite: dois gestores fechando dias diferentes sem internet podem dar o mesmo número.
7. **Quem fecha o dia e altera os dados da obra:** gestor e admin (a regra está no banco). Campo escreve; leitura só vê.
8. **Dia fechado:** o app não deixa alterar sem reabrir. Registro que chega depois de um aparelho sem internet **não é recusado**: entra e aparece com o aviso "Registrado depois de o dia ser fechado". Recusar perderia o trabalho de quem estava em campo.
9. **Três formas de marcar onde foi:** peça (toque, como na FVS), ponto (qualquer lugar da planta) e área (traço). A caneta sempre desenha e o dedo move a planta, como no Concreto. Para o celular, sem caneta, o botão "Área" faz o dedo desenhar. Sempre existe também "Local por escrito".
10. **A planta é a prancha de forma da FVS:** usa o mesmo pacote, baixado na tela inicial da FVS. Não baixa nada novo. Pavimento sem planta no aparelho: lista de peças para marcar. Serviço depois da estrutura (reboco, pintura) marca com ponto ou área em cima da forma, até a planta de ambientes da FVS ir para o servidor.
11. **Toda marca guarda a revisão da prancha** (`planta_ref` = `<trecho>@<revisão>`). Com revisão nova, a tela avisa que a marca foi feita em outra revisão.
12. **Vistoria com lista toda respondida e sem "Ruim" nasce resolvida.** O resto nasce aberto.
13. **Puxa dos outros módulos, só para ler:** concretagens do dia (Concreto) e peças verificadas (FVS). Veio do protótipo PVS ("diário de obra puxando as verificações do dia").

## Tabelas (`supabase/migrations/20261106120000_relatorios.sql`)
Todas sincronizadas e só de inclusão. Nas que têm `substitui_id` e `cancelado`, corrigir ou apagar é uma linha nova e vale a que ninguém substituiu (igual ao Concreto). Quem aponta para um registro aponta para a primeira versão dele (raiz).

| Tabela | Quem inclui | O que guarda |
|---|---|---|
| `diario_cadastro` | gestor | endereço, contratante, responsável técnico, ART, início, fim do prazo. Vale o último da obra. |
| `diario_clima` | campo | data, período, tempo, condição. Vale o último de cada data + período. |
| `diario_efetivo` | campo | data, empresa, função, quantidade. |
| `diario_equipamentos` | campo | data, nome, quantidade, situação. |
| `diario_materiais` | campo | data, material, quantidade, unidade, fornecedor, nota fiscal. |
| `diario_servicos` | campo | data, descrição, empresa, situação, avanço, local por escrito. |
| `diario_ocorrencias` | campo | data, tipo, descrição, horas paradas, local por escrito. |
| `diario_fechamentos` | gestor | data, fechado ou reaberto, número do RDO. Vale o último da data. |
| `relatorios` | campo | tipo, data, título, descrição, gravidade, responsável, prazo, lista de conferência. |
| `relatorio_andamentos` | campo | relatório, situação, comentário. A situação atual é a do último. |
| `rel_marcas` | campo | serviço, ocorrência ou relatório (um dos três), pavimento, prancha e revisão, peça, área ou ponto. |
| `rel_fotos` | campo | data, serviço, ocorrência ou relatório (ou nenhum = foto do dia), arquivo. |

## Telas (`app/src/relatorios/`)
- **Início:** abas Diário de obra e Relatórios. Hoje em destaque, outro dia por data, dias anteriores com resumo e número do RDO, dias com período impraticável no mês. Relatórios filtram por tipo e situação; o prazo vencido fica marcado como atrasado.
- **Dia:** um toque no clima já grava. Seções com "Adicionar" e, em mão de obra e equipamentos, "Copiar de 05/11". Ao salvar um serviço, a tela vai direto para a planta. Depois: fotos, relatórios do dia, o que veio do Concreto e da FVS, e Fechar o dia.
- **Onde foi (planta):** marca e desmarca na hora, sem esperar gravar. Desfazer. Painel embaixo no celular em pé, ao lado no tablet deitado. Abre no último pavimento usado, ou no mais alto que tenha planta no aparelho.
- **Na planta (mapa):** tudo que foi marcado no período, por cor. Tocar mostra o que aconteceu ali e leva ao registro. Problema aberto fica por cima de serviço.
- **Imprimir:** RDO e relatório em A4 pelo Imprimir do navegador (dá para salvar em PDF), com cabeçalho, tabelas, desenho leve da planta, fotos e linhas de assinatura. Dia não fechado sai com o aviso RASCUNHO.

Reaproveita sem alterar: `concreto/caneta.ts`, `geometria.ts`, `pecas.ts`, `planta.ts`, `vigentes.ts`; `fvs/plantas.ts`, `pacote.ts`, `reduzirFoto`.

## Como ver sem servidor (bancada)
`cd app && npm run dev`, depois:
- `/dev/relatorios.html`: planta de teste, com o diário de ontem já preenchido. `?papel=campo` ou `?papel=leitura` muda o papel.
- `/dev/relatorios.html?pasta=http://127.0.0.1:8766/&pavimento=3`: prancha de forma de verdade. Antes, noutra janela: `python pipeline/fvs/bancada.py "<...>\FVS\pacotes"`. Nada sai do PC.

## Testes
- Banco: `supabase/testes/testes_x_relatorios.sql` (permissões por papel, outra obra, formato das marcas, só inclusão).
- Regras: `app/src/relatorios/relatorios.test.ts`. Inclui conferir cada coluna que o app grava contra a migração: coluna errada só apareceria como recusa do servidor em campo.
- Telas: `app/testes/relatorios_bancada.e2e.test.ts` (tablet deitado e 375 px, dedo, caneta, foto, fechar, imprimir). Roda no GitHub com as outras. Com `SO_PASTA=http://127.0.0.1:8766/` testa também a prancha de verdade (só no PC).
- **O que não foi testado:** app contra PostgREST de verdade, com envio ao servidor (só roda no GitHub); celular físico; caneta física (a caneta é simulada pelo Chrome); ver foto já enviada (depende do servidor).

## Status (07/11/2026)
- **Na `main`** pelo PR #19, que o Nicolas abriu e mergeou em 06/11.
- **Testes do GitHub:** tudo que é deste módulo passou: banco, build, regras e telas.
  - O ✗ do #19 e da `main` vem de 2 testes de tela da FVS que dependem do fuso horário. A falha já existia antes do #19.
  - O conserto está no PR #18 da FVS.
- **Migração `20261106120000_relatorios.sql` aplicada no Supabase em 07/11/2026**, a pedido do Nicolas, pelo SQL Editor do painel.
  - Conferido depois: as 12 tabelas estão em `nucleo.tabelas_sincronizadas`, só de inclusão, com RLS e 2 regras de acesso cada.
  - O total de tabelas sincronizadas passou de 20 para 32, e `tabelas_para_exportar()` lista as 32.
- **Conflito que este módulo causou no PR #18 da FVS:** uma linha em `app/src/nucleo/tabelas.ts`. A solução é manter as duas linhas, nesta ordem: `...TABELAS_FVS_HISTORICO,` e depois `...TABELAS_RELATORIOS,`.

## Próximo passo
1. Nicolas confere as decisões acima, sobretudo 1 e 3, e diz se a empresa tem modelo de RDO.
2. Testar em celular de verdade, com envio ao servidor.
3. Planilha do período para o escritório (dias, efetivo, chuva, horas paradas). Por enquanto, os dados saem na exportação da obra.

## Pendências e limites conhecidos
- Quem registrou fica gravado (`usuario_id`), mas não aparece na tela: `perfis` não é baixada para o aparelho (ver Pedidos).
- Foto já enviada precisa de internet para ser vista, inclusive na impressão: depois de enviada ela sai do aparelho (regra do núcleo).
- A planta impressa é um desenho das peças, sem a imagem da prancha, e só sai se a prancha estiver no aparelho. O local por escrito sempre sai.

## Pedidos ao núcleo
1. Acrescentar o módulo em `docs/01_ARQUITETURA.md` (lista de módulos e "Escrita offline só no que acontece em campo": diário e relatórios entram) e `docs/02_CONTRATO_NUCLEO.md` ("Tabelas por módulo"). **Mudança de arquitetura: precisa do ok do Nicolas.** Segue a regra de evento só de inclusão.
2. Citar `modulo/relatorios` no `CLAUDE.md`, na lista de branches e de módulos.
3. Arquivos do núcleo alterados, só nos pontos que o contrato manda: `app/src/modulos.ts` (a linha do módulo e o tipo `IdModulo`) e `app/src/nucleo/tabelas.ts`.
4. Sugestão: a baixa não parar tudo quando uma tabela ainda não existe no servidor (erro `PGRST205`), para app novo e migração não precisarem ser exatamente na ordem.
5. Baixar nome de quem registrou (`perfis.nome`) para o aparelho. O item 1 do backlog da FVS pede o mesmo.

## 07/11/2026 à noite (branch `app/local`)
Pedido do Nicolas: quantidade de funcionários por função (criada na hora), imagens, relatório de texto, "pingar onde foi o acontecimento de cada imagem", e exemplos.
- **Relato do dia**: seção própria no dia, texto corrido (até 2000 caracteres). Gravado como ocorrência do tipo `relato` (`tipos.ts`, `TIPO_RELATO`), sem tabela nova; some da lista de ocorrências e do resumo do dia; na impressão sai como "Relato do dia".
- **Onde a foto foi tirada**: `rel_marcas.foto_id` (migração `20261107200000_relatorios_foto_marca.sql`, testada no Postgres local e aplicada no servidor em 08/11/2026). Cada foto tem o botão "📍 Pingar onde foi" (abre "Onde foi" no modo Ponto) e mostra o local; as fotos aparecem em "Na planta" (categoria roxa, filtro Fotos).
- **Exemplos** (`exemplos.ts`): três dias no pavimento com peças (Pilotis na obra piloto), relatórios de problema, limpeza e segurança, fotos desenhadas na hora com o ponto na planta, e a concretagem do Concreto. Entram uma vez por obra como registros baixados (fora da fila). `exemplos.test.ts`.
- Mão de obra com função livre já existia (`diario_efetivo.funcao`, com sugestões do que foi digitado).
- Testes: `relatorios.test.ts` confere as colunas contra as duas migrações; `relatorios_bancada.e2e` no Chrome.

## 09/11/2026: de volta ao menu
- Saiu de `foraDoMenu` em `app/src/modulos.ts` (pedido do Nicolas). IFC, Projetos e Documentos continuam fora.
- `local.e2e.test.ts` agora abre o Relatórios no modo local com a pasta de teste: três dias de exemplo (Nº 1, Nº 2 e um aberto) e os três relatórios avulsos, em 375 px e 1280 px. `relatorios_bancada.e2e` e os testes de unidade passaram no Chrome deste PC.
- Exemplo de material: o fornecedor do aço virou "Siderúrgica Exemplo" (era um nome de empresa real).

## 09/11/2026: um dia inteiro como alguém novo (375 px e tablet)
Roteiro: clima, relato, três funções de mão de obra, equipamento, serviço, material, ocorrência, um erro de validação e fechar o dia. As três coisas que mais atrapalharam foram corrigidas:
1. **Voltar ao dia caía no topo.** Depois de cada item a pessoa rolava tudo de novo (no celular o dia tem uns 2.600 px). Agora o `ir` guarda a rolagem no histórico e o voltar devolve ao mesmo ponto (`ModuloRelatorios.tsx`).
2. **"Relato do dia" aparecia como tipo de ocorrência**, e o que se gravava assim sumia das Ocorrências (vira o relato). Saiu da lista do formulário (`tipos.ts`); o rótulo continua para o que já foi gravado.
3. **"Salvar e adicionar outro" apagava a empresa** e repetia sempre a mesma frase. Agora `empresa` (mão de obra) e `fornecedor` (materiais) continuam preenchidos (`repete` em `tipos.ts`), e a mensagem diz o que entrou ("Salvo: Pedreiro · 4").

Também: o resumo da FVS no dia dizia "A · R"; agora diz "C · NC · NA", como a FVS. Teste de tela novo no `relatorios_bancada.e2e` (375 px e tablet).
Ficou para depois (menor): o clima ocupa muito espaço no celular (três períodos com chips em duas linhas); "Fechar o dia" só no fim da página.


## 09/11/2026: exemplos marcados e "Tirar os exemplos"

A Nova obra achou que o `semearExemplos` (`app/src/relatorios/exemplos.ts`) punha os exemplos em toda obra aberta, inclusive na real. Eram três dias de diário, relatórios, uma concretagem com caminhões fictícios e uma laje, que na FVS aparecia como uma 22ª peça.

- **Marcados:** registros novos levam `exemplo: true`. Os semeados antes são reconhecidos pela assinatura do "usuário do pacote", que o pacote nunca usa no diário, nos relatórios nem no concreto. A laje é um caso à parte: o pacote também traz laje com essa assinatura e o mesmo id do Python, então a do exemplo é a que tem `exemplo: true` ou uma hora diferente da do pacote (`lajesDeExemplo`).
- **Nas telas:** os exemplos aparecem com o selo EXEMPLO. Ficam fora da impressão (RDO e relatório), do número do RDO (o primeiro de verdade é o nº 1), dos dias impraticáveis, da contagem e dos "Atrasado", e das NCs abertas no Documentos.
- **Botão "Tirar os exemplos":** fica no início do módulo e só aparece para gestor e admin. Apaga o diário, os relatórios, as marcas e fotos, a concretagem com caminhões, áreas e peças, a laje do exemplo e os documentos de exemplo.
  - Leva junto o que alguém registrou em cima de um exemplo (correção, andamento, foto, marca ou CP), inclusive da fila.
  - A laje fica se algo de verdade aponta para ela. Os exemplos não voltam.
- **Obra que já tem diário, relatório ou concretagem de verdade não recebe mais exemplo.** Uma obra nova e vazia ainda recebe, porque quem chama o `semearExemplos` é o `app.tsx`, que é núcleo.

Pedidos (fora do meu módulo):
- **Núcleo (`app.tsx`):** decidir se os exemplos devem entrar só na obra de demonstração (EXE) ou atrás de um botão "carregar exemplos", em vez de em toda obra nova.
- **Concreto:** a concretagem de exemplo já aparece com o rótulo EXEMPLO (`concreto/exemplo.ts`). Falta conferir se ela fica fora das contagens e da ficha impressa do Concreto. Isso é código do Concreto.
- **FVS:** enquanto os exemplos não são tirados, a laje do exemplo aparece como peça. Basta tirar os exemplos, ou a FVS pode ignorar elemento com `exemplo: true`. Isso é código da FVS.
- Com conta: um registro feito em cima de um exemplo e já enviado ao servidor sai só deste aparelho.

## 12/11/2026: foto anexada (Professor)

- Foto do Diário e dos relatórios: só JPG, PNG, WEBP ou HEIC, até 20 MB (`recusaDaFoto`). Antes entrava qualquer arquivo de imagem, de qualquer tamanho.
- Se não der para reduzir (HEIC em navegador que não lê, foto corrompida), a original só fica se for JPG, PNG ou WEBP de até 10 MB; senão, avisa.
- Pendente: os formulários do Diário não guardam rascunho ao recarregar.
- Achado fora do módulo (núcleo): `src/nucleo/pasta_salvamento.test.ts` falha depois das 21h. Espera a data em UTC, mas o app grava a data local. Falha igual na main.

## 13/11/2026: exemplos na obra de demonstração

- A área dos caminhões de exemplo agora pega pilares vizinhos na planta (`cadeiaDeVizinhos`), não os primeiros pelo nome. Isso vale também para as vigas e para as marcas do diário.
- A folga da área é proporcional ao tamanho dela (30% e 25% do lado maior, no mínimo 4 px), e a caixa fica presa dentro da largura e da altura da planta (`caixaNaPlanta`). Antes a folga era fixa, de 30 px, e na obra de demonstração a área virava uma faixa acima do prédio.
- Pendente, depende do núcleo: não semear na obra feita pela Nova obra. O `origem: nova_obra` do `indice.json` não fica guardado no aparelho. A proposta é gravar `origem` na meta do pacote (`nucleo/pacote_obra.ts`), e aí o `semearExemplos` sai sozinho. Aguarda o ok do Nicolas.

## 14/11/2026: sem exemplos na obra da Nova obra

O núcleo passou a guardar o `origem` do `indice.json` na meta do pacote (`pacote_obra:<obra>`); o "pode" do Nicolas valeu só para essa linha. O `semearExemplos` lê essa meta e não semeia quando a origem é `nova_obra` (a obra pública de demonstração). As outras obras continuam recebendo exemplos.

## Demo de 14/11/2026 (Testador, branch `app/demo-documentos-relatorios`)
- Sem conta (`estado.local`): nenhum aviso "esperando envio" nem "vai para o servidor" (mesma regra da FVS e do Concreto, #55/#56). Função `avisoDaSincronizacao` em `regras.ts`.
- O aviso dos EXEMPLO e o botão "Tirar os exemplos" foram para o fim da tela, menores; tirar continua pedindo confirmação.

## Pendência achada em 16/11/2026 (Professor)
- **Primeiro toque no mapa da obra se perde (celular simulado, 375 px).** Logo depois de abrir "Na planta", o primeiro toque numa peça não abre nada e o segundo abre. Mouse funciona. Não é a animação de zoom (esperar o mapa parar não resolve). Falta confirmar num celular de verdade. O teste `relatorios_bancada.e2e.test.ts` toca de novo uma vez até isso ser resolvido.
