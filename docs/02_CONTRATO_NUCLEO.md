# Contrato de dados do núcleo (dono: sessão Núcleo)

Versão 1.4, 04/11/2026. v1: validado a partir do rascunho v0 e transformado em migração. v1.1: biblioteca de sincronização do app. v1.2: exportação de obra. v1.3: pessoas da obra, caminho seguro, correções da revisão da exportação. v1.4: casca do app com registro de módulos (`app/src/modulos.ts`). v1.5 (18/11/2026): volta ao último módulo ao reabrir e betas fora do menu.

- Migração: `supabase/migrations/20261103120000_nucleo.sql`
- Testes: `supabase/testes/rodar_testes.sh` (Postgres local com imitação do Supabase)
- Como aplicar: `supabase/README.md`

Outras sessões só leem este arquivo. Precisa mudar algo aqui? Anote em "Pedidos ao núcleo" no arquivo do seu módulo.

## Papéis

| Papel | Onde | Lê a obra | Registra em campo | Cadastro e escritório | Cria obra, dá acesso |
|---|---|---|---|---|---|
| admin | `perfis.papel` | todas | sim | sim | sim |
| gestor | `acessos.papel` | sim | sim | sim | não |
| campo | `acessos.papel` | sim | sim | não | não |
| leitura | `acessos.papel` | sim | não | não | não |

Usuário sem linha em `acessos` (e que não é admin) não vê nada. `perfis.papel` só muda pelo editor SQL.

## Tabelas do núcleo

- `perfis` (id = usuário do Supabase, nome, papel admin/usuario). Criado sozinho quando o usuário é criado no Supabase. Cada um vê o próprio perfil e o de quem divide obra com ele.
- `obras` (id, codigo ex. obra piloto, nome, empresa, criado_por). `codigo` só com maiúsculas, números, `_` e `-`.
- `acessos` (usuario_id, obra_id, papel gestor/campo/leitura). Revogar = apagar a linha. Não é baixada por cursor: o app relê a lista a cada login com internet.
- `pavimentos` (obra_id, nome, ordem). `ordem` cresce de baixo para cima. Nome único por obra.
- `setores` (obra_id, pavimento_id opcional, nome_projeto ex. "Trecho 2", nome_construpoint ex. "B/C", disciplina ex. "estrutura").
  - Liga o trecho da prancha ao setor do Construpoint. De-para da obra piloto ainda não definido: `nome_construpoint` fica vazio até lá.
- `elementos` (obra_id, pavimento_id, tipo P/V/L/A/F/E: pilar, viga, laje, ambiente, furo de viga, esquadria; nome, secao). Único por (pavimento_id, tipo, nome) entre os não apagados.
  - Pilar que aparece em dois trechos é um elemento só.
  - `nome` sem espaço: "V46", não "V 46". O leitor de prancha normaliza antes de gravar.
- `arquivos` (obra_id, caminho, nome_original, hash SHA-256 hex, tamanho em bytes, tipo MIME). Quem criou e quando: `usuario_id` e `criado_em_servidor`.

`pavimentos`, `setores`, `elementos` e `arquivos` são tabelas sincronizadas (seção abaixo).

## Colunas obrigatórias em toda tabela sincronizada

```sql
  id                    uuid primary key default gen_random_uuid(),  -- o aparelho manda o próprio
  obra_id               uuid not null references public.obras (id),
  -- ... colunas do módulo ...
  usuario_id            uuid not null default auth.uid() references public.perfis (id),
  dispositivo_id        uuid not null,
  criado_em_dispositivo timestamptz not null,
  criado_em_servidor    timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  apagado               boolean not null default false,
  unique (id, obra_id)
```

A chave primária tem que ser só `id`. `unique (id, obra_id)` permite que outras tabelas apontem para esta com chave estrangeira composta, garantindo que a referência é da mesma obra:

```sql
  elemento_id uuid not null,
  foreign key (elemento_id, obra_id) references public.elementos (id, obra_id)
```

## Como um módulo cria uma tabela sincronizada

