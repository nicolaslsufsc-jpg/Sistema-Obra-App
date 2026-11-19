# App local: um usuário, sem servidor

Decisão do Nicolas em 07/11/2026: parar o trabalho em paralelo por módulo e entregar **um app que ele baixa e usa no PC, sem login**, para apresentar aos chefes da empresa. O que já existe (módulos, tabelas, migrações, sincronização) fica; o servidor continua desenhado e pronto, mas não é usado na apresentação.

Na noite de 07/11 ele fechou o escopo: o app abre **como se já estivesse logado na obra piloto** (sem "Nova obra"), com os módulos FVS, Concreto (rastreabilidade com duas canetas e mapa de concretagens), Relatórios/Diário (com exemplos) e IFC (importar o arquivo). O painel do Controle de Projetos ficou de fora desta rodada: o módulo Projetos continua como estava.

## Resultado

Uma pasta que, extraída no PC, abre com dois cliques em `ABRIR_SISTEMA_OBRA.bat` e mostra o menu da obra piloto com:

1. **FVS**: planta única por pavimento (9 pavimentos), pilares e vigas desenhados, áreas de laje criadas na planta, fichas de pilar, viga, laje e ambientes, histórico do Construpoint de 05/11, cores cinza (pendente) / amarelo / azul / verde / vermelho, lista de reprovações.
2. **Concreto**: concretagem, caminhões e CPs; no mapa, a caneta dos pilares e a caneta das vigas e laje; sem caminhão escolhido, o mapa de concretagens (uma cor por concretagem).
3. **Relatórios**: diário (clima, relato do dia, mão de obra com função livre, equipamentos, serviços, materiais, ocorrências, fotos com o ponto de onde foram tiradas) e relatórios avulsos. Três dias de exemplo.
4. **IFC**: "Importe aqui seu IFC", modelo 3D, busca e cortes.
5. Projetos (como estava) e Documentos (em construção).

**Desde 08/11/2026** (branch `app/fvs`) o menu mostra só FVS e Concreto: Relatórios, IFC, Projetos e Documentos ficaram fora, com o código guardado (`foraDoMenu` em `app/src/modulos.ts`). **Desde 09/11/2026** os Relatórios (Diário de obra) voltaram ao menu e o Documentos entrou (lista mestra do PBQP-H, só no modo sem conta); IFC e Projetos seguiram fora. O IFC voltou em 13/11/2026 e o Projetos em 14/11/2026, os dois com o selo "beta" (o Projetos, sem conta, ainda não importa a lista de pranchas). **Desde 18/11/2026** (pedido do Professor, pela regra do CLAUDE.md) IFC, Projetos e Relatórios (Diário) saíram de novo, com o código guardado; o teste de sincronização com dois aparelhos chega ao Diário pelo build de teste (núcleo). Ficam FVS, Concreto e Documentos.

Nada sai do PC. O que a pessoa registra fica no navegador; "Salvar arquivo" gera o `.obra`.

