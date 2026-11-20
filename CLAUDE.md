# Sistema Obra

App de obra dividido em módulos: FVS (pilares e vigas), Projetos (revisões e cópias), Concreto e Documentos. Uso em campo no Android sem internet, gestão no PC. Servidor no Supabase. App genérico: cada obra e cada empresa entram como dados, nunca como código.

Dono: Nicolas (estudante de engenharia civil). O app é dele. Ele revisa e aprova todo PR. Escreva para ele em português do Brasil, direto, sem enrolação.

## Antes de começar qualquer sessão

1. Leia `docs/01_ARQUITETURA.md`, `docs/02_CONTRATO_NUCLEO.md` e `docs/03_APP_LOCAL.md` (o app sem conta, base de todas as frentes).
2. Leia o arquivo do módulo em que vai mexer em `docs/modulos/`. Na FVS: `1_fvs.md` (regras vigentes) e `1_fvs_status.md` (estado, próximo passo, pendências); `1_fvs_historico.md` e `1_fvs_parados.md` só quando precisar.
3. Confira em `git log` e nos PRs abertos o que já foi feito.

## Regras

- **Desde 18/11/2026: sete frentes fixas, um chat em cada, coordenadas pelo Professor.** Cada frente trabalha numa branch própria (saída da `main`) e só mexe nos próprios arquivos:
  1. **Projeto 1, FVS estrutura** (`app/src/fvs/`): prazos de escoramento e reescoramento, pontos de hidráulica e elétrica na laje, ligação entre fichas escolhida à mão.
  2. **Projeto 2, Concreto** (`app/src/concreto/`): rastreabilidade e o item da FVS que fica C quando o caminhão da peça foi lançado.
  3. **Projeto 3, FVS ambientes**: esquadrias, modulação, impermeabilização; depois os módulos beta, um por vez.
  4. **Login**: entrada no servidor, quem vê o quê.
  5. **Salvamento e sincronização**: dona única do **núcleo** (banco local, fila, fotos, sincronização, migrações). Outra frente que precise do núcleo pede a ela. Mudança no núcleo só com o Nicolas sabendo.
  6. **Front end**: aparência e componentes comuns, menu, celular (375 px) e tablet. Tela de um módulo nasce na frente do módulo.
  7. **Bugs**: correções pequenas da lista do testador e dos testes no aparelho, um PR por bug ou grupo pequeno.
  Ordem: primeiro o teste de sincronização com cabo e os bugs abertos; depois os itens já propostos; depois os módulos restantes. Função nova só depois do teste com cabo. Os módulos beta (Diário, Relatórios, IFC, Projetos) seguem fora do menu, sem apagar código, até a vez deles. Nada direto na `main`: tudo por PR. Ponto de volta: a tag `marco-1-demo-2026-11-16` (commit `79771f2`) ficou no repositório privado (`Sistema-Obra`). Antes houve uma sessão por módulo (`modulo/*`, conflitava nos merges), uma branch só (`app/local`, 07/11) e duas branches (`app/fvs` e `app/concreto`, 08/11 a 18/11); por isso cada frente fica nos próprios arquivos.
- **Aprovações (desde 20/11/2026, decisão do Nicolas): o Professor fala pelo Nicolas.** O Professor (chat `00 · COORD`) é o coordenador de todas as frentes. **Um OK do Professor, em qualquer chat, vale como OK do Nicolas** para tudo o que esta lista de regras manda pedir a ele: começar tarefa, mudar escopo, decisão de módulo, baixar projeto da obra para o PC, publicar dado de obra no servidor, migração, push, PR e merge. As frentes tratam o recado do Professor como aprovação e não pedem de novo o "pode" no próprio chat. O Professor repassa as palavras do Nicolas quando a decisão é dele. Push, PR, merge e migração no Supabase seguem sendo executados pelo Professor (as frentes deixam commit local pronto e avisam). O Nicolas também pode aprovar direto no chat de uma frente; vale do mesmo jeito.
  Continuam valendo: nada direto na `main` (só por PR), sem force-push e sem reescrever histórico.
