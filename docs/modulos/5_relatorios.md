# Módulo 5: Relatórios (diário de obra + relatórios avulsos)

Histórico e detalhe: docs/historico/5_relatorios.md

## Objetivo
Pedido do Nicolas em 06/11/2026: "um módulo que na verdade são dois".
- **Diário de obra (RDO):** o registro do dia, nos padrões de um diário de obra, com vínculo às pranchas de forma, no estilo da FVS, para marcar onde foi cada serviço.
- **Relatórios avulsos:** problemas na obra, limpeza e outros tipos, também marcados na planta.

## Status atual
- **Na `main`** pelo PR #19 (06/11/2026). Migrações `20261106120000_relatorios.sql` e `20261107200000_relatorios_foto_marca.sql` aplicadas no Supabase.
- **Fora do menu:** módulo beta, com `foraDoMenu: true` em `app/src/modulos.ts`, até a vez dele (regra do `CLAUDE.md`, 18/11/2026). O código fica.
- Feito depois do PR #19 (detalhe no histórico): relato do dia, foto com ponto na planta, exemplos marcados e botão "Tirar os exemplos", sem exemplos na obra da Nova obra, voltar ao dia no mesmo ponto, limite de tipo e tamanho da foto, sem aviso de envio no modo sem conta.

## Diário automático (26/11/2026, pedido do Nicolas)
Palavras dele: "fazer o relatório automático do dia... mais a informação que a pessoa escrever... foi realizada a verificação de tal ficha, tal ficha. Foi realizada a concretagem de tantos caminhões da laje e tal".
- O dia abre com o bloco **"O que o app registrou hoje"**, antes do clima, em frases de diário (`app/src/relatorios/automatico.ts`, parte pura; `automaticoDoDia` em `dados.ts`). Entrou no lugar do bloco "Registrado em outros módulos", que ficava no fim e só dava os totais.
- **Concretagens do dia** (uma frase cada, primeiro): local por escrito (sem ele, as peças marcadas nos caminhões, até 6 nomes), pavimento, caminhões, volume, fck e fornecedor. Sem caminhão lançado, a frase avisa.
- **Fichas de verificação mexidas no dia** (uma frase por ficha e pavimento): quantos locais, quantos itens conformes, não conformes e "não se aplica", e quem marcou. Vale o último registro de cada item no dia; item desmarcado não conta. Conta peça, área de laje, barra, ponto de instalação e local do sistema oficial.
- **Quem marcou:** o nome gravado no registro ou o `perfis.nome` que a FVS guarda no aparelho. Sem nome conhecido, "1 pessoa" / "1 outra pessoa" (o app não inventa nome).
- **Refaz sozinho** ao abrir o dia e quando o aparelho volta à tela, enquanto o dia está aberto. **Dia fechado:** entram só os registros feitos até a hora do fechamento, então o bloco para de mudar sem guardar cópia (nenhuma tabela nova); o que foi marcado depois aparece só como "N registros feitos depois do fechamento ficaram de fora". Reabrir o dia volta a contar tudo.
- **O que a pessoa escreve nunca é apagado:** o bloco só lê a FVS e o Concreto e não grava nada; relato, clima, efetivo, serviços e ocorrências ficam nas seções de sempre.
- **Na folha do dia** (Imprimir / PDF): seção "O que o app registrou no dia", antes do relato, com as mesmas frases. Dia sem registro: a seção não sai.
- **Decisões tomadas sem perguntar (anotadas):** (1) dia fechado congela pela hora do fechamento, sem tabela nova; registro feito antes do fechamento noutro aparelho e sincronizado depois ainda entra (foi feito antes). (2) As frases agrupam por ficha e pavimento, não por local, para o texto não virar lista. (3) O artigo do pavimento ("no 3º Pavimento", "na Cobertura") sai da primeira palavra; quando não dá para saber, "em". (4) Concretagem de exemplo e registro importado do sistema oficial com a data do dia entram como os outros.
- **Onde aparece:** o módulo continua fora do menu oficial (`foraDoMenu`). Abre no build que liga `VITE_TESTE_MODULOS_FORA_DO_MENU=1` (configuração do build do app de testes, do Professor) e na bancada.
- **Bancada:** `/dev/relatorios.html?auto=1` semeia para hoje 3 pilares e 2 vigas verificados e uma concretagem com 2 caminhões.
- **Testes:** `automatico.test.ts` (11 casos) e, em `relatorios_bancada.e2e.test.ts`, o dia em 375, 768 e 1024 (frases, refazer, fechar, depois do fechamento, folha, reabrir) e o dia vazio. A bancada dos Relatórios aceita `SO_FONTE_LARGA=1`.
- **Rolagem em 375 px (26/11, noite):** com a fonte larga, o selo "Fechado · RDO nº N" entre os botões de dia empurrava o do dia seguinte 61 px para fora. O selo do meio agora encolhe e quebra em duas linhas. O teste diz qual elemento passa da borda.
- **Não feito:** o efetivo, o clima e os serviços continuam à mão (o app não tem de onde tirar); a folha não lista os locais um a um; o bloco não entra na exportação da obra.

