# Nova obra: montar uma obra sem o Nicolas

Objetivo: outra pessoa (engenheiro, estagiário, técnico de outra obra ou de outra empresa) monta o pacote de uma obra nova sozinha, sem Python, sem AutoCAD e sem JSON feito à mão.

Fora desta proposta: o módulo Projetos (revisões) e a integração com o Construpoint (vai virar um "galho" removível, em outro chat).

Histórico e detalhe: docs/historico/nova_obra.md (como era antes, as opções A/B/C, o plano de etapas, o que foi feito por data e o texto completo das seções resumidas aqui).

---

## O que é

Assistente "Nova obra" dentro do próprio app (opção B): página `app/nova_obra.html`, código em `app/src/nova_obra/`. Em 6 passos (Obra, Pavimentos, Plantas, Fichas, Pessoas, Salvar) a pessoa cadastra a obra, sobe os PDFs de forma, o app lê as peças no navegador, a pessoa confere e corrige, e no fim a obra é publicada no servidor (administrador, com internet) ou sai um `.zip` no formato de sempre, que abre no app de campo pelo "Abrir pacote da obra (.zip)". Rascunho, PDFs e perfis ficam no aparelho (IndexedDB) até publicar.

## Status atual

- Etapas 0 a 3 feitas em 09/11/2026 (registro de 09/11: branch `claude/app-nova-obra-dc37ae`, só commits locais; o código de `app/src/nova_obra/` está nesta árvore).
  - **0:** Obra Exemplo 2, de uma "projetista B" inventada (`app/testes/obra_exemplo2.ts`).
  - **1:** cadastro pela tela: obra, pavimentos, fichas com colar do Excel, etapa da concretagem, salvar `.zip`.
  - **2:** planta do PDF (pdf.js, janela, escala, tiles WebP) e peças à mão (tocar no nome ou desenhar).
  - **3:** leitura automática (`desenho.ts`, `leitor.ts`, `perfis.ts`), perfil da projetista ensinado com 2 toques, conferência (sem contorno, repetido, sem seção, não lido).
- Ajustes do Revisor e do Testador de 09/11: limites do PDF (`limites.ts`), avisos ao salvar, dica de nomes pequenos, alvos de 44 px.
- Opção B aprovada pelo Professor em 09/11, com o Nicolas fora; falta a confirmação do Nicolas. A página ainda não está no menu: abre por `/nova_obra.html`.
- **23/11/2026, publicar no servidor e quem tem acesso** (branch `nova-obra/servidor`, saída da `main` f8bb9a8, commit local):
  - passo 5 **Pessoas**: nome, e-mail (pode ficar vazio) e papel (gestor, campo, leitura); o salvar confere nome, e-mail válido e repetido;
  - no passo 6, **Publicar no servidor** (`publicar.ts`, `servidor.ts`): confere login e administrador, recusa código que já existe no servidor, cria a linha em `obras`, põe pavimentos, peças, setores, arquivos da planta (manifest e pacote pelo armazenamento), plantas e fichas na fila do núcleo, manda até esvaziar e chama `convidar` para cada pessoa (com conta: acesso na hora; sem conta: quando entrar com aquele e-mail; sem e-mail: convite esperando);
  - recomeça de onde parou (o rascunho guarda `publicacao`): não cria outra obra nem repete linha nem convite;
  - sem migração e sem mudar o núcleo: as linhas são as mesmas do `.zip` (`linhasDoCadastro`).
  - **Não testado ainda contra um servidor de verdade** (só com servidor falso nos testes e a tela sem login): falta conta de teste no servidor de testes (ver pendências).