1. `create table` com as colunas obrigatórias acima.
2. Chamar `nucleo.preparar_tabela`:

```sql
-- evento de campo (offline, só inclusão): campo inclui, ninguém altera
select nucleo.preparar_tabela('public.fvs_eventos', 'campo', 'nenhuma');
-- cadastro de escritório: gestor inclui e altera
select nucleo.preparar_tabela('public.revisoes', 'gestor', 'gestor');
```

A função confere as colunas (recusa a tabela se faltar alguma), liga os gatilhos, ativa RLS, cria as regras de ler/incluir/alterar, tira o DELETE da API, cria o índice da baixa por cursor e registra a tabela em `nucleo.tabelas_sincronizadas` (usada pelo export da obra).

Os módulos não escrevem regra RLS própria para essas tabelas. Precisa de regra diferente? Pedido ao núcleo.

## Regras de sincronização

- **id:** uuid gerado no aparelho (`crypto.randomUUID()`), antes de qualquer envio.
- **Horas:** `criado_em_dispositivo` é a hora do aparelho no momento do toque. `criado_em_servidor` e `atualizado_em` são carimbadas pelo servidor (gatilho); o que o aparelho mandar nesses campos é ignorado. Desde 18/11/2026 (C3), `criado_em_dispositivo` no futuro vira a hora de chegada no servidor: relógio adiantado não ganha de quem marcou depois; hora do passado (marcação sem internet) fica como veio.
- **Origem imutável:** numa alteração, `usuario_id`, `dispositivo_id`, `criado_em_dispositivo` e `criado_em_servidor` voltam ao valor original. Mudar `id` ou `obra_id` dá erro.
- **Só inclusão:** em tabela de evento (`'nenhuma'`), UPDATE dá erro, até pelo editor SQL. Corrigir = registrar evento novo. Status é derivado do último evento.
- **Apagar:** `apagado = true`. DELETE pela API não existe (o registro tem que continuar existindo para os outros aparelhos saberem que foi apagado).
- **Envio:** `insert ... on conflict (id) do nothing` (no supabase-js: `upsert` com `ignoreDuplicates: true`). Reenviar o mesmo item não duplica. `usuario_id` tem que ser o usuário logado: a fila só envia itens do usuário logado no aparelho.
- **Baixa:** por obra e por tabela, `atualizado_em >= cursor - 5 minutos`, ordenado por `(atualizado_em, id)`, em páginas. O aparelho grava por `id` (repetir registro não faz mal). O novo cursor é o maior `atualizado_em` recebido.
  - Por que a margem de 5 minutos: `atualizado_em` é a hora de início da transação. Uma transação que começa antes e termina depois de outra pode gravar um `atualizado_em` menor que o cursor já baixado. Com a margem, esse registro é pego na baixa seguinte.
- **Escrita fora do app** (editor SQL ou estação no PC com chave secreta): informar `usuario_id` e `dispositivo_id`. Editor SQL usa `dispositivo_id = 00000000-0000-0000-0000-000000000000`.
- **Usuário com registros não pode ser apagado** do Supabase (chave estrangeira). Para tirar alguém, apague os acessos.

## Biblioteca de sincronização no app (`app/src/nucleo/`)

Os módulos não falam direto com o Supabase para dados de campo: usam o núcleo.

```ts
import { sincronizador, conta } from '../nucleo/servicos'

// registro de campo (funciona offline): grava no aparelho e entra na fila de envio
const linha = await sincronizador.registrar('fvs_eventos', obraId, usuario.id, { elemento_id, item: 3, resultado: 'NC' })

// foto: guarda no aparelho, envia o arquivo e a linha em "arquivos" quando houver internet
const foto = await sincronizador.registrarArquivo(obraId, usuario.id, 'fvs', blob, 'foto.jpg')

// leitura local (o que já foi baixado + o que foi registrado aqui)
const eventos = await sincronizador.linhas('fvs_eventos', obraId)
```

