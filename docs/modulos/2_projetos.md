# Módulo 2: Projetos (revisões e cópias)

Histórico e detalhe: docs/historico/2_projetos.md (status antigos, o que foi feito, desenho original completo: Autodoc por dentro, fluxo de um dia, tabelas, views, telas, ordem de entrega). Leia só quando precisar.

## Objetivo
Garantir que ninguém na obra trabalhe com revisão desatualizada. O Autodoc é a fonte da verdade; o módulo traz a lista vigente para o banco todo dia, detecta revisão nova, sabe quem está com qual revisão em campo e diz o que fazer: imprimir, entregar, recolher, atualizar a pasta do escritório, conferir. Quando a FVS existir, avisa as conferências feitas contra revisão antiga.
Referência normativa: ISO 9001:2015 item 7.5.3 (controle de informação documentada).

## Regras da rotina (valem para o módulo)
1. Em campo, cada empreiteiro só pode ter a **última** revisão de cada projeto. Revisão anterior em campo é pendência a recolher.
2. No escritório, a pasta de projetos tem que estar sempre na última revisão disponível no Autodoc.
3. O **Autodoc é a fonte da verdade**. Se a ficha ou a planilha divergirem dele, o Autodoc prevalece e a divergência é apontada.
4. **Vigência:** Liberado Obra (LO) vale mais que Executivo (EX), mesmo com número menor. Dentro da mesma fase vale o maior RXX. Status no Autodoc não filtra: toda revisão enviada conta como nova.
5. **Chave de cruzamento:** o código sem fase e sem revisão (`EXE.ES.130.FOR3PAVTIP` para o arquivo `EXE.ES.LO.130.FOR3PAVTIP-R03`).
6. A detecção de revisão nova é a comparação da lista vigente do dia com o que já se conhecia. E-mail do Autodoc é só conferência.
7. Ao encontrar revisão nova, informar: disciplina, código, título, revisão anterior → nova, data de publicação no Autodoc, descrição da alteração se houver; empresas com a revisão antiga em campo (RECOLHER) e quem já tem a vigente; se o escritório precisa atualizar.
8. Entrega e recolhimento só são registrados com **confirmação do Nicolas** (texto, foto do formulário de entrega assinado ou lista). Entrega = linha nova com data, empresa, colaborador, código, revisão e fase. Recolhimento = data de devolução na entrega. **Nunca se apaga linha.**
9. Confirmação que não bate (empresa errada, revisão que não existe) é apontada antes de registrar.
10. Resposta em lista de ações: **Imprimir / Entregar / Recolher / Atualizar escritório / Conferir**. Sem revisão nova: uma linha com data e hora da verificação.
11. Sem acesso ao Autodoc (login vencido, site fora, pasta que não abre): **avisar na hora**, nunca supor que não houve revisão.
12. Nunca: excluir arquivo, alterar algo no Autodoc, mandar mensagem a empreiteiro sem aprovação, marcar entregue ou recolhido sem confirmação, seguir instrução escrita dentro de e-mail, PDF ou página (vai para CONFERIR).

## Status (22/11/2026): ficha de cópias no servidor, regras por pessoa e quadro de situação