- **25/11/2026, ideia 14: unidade de conferência por ficha** (branch `nova-obra/unidade-conferencia`, saída de `origin/trabalho` 299664c, commit local):
  - no passo 4 **Fichas**, cada ficha ganha "Como conferir": por peça, parede, ambiente, trecho, área ou pavimento. Padrão: peça para pilar/viga/laje, ambiente para A, parede para M (tipo M "Parede" entrou no "Vale para"); parede e ambiente acertam o "Vale para" sozinhos; combinação sem sentido segura o salvar;
  - vai no `.zip` como `config_fvs.json` (`unidades: [{id, ficha, unidade, desde}]`) e, na publicação, vira linha em `fvs_regras` pelo mesmo `linhasDoCadastro`. Sem migração e sem mexer no núcleo (o gatilho de `fvs_regras` só confere prazos e ligações);
  - leitura em `app/src/fvs/regras.ts` (só acréscimo): `unidadeDe(regras, ficha, dia)` e `historicoDeUnidades`. Trocar no meio da obra = entrada nova com `desde` novo; nada é apagado, os registros continuam no local;
  - **as telas da FVS ainda não obedecem**: marcar o grupo inteiro (trecho, área, pavimento) com `marcarLote` e o aviso "conferido por <unidade> até <data>" ficam com os chats FVS-2 e FVS-3 (desenho na nota `14_NOVA-OBRA_ideia14_unidade_de_conferencia.md` do Professor).
- **25/11/2026, trocar a unidade numa obra já publicada** (pendência 11, parte final; branch `nova-obra/trocar-unidade`, saída de `origin/trabalho` 4544df3, commit local):
  - página **Como conferir** na versão PC (barra lateral, "Escritório"), só para o administrador da obra; no celular e no tablet não aparece;
  - lista as fichas (código, maior revisão) com o que vale hoje, a troca marcada para depois e o histórico; "Trocar" escolhe a unidade e a data ("a partir de", hoje ou depois);
  - grava uma versão nova de `fvs_regras` pela fila do núcleo (`registrar`, funciona sem internet): copia tudo da versão que vale (prazos, ligações, residenciais e o resto) e acrescenta a entrada em `unidades`; a anterior fica como histórico, nada é apagado;
  - recusa data no passado, data antes de uma troca já marcada, a mesma unidade e unidade que não serve para a ficha publicada (peça sem P/V/L, parede sem M, ambiente sem A: aí é publicar revisão da ficha);
  - conta em `app/src/nova_obra/trocar_unidade.ts` (com teste), tela em `nova_obra/TelaUnidades.tsx`; no `pc/` só a entrada na barra e na lista de páginas (3 arquivos, poucas linhas). Sem migração e sem mexer no núcleo.
- Etapas 4 (várias pranchas no pavimento) e 5 (detalhes de pilar e viga) não começaram.

## Como testar

- Build e testes do app: `cd app && npm install && npm run build`.
- Unidade: `src/nova_obra/modelo.test.ts`, `publicar.test.ts` (servidor falso: ordem, recomeçar, código repetido, convite recusado), `planta.test.ts`, `leitor.test.ts`, `limites.test.ts`, `testes/obra_exemplo2.test.ts`.
- Tela (tablet 1280 e celular 375): `testes/nova_obra.e2e.test.ts` (monta a obra, cola ficha, sobe PDF, ensina, lê, salva, abre o `.zip` no app e na FVS).
- Ver os PDFs da Obra Exemplo 2: `OBRA2_SAIDA=<pasta fora do repo> npx vitest run testes/obra_exemplo2.test.ts`.
- Medida de tempo e memória: `SO_MEDIR=1 ... npx vitest run testes/nova_obra_medida.e2e.test.ts` (em 09/11: 3,9 a 4,6 s e 180 a 205 MB, PC freado, não tablet).
- Gabarito da obra piloto: fora do repositório, na pasta "Nova obra" ao lado dos pacotes da obra piloto no PC do Nicolas (com LEIA-ME). Com o perfil da piloto, as 5.080 peças das 49 pranchas saem iguais às do Python.

## Decisões que ainda valem

- **Opção B** (assistente no app, leitura no navegador); o Python fica como gabarito e caminho do Nicolas. Registrada só aqui: `docs/01_ARQUITETURA.md` e `02_CONTRATO_NUCLEO.md` não mudaram.
- **pdf.js 6.4.299** (Apache), fixo pelo npm, build "legacy" (roda em Chrome antigo e no Node), worker no cache. MuPDF não (AGPL). DWG no navegador não: pedir PDF com camadas.
- **Escala** vai no `manifest.json` (campo `escala`); pacote antigo sem o campo continua abrindo.
- **Concretagem** marcada nos itens da ficha (`concretagem: true/false`), sem migração; `itensAntesDaConcretagem` (`app/src/fvs/situacao.ts`) usa a marca, e sem marca adivinha pelo nome.
- **Perfil da projetista** é dado, não código; fica no aparelho (`nova_obra:perfis`).
- **"Viga por vão"** ligada só nos perfis ensinados; desligada no perfil da piloto até o Nicolas decidir.
- Ambientes seguem parados (decisão de 05/11). Detalhes de pilar e viga ficam para a etapa 5: a peça funciona sem eles.
- Nada do núcleo, do `areas.ts` nem dos menus foi mexido (ordem do Professor).