- Tabela nova que precisa estar offline: acrescente em `app/src/nucleo/tabelas.ts` (ordem: pais antes dos filhos) e a lista do módulo em `BLOCOS_SINCRONIZADOS` no mesmo arquivo (o núcleo baixa primeiro, os módulos ao mesmo tempo; por isso tabela de módulo só aponta para o núcleo e para o próprio módulo) e chame `nucleo.preparar_tabela()` nela na migração do módulo.
- `registrar()` preenche sozinho `id` (se não vier), `obra_id`, `usuario_id`, `dispositivo_id`, `criado_em_dispositivo` e `apagado`. Passar qualquer coluna do núcleo dá erro.
- No aparelho, todas as tabelas ficam numa tabela local genérica (`registros`, chave tabela + id). Módulo novo não mexe no esquema do banco local.
- `registrar()` é só para inclusão com id novo. Não use para editar um registro existente: o servidor ignora id repetido.
- A sincronização roda sozinha enquanto o app está aberto numa obra (`usarSincronizacao`): ao abrir, quando a internet volta, quando o app volta para a frente, a cada 5 min, e a cada 1 min se houver coisa na fila. As telas nunca esperam a rede.
- Fila: uma por usuário, enviada em ordem. Erro de rede ou login vencido: para e tenta depois. Erro permanente (sem permissão, valor inválido): o item fica marcado com o motivo, a fila segue e a tela mostra a lista. Nada é apagado da fila sem chegar ao servidor.
- Login: sem internet, o token vence em 1 h, mas o app segue funcionando com o usuário guardado. Depois de uma falha de renovação, o supabase-js espera 60 s para tentar de novo: quando a internet volta, o envio pode levar até 1 min para começar.
- Sem internet, cada leitura do servidor ainda tenta 3 vezes (1 s, 2 s, 4 s) antes de desistir (comportamento do supabase-js). Por isso nada na tela espera resposta do servidor.
- Antes de cada envio a biblioteca confere se há login válido **da mesma pessoa** (`sessaoValida`). Sem isso, para e tenta depois: nunca manda como visitante (o servidor recusaria e o item ficaria marcado como recusado à toa) nem com a sessão de outra pessoa aberta em outra aba.
- Arquivo (foto): os bytes ficam numa tabela local à parte (`conteudos`) até o envio; contar ou listar a fila não carrega fotos na memória. Depois de enviado, o conteúdo sai do aparelho e fica só no servidor.
- Sair, trocar de pessoa ou perder acesso a uma obra no meio de uma baixa cancela a baixa: nada é gravado depois da limpeza (contador `geracao` no banco local).
- Sincronizações de obras ou pessoas diferentes rodam uma depois da outra; pedido igual ao que está rodando reaproveita o resultado.
- Sair sem internet não avisa o servidor (só apaga a sessão do aparelho). Avisar deixaria um pedido pendurado que, quando a internet voltasse, podia derrubar o login seguinte.
- Código de login pedido fica guardado por 1 h: se o Android fechar o app enquanto a pessoa lê o e-mail, a tela do código volta sozinha.

## Casca do app: como um módulo aparece no menu (`app/src/modulos.ts`)

`app.tsx` e `telas/Menu.tsx` são do núcleo: os módulos não mexem neles. Cada módulo tem uma linha em `MODULOS` (`app/src/modulos.ts`) e mexe só nela.

```ts
import { ModuloFvs } from './fvs/telas/ModuloFvs'
{ id: 'fvs', nome: 'FVS', descricao: 'Pilares e vigas', Tela: ModuloFvs },
```

