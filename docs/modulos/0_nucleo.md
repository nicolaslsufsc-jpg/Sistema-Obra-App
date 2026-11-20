# Módulo 0: Núcleo

Branch: `modulo/nucleo`

## Objetivo
Base comum de todos os módulos: estrutura do repositório, banco, login, sincronização offline, casca do app (PWA) e export por obra.

## Entregas
1. Esqueleto do monorepo: `app/` (Vite + TypeScript + Preact), `pipeline/`, `supabase/`. **Feito (03/11).**
2. Migração SQL das tabelas do núcleo (`docs/02_CONTRATO_NUCLEO.md`) com regras de acesso por obra (RLS). O Nicolas aplica colando no editor SQL do Supabase. **Feito e aplicado no Supabase (03/11). Nicolas é admin.**
3. Casca da PWA: login por e-mail, escolher obra, menu de módulos, instalação e funcionamento offline, `storage.persist()`. **Feito (03/11). Login e escolha de obra testados pelo Nicolas no PC e no celular (03/11, pela rede de casa). Instalação e uso sem internet no celular ficam para depois da publicação (entrega 7).**
4. Biblioteca de sincronização: fila de saída em Dexie, envio, baixa por cursor. Usada por todos os módulos. **Feito (03/11).**
5. Export completo de uma obra (banco + arquivos). **Feito (03/11): `pipeline/exportar_obra.py`. Migração aplicada no Supabase e exportação da obra TESTE feita contra o Supabase real (03/11).**
6. Cadastro da obra de teste e da obra piloto (pavimentos abaixo). **Obra TESTE aplicada (03/11). obra piloto: SQL pronto, aguardando decisão.**
7. Publicação no Cloudflare Pages. **Publicado em 17/11/2026: `https://sistema-obra-1po.pages.dev` (projeto `sistema-obra` na conta Cloudflare do Nicolas, ligado só ao repositório `Sistema-Obra`, branch `main` até 18/11 e `site` desde então, build `cd app && npm ci && npm run build`, saída `app/dist`, `NODE_VERSION=22` e `NOMES_PROIBIDOS`). Conferido em 18/11: responde 200 com a lista de permissões e os cabeçalhos de `_headers`. Falta: esconder `NOMES_PROIBIDOS` (Encrypt), ligar o Access e testar no celular.**
8. Plantas pelo servidor, sem .zip (18/11/2026, branch `claude/nucleo-servidor-login-c870e3`): com login, o menu da obra baixa sozinho as plantas vigentes que faltam no aparelho (`nucleo/plantas_offline.ts` + `telas/PlantasSemInternet.tsx`), uma por vez, com o download conferido pelo SHA-256 da FVS. Mostra "Plantas no aparelho: X de Y"; sem internet, avisa quanto falta; sem espaço, não começa. O cadastro e as fichas já vinham pela sincronização; as plantas sobem pelo `pipeline/fvs/publicar_planta.py`.

## Dados confirmados (03/11/2026)
- Repositório: `nicolaslsufsc-jpg/Sistema-Obra-App`, público, desde 18/11/2026 (começou sem histórico). O antigo `nicolaslsufsc-jpg/Sistema-Obra` ficou privado, com o histórico, e o Cloudflare publica o ramo `site` dele (ver CLAUDE.md, "Dois repositórios").
- Supabase: projeto `zktsuwxgvvyufuihkndj` (região São Paulo, organização "Conferencias"), URL `https://zktsuwxgvvyufuihkndj.supabase.co`. Desde 04/11/2026; o projeto anterior `wtptoyvyypaeotxiqupy` ficava nos EUA e deve ser pausado e depois apagado pelo Nicolas.
- Publishable key (pública): `sb_publishable_UkMxFtS6lcprzAlWCpxwHQ_KKLLJ0op`. Login por e-mail ativo.
- Chaves secretas nunca no chat nem no repositório: `.env` no PC do Nicolas.
- Pavimentos da obra piloto: Subsolo, Pilotis, Térreo Comercial, Mezanino, 2º, 3º, 4º, 5º e 6º Pavimento, Cobertura, Barrilete.
- De-para trecho da prancha × setor do Construpoint: depois.
- Dados da obra piloto só sobem depois do e-mail de ok dos chefes da empresa.

