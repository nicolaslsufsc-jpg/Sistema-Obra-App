# Modo sem conta + Salvar/Restaurar: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O app abre sem login ("Usar neste aparelho, sem conta"), cria uma obra local e deixa salvar/restaurar o que foi registrado num arquivo `.obra`, com pasta de salvamento automático no Chrome/Edge do PC.

**Architecture:** Nada muda nos módulos nem na sincronização: o modo sem conta grava um usuário local e uma obra no mesmo banco do aparelho (`BancoLocal`), e os registros continuam entrando pela fila de pendentes do `Sincronizador`. O arquivo de salvamento é a fila (itens + fotos) em JSON comprimido; restaurar é repor a fila. Quando o servidor entrar, "Enviar ao servidor" manda essa mesma fila (fora desta parte).

**Tech Stack:** Preact, Dexie (IndexedDB), `CompressionStream` do navegador (gzip, sem dependência nova), File System Access API (`showDirectoryPicker`) para a pasta automática, Vitest + fake-indexeddb nos testes de unidade, Playwright (Chromium) nos testes de tela.

**Spec:** `docs/03_APP_LOCAL.md` (seções "Casca sem conta" e "Salvamento").

## Global Constraints

- Textos de tela em português do Brasil, sem jargão ("sem conta", "neste aparelho", "salvar", "restaurar"; nunca "sync", "backup", "export").
- Toda tela nova testada em 375 px e tablet (1280x800) antes de dizer que está pronta.
- Nenhuma dependência npm nova.
- Nada do modo sem conta fala com o Supabase: com `VITE_SUPABASE_URL=http://127.0.0.1:9` o app tem de funcionar inteiro.
- Nunca apagar registro pendente: restaurar só acrescenta; "sair" não existe no modo sem conta.
- Ids de obra e usuário são UUID (`montarLinha` recusa outra coisa).
- Commits com `git -c user.name=Claude -c user.email=noreply@anthropic.com`, mensagem terminando em `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Arquivo `.obra` de outra obra restaurado: a obra entra na lista e vira a atual; os registros ficam nela (teste na Tarefa 4).
2. Arquivo corrompido ou de outro formato: mensagem "Este arquivo não é um salvamento do Sistema Obra" e nada muda no banco (teste na Tarefa 4).
3. Mesmo arquivo restaurado duas vezes: 0 novos, N repetidos, fila sem duplicata (teste na Tarefa 4).
4. Pasta automática que perdeu a permissão depois de fechar o navegador: estado "pedir" com botão "Reativar", sem erro em laço (teste na Tarefa 6, com permissão simulada).
5. Navegador sem `CompressionStream`: o arquivo sai em JSON puro e o leitor aceita os dois (teste na Tarefa 4).

---

### Tarefa 1: usuário e obra sem conta (`nucleo/local.ts`)

**Files:**
- Create: `app/src/nucleo/local.ts`
- Test: `app/src/nucleo/local.test.ts`

**Interfaces:**
- Consumes: `BancoLocal` (`lerMeta`, `gravarMeta`), tipos `UsuarioLocal`, `ObraLocal` de `conta.ts`.
- Produces:
  - `const EMAIL_SEM_CONTA = 'sem-conta@este-aparelho'`
  - `ehModoLocal(banco: BancoLocal): Promise<boolean>` — meta `modo_local === true`.
  - `entrarSemConta(banco: BancoLocal): Promise<UsuarioLocal>` — gera uma vez `usuario_local_id` (uuid), grava meta `usuario` `{ id, email: EMAIL_SEM_CONTA }` e `modo_local: true`; chamada de novo devolve o mesmo id.
  - `criarObraLocal(banco: BancoLocal, dados: { codigo: string; nome: string }): Promise<ObraLocal>` — código em maiúsculas sem espaços nas pontas, nome sem espaços nas pontas; lança `Error('Informe o código da obra')` se código vazio e `Error('Já existe uma obra com o código X')` se repetido; `{ id: uuid, codigo, nome, empresa: null, papel: 'admin' }` acrescentado em meta `obras` e gravado em `obra_atual`.

- [ ] **Passo 1: teste** `local.test.ts` com `new BancoLocal('teste-local-' + n)`:
  - `entrarSemConta` duas vezes → mesmo `id`, `email === EMAIL_SEM_CONTA`, `ehModoLocal` true; antes, `ehModoLocal` false.
  - `criarObraLocal({ codigo: ' exe ', nome: ' Obra Exemplo ' })` → `codigo 'EXE'`, `nome 'Obra Exemplo'`, `papel 'admin'`, id bate com o regex de UUID; `lerMeta('obras')` tem 1 item; `lerMeta('obra_atual')` é o id.
  - código vazio → rejeita com "Informe o código da obra"; código repetido → rejeita com "Já existe uma obra com o código obra piloto".
- [ ] **Passo 2:** rodar `npx vitest run src/nucleo/local.test.ts` → falha (módulo não existe).
- [ ] **Passo 3:** implementar `local.ts`.
- [ ] **Passo 4:** rodar de novo → passa.
- [ ] **Passo 5:** commit `Modo sem conta: usuário e obra locais`.

### Tarefa 2: sincronização ciente do modo sem conta

**Files:**
- Modify: `app/src/nucleo/conta.ts` (`EstadoSessao`, `estadoSessao`, `sessaoDoUsuario`)
- Modify: `app/src/nucleo/usarSincronizacao.ts` (`EstadoSincronizacao`, `ciclo`)
- Test: `app/src/nucleo/local.test.ts` (acrescentar)

**Interfaces:**
- Produces: `EstadoSessao` ganha `'local'`; `Conta.estadoSessao()` devolve `'local'` quando `ehModoLocal(banco)` (antes de qualquer chamada ao cliente); `sessaoDoUsuario` devolve `false` nesse caso (o `Sincronizador.enviar` nunca manda). `EstadoSincronizacao` ganha `local: boolean` (true quando `sessao === 'local'`). No `ciclo`, com sessão `'local'`: só `contar()`, `problema` vazio, `sincronizando` false, próximo ciclo em 5 min, sem `atualizarObras`, `enviar` nem `baixar`.

- [ ] **Passo 1: teste** em `local.test.ts`: `new Conta({} as SupabaseClient, banco)`; depois de `entrarSemConta`, `estadoSessao()` → `'local'` e `sessaoDoUsuario(id)` → `false` (o cliente vazio prova que não houve chamada).
- [ ] **Passo 2:** rodar → falha.
- [ ] **Passo 3:** implementar em `conta.ts` e `usarSincronizacao.ts`. `Menu.tsx`, `ModuloConcreto`, `ModuloFvs`, `ModuloProjetos`, `ModuloRelatorios` continuam compilando (o campo novo é opcional de ler).
- [ ] **Passo 4:** `npm run typecheck` e `npx vitest run src/nucleo` → passam.
- [ ] **Passo 5:** commit `Sincronização: modo sem conta não fala com o servidor`.

### Tarefa 3: telas de entrada e de obra sem conta

**Files:**
- Modify: `app/src/telas/Entrar.tsx` (prop `aoUsarSemConta: () => void`; botão "Usar neste aparelho, sem conta" abaixo do formulário, com a linha "Para usar sem login: tudo fica guardado neste aparelho e pode ser salvo num arquivo.")
- Create: `app/src/telas/NovaObraLocal.tsx` — `NovaObraLocal({ aoCriar, aoVoltar }: { aoCriar: (obra: ObraLocal) => void; aoVoltar?: () => void })` (nome diferente do tipo `ObraLocal` de `conta.ts`): h1 "Nova obra", campos "Código" (ex.: obra piloto) e "Nome", botão principal "Criar obra"; erro de `criarObraLocal` aparece em `<p class="erro" role="alert">`.
- Modify: `app/src/telas/Obras.tsx` (prop `local?: boolean`: sem `atualizar`, sem "Atualizar lista" e "Sair"; botão "Nova obra" → `aoNovaObra`; texto do topo `Sem conta · tudo neste aparelho`)
- Modify: `app/src/telas/Menu.tsx` (`aoSair` vira opcional; sem "Sair" e sem "Pessoas da obra" quando `estado.local`)
- Modify: `app/src/app.tsx` (telas `obra-local`; `telaInicial` com `ehModoLocal`; `Entrar.aoUsarSemConta` → `entrarSemConta` → se não há obra, `obra-local`, senão `telaDoUsuario`)
- Test: tela, na Tarefa 7.

- [ ] **Passo 1:** implementar as quatro telas e o `app.tsx`.
- [ ] **Passo 2:** `npm run build` passa; abrir `npm run dev` com `VITE_SUPABASE_URL=http://127.0.0.1:9` no navegador interno: entrar sem conta, criar "obra piloto", ver o menu com os módulos e sem "Sair"; recarregar e cair direto no menu.
- [ ] **Passo 3:** commit `Casca: usar o app sem conta`.

