# Módulo 0: Núcleo

Branch: `modulo/nucleo`

Histórico e detalhe: docs/historico/0_nucleo.md (entregas por extenso, tudo o que foi feito por data, pedidos dos módulos já atendidos, tabela completa das migrações).

## Objetivo
Base comum de todos os módulos: estrutura do repositório, banco, login, sincronização offline, casca do app (PWA) e export por obra.

## Entregas (resumo)
1. Esqueleto do monorepo (`app/`, `pipeline/`, `supabase/`): feito (03/11).
2. Migração das tabelas do núcleo com RLS: feita e aplicada no Supabase (03/11). Nicolas é admin.
3. Casca da PWA (login por e-mail, escolher obra, menu, offline, `storage.persist()`): feita (03/11), testada pelo Nicolas no PC e no celular.
4. Biblioteca de sincronização (fila em Dexie, envio, baixa por cursor): feita (03/11).
5. Export completo de uma obra (`pipeline/exportar_obra.py`): feito e testado contra o Supabase real (03/11).
6. Cadastro das obras: obra TESTE aplicada (03/11); obra piloto com SQL pronto, aguardando decisão.
7. Publicação no Cloudflare Pages: publicado em 17/11/2026 (`https://sistema-obra-1po.pages.dev`, ramo `site` do repositório `Sistema-Obra` desde 18/11). Falta: esconder `NOMES_PROIBIDOS` (Encrypt), ligar o Access e testar no celular.
8. Plantas pelo servidor, sem .zip (18/11/2026): com login, o menu da obra baixa sozinho as plantas vigentes que faltam no aparelho, conferidas pelo SHA-256.

## Dados confirmados (03/11/2026)
- Repositório: `nicolaslsufsc-jpg/Sistema-Obra-App`, público, desde 18/11/2026 (começou sem histórico). O antigo `nicolaslsufsc-jpg/Sistema-Obra` ficou privado, com o histórico, e o Cloudflare publica o ramo `site` dele (ver CLAUDE.md, "Dois repositórios").
- Supabase: projeto `zktsuwxgvvyufuihkndj` (região São Paulo, organização "Conferencias"), URL `https://zktsuwxgvvyufuihkndj.supabase.co`. Desde 04/11/2026; o projeto anterior `wtptoyvyypaeotxiqupy` ficava nos EUA e deve ser pausado e depois apagado pelo Nicolas.
- Publishable key (pública): `sb_publishable_UkMxFtS6lcprzAlWCpxwHQ_KKLLJ0op`. Login por e-mail ativo.
- Chaves secretas nunca no chat nem no repositório: `.env` no PC do Nicolas.
- Pavimentos da obra piloto: conferidos, ficam no cadastro da obra (dado de obra, fora do repositório).
- De-para trecho da prancha × setor do Construpoint: depois.
- Dados da obra piloto só sobem depois do e-mail de ok dos chefes da empresa.

## Migrações aplicadas no Supabase
Projeto `zktsuwxgvvyufuihkndj` (São Paulo). Quem aplica é o Nicolas (ou a sessão de testes com ele olhando), colando no editor SQL (`supabase/README.md`). Migração nova: acrescente uma linha aqui quando for aplicada. Conferência sem login: `GET /rest/v1/<tabela>` com a publishable key responde "permission denied" se a tabela existe e `PGRST205` se não existe.

Resumo, uma linha por migração (tabela completa no histórico):
- `20261103120000_nucleo.sql` (PR 2): Aplicada em São Paulo (04/11/2026)
- `20261103200000_nucleo_exportacao.sql` (PR 3): Aplicada em São Paulo (04/11/2026)
- `20261103210000_nucleo_pessoas.sql` (PR 3): Aplicada em São Paulo (04/11/2026)
- `20261103220000_nucleo_caminho_arquivo.sql` (PR 3): Aplicada em São Paulo (04/11/2026)
- `20261103230000_concreto.sql` (PR 7): Aplicada em São Paulo (04/11/2026)
- `20261103234000_projetos.sql` (PR 6): Aplicada em São Paulo (04/11/2026)
- `20261104100000_fvs.sql` (PR 14): Aplicada em São Paulo pela sessão de testes (conferido pela API em 07/11/2026)
- `20261105090000_fvs_ambientes.sql` (PR 14): Aplicada em São Paulo pela sessão de testes (conferido pela API em 07/11/2026)
- `20261105120000_fvs_fichas_campo.sql` (PR 17): Aplicada (conferido pela API em 07/11/2026)
- `20261106120000_relatorios.sql` (PR 19): Aplicada em São Paulo pela sessão de testes (07/11/2026); conferido pela API que as 12 tabelas existem e recusam visitante
- `20261106130000_fvs_areas.sql` (app/local): Aplicada em São Paulo (08/11/2026, `docs/03_APP_LOCAL.md`)
- `20261107200000_relatorios_foto_marca.sql` (app/local): Aplicada em São Paulo (08/11/2026)
- `20261107210000_concreto_caneta.sql` (app/local): Aplicada em São Paulo (08/11/2026)
- `20261108120000_fvs_resultado_c_nc.sql` (FVS (tarefa 3)): Aplicada em São Paulo (conferido em 18/11/2026: regra C/NC/NA e gatilho `fvs_converter_resultado` no banco; já estava lá antes desta sessão)
- `20261121120000_nucleo_convites.sql` (Login (branch `login/convites`)): **Ainda não aplicada.** Convites de pessoa sem e-mail; o Professor aplica depois do merge (aprovado pelo Nicolas em 21/11/2026)