Onde está: `(pasta da obra piloto, fora do repositório)\Sistema Obra obra piloto\` (programa + `dados_obra_FVS.zip`; fora do repositório, porque tem dados da empresa).

## App de um lado, dados da empresa do outro (decisão de 08/11/2026)

O app é do Nicolas e é genérico. Tudo o que é da empresa da obra piloto entra só como dados, fora do repositório:

- **No repositório:** só código e exemplos fictícios (obra `EXE`, "Obra Exemplo", "Construtora Exemplo", fichas `EXE-PVS-*`). Nenhum nome de empresa ou obra real, nenhuma ficha ou formulário de empresa, nenhuma prancha, nenhum cadastro, nenhum script que entre em sistema da empresa (o exportador automático do Autodoc saiu; a lista é exportada à mão).
- **Fora do repositório** (`(pasta da obra piloto)\fora_do_repo\` e as pastas de pacotes que já existiam): as fichas PVS, o config do gerador legado, o cadastro SQL da obra, o exportador do Autodoc e o pacote da obra (`dados_obra_FVS.zip`, plantas, fichas e histórico). É isso que se carrega para a demonstração.
- **Para usar com a obra piloto**, os scripts recebem os dados de fora: `bancada.py`/`exportar_bancada.py` com `--fichas ARQUIVO_DA_EMPRESA` e `--nome`, `pipeline/integracoes/construpoint/importar_construpoint.py` com `--obra` e `--fichas-do-app FICHA_DE_PILAR,FICHA_DE_VIGA`, `publicar_historico.py` com `--empresa-autorizou`.
- **Trava:** `nomes_proibidos.txt` (na raiz, ignorado pelo git) lista os nomes que não podem aparecer; o build falha se algum deles estiver no site compilado. No GitHub, a mesma lista pode ir como segredo `NOMES_PROIBIDOS`.
- **Pendência de risco alto (não resolvida):** não há acordo escrito com a empresa da obra piloto sobre de quem é o app e como ela pode usá-lo. A separação ajuda, mas não substitui o acordo. Resolver antes de entregar o app ou qualquer cópia dele à empresa.
- **Pendência (decisão do Nicolas):** o histórico antigo do git ainda tem as versões anteriores, com os dados que saíram. Limpar o histórico (reescrever ou começar um repositório novo) é uma etapa à parte, só com o ok dele.

## Como funciona

**Pacote da obra (`dados_obra/`).** A pasta ao lado do app, no formato do `pipeline/fvs/exportar_bancada.py`: `indice.json` (pavimentos, peças, plantas e, opcional, `sistema_oficial`: o galho de sistema oficial da obra, ver [modulos/integracoes.md](modulos/integracoes.md)), `fichas.json`, `historico.json` (histórico do sistema oficial) e, por pavimento, `manifest.json` + `pacote.bin`. `app/src/nucleo/pacote_obra.ts` procura `dados_obra/indice.json` ao lado do app (ou `?dados=URL`, só no modo de desenvolvimento, para a bancada: o app compilado ignora, desde 08/11/2026) e, se existe:
- entra sem conta (`local.ts`), cadastra a obra com **id fixo pelo código** (UUID derivado: a mesma obra em qualquer PC, e o `.obra` de um restaura no outro);
- grava o cadastro e o histórico como registros "baixados" (pendente 0), com ids derivados do conteúdo;
- guarda todas as plantas no banco da FVS, com a tela "Guardando as plantas no aparelho: 3 de 10" (só na primeira vez; 120 MB em uns 5 s do próprio PC);
- só relê o cadastro quando a pasta muda (assinatura do índice e das fichas);
- ao reler, a ficha que saiu da pasta (a rev. 0 quando chega a rev. 1, por exemplo) continua no aparelho se alguma marcação, ficha aberta ou área de laje feita aqui usa ela; o histórico do Construpoint passa para a revisão vigente (desde 08/11/2026).

**Pacote da obra em .zip (desde 08/11/2026, "nada por USB, pode ser tudo por arquivo compactado").** O Chrome do Android não abre pasta, só arquivo. Sem a pasta ao lado, a tela de entrada mostra "Sem conta, sem internet" com o botão "Abrir pacote da obra (.zip)"; o menu sem conta tem o mesmo botão, para trazer um pacote novo (plantas ou fichas novas). O app lê o .zip em fatias, um arquivo de cada vez (`app/src/nucleo/zip.ts`, sem biblioteca nova), e daí segue igual à pasta: mesma tela "Guardando as plantas", mesmas proteções do #30 e do #31. Depois de guardado, o app abre direto na obra, sem o .zip e sem internet; se uma planta sumir do aparelho, ele pede o .zip de novo. O .zip sai do `pipeline/fvs/compactar_pacote.py PASTA --saida ARQ.zip` (recusa saída dentro do repositório) ou do `exportar_bancada.py`. Medido em 08/11 com o pacote da obra piloto (90 MB, 23 arquivos) em 375 px e CPU 4x mais lenta, no Chrome do PC: 4,6 s para guardar (já com a conferência do SHA-256), pico de 31 MB de memória JavaScript do app (a medição não conta os buffers de cada planta, uns 10 MB por vez), 101 MB guardados; a planta abre em 1,5 s depois de fechar e abrir. **Celular de verdade ainda não testado.**

**Proteções do .zip (ressalvas do Revisor, 08/11):** item comprimido é descompactado contando os bytes e para ao passar do tamanho declarado (teto de 50 MB); .zip com nome ou item fora do arquivo dá a mensagem normal de .zip ilegível; cada planta é conferida pelo tamanho e pelo SHA-256 do índice antes de guardar (estragada não fica como guardada, e a próxima abertura tenta de novo); o `indice.json` tem `gerado_em` (pipeline), e um .zip de outra obra, mais antigo ou sem data (quando o aparelho tem data) mostra "Trocar de obra?" ou "Abrir um pacote mais antigo?" com as duas datas, e só segue com a confirmação; cancelar não mexe em nada.

Sem a pasta e sem o .zip, o app pede o login por e-mail, como antes. O botão "Usar neste aparelho, sem conta" e a tela "Nova obra" saíram.

**Salvamento (vira a sincronização).** Igual à parte 2: a fila de pendentes do núcleo; "Salvar arquivo" / "Restaurar" / pasta de salvamento automático na faixa do menu. Quando o servidor entrar, "Enviar ao servidor" manda a mesma fila.

**Exemplos** (`app/src/relatorios/exemplos.ts`): semeados uma vez por obra, como registros baixados (fora da fila e do `.obra`), no pavimento com peças (Pilotis na obra piloto): três dias de diário, três relatórios, fotos desenhadas na hora com o ponto na planta e uma concretagem com três caminhões, áreas das duas canetas e a laje. Para refazer: apagar a chave `exemplos_relatorios:<obra>` da tabela `meta` do banco do navegador.

## Migrações aplicadas no servidor em 08/11/2026

Feitas nesta branch, testadas no Postgres local (`python supabase/testes/rodar_testes_windows.py`, 239 checagens) e **aplicadas no Supabase de São Paulo em 08/11/2026** (com o "Pode aplicar" do Nicolas, pelo SQL Editor; conferidas pela API em seguida):
- `20261106130000_fvs_areas.sql` (áreas de laje, da FVS).
- `20261107200000_relatorios_foto_marca.sql`: `rel_marcas.foto_id` (onde a foto foi tirada).
- `20261107210000_concreto_caneta.sql`: `caminhao_areas.alvo` (`pilares` | `vigas_laje`).

## Gerar a entrega de novo

1. `py pipeline/fvs/montar_entrega.py PASTA_FORA_DO_REPOSITORIO` (compila o app e a bancada, copia os arquivos de `pipeline/fvs/pc_empresa/`; recusa dado de obra).
2. Copiar `dados_obra_FVS.zip` para dentro (o de `(pasta da obra piloto)\FVS\Folha unica\`, gerado por `exportar_bancada.py` com `pacotes_folha_unica`, os três `--fichas`, `--historico` e `--sistema-oficial construpoint`; sem esta última, o app não mostra lançamento nem fichas duplicadas).
3. Abrir com `ABRIR_SISTEMA_OBRA.bat` e conferir.

Bancada no PC (sem montar nada): `python <scratch>/servir_cors.py "<Folha unica>\dados_obra" 8766` e `npm run dev` com `http://localhost:5183/?dados=http://127.0.0.1:8766/`.

