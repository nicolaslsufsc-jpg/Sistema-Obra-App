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