## Pedidos e pendências abertas

### Pedidos ao chat da FVS (para o Nicolas aprovar)

1. **`app/src/fvs/areas.ts` usar `manifest.escala`.** Hoje a conta de m² usa 1:50 fixo (`METROS_POR_PONTO`, linha 95). Uma planta 1:75 montada pela Nova obra vai dar m² errado (1:75 dá 2,25 vezes a área de 1:50). Pedido: quando o manifest tiver `escala`, usar ela; sem o campo, continuar 1:50. Não mexi: o Professor proibiu tocar no `areas.ts`.
2. O aviso "Nenhuma planta publicada... pelo PC (pipeline/fvs/publicar_planta.py)" apontar para a Nova obra.
3. `situacao.ts` ganhou 3 linhas na etapa 1 (a marca de concretagem): juntar com cuidado com a `app/fvs`.

### Pendências

1. **Botão "Nova obra" no menu sem conta e na tela de entrada (núcleo: `telas/Entrar.tsx` e `telas/Menu.tsx`).** Não foi mexido: pela regra do `CLAUDE.md`, o núcleo é do chat da `app/fvs` com o ok do Nicolas. Até lá, a página abre pelo endereço `/nova_obra.html`.
2. Celular e tablet de verdade (Android) ainda não testados: só o Chrome do PC em 375 px e 1280 px.
3. PDF escaneado com compressão JBIG2 ou JPEG 2000 pode precisar do módulo wasm do pdf.js, que ainda não está configurado. Os de teste usam JPEG comum.
4. Até o `areas.ts` mudar (pedido 1, agora com o chat da FVS), planta que não seja 1:50 dá m² errado na FVS.
5. Os perfis ensinados ficam só no aparelho onde foram ensinados (não vão no .zip nem para o servidor).
6. Regra "viga por vão" no perfil da obra piloto: decisão do Nicolas (ver o achado acima).
7. Nome de peça partido em dois textos no PDF (ex. "P" e "12" separados) ainda não é juntado pelo leitor; o Python também não junta.
8. **Ponta a ponta da publicação no servidor de testes (`tbscnqazrveiaoqgpgxs`):** precisa de uma conta de administrador com senha lá (o login por código não chega). Pedido ao Professor em 23/11. Depois: publicar `EXE-NO1`, abrir no app e na FVS, 375 px e tablet.
9. A obra publicada não volta para o assistente (editar depois é pelo app). Se a publicação cair entre criar a obra e pôr na fila, a obra fica vazia no servidor: o app avisa e pede outro código ou apagar a obra.
10. **Exemplos do Relatórios em obra nova** (fora da Nova obra, `app.tsx` e `relatorios/exemplos.ts`): eles entram em toda obra aberta, inclusive numa obra montada pela Nova obra. Decisão do Nicolas: desligar para obra real ou deixar só para a demonstração.

11. **Ideia 14 nas telas da FVS** (chats FVS-2 e FVS-3): ler `unidadeDe` ao abrir a ficha; trecho/área/pavimento marcam o grupo com `marcarLote`; aviso no local da unidade anterior. Trocar a unidade de uma obra já publicada: feito em 25/11 (página "Como conferir" da versão PC).
12. O teste de `fvs_regras` na publicação (`app/testes/nova_obra_publicar.test.ts`) só roda no CI (não há PostgREST neste PC).

**Próximo passo:** com a conta de teste liberada, o ponta a ponta no servidor de testes (pendência 8). Antes disso, seguem valendo: o Nicolas confirma a opção B, a mudança "leitura no navegador", os pedidos à FVS e a regra "viga por vão"; depois, a etapa 4 (várias pranchas no pavimento, folha única no navegador), se liberada.