### Tarefa 4: arquivo de salvamento (`nucleo/salvamento.ts`)

**Files:**
- Create: `app/src/nucleo/salvamento.ts`
- Test: `app/src/nucleo/salvamento.test.ts`

**Interfaces:**
- Consumes: `BancoLocal` (`fila`, `registros`, `conteudos`, meta `obras`, `obra_atual`), `ItemFila`, `Sincronizador` (nos testes, para gerar registros de verdade com `{} as SupabaseClient`).
- Produces:
  - `interface Salvamento { formato: 'sistema-obra-salvo'; versao: 1; gerado_em: string; dispositivo_id: string; usuario: UsuarioLocal; obra: ObraLocal; itens: Omit<ItemFila, 'seq'>[]; conteudos: { id: string; base64: string }[] }`
  - `gerarSalvamento(banco, usuario: UsuarioLocal, obra: ObraLocal): Promise<Salvamento>` — itens da fila (pendentes e com erro) dessa pessoa e obra, em ordem de `seq`; `conteudos` dos itens com `arquivo`.
  - `empacotar(s: Salvamento): Promise<Blob>` — JSON; gzip via `CompressionStream('gzip')` quando existir (tipo `application/gzip`), senão JSON puro (`application/json`).
  - `desempacotar(blob: Blob): Promise<Salvamento>` — detecta gzip pelos 2 primeiros bytes (`0x1f 0x8b`); lança `Error('Este arquivo não é um salvamento do Sistema Obra')` se `formato` não bate ou o JSON não lê.
  - `aplicarSalvamento(banco, s: Salvamento, usuarioAtual: UsuarioLocal): Promise<{ novos: number; repetidos: number }>` — para cada item: já existe `registros[[tabela, id]]` → repetido; senão grava registro `pendente: 1` e item da fila com `usuario_id = usuarioAtual.id` (na linha também), `estado 'pendente'`, `tentativas 0`, e o conteúdo se houver. Acrescenta `s.obra` em meta `obras` se o id não estiver lá e grava `obra_atual`. Tudo numa transação.
  - `nomeDoArquivo(obra: ObraLocal, agora: Date): string` → `salvo-EXE-2026-11-07_14-30.obra`.