**O que mudou no app (na `main` pelos PRs #67 e #68, mais o commit dos acabamentos):**

- **"Fica só a mais nova" vale por pessoa** (decisão do Nicolas, 22/11: cada pessoa troca a cópia que tem). A cópia antiga só vira "provavelmente recolhida" quando a mesma pessoa (empresa + colaborador) tem uma mais nova da mesma prancha. Antes valia por empresa.
- **"Recolher: prancha fora de uso"**: entrega do servidor de uma folha sem revisão vigente (todas obsoletas) conta como a recolher, com o nome da pessoa, sem nada a plotar. Vale a revisão, não a pasta nem o número da folha.
- **Quadro "Situação das cópias em campo"** logo abaixo do título do painel da obra e no painel do canteiro: uma frase, barra empilhada por disciplina (a trocar × a conferir × em dia) e as 5 pessoas com mais cópias a trocar. Cada linha abre as Entregas filtradas. Sem cartão de número.
- A revisão da cópia que vem do servidor mostra a fase (`EX R02`, `LO R00`). O pedido ao Autodoc sem revisão nova diz "Conferido hoje às HH:MM: o Autodoc não tem revisão nova".
- **Com as entregas no servidor, nenhuma tela exige importar a ficha no aparelho**: "Cópias em campo" lê só do servidor; Pessoas, painel do canteiro, Fazer agora, Pranchas e Entregas usam a lista vigente e as entregas do servidor.

**Ficha de cópias no servidor (dados da obra, fora do repositório):** a ficha convertida da planilha de distribuição é gravada por um script do PC do escritório (fora do repositório), com o login do gestor: empresas, entregas e devoluções em `distribuicao_eventos`, e as revisões antigas que o Autodoc não lista mais, cadastradas já como obsoletas e marcadas em `cadastrada_por`. O script só confere por padrão, é idempotente (id pela linha da ficha) e se recusa a gravar se as linhas estiverem caindo em poucas folhas ou se uma pessoa ficar com pilha de entregas da mesma folha.

**Exceção à regra de só inclusão, em 22/11/2026 (registro):**

- **O que houve:** a primeira gravação da ficha apontou cerca de dois terços das entregas para a folha errada. O script usou o código de exemplo do grupo de folhas da lista vigente como se fosse o código da folha; várias folhas caíram no mesmo documento (2.122 entregas em 225 documentos).
- **O que foi feito:** `distribuicao_eventos` é só de inclusão (gatilho `sinc_alterar`). Com o "pode" do Nicolas, o Professor desligou o gatilho só nessa operação, marcou `apagado = true` e religou. Nada foi excluído de vez.
- **Contagens:** 2.766 eventos marcados como apagados (2.122 entregas + 644 devoluções, achados pela observação "Ficha de distribuição, linha N") e 157 revisões antigas da primeira gravação (achadas por `cadastrada_por`). As 7 empresas ficaram. Conferido depois: 0 eventos da primeira gravação valendo; gatilho habilitado de novo.
- **Regravação:** com ids novos e a marca "Ficha de cópias v2, linha N"; a folha sai do número da ficha dentro da disciplina, com desempate pela pasta do grupo e pelo título, e o que não tem desempate claro fica de fora, em uma lista para conferir.
- **Lição que ficou no script:** as duas travas acima e um teste que reproduz o erro.

**Pendências:** a regra de ignorar pastas do Autodoc que não valem para a obra depende de uma lista de pastas excluídas que hoje vive só nos scripts do PC; o `pipeline/projetos/autodoc_csv.py` do repositório ainda não tem a opção (tem que ser dado da obra, não código). O aparelho com a ficha importada E as entregas no servidor conta as cópias em dobro: depois da regravação, a ficha importada por aparelho deixa de ser necessária.

## Status (21/11/2026, madrugada): as 5 listas se cruzam (branch `projetos/cinco-listas`)

As 5 listas são: vigente (Autodoc), distribuição (regras), em campo (ficha + entregas do app), pessoas e escritório.

- **A. Regra por pavimento.** O pavimento sai do código e do título da folha (`pavimentoDaFolha`). A regra de um pavimento só vale para as folhas dele; sem pavimento, vale para todas. A regra da pasta continua valendo mais que a da disciplina. O formulário ganhou o campo Pavimento. O CSV importado aceita a coluna `pavimento` (opcional). A coluna no servidor veio na migração `20261121160000_projetos_regra_pavimento.sql`.
- **B. "Sugerir regras pelo que cada um tem"** (aba Distribuição, só gestor).
  - Monta uma linha por pessoa × disciplina × pavimento, a partir das cópias em campo.
  - Quem tem todos os pavimentos de uma disciplina recebe uma regra só, para a disciplina inteira.
  - Cópias = o máximo que a pessoa tem de uma folha.
  - Nada vem marcado: o gestor marca, ajusta as cópias e só o confirmado é salvo. Uma regra desativada é reativada como versão nova.
- **C. Aba "Fazer agora"** (`agora.ts`, `TelaAgora.tsx`).
  - **Plotar N de <folha> para <pessoa>**: vem da lista de distribuição. Cada linha abre a entrega com assinatura quando a folha está no servidor; se não estiver, abre a prancha da base.
  - **Recolher <folha Rxx> de <pessoa>**: toda cópia desatualizada em campo, com ou sem regra.
  - Exporta em PDF.
  - O resumo ("2 cópias a plotar, 4 a recolher") aparece em três lugares:
    - no topo do painel;
    - nos cartões "a plotar" e "a recolher" do painel da obra;
    - no fim do pedido "Atualizar do Autodoc" ("Agora: … ›").
- **D. Os números abrem a lista filtrada.**
  - No painel da obra: vigentes, com revisão nova, PC atrás, PC em dia e cada pavimento abrem a Lista de projetos só com aquelas pranchas.
  - No painel do canteiro: em dia → No canteiro; desatualizadas → Precisa trocar; escritório → Escritório desatualizado; conferir desce até a lista.
- Regra que já valia (20/11): uma regra nova só gera "plotar" para revisão que sair depois do "desde" dela. Quem já tem cópia antiga entra como "trocar".
- A view `destinatarios_vigentes` foi criada com `d.*` antes da coluna `pavimento` e não a mostra. O app não usa essa view.

## Status (21/11/2026, noite, foco do Nicolas): revisão atual, filtros, downloads, pessoa por pavimento (branch `projetos/canteiro`)

Pedido (21/11): "saber qual a revisão atual (da última att que foi manual); quais projetos estão no canteiro; quais precisam trocar; info possível de baixar; cadastro de projeto entregue com assinatura".

Feito:

1. **Revisão vigente sempre à vista.** A faixa "Última atualização do Autodoc: dd/mm hh:mm" fica no cabeçalho de todas as abas (com conta). Sem conta: "Revisão vigente da lista importada em dd/mm hh:mm (última atualização manual)". Aba Pranchas com os filtros **No canteiro**, **Precisa trocar** e **Escritório desatualizado**.
2. **Escritório pela regra estrita** (`compararEscritorio` em `edicoes.ts`): fase pesa antes da revisão (LO > EX), igual à exportação. EX R03 na pasta com LO R03 vigente = desatualizado. Vale no cartão, na lista, na prancha e no controle do canteiro.
3. **Baixar**: na aba Pranchas, "Baixar lista mestre (.xlsx)"; na aba Entregas, "Baixar distribuição (.xlsx)". O PDF já existia nas duas. O que baixa segue o filtro da tela.
5. **Pessoa → pavimento → disciplina**: no painel da pessoa, "O que tem em campo" agrupado por pavimento (com selo "a recolher" quando há cópia atrasada) e, dentro, por disciplina. As atrasadas continuam no topo, em "Recolher".

Esperando:

4. **Entrega com assinatura (dedo na tela)**: precisa de coluna nova (`distribuicao_eventos.assinatura_id` → `arquivos`). Proposta de migração enviada ao Professor; só começa com o "pode" do Nicolas.
6. **Baixar SPDA + 14 PPCI**: lista pronta fora do repositório; o Nicolas roda quando puder.

## Status (21/11/2026, noite): controle do canteiro (branch `projetos/canteiro`)

Pedido do Nicolas (21/11): "comparar o que está no canteiro, o que está desatualizado... o que mais vale dos projetos". Plano de 5 passos aprovado, sem migração.

Feito:
- **Ficha .xlsx direto no app** (`planilha_xlsx.ts`): o importador da distribuição aceita a ficha de controle do Excel como está (primeira aba). As colunas são achadas pelo nome do cabeçalho, mesmo quando o cabeçalho ocupa duas linhas mescladas. Lê datas do Excel e datas digitadas. Conferido com a ficha real de 14/11, fora do repositório: 2116 cópias e 690 devoluções, iguais à leitura do openpyxl.
- **Vigente do servidor** (`canteiro.ts`, `vigentesDoServidor`): com conta, a revisão vigente de cada documento vem do servidor (a lista do Autodoc que o PC publica) e a lista vigente em CSV deixa de ser necessária. Sem conta, vale a lista importada.
  - A disciplina usa o nome que a ficha escreve, pela sigla: ES ESTRUTURAL, EC ESCORAMENTO, FU FUNDAÇÃO, HI HIDRO, SA SANITÁRIO, FR FURAÇÃO, SP SPDA, VD VEDAÇÃO, AR ARQUITETÔNICO. As outras siglas usam o nome do Autodoc.
  - Uma fase que não é de obra (PL, DE, AP...) entra com a fase na frente do número, para não cruzar com cópia.
- **Situação como na ficha v2:**
  - em dia → OK
  - desatualizada em campo → RECOLHER
  - devolvida ou provavelmente recolhida → DEVOLVIDO
  - o resto → CONFERIR

  No painel, o bloco "Controle do canteiro" mostra a contagem. A entrada é pelo painel da obra, em "Controle do canteiro".
- **Escritório pelo índice do PC:** a importação tem um terceiro arquivo, o índice de pranchas (CSV com `codigo` ou `arquivo`). Para cada folha vale a revisão mais nova que está na pasta.
  - Junta com o "Atualizar" feito no app: fica o de data mais recente.
  - A comparação é estrita, porque no PC a fase do arquivo é conhecida. EX R03 na pasta com a LO R03 vigente dá ATUALIZAR.
- **Exportar ficha v2 (.xlsx)** (`ficha_v2.ts`), com as abas:
  - FICHA: uma linha por cópia, com Situação, revisão vigente, dias e o motivo do CONFERIR;
  - AUTODOC: a lista vigente;
  - ESCRITORIO: OK / ATUALIZAR / CONFERIR / SEM CÓPIA;
  - RESUMO: totais por empresa e do escritório.

  O arquivo é gerado no aparelho, sem fórmulas; texto que parece fórmula entra como texto.
- Telas conferidas em 375 px e 768 px, nos temas claro e escuro. Os prints estão fora do repositório.

Próximo passo:
- conferir com o Nicolas os números da ficha real contra o servidor;
- (b) controle de entrega por pessoa;
- (c) PDF.

Pendências:
- O cartão "escritório desatualizado" do painel ainda usa a regra das cópias, que é mais branda (EX = LO do mesmo número entregue depois). Só a exportação usa a regra estrita. Falta decidir com o Nicolas se o cartão passa a usar a estrita.
- A ficha real e os nomes ficam só no aparelho e no servidor, nunca no repositório.

## Status (21/11/2026, tarde): painel da obra (branch `projetos/painel-obra`)
Pedido do Nicolas (21/11, pelo Professor): "da inicio as outras etapas que haviamos comentado dos projetos". Etapas: (a) painel da obra, (b) controle de entrega por pessoa, (c) PDF dessas telas.
- **Teste ao vivo do atalho do Autodoc (21/11, 12:31): deu certo.** Lista do dia publicada na obra piloto (`listas_autodoc`, `documentos` e `revisoes`). A rodada exigiu três ajustes no script do PC: selecionar a conta pela página inicial depois do login, fechar o tour de boas-vindas e limpar o filtro Data (últimos 7 dias).
- **(a) Painel da obra** (`projetos/obra.ts` e `telas/TelaObra.tsx`): a primeira tela do Projetos no app com conta. Sem conta, continua o painel da base.
  - Faixa da última atualização do Autodoc.
  - Quatro números: vigentes; com revisão nova; PC atrás do Autodoc (pasta do escritório com revisão antiga); PC em dia (e quantas sem registro do escritório).
  - Por disciplina e, dentro dela, por pavimento. O pavimento sai do nome curto e do título da prancha (`pavimentoDe`: "FOR4PAVTIP" vira 4º pavimento; pilotis, térreo, fundação...; o resto fica em "Geral").
  - **Nova** = a revisão vigente apareceu depois da leitura anterior do Autodoc (o app lê as últimas linhas de `listas_autodoc`). Na primeira leitura nada conta como novo. Sem internet e sem cópia guardada, vale a regra antiga dos últimos 7 dias.
  - Lista das revisões novas; tocar abre a prancha.
  - Sem migração nova.

## Status (21/11/2026, fim da noite): botão "Atualizar do Autodoc" (branch `projetos/canteiro`)

Pedido do Nicolas (prioridade 1): "um botão para baixar os projetos e montar os dashboards".

- **App**: no topo do painel da obra, só gestor e com conta, o botão "Atualizar do Autodoc". O toque grava um pedido no servidor e a tela acompanha: "Pedido às hh:mm" → "Buscando no Autodoc" → "Pronto às hh:mm: N revisões novas, N baixadas, N falharam" (com a lista das que falharam, pelo código) ou o erro. Ao ficar pronto, o app sincroniza e o painel se refaz. Pendente há mais de 15 min: "o PC do escritório não respondeu". Buscando há mais de 30 min: "interrompido", e o gestor pode pedir de novo. Código: `projetos/pedido_autodoc.ts` e `telas/PedidoAutodoc.tsx`; na bancada, `?pedido=ciclo|parado|erro|preso`.
- **Servidor**: migração `20261121150000_projetos_pedidos_atualizacao.sql` (fora da sincronização; o app só insere a obra; o PC usa `projetos_pegar_pedido` e `projetos_concluir_pedido`; um pedido aberto por obra) e teste `testes_x_projetos_pedidos.sql`. **Não aplicada**: espera o "pode" do Nicolas.
- **PC** (fora do repositório, junto do script do Autodoc): vigia a cada 5 min pela tarefa do Windows, sem janela. Pega o pedido e roda relatório → lista vigente → publicação → revisões novas para o CFL_Projetos (índice + md5). Usa o login do app já guardado e um perfil só do Autodoc (login feito uma vez na mão; fica a sessão, nunca a senha). A janela do Chrome abre fora da tela, porque escondida a página não carrega. A tarefa só é criada com o ok do Nicolas.
- Falta: o ponta a ponta real (depois da migração, do login no perfil e da tarefa).

4. **Entrega com assinatura** ("pode" do Nicolas em 21/11, opcional com aviso): migração `20261121140000_projetos_assinatura_entrega.sql` (só acrescenta `distribuicao_eventos.assinatura_id` → `arquivos`) e teste `testes_x_projetos_assinatura.sql`. No formulário de entrega: quadro para assinar com o dedo ou a caneta e "Mais pranchas nesta entrega" (vai a vigente de cada uma). **Uma assinatura por entrega**: o PNG é guardado uma vez e o mesmo `assinatura_id` vai em todas as linhas; data e hora = `criado_em_dispositivo`. Sem assinatura: aviso na tela e na confirmação, e a entrega é registrada igual. Depois de salvar abre o **Comprovante de entrega** (pranchas, quem, quando, assinatura) com Exportar PDF; na prancha, "✍ assinada · comprovante". A ficha v2 (planilha importada) não tem assinatura: ela vem do Excel, não das entregas do app. **Aplicar a migração junto com o merge**: o app só manda `assinatura_id` quando há assinatura, mas uma entrega assinada não sobe enquanto a coluna não existir no servidor.

## Status (21/11/2026): atualização automática do Autodoc (branch `projetos/autodoc-com-conta`)
Pedido do Nicolas (21/11, pelo Professor): "coloca esse script no programa, a única coisa que a pessoa vai fazer é executar ele".
- **Fora do repositório** (entra no Autodoc, regra do CLAUDE.md): um atalho na área de trabalho, "Atualizar projetos do Autodoc", roda o exportador.
  1. Abre o Autodoc numa janela limpa; a pessoa faz o login nela. Nada da sessão fica gravado.
  2. Exporta o CSV da página Relatórios (só leitura) e gera a lista vigente do dia e a comparação com a anterior.
  3. Publica com o `importar_lista.py` deste repositório, com o login do app: grava `documentos`, `revisoes` e a linha de `listas_autodoc`.
  - Um instalador simples (pasta + atalho) leva tudo para outro PC.
- **No app, só leitura e só com conta:** uma faixa no alto do painel (`projetos/autodoc.ts` e `telas/FaixaAutodoc.tsx`).
  - Mostra "Última atualização do Autodoc: data e hora, por quem" e as revisões e documentos novos.
  - Com mais de 1 dia, diz "Rode o atalho ... no PC".
  - Lê só a última linha de `listas_autodoc`, direto do servidor (a tabela não desce com a sincronização), e guarda uma cópia no aparelho para abrir sem internet.
  - Sem migração nova.
- Bancada: `app/dev/projetos.html?autodoc=ok|atrasada|nunca` (e `&base=exe` para carregar a base fictícia).
- **Aba Pessoas** ("quem tem o quê"; pedido do Nicolas de 21/11: "quando eu clico no fulano, ele tem tal projeto... tem que tirar dele tais projetos"). Só leitura, com e sem conta, em cima da base importada (`projetos/pessoas.ts` e `telas/TelaPessoas.tsx`).
  - Menu: as empresas, com mais atrasadas primeiro. Submenu: as pessoas de cada empresa. Busca por empresa ou pessoa.
  - Painel da pessoa: em campo, atrasadas, a entregar e conferir.
    - **Recolher**: as cópias com revisão que não vale mais.
    - **Entregar**: o que a lista de distribuição diz que falta.
    - **O que tem em campo**: por disciplina e pasta do Autodoc (LO/Formas, LO/Pilares...), como a obra separa forma, armadura e pavimento.
  - Atrasada = a cópia em campo não é a revisão vigente. A ficha de cópias não tem prazo de devolução; esse segundo critério fica para quando houver o campo.
- Próximo passo: o teste ao vivo com o login do Nicolas no Autodoc e a primeira publicação de verdade da obra piloto.

## O que já existe (resumo)
- **Menu:** o Projetos está no menu com o selo "beta" (desde 14/11). Desde 20/11 a base e a lista de distribuição ficam no aparelho (app sem conta); com conta, a lista de distribuição sobe ao servidor.
- **Banco** (migração `20261103234000_projetos.sql`): tabelas `empresas`, `documentos`, `revisoes`, `listas_autodoc`, `escritorio_eventos`, `distribuicao_eventos` e views `revisoes_vigentes`, `documentos_escritorio`, `situacao_distribuicao`. Nada é apagado; correção é registro novo. `listas_autodoc` fica só no servidor.
- **Lista de distribuição** (migração `20261120130000_projetos_destinatarios.sql`, **não aplicada no servidor**): tabela `distribuicao_destinatarios` (só inclusão, gestor inclui) e view `destinatarios_vigentes`. Regra por disciplina inteira ou por pasta do Autodoc; a da pasta vale mais. Destinatário é um nome (empresa + colaborador), sem conta. Cada mudança é linha nova com `substitui_id` (`projetos/distribuicao.ts`).
- **PC** (`pipeline/projetos/`): `importar_lista.py` (lê o CSV do Autodoc, grava `documentos`, `revisoes`, `listas_autodoc` e salva o relatório do dia), `autodoc_csv.py`, `acoes.py`, `exportar_ficha.py` (ficha de cópias no formato da ficha v2). O exportador que entra no Autodoc fica **só fora do repositório** (desde 08/11; volta em 21/11 como atalho no PC).
- **App** (`app/src/projetos/`): abas Painel, Pranchas, Entregas, Empresas, Importar base, Distribuição, A entregar e Pessoas, mais a faixa do Autodoc. Base importada, correções e pasta do escritório ficam em `meta` do navegador (chaves `projetos_base:<obra>`, `projetos_edicoes:<obra>`) e **não entram no .obra**.
- **Regras do cruzamento** do painel em `projetos/painel.ts` (decididas pelo Nicolas em 14/11; texto completo no histórico). Vigência: LO vence EX; chave da folha = código sem a fase.

## Decisões que ainda valem
- 03/11/2026: acesso ao Autodoc **só para ler**, com o login do Nicolas; senha nunca no chat. A ficha de entregas sai do Excel e passa a viver no app, com exportação no formato da ficha v2.
- 08/11/2026: o app não entra no Autodoc; script que entra no Autodoc fica fora do repositório.
- 14/11/2026: as telas não citam um sistema fixo ("sistema de projetos"); as colunas do banco (`pasta_autodoc`, `status_autodoc`...) ficam como estão.
- 20/11/2026: lista por pasta do Autodoc; disparo da verificação por atalho na área de trabalho, nada registrado no Windows; equipe sem conta (conta de leitura fica para depois).

## Como testar
- Bancada (só no `npm run dev`): `app/dev/projetos.html?autodoc=ok|atrasada|nunca` (e `&base=exe` para a base fictícia); `?papel=campo` ou `?papel=leitura` troca o papel.
- Unidade: `painel.test.ts`, `edicoes.test.ts`, `distribuicao.test.ts`, `base.test.ts` (obra EXE em `exemplo_exe.ts`).
- Tela: `local.e2e.test.ts` em 375x812 e 768x1024, nos dois temas (`itProjetos`).
- Banco: `supabase/testes/testes_projetos.sql` e `supabase/testes/testes_x_projetos_destinatarios.sql`. Python: `pipeline/testes`. Integração com PostgREST: `app/testes/projetos.test.ts`.

## Próximo passo
1. Teste ao vivo com o login do Nicolas no Autodoc e a primeira publicação de verdade da obra piloto (status de 21/11).
2. O Nicolas confere a lista sugerida e os apelidos (status de 20/11).
3. Sincronização da lista e das correções (NUC-SINC).
4. Ligação com a FVS (conferências feitas contra revisão antiga), quando a FVS guardar a revisão da planta.

## Pendências abertas
- Migração `20261120130000_projetos_destinatarios.sql` não aplicada no servidor: o Professor fala com o Nicolas antes.
- Correções e pasta do escritório só no navegador; levar para o .obra ou para o servidor precisa do núcleo (com o Nicolas).
- Inativar ou corrigir empresa pelo app: falta alteração de cadastro no núcleo (ou o padrão `substitui_id`). Até lá, pelo editor SQL. Se a FVS precisar de `empresas`, a tabela sobe para o núcleo.
- Prazo de devolução das cópias: a ficha não tem o campo; o segundo critério de atraso espera o campo.
- Do Nicolas:
- Mandar a **Ficha de controle v2** (Excel, pode ser só os cabeçalhos) para conferir a Situação e o formato da exportação.
- Dizer quais filtros usa hoje ao exportar (proposta do módulo: sem data, projeto da obra, todas as extensões).
- Conferir ao vivo se as revisões **obsoletas** vêm na lista da página Relatórios sem mexer no filtro Obsoletos (ele apareceu desativado). Se não vierem, uma revisão que some da lista precisa ser tratada pelo importador (hoje ele só marca obsoleta pela coluna "Obsoleto").
- Medir por quantos dias a sessão do Autodoc fica válida sem login novo (define o quanto o agendamento é "sem ninguém olhar").
