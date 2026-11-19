# Núcleo: sincronização sólida (prioridade 1)

Pedido do Nicolas, 18/11/2026: "antes de qualquer função nova, garantir que marcar, salvar e sincronizar entre os aparelhos não perca nada". Frente "01 · NUC-SINC · Salvamento e sincronização" (dona do núcleo desde 18/11).

**Estado (18/11, noite):** C1, C2 e C3 estão na main (PR #84) e a migração do C3 (20261118120000) foi aplicada no Supabase. Os testes R1, R2 e R3 de `app/testes/sincronizacao_solida.test.ts` passam sem `it.fails`. Os testes de tela com dois navegadores (E1–E4) e a guarda do CI (`testes/guarda_integracao.test.ts`, que falha se a integração for pulada) também estão na main. Dois commits só de teste deixam o E1–E4 estável (`testes/e2e-duas-telas-estavel`: d14525c e 9b6a7a0) e esperam o ok para subir. Próximo: o teste com cabo do Nicolas (seção 3). C4, C5 e C6 ficam para depois do que o teste mostrar.
Base lida: `app/src/nucleo/sincronizacao.ts`, `banco_local.ts`, `conta.ts`, `local.ts`, `erros.ts`, `usarSincronizacao.ts`, `fvs/toques.ts`, `fvs/situacao.ts` (maisNovo) e `app/testes/sincronizacao.test.ts` (32 testes).

**Depende do PR #83?** Não. A sincronização é a mesma com ou sem ele. O #83 só baixa as plantas sozinho. Para o teste do fim de semana ajuda ter o #83 na main e as plantas de teste da EXE publicadas: sem elas, a FVS logada não tem planta para marcar.

## 1. Auditoria do caminho marcar → aparelho → fila → envio → outro aparelho

O que já está bem feito (e tem teste):
- O registro e o item da fila são gravados juntos, numa transação só (`gravarPendente`). Ou entram os dois, ou nenhum.
- Reenvio não duplica (`upsert ... ignoreDuplicates`). Se o app fechar depois do envio e antes de limpar a fila, a próxima rodada reenvia sem duplicar (teste "reenviar o mesmo item").
- Foto: se o app fechar entre o envio do arquivo e o registro, o "já existe" do armazenamento é tratado como enviado (teste "reenvio não duplica").
- Token vencido, sem internet ou servidor fora: a fila para e tenta de novo, sem marcar erro (testes).
- Erro permanente marca só aquele item e a fila segue (teste).
- Sair, trocar de pessoa ou perder acesso nunca apaga o que ainda não foi enviado (`esquecerObra` e `esquecerTudoBaixado` só apagam `pendente = 0`; teste "outra pessoa entra").
- Recarregar no instante do toque: o diário em localStorage (`fvs/toques.ts`) refaz o toque (S3).
- Não há conflito de versão no sentido clássico: tudo é evento só de inclusão, e a situação sai do último evento.

Riscos encontrados, do mais grave para o menos grave:

| # | Risco | Onde | O que acontece | Gravidade |
|---|---|---|---|---|
| R1 | **Fila do modo sem conta nunca sobe** | `local.ts` cria um `usuario_local_id`; a fila é por `usuario_id` | Tudo o que foi marcado nos tablets com o .zip fica com o usuário local. Ao entrar com e-mail, `enviar(usuario real)` não acha esses itens. E, se achasse, o servidor recusaria, porque `usuario_id` tem que ser o logado. Já anotado em docs/03_APP_LOCAL.md como "para depois". | **Alta**: é exatamente a passagem do .zip para o servidor |
| R2 | **Envio travado prende tudo** | `inserir()` e `upload()` não têm prazo; `sincronizar()` roda numa cadeia, uma rodada depois da outra | Num 3G fraco, uma conexão que fica pendurada (sem erro e sem resposta) segura a rodada. Todas as seguintes ficam esperando até fechar o app. Na tela aparece "Sincronizando…" para sempre. | **Alta** em campo |
| R3 | **Relógio errado decide quem ganha** | `maisNovo()` compara `criado_em_dispositivo` | Dois aparelhos marcam o mesmo item: ganha o de hora mais tarde. Um tablet com o relógio adiantado 1 h "ganha" de uma correção feita depois em outro aparelho. Os dois mostram o mesmo resultado (não diverge), mas pode ser o resultado errado. Hoje existe só um aviso (`relogioAtrasado`, `horaNaFrente`). | Média |
| R4 | **Banco do aparelho apagado pelo Chrome** | `navigator.storage.persist()` | Sem o app instalado, o Chrome do Android pode apagar o IndexedDB quando falta espaço, e com ele a fila. O pedido só é feito quando o menu abre, e o Chrome pode negar sem avisar. A tela mostra "não (instale o app)", mas fica escondida no bloco "Este aparelho". | Média (alta se ninguém instalar) |
| R5 | **Fila de outra pessoa presa no aparelho** | a fila é por pessoa | A pessoa A marca sem internet e a pessoa B entra no mesmo tablet. A fila de A fica guardada, mas só sobe quando A entrar de novo, e ninguém vê que há itens dela parados. | Média |
| R6 | **Item recusado sem saída** | `marcarErro` | Acesso tirado ou valor inválido: o item fica "recusado" e só o botão "Tentar enviar de novo" o mexe. Se for permanente de verdade, fica para sempre na lista, sem um caminho de exportar ou descartar com registro. | Baixa (já aparece na tela) |
| R7 | **Foto grande** | a foto inteira vai num pedido só | `reduzirFoto` limita a 1600 px, então costuma ficar em uns 0,3 a 1 MB. Sem prazo (R2), uma foto num 3G pode travar a fila. Sem espaço no aparelho, `registrarArquivo` falha: a tela mostra o erro, mas a foto não fica guardada. | Média (junto com R2) |
| R8 | **Sessão vencida há dias** | refresh token | Se o refresh token for revogado (sair em outro lugar, conta desligada), a fila espera "Entrar de novo". Não perde nada, mas só avisa quando há internet. | Baixa |
| R9 | **Transação de mais de 5 min no servidor** | margem do cursor | Um registro gravado numa transação que durou mais de 5 min não chega aos outros aparelhos. No uso normal não acontece; um import grande pelo editor SQL pode causar. | Baixa |
| R10 | **Trocar o pacote (.zip) com fila pendente** | `gravarComoBaixado` | Só apaga linhas baixadas (`pendente = 0`), e a fila fica. Ficha que sai do pacote mas está em uso também fica. Não achei perda. | Baixa (conferir no teste) |
| R11 | **Duas abas no mesmo aparelho** | `navigator.locks` | A sincronização é uma por vez entre as abas; o registrar das duas abas vai para o mesmo IndexedDB. Não achei perda. | Baixa (conferir) |

## 2. Testes automáticos que faltam

Integração com o PostgREST de verdade (escritos em `app/testes/sincronizacao_solida.test.ts`: T1 = R1, T2 = R2, T3 = R3 com as duas variantes, T4 = R5, T5 = R7, mais "200 marcações com queda no meio". T6 e T7 ficam para o roteiro manual: o IndexedDB de teste não simula cota cheia, e o T7 depende do pacote da FVS):
- **T1 (R1)** Marcar no modo sem conta, entrar com e-mail e sincronizar: tudo chega ao servidor com o `usuario_id` da pessoa, nada duplica, e a fila local zera. Hoje falha: o teste documenta o defeito.
- **T2 (R2)** Servidor que aceita a conexão e não responde (proxy de teste que segura o pedido): a rodada desiste dentro do prazo com erro transitório, a próxima rodada roda, e nada fica marcado como recusado.
- **T3 (R3)** Dois aparelhos (dois `BancoLocal` e dois `Sincronizador`, duas pessoas) marcam o mesmo item com horas diferentes, os dois sincronizam, e `ultimosPorItem` dá o mesmo resultado nos dois. Variante: o relógio de B 1 h adiantado; o teste fixa a regra que o Nicolas decidir (ver C3).
- **T4 (R5)** A marca sem internet, B entra no mesmo aparelho, A volta: a fila de A sobe inteira. E a tela de B mostra que há itens de outra pessoa esperando.
- **T5 (R7)** Foto de 5 MB sem internet, fecha e abre o app (banco reaberto), volta a internet: o arquivo e a linha chegam, e o conteúdo sai do aparelho.
- **T6** Cota estourada no `registrar` (IndexedDB recusa): o erro sobe, nada fica pela metade (registro sem item na fila ou o contrário).
- **T7 (R10)** Fila pendente, abrir um .zip novo da mesma obra: a fila e os registros pendentes continuam.

Telas com 2 navegadores (Playwright, dois contextos = dois aparelhos, contra o PostgREST):
- **E1** A sem internet (`context.setOffline(true)`) marca NC com foto num pilar. B, com internet, marca C no mesmo item. A volta: em até 1 min os dois mostram o mesmo estado, e o histórico do item tem os dois registros.
- **E2** A marca 20 itens sem internet, recarrega a página no meio, volta a internet: B vê os 20, sem repetidos.
- **E3** A com o login vencido (token apagado) marca e entra de novo: tudo sobe.
- **E4** Celular de 375 px e tablet: a barra de sincronização e a lista de recusados ficam legíveis.

## 3. Roteiro do fim de semana (celular e tablet no cabo)

Preparar (uma vez, no PC):
1. No celular e no tablet: Configurações > Sobre > tocar 7 vezes em "Número da versão". Depois, Opções do desenvolvedor > ligar a **Depuração USB**.
2. Ligar os dois no PC pelo cabo e aceitar "Permitir depuração".
3. No Chrome do PC, abrir `chrome://inspect/#devices`. Os dois aparelhos aparecem. "Inspect" abre o DevTools de cada um, com a aba **Application > IndexedDB > sistema-obra** (tabelas `fila` e `registros`) e a aba **Network**, onde dá para pôr "Offline" sem mexer no Wi-Fi.
4. Nos dois aparelhos: abrir o site (https://sistema-obra-1po.pages.dev), passar pelo Access, **instalar o app** e entrar com e-mail. Um aparelho com o Nicolas; o outro com um segundo e-mail liberado na Obra Exemplo (EXE) pela tela Pessoas da obra (papel campo).
   - Antes: as plantas de teste da EXE precisam estar publicadas (terminal "plantas de teste EXE": e-mail e código do Nicolas). Sem elas a FVS não tem onde marcar. No menu, "Plantas no aparelho: X de Y" tem de chegar a Y de Y nos dois aparelhos antes de começar.
5. Planilha de registro, uma linha por passo: `passo | aparelho | hora | fiz | esperava | aconteceu | print | ok/falha`. Na falha: print da tela e, no DevTools, o número de itens da `fila` e o texto do erro do Console.

Passos (o que conferir em cada um):
1. **Básico**: no celular, com internet, marcar C no item 1 de P1. Conferir: em até 1 min aparece "Sincronizado" e a fila fica em 0. No tablet, "Sincronizar agora": P1 item 1 em C.
2. **Sem internet**: no celular, Network > Offline. Marcar 10 itens em peças diferentes e 1 NC com foto. Conferir: a fila mostra 11 ou mais itens, nada some da tela, e a barra diz "Sem internet".
3. **App fechado**: com o celular ainda offline, fechar o app de verdade (arrastar para fora dos recentes) e abrir de novo. Conferir: as 11 marcações continuam na tela e a fila tem o mesmo número.
4. **Volta da internet**: tirar o Offline. Conferir: em até 1 min a fila zera; no tablet, os 11 aparecem, com a foto.
5. **Mesma peça nos dois**: celular e tablet offline, os dois marcam o item 3 de P2 (celular NC, tablet C, um minuto depois). Ligar o celular primeiro, depois o tablet. Conferir: os dois aparelhos mostram o **mesmo** resultado (o mais recente, C) e o histórico do item mostra os dois.
6. **Relógio errado** (R3): no tablet, pôr a hora 1 h para frente. Marcar NC no item 4 de P2. No celular, marcar C depois. Sincronizar os dois. Conferir: vence o C do celular, que foi marcado depois (correção C3: o servidor troca a hora do futuro pela de chegada). No histórico do item, o NC do tablet aparece com a hora em que chegou ao servidor, não com a hora adiantada. Ao terminar, voltar o relógio do tablet para automático.
7. **Recarregar no toque**: no celular, tocar num item e logo em seguida puxar para recarregar. Conferir: a marcação está lá.
8. **Foto grande sem internet**: celular offline, 3 NC com foto da câmera. Ligar a internet com sinal fraco (Network > "Slow 3G"). Conferir: sobe sem travar. Com o prazo (C2), um pedido que não responde desiste em 60 s (foto: mais 1 s a cada 16 kB) e a barra mostra "Não foi possível sincronizar agora…", tentando de novo sozinha. "Sincronizando…" por mais de 3 min é falha: anotar.
9. **Login vencido**: no DevTools, Application > Local Storage > apagar a chave `sistema-obra-sessao`, marcar algo e recarregar. Conferir: aparece "Entrar de novo", nada some, e depois de entrar a fila sobe.
10. **Outra pessoa no mesmo aparelho**: no tablet, offline, marcar 2 itens; sair; entrar com o outro e-mail; voltar ao primeiro. Conferir: os 2 itens do primeiro sobem.
11. **Do .zip para o login** (R1): num aparelho no modo sem conta (com o .zip), marcar 3 itens e depois entrar com e-mail. Sincronizar. Conferir: os 3 chegam ao outro aparelho em nome de quem entrou (correção C1) e a fila do aparelho zera. Só vale se a obra do .zip for a mesma do servidor (EXE); de outra obra, o servidor recusa e os 3 aparecem na lista de recusados, sem sumir.
12. **Sem instalar** (R4): no Chrome comum, sem instalar, abrir "Este aparelho" no menu e anotar "Dados protegidos: sim ou não".

## 4. Correções prováveis, em ordem (todas são núcleo: precisam do ok do Nicolas)

1. **C1 (R1) — feito, na main.** Ficou sem a pergunta: a fila sobe em nome de quem entra (recomendação do Professor). Proposta original: ao entrar com e-mail num aparelho que tem fila do modo sem conta, perguntar "Enviar as N marcações feitas sem conta em seu nome?". No sim, reescrever `usuario_id` (no item da fila e no registro) para a pessoa logada, numa transação, e só então enviar. É uma decisão de regra (quem assina o que foi feito sem conta). Precisa do ok dele.
2. **C2 (R2, R7) — feito, na main (60 s por pedido).** Proposta original: prazo em cada pedido do envio e da baixa (por exemplo 45 s sem receber nada, como já existe no download de planta da FVS, `comPrazo`/`LIMITE_SEM_DADOS_MS`), tratado como transitório. Assim a rodada seguinte não fica presa.
3. **C3 (R3) — feito, na main e no Supabase.** Ficou assim: hora do aparelho no futuro vira a hora de chegada; hora do passado fica (usar sempre a do servidor faria quem marcou sem internet ganhar de quem marcou depois). Opções discutidas: regra de "quem ganha" quando o relógio do aparelho está errado. Opções: (a) manter a hora do aparelho e só avisar mais alto; (b) quando a diferença para o servidor passar de X minutos, usar `criado_em_servidor` para desempatar. É decisão de arquitetura e mexe no contrato (`docs/02`): proposta para o Nicolas.
4. **C4 (R4) — feito em 19/11 (branch `nucleo/c4-c5-smtp`).** O menu mostra, fora do bloco recolhido, "Instale o app para não perder marcações" quando o navegador não protege os dados; o `persist()` já era pedido logo depois do login (`app.tsx`). Proposta original: aviso visível no menu, fora do bloco recolhido, quando os dados não estão protegidos ("Instale o app para não perder marcações"), e o pedido de `persist()` logo depois do login.
5. **C5 (R5) — feito em 19/11 (mesma branch).** A barra de sincronização mostra "N registros de outra pessoa esperando envio: ela precisa entrar neste aparelho para enviar" (`Sincronizador.contarDeOutros`, teste em `nucleo/fila_de_outros.test.ts` e no R5 da integração). Proposta original: mostrar no menu "N marcações de outra pessoa esperando: ela precisa entrar neste aparelho para enviar".
6. **C6 (R6)** Para item recusado: "Salvar para o administrador" (gera um arquivo) antes de qualquer descarte. Baixa prioridade.

Ordem sugerida: primeiro os testes T1, T2, T3 e E1 (mostram o defeito), depois C1, C2 e C4, e por último o roteiro do fim de semana na versão corrigida. C3 só depois da decisão dele.