- Sem `Tela`, o botão aparece desativado como "em construção". Com `Tela`, fica ativo.
- Com `foraDoMenu: true`, o módulo não aparece no menu nem abre, e o código continua (desde 18/11/2026: Projetos, Relatórios e IFC; o menu mostra FVS, Concreto e Documentos). Só o build dos testes de tela liga `VITE_TESTE_MODULOS_FORA_DO_MENU=1`, que deixa abrir também os de fora do menu; na produção ele não existe.
- A tela recebe `{ usuario, obra, aoSair, aoPerderObra }` (`PropsModulo`). Passe `aoPerderObra` para `usarSincronizacao`; chame `aoSair()` para voltar ao menu.
- Ao abrir o módulo, a casca empilha `{ tela: id }` no histórico (ex.: `{ tela: 'concreto' }`). As telas internas do módulo empilham estados com o mesmo `tela: id` e o que mais precisarem (o Concreto usa `{ tela: 'concreto', concreto: <tela interna> }`).
- O "voltar" do Android: enquanto o estado do histórico tiver `tela: id`, quem cuida é o módulo; quando volta para um estado sem isso, a casca mostra o menu.
- Volta ao último módulo (desde 18/11/2026, `app/src/telas/ultimo_modulo.ts`): a casca guarda no aparelho só a obra e o id do módulo aberto. Ao reabrir o app, se a tela já ia ao menu, a obra guardada é a atual e o módulo está em `MODULOS`, a casca empilha o menu e o módulo em cima (o voltar do Android cai no menu) com `retomar: true` no estado do histórico. Login, código e preparar/confirmar pacote nunca são pulados. A lembrança é apagada ao voltar ao menu, Sair, Trocar de obra, `aoPerderObra` e troca de pacote. O ponto dentro do módulo (planta, peça) é do próprio módulo, que só o lê com `retomar: true` (a FVS usa `app/src/fvs/onde_estava.ts`); abrir pelo menu começa no início.

## Armazenamento de arquivos