## Decisões que ainda valem (resumo; texto completo no histórico)
- Campos do RDO vêm de modelos públicos e do protótipo PVS de agosto; a empresa não tem modelo conferido (**dele**). Não é o Livro de Ordem do CREA; o app não diz que atende norma.
- Listas de conferência de limpeza e segurança e os tipos de relatório são proposta, em `app/src/relatorios/tipos.ts` (mudar é uma linha, sem migração) (**dele**).
- Diário sem linha "dia": cada registro leva a data, só inclusão. Número do RDO nasce ao fechar o dia (maior + 1) e não muda ao reabrir.
- Fecha o dia e altera os dados da obra: gestor e admin. Registro que chega depois do dia fechado entra com aviso, não é recusado.
- Onde foi: peça, ponto ou área, sempre com "Local por escrito". A planta é a prancha de forma da FVS (mesmo pacote). Toda marca guarda `planta_ref` = `<trecho>@<revisão>`.
- Lê do Concreto (concretagens do dia) e da FVS (peças verificadas), sem gravar neles. Desde 26/11, em frases, no topo do dia (seção "Diário automático").
- Exemplos levam `exemplo: true` e ficam fora da impressão, do número do RDO e das contagens; não entram na obra de origem `nova_obra`.

## Arquivos e tabelas principais
- Tabelas (`supabase/migrations/20261106120000_relatorios.sql` e `20261107200000_relatorios_foto_marca.sql`), todas sincronizadas e só de inclusão: `diario_cadastro`, `diario_clima`, `diario_efetivo`, `diario_equipamentos`, `diario_materiais`, `diario_servicos`, `diario_ocorrencias`, `diario_fechamentos`, `relatorios`, `relatorio_andamentos`, `rel_marcas` (com `foto_id`), `rel_fotos`. Correção é linha nova (`substitui_id`, `cancelado`).
- Telas em `app/src/relatorios/`: Início (abas Diário e Relatórios), Dia, Onde foi (planta), Na planta (mapa), Imprimir (RDO e relatório em A4). `tipos.ts`, `regras.ts`, `exemplos.ts`, `ModuloRelatorios.tsx`.
- Reaproveita sem alterar: `concreto/caneta.ts`, `geometria.ts`, `pecas.ts`, `planta.ts`, `vigentes.ts`; `fvs/plantas.ts`, `pacote.ts`, `reduzirFoto`.

## Como ver sem servidor (bancada)
`cd app && npm run dev`, depois:
- `/dev/relatorios.html`: planta de teste, com o diário de ontem já preenchido. `?papel=campo` ou `?papel=leitura` muda o papel.
- `/dev/relatorios.html?pasta=http://127.0.0.1:8766/&pavimento=3`: prancha de forma de verdade. Antes, noutra janela: `python pipeline/fvs/bancada.py "<...>\FVS\pacotes"`. Nada sai do PC.

## Testes
- Banco: `supabase/testes/testes_x_relatorios.sql` (permissões por papel, outra obra, formato das marcas, só inclusão).
- Regras: `app/src/relatorios/relatorios.test.ts`. Inclui conferir cada coluna que o app grava contra a migração: coluna errada só apareceria como recusa do servidor em campo.
- Telas: `app/testes/relatorios_bancada.e2e.test.ts` (tablet deitado e 375 px, dedo, caneta, foto, fechar, imprimir). Roda no GitHub com as outras. Com `SO_PASTA=http://127.0.0.1:8766/` testa também a prancha de verdade (só no PC).
- **O que não foi testado:** app contra PostgREST de verdade, com envio ao servidor (só roda no GitHub); celular físico; caneta física (a caneta é simulada pelo Chrome); ver foto já enviada (depende do servidor).

## Próximo passo
1. Nicolas confere as decisões acima, sobretudo 1 e 3, e diz se a empresa tem modelo de RDO.
2. Testar em celular de verdade, com envio ao servidor.
3. Planilha do período para o escritório (dias, efetivo, chuva, horas paradas). Por enquanto, os dados saem na exportação da obra.

## Pendências e limites conhecidos
- Quem registrou fica gravado (`usuario_id`), mas não aparece na tela: `perfis` não é baixada para o aparelho (ver Pedidos).
- Foto já enviada precisa de internet para ser vista, inclusive na impressão: depois de enviada ela sai do aparelho (regra do núcleo).
- A planta impressa é um desenho das peças, sem a imagem da prancha, e só sai se a prancha estiver no aparelho. O local por escrito sempre sai.
- Primeiro toque no mapa "Na planta" se perde no celular simulado (375 px); falta confirmar em celular de verdade (16/11).
- Formulários do Diário não guardam rascunho ao recarregar (12/11).
- Celular: o clima ocupa muito espaço e "Fechar o dia" fica só no fim da página (09/11).
- Exemplos: Concreto ainda precisa conferir se a concretagem de exemplo fica fora das contagens e da ficha; na FVS a laje de exemplo aparece como peça até tirar os exemplos; com conta, registro feito em cima de exemplo e já enviado sai só do aparelho; obra nova (fora da Nova obra) ainda recebe exemplos (decisão do núcleo em `app.tsx`).
- Pedidos ao núcleo de 07/11 (arquitetura, contrato, baixar `perfis.nome`, baixa que não para no `PGRST205`): lista completa no histórico; não conferido aqui quais já foram atendidos.