## Migrações aplicadas no Supabase
Projeto `zktsuwxgvvyufuihkndj` (São Paulo). Quem aplica é o Nicolas (ou a sessão de testes com ele olhando), colando no editor SQL (`supabase/README.md`). Migração nova: acrescente uma linha aqui quando for aplicada. Conferência sem login: `GET /rest/v1/<tabela>` com a publishable key responde "permission denied" se a tabela existe e `PGRST205` se não existe.

| Migração | Veio no | Situação |
|---|---|---|
| `20261103120000_nucleo.sql` | PR 2 | Aplicada em São Paulo (04/11/2026) |
| `20261103200000_nucleo_exportacao.sql` | PR 3 | Aplicada em São Paulo (04/11/2026) |
| `20261103210000_nucleo_pessoas.sql` | PR 3 | Aplicada em São Paulo (04/11/2026) |
| `20261103220000_nucleo_caminho_arquivo.sql` | PR 3 | Aplicada em São Paulo (04/11/2026) |
| `20261103230000_concreto.sql` | PR 7 | Aplicada em São Paulo (04/11/2026) |
| `20261103234000_projetos.sql` | PR 6 | Aplicada em São Paulo (04/11/2026) |
| `20261104100000_fvs.sql` | PR 14 | Aplicada em São Paulo pela sessão de testes (conferido pela API em 07/11/2026) |
| `20261105090000_fvs_ambientes.sql` | PR 14 | Aplicada em São Paulo pela sessão de testes (conferido pela API em 07/11/2026) |
| `20261105120000_fvs_fichas_campo.sql` | PR 17 | Aplicada (conferido pela API em 07/11/2026) |
| `20261106120000_relatorios.sql` | PR 19 | Aplicada em São Paulo pela sessão de testes (07/11/2026); conferido pela API que as 12 tabelas existem e recusam visitante |
| `20261106130000_fvs_areas.sql` | app/local | Aplicada em São Paulo (08/11/2026, `docs/03_APP_LOCAL.md`) |
| `20261107200000_relatorios_foto_marca.sql` | app/local | Aplicada em São Paulo (08/11/2026) |
| `20261107210000_concreto_caneta.sql` | app/local | Aplicada em São Paulo (08/11/2026) |
| `20261108120000_fvs_resultado_c_nc.sql` | FVS (tarefa 3) | Aplicada em São Paulo (conferido em 18/11/2026: regra C/NC/NA e gatilho `fvs_converter_resultado` no banco; já estava lá antes desta sessão) |

Seeds: `seed/01_obra_teste.sql` (PR 2) aplicado em São Paulo (04/11), a obra TESTE existe com 3 pavimentos. `seed/02_obra_exemplo.sql` aplicado em São Paulo em 18/11/2026 com o "pode" do Nicolas: obra EXE ("Obra Exemplo", fictícia) com 5 pavimentos, para o teste do servidor com login.

No projeto antigo dos EUA só as 4 do núcleo chegaram a ser aplicadas (03/11); as do Concreto e do Projetos nunca entraram lá.

## Dono de
`docs/01_ARQUITETURA.md`, `docs/02_CONTRATO_NUCLEO.md`, tabelas do núcleo, biblioteca de sincronização.