- Bucket privado `obras`.
- Caminho: `{obra_id}/{modulo}/...` (o resto é do módulo). O caminho em `arquivos.caminho` tem que começar pelo `obra_id` da linha.
- Formato (conferido pelo banco e pelo armazenamento, migração `20261103220000`): cada trecho depois do `obra_id` só com letras sem acento, números, ponto, hífen e sublinhado, começando com letra ou número. Sem espaço, `..`, `\` ou `:`. O nome que a pessoa deu ao arquivo fica em `nome_original`. Motivo: o caminho vira pasta e nome de arquivo no PC de quem exporta a obra.
- Ler: quem tem acesso à obra. Enviar: admin, gestor, campo.
- Arquivo é imutável: versão nova = caminho novo. Não há regra de alterar nem apagar pela API; limpeza pelo painel do Supabase.

## Exportação de uma obra (`pipeline/exportar_obra.py`)

- Roda no PC com o login do app (código por e-mail). Sem chave secreta: exporta o que o login vê. Admin ou gestor veem tudo da obra.
- Exporta `obras` (a linha da obra), todas as tabelas sincronizadas (as do núcleo e as que os módulos registrarem com `nucleo.preparar_tabela`), `acessos` da obra, `perfis` das pessoas citadas e todos os arquivos.
- A lista e a ordem das tabelas vêm de `public.tabelas_para_exportar()` (migração `20261103200000_nucleo_exportacao.sql`): quem é referenciado vem antes. Módulo novo entra sozinho na exportação, sem mexer no script.
- Cada arquivo é conferido pelo SHA-256 e pelo tamanho de `arquivos`. Arquivo no armazenamento sem linha em `arquivos` também é baixado e aparece no manifesto como "sem registro".
- As tabelas são lidas dos filhos para os pais: se a obra mudar durante a exportação, nunca entra um filho sem o pai, e o `restaurar.sql` continua válido.
- `restaurar.sql` recria a obra num Postgres com as migrações do núcleo e dos módulos, mantendo as horas originais (gatilhos desligados durante a carga). Falha inteiro se a obra já existir no destino. Contas que já existiam no destino não mudam de papel nem ganham acessos. Impõe UTF-8 (`set client_encoding`), por causa do psql no Windows.
- CSV para o Excel em português: `;`, vírgula decimal, horas no horário do PC, `sim`/`não`, apóstrofo antes de texto que começa com `=`, `+`, `-` ou `@`. Os valores originais ficam no JSON.
- Login renovado sozinho (refresh token) em exportações longas; queda de conexão é tentada de novo 3 vezes; a pasta se chama `.incompleta` até terminar.
- A saída nunca fica dentro de um repositório git, e nenhum caminho de arquivo sai da pasta de saída (defesa no script, além do formato imposto pelo banco).

## Pessoas da obra (tela do admin)

- O admin dá, muda e tira acesso pelo app (menu da obra > "Pessoas da obra"). Precisa de internet. Cada ação pede confirmação.
- A pessoa entra uma vez no app com o e-mail dela (a conta nasce sem acesso) e aparece em "Entraram no app e não têm acesso a esta obra" (só quem completou o login; quem só pediu o código não aparece). Quem já está em outra obra vem marcado.
- Os administradores aparecem na lista com acesso como "Administrador (vê todas as obras)", sem controles: admin só muda pelo editor SQL, e `dar_acesso` recusa e-mail de admin.
- E-mails ficam em `auth.users`, que a API não mostra: as funções `public.pessoas_da_obra(obra)`, `public.contas_sem_acesso(obra)` e `public.dar_acesso` (migração `20261103210000_nucleo_pessoas.sql`) só respondem ao admin. Mudar papel e tirar acesso usam a tabela `acessos` direto (as regras já deixam só o admin); a biblioteca confere que uma linha mudou, porque a RLS filtra sem erro.
- Tirar o acesso ou baixar para leitura: o que a pessoa registrou sem internet e ainda não sincronizou fica preso no celular dela. O app avisa isso na confirmação.

## Módulo novo: passo a passo

1. Migração do módulo a partir de `supabase/modelos/tabela_de_modulo.sql` (tem uma tabela de cadastro e uma de evento de campo, com as colunas obrigatórias e as chaves compostas).
2. Tabelas que precisam estar offline: acrescentar em `app/src/nucleo/tabelas.ts`, pais antes dos filhos.
3. Gravar em campo com `sincronizador.registrar()` / `registrarArquivo()`; ler com `sincronizador.linhas()`.
4. Teste SQL em `supabase/testes/testes_<modulo>.sql` (exemplo: `testes_x_modelo_modulo.sql`). Os testes rodam sozinhos no GitHub em cada PR. No PC do Nicolas (Windows, sem psql): `python supabase/testes/rodar_testes_windows.py`.
5. A exportação de obra pega as tabelas novas sozinha (ordem pelas chaves estrangeiras).
6. Tela do módulo: preencher `Tela` na linha do módulo em `app/src/modulos.ts` (seção "Casca do app").

## Tabelas por módulo (cada sessão detalha a sua)
- FVS: `plantas`, `geometrias`, `detalhes`, `elemento_detalhe`, `fichas_modelo`, `fvs_eventos`, `fvs_fotos`
- Projetos: `documentos`, `revisoes`, `distribuicoes`
- Concreto: `concretagens`, `caminhoes`, `caminhao_elementos`
- Documentos: `doc_documentos` (desde 20/11/2026, migração `20261120150000_documentos.sql`; `docs_obra` era só o nome proposto)

## Ligações entre módulos
- `plantas.revisao_id` aponta para `revisoes` (Projetos): planta nova nasce de revisão nova.
- `fvs_eventos.planta_id` guarda contra qual revisão foi conferido.
- `caminhao_elementos.elemento_id` liga concreto à mesma planta da FVS.

## Mudanças em relação ao rascunho v0
- `arquivos.criado_por` e `arquivos.criado_em` viraram as colunas padrão `usuario_id` e `criado_em_servidor`.
- Papéis definidos: `perfis.papel` (admin/usuario) e `acessos.papel` (gestor/campo/leitura).
- `obras` não é tabela sincronizada completa (não tem `obra_id` nem `dispositivo_id`), mas tem `atualizado_em` e `apagado` para a baixa.
- `acessos` não é baixada por cursor.
- Acrescentados: `unique (id, obra_id)` com chaves compostas, nome de elemento sem espaço, formato do código da obra, bucket `obras`.