Seeds: `seed/01_obra_teste.sql` (PR 2) aplicado em São Paulo (04/11), a obra TESTE existe com 3 pavimentos. `seed/02_obra_exemplo.sql` aplicado em São Paulo em 18/11/2026 com o "pode" do Nicolas: obra EXE ("Obra Exemplo", fictícia) com 5 pavimentos, para o teste do servidor com login.
No projeto antigo dos EUA só as 4 do núcleo chegaram a ser aplicadas (03/11); as do Concreto e do Projetos nunca entraram lá.

## Dono de
`docs/01_ARQUITETURA.md`, `docs/02_CONTRATO_NUCLEO.md`, tabelas do núcleo, biblioteca de sincronização.

## Status
**Rumo desde 07/11/2026: app de um usuário sem conta, uma sessão, uma branch `app/local` (`docs/03_APP_LOCAL.md`).** Parte 1 (base: PRs #21 a #25 na `main`) e parte 2 (casca sem conta, arquivo `.obra`, pasta de salvamento automático) feitas em 07/11; a parte 3 (pacote da obra piloto + FVS no modo local) é a próxima.

Entregas 1 a 5 prontas. Casca pronta para os módulos entrarem em paralelo (registro `app/src/modulos.ts`, 04/11). Servidor em São Paulo (04/11) com as migrações do núcleo, Concreto, Projetos e FVS e a obra TESTE; login por código configurado (e-mail pelo Gmail do Nicolas); todas as migrações da `main` aplicadas (Relatórios em 07/11); falta o Nicolas testar a sincronização e a exportação. Rodada de segurança e velocidade em 07/11 (lista de permissões do navegador, link seguro, sincronização em paralelo, Projetos sob demanda). App testado aqui contra o PostgREST 13.0.7 (o mesmo programa que o Supabase usa) e no Chromium, e pelo Nicolas no PC e no celular contra o Supabase real (login, obra TESTE). Instalação e uso sem internet no celular dependem da publicação (entrega 7).

## Como testar
- Banco (migrações e RLS): `bash supabase/testes/rodar_testes.sh`; no PC do Nicolas (Windows): `python supabase/testes/rodar_testes_windows.py`.
- App (build): `cd app && npm install && npm run build`.
- App contra PostgREST de verdade + telas no Chromium: `E2E=1 bash supabase/testes/rodar_integracao.sh`.
- Os três rodam sozinhos no GitHub em cada PR (`.github/workflows/testes.yml`). PR com ✗ não está pronto.
- Conferência de migração no Supabase sem login: ver o parágrafo em "Migrações aplicadas no Supabase".

## Próximo passo
0. Parte 3 do app local: pacote da obra piloto e FVS no modo sem conta (`docs/03_APP_LOCAL.md`).
1. Nicolas: entrar no app (PC e celular), abrir a TESTE e rodar `exportar_obra.py TESTE` contra o servidor novo. Entrar de novo também no `importar_lista.py` (apagar `%LOCALAPPDATA%\SistemaObra\sessao_supabase.json`), porque a sessão guardada era do servidor antigo.
2. Nicolas: pausar o projeto antigo `wtptoyvyypaeotxiqupy` (Project Settings > General > Pause) e apagar uma semana depois.
3. Entrega 7: Nicolas cria a conta no Cloudflare Pages e segue `app/README.md`, "Publicar". Depois, teste no celular.
4. Atender os pedidos dos módulos que chegarem (tabela abaixo).

## Pendências (decisão do Nicolas)
- **Seed da obra piloto**: só nome da obra (agora "nome da obra piloto") e pavimentos. Aplicar agora ou só depois do ok da empresa?
- E-mails saem do Gmail pessoal do Nicolas (até ~500 por dia). Serve para os testes; para a obra de verdade, talvez um serviço de e-mail próprio com domínio.
- Migração `20261121120000_nucleo_convites.sql` ainda não aplicada (o Professor aplica depois do merge).
- Cloudflare Pages: esconder `NOMES_PROIBIDOS` (Encrypt), ligar o Access e testar no celular.

## Pedidos dos módulos ainda abertos
(as outras sessões anotam nos próprios arquivos; esta consolida aqui)

| Módulo | Pedido | Situação |
|---|---|---|
| Projetos | Nome completo da obra piloto: nome da obra piloto | Feito no seed (04/11), falta o Nicolas confirmar e aplicar |
| Projetos | `empresas` nasce no módulo; se a FVS também precisar, sobe para o núcleo | Só ciência. Quando a FVS pedir, o núcleo assume |

Pedidos já atendidos (Concreto, FVS estrutura, Documentos, Projetos/distribuição): no histórico.