- [ ] **Passo 1: testes** em `salvamento.test.ts` (dois bancos, `Sincronizador` com `tabelas: ['pavimentos','arquivos', 'teste_eventos']` e cliente vazio):
  - ida e volta: 2 `registrar('pavimentos', ...)` + 1 `registrarArquivo(..., new Blob([bytes]), 'foto.jpg')` no banco A → `gerarSalvamento` tem 3 itens e 1 conteúdo → `empacotar` → `desempacotar` → `aplicarSalvamento` no banco B com outro usuário → `{ novos: 3, repetidos: 0 }`, `contarFila(usuarioB).pendentes === 3`, `conteudos.get(id).bytes` igual, `registros` com `pendente: 1` e `linha.usuario_id === usuarioB.id`, `lerMeta('obras')` contém a obra e `obra_atual` é ela.
  - aplicar o mesmo de novo → `{ novos: 0, repetidos: 3 }`, fila continua com 3.
  - `desempacotar(new Blob(['{"x":1}']))` rejeita com "Este arquivo não é um salvamento do Sistema Obra"; `new Blob(['lixo'])` idem.
  - sem gzip: `globalThis.CompressionStream = undefined` temporariamente → `empacotar` dá `application/json` e `desempacotar` lê.
  - gzip: blob começa com `0x1f 0x8b`.
  - `nomeDoArquivo({ codigo: 'EXE' }, new Date(2026, 10, 7, 14, 30))` → `salvo-EXE-2026-11-07_14-30.obra`.
