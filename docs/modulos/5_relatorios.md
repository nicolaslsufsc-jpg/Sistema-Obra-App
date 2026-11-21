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

## Decisões que ainda valem (resumo; texto completo no histórico)
- Campos do RDO vêm de modelos públicos e do protótipo PVS de agosto; a empresa não tem modelo conferido (**dele**). Não é o Livro de Ordem do CREA; o app não diz que atende norma.
- Listas de conferência de limpeza e segurança e os tipos de relatório são proposta, em `app/src/relatorios/tipos.ts` (mudar é uma linha, sem migração) (**dele**).
- Diário sem linha "dia": cada registro leva a data, só inclusão. Número do RDO nasce ao fechar o dia (maior + 1) e não muda ao reabrir.
- Fecha o dia e altera os dados da obra: gestor e admin. Registro que chega depois do dia fechado entra com aviso, não é recusado.
- Onde foi: peça, ponto ou área, sempre com "Local por escrito". A planta é a prancha de forma da FVS (mesmo pacote). Toda marca guarda `planta_ref` = `<trecho>@<revisão>`.
- Lê do Concreto (concretagens do dia) e da FVS (peças verificadas), sem gravar neles.
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
