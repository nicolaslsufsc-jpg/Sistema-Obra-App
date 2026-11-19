# app/

PWA do Sistema Obra (Vite + TypeScript + Preact + Dexie + supabase-js).

```bash
cd app
npm install
npm run dev      # servidor local para desenvolvimento
npm run build    # confere os tipos e gera dist/ (com service worker)
npm test         # testes de unidade (os de integração são pulados sem o servidor)
```

Testes completos (banco + PostgREST de verdade + telas no Chromium), da raiz do repositório:

```bash
E2E=1 bash supabase/testes/rodar_integracao.sh
```

## Estrutura

- `src/nucleo/`: o que todos os módulos usam.
  - `servicos.ts`: instâncias únicas (`banco`, `cliente`, `conta`, `sincronizador`).
  - `sincronizacao.ts`: `registrar`, `registrarArquivo`, `enviar`, `baixar`, `linhas`. Regras em `docs/02_CONTRATO_NUCLEO.md`.
  - `banco_local.ts`: banco do aparelho (IndexedDB via Dexie).
  - `conta.ts`: login por código, usuário guardado no aparelho, lista de obras.
  - `tabelas.ts`: tabelas baixadas por obra. Módulo novo acrescenta as suas aqui.
  - `usarSincronizacao.ts`: sincronização automática enquanto o app está aberto.
- `src/telas/`: entrar, código, obras, menu, pessoas da obra (só admin).
- `testes/`: integração e telas (ver acima).

Configuração pública do Supabase em `src/config.ts`. Chave secreta nunca entra aqui.
`.npmrc` liga `legacy-peer-deps` por causa de um bug do npm 10 com o vitest.

## Usar sem conta (modo local)

O app abre direto na obra, sem login, quando acha o pacote da obra de um destes dois jeitos:
- **No tablet ou celular:** "Abrir pacote da obra (.zip)", na tela de entrada ou no menu. O .zip sai de `pipeline/fvs/compactar_pacote.py PASTA --saida ARQ.zip --nome "<nome da obra>"` (ou do `exportar_bancada.py`, com o mesmo `--nome`).
- **No PC:** a pasta `dados_obra/` ao lado do app compilado (a entrega do PC, `ABRIR_SISTEMA_OBRA.bat`).

O app cadastra a obra no aparelho, guarda as plantas (conferidas pelo SHA-256 do índice) e funciona sem servidor e sem internet. Um .zip de outra obra, ou mais antigo que o do aparelho, pede confirmação antes. O que a pessoa registra fica na fila de pendentes. No menu da obra:
- "Salvar arquivo" gera o `.obra`;
- "Restaurar de um arquivo" repõe;
- "Escolher pasta" salva sozinho a cada registro.

Sem pacote, o app pede o login por e-mail. Detalhes em `docs/03_APP_LOCAL.md`.

**Bancada** (só no modo de desenvolvimento): `npm run dev` e `http://localhost:5173/?dados=http://127.0.0.1:8766/`, com a pasta servida por um servidor local com CORS. O app compilado ignora o `?dados=`: um link com ele não troca a obra de ninguém.

**Dado de obra nunca vai no site.** Em `app/dist` só pode ir o que é do app. A lista está em `sem_dados_de_obra.ts`: `index.html`, `sw.js`, `workbox-*.js`, o manifesto, o `_headers`, os ícones e o código em `assets/` (`.js`, `.css`, `.wasm`). Qualquer outro arquivo ou pasta (`dados_obra/`, uma foto, uma prancha, um `.obra`) faz o build parar, aqui, no GitHub e no Cloudflare. Então nada de colocar a obra em `app/public/`. Arquivo novo do próprio app (um ícone, uma fonte) entra na lista, com o Nicolas sabendo.

## Publicar no Cloudflare Pages

O site publicado é só o programa: não leva dado de nenhuma obra nem de empresa. As plantas, as fichas, os registros e o nome por extenso da obra chegam ao tablet pelo .zip. O nome entra no pacote com `--nome` no `compactar_pacote.py` ou no `exportar_bancada.py`; sem ele, o app mostra "Obra". A sigla da obra também vem do pacote. O build confere isso: para se algum nome de `nomes_proibidos.txt` (lista fora do git, na raiz do repositório) aparecer no código compilado (`sem_dados_de_obra.ts`). Conta gratuita. Os nomes de menu do painel podem ter mudado; se não achar, mande um print.

**Já está pronto no código (nada a fazer):**
- o app compila com `npm run build` e sai em `app/dist`;
- os cabeçalhos de segurança do site (`public/_headers`) e a lista de permissões do navegador (`vite.config.ts`);
- o build para se aparecer no site qualquer arquivo que não seja do app (`sem_dados_de_obra.ts`);
- o `?dados=` não funciona no site publicado;
- o manifesto vai com o login, então o "Instalar app" funciona atrás do Access;
- o .zip da obra sai do `pipeline/fvs/compactar_pacote.py PASTA --saida ARQ.zip --nome "<nome da obra>"`;
- o build para se o nome da obra ou da construtora aparecer no código do site.