- [ ] **Passo 2:** rodar → falha.
- [ ] **Passo 3:** implementar `salvamento.ts`. Base64 por pedaços (`String.fromCharCode` em fatias de 8 KB) para foto grande não estourar a pilha.
- [ ] **Passo 4:** rodar → passa.
- [ ] **Passo 5:** commit `Salvamento: gerar e restaurar o arquivo .obra`.

### Tarefa 5: barra "sem conta" no menu, com Salvar e Restaurar

**Files:**
- Create: `app/src/nucleo/baixar.ts` — `baixarBlob(nome: string, blob: Blob): void` (mesma técnica de `projetos/ficha.ts:baixarTexto`, que passa a chamar esta).
- Create: `app/src/telas/BarraLocal.tsx` — `BarraLocal({ usuario, obra, pendentes, aoMudarDados }: { usuario: UsuarioLocal; obra: ObraLocal; pendentes: number; aoMudarDados: () => void })`.
- Modify: `app/src/telas/Menu.tsx` (quando `estado.local`, `<BarraLocal>` no lugar de `<BarraSincronizacao>` e de `<ItensComErro>`; `aoMudarDados` → `recontar()` + `versaoDados` avança: expor `marcarDadosNovos()` em `usarSincronizacao`).
- Modify: `app/src/nucleo/usarSincronizacao.ts` (`marcarDadosNovos(): void` incrementa `versaoDados`).
- Modify: `app/src/projetos/ficha.ts` (`baixarTexto` usa `baixarBlob`).

Conteúdo da barra (`section.barra`, classe `ok`): "Sem conta: tudo fica guardado neste aparelho." · `N registros guardados` (ou "Nenhum registro ainda") · "Último salvamento: hoje às 14:30" (meta `ultimo_salvamento:${obra.id}`, ou "ainda não salvo"). Botões: "Salvar arquivo" (gera, baixa com `nomeDoArquivo`, grava a meta) e "Restaurar de um arquivo" (`<input type="file" accept=".obra,.json">` escondido; depois de aplicar, `<p role="status">` "12 registros restaurados, 3 já estavam aqui." ou o erro de `desempacotar`).

- [ ] **Passo 1:** implementar.
- [ ] **Passo 2:** `npm run build`; no navegador interno (dev, `VITE_SUPABASE_URL=http://127.0.0.1:9`): salvar baixa um `.obra`; restaurar o mesmo arquivo mostra "0 registros restaurados, N já estavam aqui".
- [ ] **Passo 3:** commit `Menu: salvar e restaurar no modo sem conta`.

### Tarefa 6: pasta de salvamento automático (`nucleo/pasta_salvamento.ts`)

**Files:**
- Create: `app/src/nucleo/pasta_salvamento.ts`
- Test: `app/src/nucleo/pasta_salvamento.test.ts`
- Modify: `app/src/telas/BarraLocal.tsx` (bloco "Salvamento automático")

**Interfaces:**
- Produces:
  - `suportaPasta(): boolean` — `'showDirectoryPicker' in window`.
  - `type EstadoPasta = { estado: 'nenhuma' } | { estado: 'ok' | 'pedir'; nome: string }`; `estadoPasta(banco): Promise<EstadoPasta>` — handle em meta `pasta_salvamento`, `queryPermission({ mode: 'readwrite' })`.
  - `escolherPasta(banco): Promise<EstadoPasta>` — `showDirectoryPicker({ mode: 'readwrite' })`, grava o handle; cancelado → estado atual.
  - `reativarPasta(banco): Promise<EstadoPasta>` — `requestPermission`.
  - `esquecerPasta(banco): Promise<void>`.
  - `gravarNaPasta(banco, nome: string, blob: Blob): Promise<boolean>` — `getFileHandle(nome, { create: true })` → `createWritable` → escreve → fecha; false se sem pasta ou sem permissão.
  - `ligarSalvamentoAutomatico(banco, obter: () => { usuario: UsuarioLocal; obra: ObraLocal } | null, gravar: (nome: string, blob: Blob) => Promise<boolean> = (n, b) => gravarNaPasta(banco, n, b), esperaMs = 3000): () => void` — `banco.fila.hook('creating', ...)` → debounce de `esperaMs` → `gerarSalvamento` + `empacotar` → `gravar('salvo-<codigo>.obra', blob)` e `gravar('salvo-<codigo>-AAAA-MM-DD.obra', blob)`; grava meta `ultimo_salvamento:${obra.id}` quando `gravar` devolve true. Devolve a função que desliga o hook e cancela o timer.