## Status
**Rumo desde 07/11/2026: app de um usuário sem conta, uma sessão, uma branch `app/local` (`docs/03_APP_LOCAL.md`).** Parte 1 (base: PRs #21 a #25 na `main`) e parte 2 (casca sem conta, arquivo `.obra`, pasta de salvamento automático) feitas em 07/11; a parte 3 (pacote da obra piloto + FVS no modo local) é a próxima.

Entregas 1 a 5 prontas. Casca pronta para os módulos entrarem em paralelo (registro `app/src/modulos.ts`, 04/11). Servidor em São Paulo (04/11) com as migrações do núcleo, Concreto, Projetos e FVS e a obra TESTE; login por código configurado (e-mail pelo Gmail do Nicolas); todas as migrações da `main` aplicadas (Relatórios em 07/11); falta o Nicolas testar a sincronização e a exportação. Rodada de segurança e velocidade em 07/11 (lista de permissões do navegador, link seguro, sincronização em paralelo, Projetos sob demanda). App testado aqui contra o PostgREST 13.0.7 (o mesmo programa que o Supabase usa) e no Chromium, e pelo Nicolas no PC e no celular contra o Supabase real (login, obra TESTE). Instalação e uso sem internet no celular dependem da publicação (entrega 7).

## Feito
**16/11/2026, branch `demo/rede-17-11` (aprovado pelo Nicolas: "Pode incluir"):** o app abre pelo IP da rede, em http sem HTTPS. `nucleo/compat.ts` põe substitutos de `crypto.randomUUID` e `crypto.subtle.digest` (SHA-1/256/512, este pelo teste do Dexie) só quando o navegador esconde os originais. `ABRIR_NA_REDE.bat` + modo `rede` do `servidor_python.py`: atende o Wi-Fi (0.0.0.0:8770) e mostra no PC uma página com QR code (`qrcode.js`, qrcode-generator 1.4.4, MIT). Pela rede não há service worker: funciona só com o PC ligado. Cada aparelho guarda os próprios registros; se o IP do PC mudar, o celular passa a ser outro endereço e não vê o que gravou no anterior.

**03/11/2026, PR 2 (mergeado):** esqueleto do monorepo, migração do núcleo com RLS, seeds, testes do banco, contrato v1.

**03/11/2026, entregas 3 e 4:**
- Login por código numérico por e-mail (decisão do Nicolas; hoje 8 dígitos), cadastro livre (decisão do Nicolas), escolher obra, menu de módulos, aviso de versão nova, instalação, `storage.persist()`.
- Biblioteca em `app/src/nucleo/`: banco local (Dexie), fila de envio por usuário, envio em lotes sem duplicar, baixa por cursor com margem de 5 min e paginação por (atualizado_em, id), envio de arquivo (foto) com hash SHA-256.
- O app abre direto do banco do aparelho, sem esperar a internet. Sincroniza sozinho por trás.
- Testes: 47 no app (unidade, integração com PostgREST real e 6 de tela no Chromium, inclusive abrir sem internet) e 63 no banco. 12 defeitos inseridos de propósito: os testes acusaram todos (um deles só depois de um teste novo feito para isso).
- Revisão independente (5 revisores + 5 verificadores que tentam derrubar cada achado): 27 achados confirmados, alguns repetidos entre revisores, todos corrigidos; 4 derrubados. Os mais graves:
  - Sair no meio de uma sincronização deixava o aparelho com a marcação errada e parte da obra nunca mais baixava. Corrigido: a baixa é cancelada quando o aparelho é limpo.
  - Foto pendente era carregada inteira na memória a cada minuto. Corrigido: bytes em tabela à parte, contagem pelo índice.
  - Com login vencido, a foto ia como visitante e era marcada como recusada para sempre. Corrigido: confere o login antes de enviar.
  - Sair sem internet podia derrubar o login seguinte. Corrigido: sem internet, sair não chama o servidor.
  - Telas: código de login some se o Android fechar o app; barra verde com servidor fora; sair sem aviso na tela de obras; sem caminho de volta depois de "Entrar de novo". Todos corrigidos.
- Supabase real conferido (só leitura): visitante sem login recebe "permission denied" em `obras`.

**03/11/2026, entrega 5:** `pipeline/exportar_obra.py` (Python, só biblioteca padrão, roda no Windows). Exporta dados (JSON e CSV para o Excel), arquivos conferidos pelo SHA-256 e `restaurar.sql`. Testado contra o PostgREST de verdade e restaurando num banco novo; 6 defeitos inseridos de propósito, todos acusados.

**03/11/2026, extras (sem depender do Nicolas):**
- Testes automáticos no GitHub (`.github/workflows/testes.yml`): banco, app, exportação e telas em cada PR. PR com ✗ não está pronto.
- Tela "Pessoas da obra" (só admin): dar, mudar e tirar acesso pelo app; mostra quem entrou e ainda não tem acesso. Migração `20261103210000_nucleo_pessoas.sql`.
- Modelo de migração para os módulos (`supabase/modelos/tabela_de_modulo.sql`), testado junto com o banco.
- Revisão independente da exportação (3 revisores + 3 verificadores): 14 achados confirmados, todos corrigidos (caminho de arquivo que podia sair da pasta e apagar arquivo do PC, login que vencia em exportação longa, queda de conexão derrubava tudo, obra mudando quebrava o restaurar.sql, psql no Windows corrompia acentos, CSV errado no Excel pt-BR, entre outros). Migração `20261103220000_nucleo_caminho_arquivo.sql`: o banco e o armazenamento recusam caminho de arquivo inseguro.
- Revisão independente da tela de pessoas (2 + 2): 11 achados confirmados, todos corrigidos (admin não aparecia e "tirar acesso" de um admin não tirava nada; mensagens fora da tela no celular; tela abria rolada; lista de contas que nunca entraram; aviso errado ao tirar acesso; entre outros).
- Testes: 66 no app e 105 checagens no banco. Mais 14 defeitos inseridos de propósito nas correções, todos acusados.

**03/11/2026, Supabase real (registro das migrações):**
- Nicolas confirmou as 4 migrações aplicadas (tabela em "Migrações aplicadas no Supabase").
- O Supabase agora só deixa editar os modelos de e-mail com SMTP próprio. Sem isso o e-mail chegava só com link, sem código, e nem o app nem a exportação conseguiam entrar. Configurado o SMTP do Gmail do Nicolas (`smtp.gmail.com`, porta 465, senha de app do Google, que não fica no repositório). Modelos "Magic link or OTP" e "Confirm signup" com `{{ .Token }}` e assunto "Código de acesso ao Sistema Obra". Limite subiu para 30 e-mails por hora. `supabase/README.md` atualizado.
- Exportação da obra TESTE pelo `exportar_obra.py`, logado como admin: 1 obra, 3 pavimentos, 1 perfil, nenhum arquivo, nenhum aviso. Pasta e `.zip` fora do repositório, no PC do Nicolas.
- O código que chega tem **8 dígitos** (configuração atual do Supabase). Decisão do Nicolas (03/11): fica em 8. Os textos que falavam em "6 dígitos" (app, script, READMEs e arquitetura) passaram a falar só em "código"; o app e o script já aceitavam de 6 a 10.
- App compilado aberto no PC (`localhost`) e pelo IP da rede com https (o celular exige https para `crypto.randomUUID`); servidor improvisado na sessão, fora do repositório. Nicolas entrou no app pelo PC e pelo celular e abriu a obra TESTE: tudo certo. PR 4 mergeado.

**04/11/2026, casca para vários módulos em paralelo (PR da branch modulo/nucleo):**
- Conferido que a `main` com os PRs 5, 6 e 7 juntos está verde aqui no PC: banco (155 checagens, 7 arquivos de teste), app (build e 28 testes de unidade) e pipeline (33 testes).
- Registro de módulos `app/src/modulos.ts`: cada módulo mexe só na própria linha (preenche `Tela`), sem tocar em `app.tsx` nem `Menu.tsx`. Antes, cada módulo novo teria que editar os dois arquivos em três lugares, e as sessões de FVS, Projetos e Documentos em paralelo iam dar conflito. O Concreto passou para o registro sem mudar nada no código dele. Contrato v1.4, seção "Casca do app".
- Teste de tela novo: o menu abre o Concreto, FVS fica desativado, e o voltar do Android (e o "Voltar" do módulo) retornam ao menu. Roda no GitHub (PostgREST + Chromium); aqui no PC o download do PostgREST para Windows foi bloqueado pela permissão do Claude Code.
- `supabase/testes/rodar_testes_windows.py`: roda os testes do banco no PC do Nicolas sem psql (Postgres portátil + psycopg). Conferido que acusa defeito: com a regra de leitura aberta de propósito, falhou em "sem acesso não vê pavimentos".
- Seed da obra piloto com o nome completo "nome da obra piloto" (pedido da sessão Projetos). Continua **não aplicado**.

**04/11/2026, servidor em São Paulo (sessão de testes e segurança, PR da branch `nucleo/servidor-sao-paulo`):**
- Conferência da `main` com os PRs 5 a 8: build, 28 testes do app, 33 do pipeline e 155 do banco, tudo verde; varredura de segurança sem achados (RLS pelo `preparar_tabela` nas 11 tabelas novas, views com `security_invoker`, `security definer` com `search_path` vazio, nada aberto ao `anon`, nenhum segredo no repositório, sem `innerHTML`, bancada de teste fora do `dist`).
- Pasta principal `03_Sistema_Obra` restaurada para a `main` com o ok do Nicolas (os três arquivos antigos tinham sido vistos pela sessão do núcleo). Os testes da sessão de QA rodam na cópia `.claude/worktrees/testes`.
- O Supabase não muda a região de um projeto. Nicolas criou o projeto `zktsuwxgvvyufuihkndj` em São Paulo; a sessão aplicou as 6 migrações e o seed da TESTE pelo editor SQL (navegador interno, com ele logado), Nicolas criou o usuário dele no painel e colou a senha de app do Gmail no SMTP; a sessão o virou admin, trocou os dois modelos de e-mail para o código e conferiu pela API que as 18 tabelas e views existem e recusam visitante. Código com 8 dígitos já era o padrão do projeto novo.
- Repositório: URL e publishable key trocadas em `app/src/config.ts`, `pipeline/exportar_obra.py`, `docs/01_ARQUITETURA.md` e `supabase/README.md` (com o roteiro de "trocar de projeto").
- Aviso: o navegador interno do app Claude perde o login do Supabase e do GitHub quando o painel é fechado; cada rodada longa pede login de novo.

**07/11/2026, rodada de segurança e velocidade (sessão de testes e segurança, branch `nucleo/seguranca-velocidade`):**
- **Sincronização mais rápida:** antes o aparelho baixava as ~30 tabelas uma por vez, e no celular cada pedido espera a ida e volta ao servidor. Agora o núcleo baixa primeiro e os módulos (FVS, Concreto, Projetos, Relatórios) baixam ao mesmo tempo, cada um na própria ordem (`BLOCOS_SINCRONIZADOS` em `app/src/nucleo/tabelas.ts`). "Pais antes dos filhos" continua valendo porque módulo só aponta para o núcleo e para as próprias tabelas (conferido nas chaves estrangeiras das migrações). De quebra, tabela que falta num módulo não impede mais os outros de baixar. Módulo novo: acrescentar a lista dele em `BLOCOS_SINCRONIZADOS` (o app recusa abrir se os blocos não baterem com `TABELAS_SINCRONIZADAS`; teste em `blocos.test.ts`).
- **App abre mais leve:** o Projetos passou a carregar só quando é aberto, como FVS, Concreto e Relatórios (`sobDemanda` em `app/src/telas/SobDemanda.tsx`, genérico para qualquer módulo). Arquivo inicial caiu de 401 kB para 372 kB (106 kB comprimido).
- **Lista de permissões do navegador (CSP):** o `index.html` compilado diz ao navegador que o app só roda o próprio código e só fala com o próprio endereço e com o Supabase (`vite.config.ts`). Se um dia entrar texto malicioso numa tela, ele não roda script de fora nem manda o login para outro lugar. Conferido no navegador: tela de login abre, o Supabase responde, pedido para outro site é bloqueado, service worker registra. Serviço externo novo (mapa, fonte) precisa entrar nessa lista.
- **Link da pasta do Autodoc (Projetos):** o endereço vinha do banco direto para o link; um texto `javascript:...` gravado em `documentos.link_pasta` rodaria dentro do app ao ser tocado. Agora só vira link se for http(s) (`app/src/nucleo/links.ts`, com teste).
- **Cabeçalhos do Cloudflare Pages** (`app/public/_headers`, valem quando publicar): não deixa outro site abrir o app dentro de moldura, `nosniff`, sem `Referer`, só câmera liberada, HTTPS obrigatório; `sw.js` e `index.html` sempre conferidos e os arquivos com código no nome guardados por um ano.
- Migração dos Relatórios aplicada no Supabase de São Paulo com o ok do Nicolas (editor SQL, navegador interno).
- A `main` estava vermelha desde o PR 17: o teste de tela da FVS esperava a hora de Brasília e o Chrome do GitHub roda em UTC. O teste passou a abrir o navegador no fuso `America/Sao_Paulo`.
- Observação sem mudança: a cópia "colar no Excel" da FOR-008 (`linhasParaExcel`, Concreto) não protege célula que começa com `=`; os CSVs já protegem. Risco baixo (texto digitado pela própria equipe); fica para a sessão do Concreto.

**07/11/2026, parte 2 do app local (branch `app/local`):** modo sem conta na casca (`nucleo/local.ts`, `telas/NovaObraLocal.tsx`, `telas/BarraLocal.tsx`), `EstadoSessao` com `'local'`, arquivo `.obra` (`nucleo/salvamento.ts`) e pasta automática (`nucleo/pasta_salvamento.ts`). Detalhes em `docs/03_APP_LOCAL.md`, "Parte 2".

## Próximo passo
0. Parte 3 do app local: pacote da obra piloto e FVS no modo sem conta (`docs/03_APP_LOCAL.md`).
1. Nicolas: entrar no app (PC e celular), abrir a TESTE e rodar `exportar_obra.py TESTE` contra o servidor novo. Entrar de novo também no `importar_lista.py` (apagar `%LOCALAPPDATA%\SistemaObra\sessao_supabase.json`), porque a sessão guardada era do servidor antigo.
2. Nicolas: pausar o projeto antigo `wtptoyvyypaeotxiqupy` (Project Settings > General > Pause) e apagar uma semana depois.
3. Entrega 7: Nicolas cria a conta no Cloudflare Pages e segue `app/README.md`, "Publicar". Depois, teste no celular.
4. Atender os pedidos dos módulos que chegarem (tabela abaixo).

## Pendências (decisão do Nicolas)
- **Seed da obra piloto**: só nome da obra (agora "nome da obra piloto") e pavimentos. Aplicar agora ou só depois do ok da empresa?
- E-mails saem do Gmail pessoal do Nicolas (até ~500 por dia). Serve para os testes; para a obra de verdade, talvez um serviço de e-mail próprio com domínio.

## Pedidos dos módulos
(as outras sessões anotam nos próprios arquivos; esta consolida aqui)

| Módulo | Pedido | Situação |
|---|---|---|
| Projetos | Nome completo da obra piloto: nome da obra piloto | Feito no seed (04/11), falta o Nicolas confirmar e aplicar |
| Projetos | `empresas` nasce no módulo; se a FVS também precisar, sobe para o núcleo | Só ciência. Quando a FVS pedir, o núcleo assume |
| Concreto | Mexeu na casca (`Menu.tsx`, `app.tsx`) para abrir o módulo; tabelas em `nucleo/tabelas.ts` | Casca trocada pelo registro `modulos.ts` (04/11); o Concreto continua igual |
| FVS estrutura | Tabela `fvs_regras` (prazos e ligações entre itens, uma linha por versão da config da obra; vale a mais nova) | 19/11: migração `20261119120000_fvs_regras.sql` + teste do banco; baixa num bloco à parte, no fim (`nucleo/tabelas.ts`); sem conta, o `config_fvs.json` do pacote vira uma linha (id fixo por obra). Migração aplicada no Supabase em 18/11 (Professor, com o "pode" do Nicolas) |
| Documentos | Funcionar com login: tabela `doc_documentos` no servidor e na sincronização | 20/11: migração `20261120150000_documentos.sql` (gestor e admin incluem, só inclusão) + teste do banco; bloco à parte, no fim (`nucleo/tabelas.ts`); o módulo grava pelo `sincronizador.registrar`; PDF já enviado abre baixando do servidor |

## Feito em 07/11/2026 à noite (branch `app/local`, parte 3 de `docs/03_APP_LOCAL.md`)
- `app/src/nucleo/pacote_obra.ts`: o pacote da obra (`dados_obra/` ao lado do app) entra no aparelho sem login: obra com id fixo pelo código, cadastro e histórico como registros baixados (ids derivados do conteúdo), plantas guardadas no banco da FVS com progresso. A casca (`app.tsx`) mostra "Preparando a obra" e cai no menu; "Nova obra" e "Usar sem conta" saíram (`local.ts` só liga o modo).
- `modulos.ts` ganhou o módulo IFC. `vite.config.ts`: `.wasm` no cache do app e `'wasm-unsafe-eval'` na lista de permissões.
- Entrega: `pipeline/fvs/pc_empresa/` virou o pacote do Sistema Obra (`ABRIR_SISTEMA_OBRA.bat`; o servidor entrega `/dados_obra/` aos dois sites).
- Testes: `pacote_obra.test.ts`, `local.e2e.test.ts` (pasta de obra de teste gerada no teste).