**É do Nicolas (com a conta dele; o Claude não cria conta nem entra em painel):**
1. criar a conta da Cloudflare (passo 1 abaixo);
2. ligar o repositório do GitHub ao Pages e salvar a configuração (passos 2 a 4);
3. ligar o Access e pôr nele os e-mails de quem pode abrir (seção "Cloudflare Access");
4. levar o .zip da obra a cada tablet.

1. Crie a conta em dash.cloudflare.com.
2. Workers & Pages > Create > aba Pages > Connect to Git. Na tela do GitHub que pede a autorização, marque **Only select repositories** e escolha só o `Sistema-Obra`. Assim a Cloudflare não lê outros repositórios. Depois, escolha o `Sistema-Obra` na lista.
3. Configuração da compilação:
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: `cd app && npm ci && npm run build`
   - Build output directory: `app/dist`
   - Environment variables (as duas são obrigatórias):
     - `NODE_VERSION` = `22`
     - `NOMES_PROIBIDOS` = os nomes reais das obras e das empresas, separados por `;` (por exemplo `Nome da Obra;Nome da Construtora`). Marque **Encrypt**, para o valor não aparecer no painel. É a mesma lista do `nomes_proibidos.txt` do seu PC. Sem ela, a compilação para de propósito com "a lista de nomes proibidos está vazia": o Cloudflare compila com `CI=true`, e aí o build exige a lista para garantir que nenhum nome real vá para o site.
4. Save and Deploy. O endereço fica `https://<nome-do-projeto>.pages.dev`. Se a compilação falhar, abra o registro (View build log) e procure a última linha em vermelho; o caso mais comum é faltar o `NOMES_PROIBIDOS` do passo 3.
5. Antes de passar o endereço para alguém, ligue o Cloudflare Access (abaixo).

Depois disso, cada merge na `main` publica sozinho, e cada PR ganha um endereço de prévia para testar antes de aprovar.

**No tablet, a primeira vez (com internet):**
1. Abra o endereço no Chrome e entre pelo Access (código no e-mail).
2. Menu do Chrome > "Instalar app" (ou "Adicionar à tela inicial").
3. Copie o .zip da obra para o tablet (Downloads, por exemplo). Abra o app e toque em "Abrir pacote da obra (.zip)".
4. Espere "Guardando as plantas". Num pacote de 90 MB, leva uns 5 s num celular simulado e mais num tablet de verdade.

Daí em diante o app abre sem internet. Plantas ou fichas novas: um .zip novo, pelo mesmo botão do menu.

### Cloudflare Access (recomendado)

**Por quê:** sem ele, qualquer pessoa com o endereço abre o app. Não vê nada da obra, porque o site não tem dados, mas vê o programa e pode instalar. O Access pede o e-mail e manda um código antes de abrir o site. Só passa quem estiver na lista.

**Passo a passo:**
1. No painel: Zero Trust. Na primeira vez, escolha um nome para a equipe e o plano **Free**. O painel pode pedir um cartão mesmo no plano grátis.
2. Settings > Authentication > Login methods: deixe **One-time PIN** (código no e-mail). Não precisa de Google nem de senha.
3. Access > Applications > Add an application > **Self-hosted**.
   - Application domain: `<nome-do-projeto>.pages.dev`. Repita com `*.<nome-do-projeto>.pages.dev` para proteger também as prévias dos PRs.
   - Session duration: **1 month**. O tablet fica sem internet na obra. O app abre do próprio aparelho mesmo com a sessão vencida, mas a versão nova do app só chega depois de entrar de novo.
4. Policy: Action **Allow**, Include **Emails**, com os e-mails de quem usa (Nicolas e chefes de obra). Se a empresa tiver domínio próprio de e-mail, pode ser "Emails ending in @<domínio>".
5. Teste numa janela anônima: tem que aparecer a tela do Access. Com um e-mail fora da lista, o código não chega.

O app já está pronto para o Access: o manifesto é pedido com o login (`useCredentials` no `vite.config.ts`). Sem isso, o Chrome não ofereceria "Instalar app" atrás do Access.

### Custo

Hoje, zero para um pacote de 90 MB. São os limites do plano grátis que eu conheço; confira no painel antes de decidir, porque a Cloudflare muda os planos.
- **Pages Free:** sites, acessos e tráfego sem limite para site estático, 500 compilações por mês e arquivos de até 25 MB. O app tem uns 7 MB. As plantas não passam pelo site: vão no .zip.
- **Zero Trust (Access) Free:** até 50 usuários. Passando disso, é pago por usuário por mês.
- **Domínio próprio** (por exemplo `obra.exemplo.com.br`): opcional, custa o registro do domínio. O `.pages.dev` é grátis.