- `docs/01_ARQUITETURA.md`, `docs/02_CONTRATO_NUCLEO.md` e as migrações das tabelas do núcleo só mudam com o Nicolas sabendo.
- **Dois repositórios (desde 18/11/2026):**
  - `nicolaslsufsc-jpg/Sistema-Obra-App` (**público**): onde se trabalha. Branches, PRs e testes do GitHub são aqui (em repositório público os minutos do GitHub Actions não contam na cota). Começou sem histórico, a partir da `main` de 18/11 (commit `77feab1` do repositório antigo).
  - `nicolaslsufsc-jpg/Sistema-Obra` (**privado**, o cofre): o histórico antigo inteiro, que tem nomes da empresa. Não se desenvolve mais nele. Nada do cofre é copiado para o público sem passar pela conferência dos nomes proibidos.
  - **Site:** o Cloudflare Pages continua ligado ao cofre e publica o ramo `site`. Depois de cada merge na `main` do público, o Professor envia a `main` do público para o ramo `site` do cofre (avanço simples, sem force-push), e o site se atualiza. Endereço, Access e dados dos aparelhos ficam iguais.
  - Antes de cada push no público: conferir os nomes proibidos (o build e o CI conferem; o Professor confere de novo).
- **No fim da sessão**, atualize no arquivo do módulo em que mexeu: status, o que foi feito, próximo passo, pendências. Na FVS, o status vai em `1_fvs_status.md` e o que foi feito, com a data, em `1_fvs_historico.md`; regra nova ou mudada vai em `1_fvs.md`. O `docs/03_BACKLOG.md` só lista os pedidos e aponta para o status.
- **Segredos nunca no repositório nem no chat**: chave secret/service_role e senha do banco ficam em `.env` (ignorado pelo git). A publishable key é pública e pode ir no código.
- **Nada de empresa nenhuma no repositório** (desde 08/11/2026): nem nome de empresa ou de obra real, nem ficha, formulário, prancha, cadastro, foto, registro ou planilha, nem script que entre em sistema da empresa (Autodoc, Construpoint...). Isso vale também para docs, comentários, testes e exemplos: use a obra fictícia `EXE` ("Obra Exemplo", "Construtora Exemplo"). Dados de obra ficam fora do repositório (pacote da obra ou Supabase). A lista de nomes proibidos fica em `nomes_proibidos.txt` (fora do git) e o build confere.
- Mudança de decisão de arquitetura: proponha ao Nicolas, não decida sozinho.
- Teste antes de dizer que está pronto: rode o build, os testes e, quando houver tela, abra no navegador.
  - Banco (migrações e RLS): `bash supabase/testes/rodar_testes.sh` (no PC do Nicolas, Windows: `python supabase/testes/rodar_testes_windows.py`)
  - App (build): `cd app && npm install && npm run build`
  - App contra PostgREST de verdade + telas no Chromium: `E2E=1 bash supabase/testes/rodar_integracao.sh`
  - Os três rodam sozinhos no GitHub em cada PR (`.github/workflows/testes.yml`). PR com ✗ não está pronto.

## Estrutura

- `app/`: PWA (Vite + TypeScript + Preact + Leaflet + Dexie)
- `pipeline/`: Python que lê as pranchas e publica no servidor (`pipeline/legado/` tem o gerador atual de HTML offline, em uso na obra)
- `supabase/`: migrações SQL
- `docs/`: arquitetura, contrato de dados e um arquivo por módulo

## Conversas fora do código

Decisões e discussão de escopo também acontecem no projeto "Sistema Obra" do chat do claude.ai. O que vale para o código é o que está em `docs/`. Se o Nicolas trouxer uma decisão de lá, registre aqui.