- [ ] **Passo 1: teste** `pasta_salvamento.test.ts`: `ligarSalvamentoAutomatico(banco, () => ({ usuario, obra }), gravarFalso, 20)`; dois `registrar` seguidos → depois de 60 ms `gravarFalso` foi chamado 2 vezes (os dois nomes), uma rodada só, o blob desempacota com 2 itens, `lerMeta('ultimo_salvamento:...')` existe; `desligar()` e mais um `registrar` → nada novo em 60 ms.
- [ ] **Passo 2:** rodar → falha.
- [ ] **Passo 3:** implementar; na `BarraLocal`, quando `suportaPasta()`: "Salvamento automático: nenhuma pasta" + botão "Escolher pasta"; `ok` → "salvando em <nome>" + "Trocar" e "Parar"; `pedir` → "a pasta <nome> precisa de permissão de novo" + botão "Reativar". No `Menu`, `useEffect` liga `ligarSalvamentoAutomatico` enquanto `estado.local`.
- [ ] **Passo 4:** rodar → passa; `npm run build`.
- [ ] **Passo 5:** commit `Salvamento automático numa pasta do PC`.

### Tarefa 7: teste de tela do modo sem conta

**Files:**
- Create: `app/testes/local.e2e.test.ts` (gatilho `SO_E2E === '1' || SO_BANCADA === '1'`, como `fvs_bancada.e2e.test.ts`; `build` + `preview` como `telas.e2e.test.ts`, com `VITE_SUPABASE_URL = 'http://127.0.0.1:9'`).

Roteiro, em 375x812 e 1280x800 (contexto novo para cada, `acceptDownloads: true`):
1. Abre; clica "Usar neste aparelho, sem conta"; h1 "Nova obra"; código `EXE`, nome `Obra Exemplo`; "Criar obra".
2. Menu: texto "Sem conta: tudo fica guardado neste aparelho.", "obra piloto", "Nenhum registro ainda", nenhum botão "Sair" nem "Pessoas da obra"; os 5 módulos aparecem.
3. Recarrega → continua no menu.
4. "Salvar arquivo" → `page.waitForEvent('download')`, `suggestedFilename()` bate com `/^salvo-EXE-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.obra$/`; "Último salvamento: hoje às".
5. Contexto novo (banco vazio): entra sem conta, cria `EXE`; "Restaurar de um arquivo" com `setInputFiles` do arquivo baixado → texto "0 registros restaurados, 0 já estavam aqui." (a fila estava vazia; o que importa é o caminho inteiro funcionar sem erro).
6. `SO_PRINTS` salva `local-1-entrar`, `local-2-obra`, `local-3-menu` por tamanho.

- [ ] **Passo 1:** escrever o teste; rodar no PC com `SO_BANCADA=1 SO_PLAYWRIGHT=<pasta do scratchpad>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/local.e2e.test.ts` → passa nos dois tamanhos; olhar os prints.
- [ ] **Passo 2:** commit `Teste de tela do modo sem conta`.

### Tarefa 8: documentação

**Files:**
- Modify: `docs/03_APP_LOCAL.md` (parte 2 feita, data, o que ficou de fora: reatribuir `usuario_id` da fila ao entrar com e-mail, quando o servidor entrar)
- Modify: `docs/modulos/0_nucleo.md` (Feito, Status, Próximo passo)
- Modify: `app/README.md` (seção "Usar sem conta" com o `.obra` e a pasta automática)

- [ ] **Passo 1:** escrever; commit `Docs: modo sem conta e salvamento`.
- [ ] **Passo 2:** `git push -u origin app/local` e PR só com o ok do Nicolas.