## Testes

- Unidade: `pacote_obra.test.ts`, `local.test.ts`, `exemplos.test.ts`, `relatorios.test.ts` (colunas contra as duas migrações), Concreto.
- Telas (Chrome): `local.e2e.test.ts` (pasta de obra de teste gerada no próprio teste: abre direto na obra piloto, FVS com a planta guardada, salvar e restaurar, 375 px e tablet), `concreto_bancada`, `relatorios_bancada`, `ifc_bancada`.
- Banco: 239 checagens (inclui as duas migrações novas).

## O que ficou de fora (para depois)

- Painel do Controle de Projetos (o módulo Projetos está como estava).
- Celular/tablet de verdade com este pacote: o teste foi no Chrome do PC (375 px e 1280 px). Pelo Wi-Fi, o `servidor.ps1` só atende o próprio PC (localhost).
- Ao entrar com e-mail num aparelho que estava sem conta, reatribuir o `usuario_id` da fila antes de enviar.
- Fotos de exemplo são desenhos; fotos de verdade entram pelo botão "Tirar ou escolher foto".
- Conferido no Chrome de verdade (Playwright) com o pacote em `localhost:8770`: o service worker registra e não há erro de console; o leitor de IFC abriu o EST do outra obra (12 MB) com a lista de permissões do app compilado. No navegador interno do Claude o service worker não registra (limitação do painel, não do pacote).

## Ordem de trabalho (histórico)

1. Base: juntar os PRs abertos na `main` (feito em 07/11: #22, #25, #24, #21, #23).
2. Casca sem conta + Salvar/Restaurar (feito em 07/11, PR #26).
3. Pacote da obra piloto + FVS no modo local (feito em 07/11 à noite).
4. Rastreabilidade (Concreto) com as plantas da obra piloto, duas canetas e mapa de concretagens (feito).
5. Diário de obra e Relatórios, com exemplos e ponto da foto (feito).
6. IFC no menu (feito).
7. Painel de Projetos (não feito).
8. Pasta final, LEIA-ME, teste em 375 px e tablet (feito no Chrome do PC).
