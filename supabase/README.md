# supabase/

Migrações SQL do banco (projeto `zktsuwxgvvyufuihkndj`, São Paulo). Contrato: `docs/02_CONTRATO_NUCLEO.md`.

Trocar de projeto (foi o que fizemos em 04/11/2026, dos EUA para São Paulo): o Supabase não muda a região de um projeto; cria-se um novo e refaz-se tudo abaixo na ordem, mais o "Login por código". Nada de dado precisou ser copiado porque só existia a obra TESTE, que sai do seed.

- `migrations/`: aplicar em ordem de nome, uma vez cada.
- `seed/`: cadastros iniciais (obras e pavimentos). Podem rodar de novo sem duplicar.
- `testes/`: testes locais. Não vão para o Supabase.

## Aplicar o núcleo (uma vez)

Os nomes de menu do painel do Supabase podem ter mudado; se não achar, me mande um print.

1. **Migração.** Painel do Supabase > SQL Editor > nova consulta. Cole o conteúdo inteiro de `migrations/20261103120000_nucleo.sql` e rode. Esperado: sucesso sem linhas. Se der erro, nada fica aplicado (roda numa transação): copie a mensagem e me mande.
2. **Seu usuário.** Se você ainda não tem usuário: Authentication > Users > Add user, com seu e-mail. Se já tinha antes da migração, o perfil foi criado sozinho.
3. **Virar admin.** No SQL Editor, trocando pelo seu e-mail:
   ```sql
   update public.perfis set papel = 'admin'
   where id = (select id from auth.users where email = 'SEU_EMAIL');
   ```
   Confira: `select nome, papel from public.perfis;` tem que mostrar você como `admin`.
4. **Obra de teste.** Cole e rode `seed/01_obra_teste.sql`.
5. **Obra de exemplo.** `seed/02_obra_exemplo.sql` cadastra uma obra fictícia com 5 pavimentos. O cadastro de uma obra de verdade fica fora do repositório (é dado da empresa) e roda do mesmo jeito, pelo editor SQL.

6. **Exportação (entrega 5).** Cole e rode `migrations/20261103200000_nucleo_exportacao.sql` (cria a função que diz quais tabelas exportar e em que ordem). Uma vez.

7. **Pessoas da obra.** Cole e rode `migrations/20261103210000_nucleo_pessoas.sql` (deixa o admin dar e tirar acesso pelo app). Uma vez.

8. **Caminho de arquivo seguro.** Cole e rode `migrations/20261103220000_nucleo_caminho_arquivo.sql` (o banco recusa caminho de arquivo que possa virar pasta fora da exportação). Uma vez.

Conferência rápida depois de tudo:
```sql
select tabela, inclusao, alteracao from nucleo.tabelas_sincronizadas;  -- 4 linhas
select * from public.tabelas_para_exportar();                         -- 4 linhas, pavimentos antes de elementos
select o.codigo, count(p.*) from public.obras o left join public.pavimentos p on p.obra_id = o.id group by 1;
```

## Login por código (uma vez)

O app entra com código mandado por e-mail. O Supabase só manda o código se o modelo do e-mail tiver `{{ .Token }}`, e só deixa editar o modelo com SMTP próprio (sem isso o e-mail chega só com um link, que não serve para o app). **Feito em 03/11/2026 com o Gmail do Nicolas e refeito em 04/11/2026 no projeto de São Paulo.** Para refazer (outro projeto, ou trocar o e-mail):

1. **Senha de app do Google.** Com a verificação em duas etapas ligada na Conta Google, crie em myaccount.google.com/apppasswords uma senha de app chamada "Supabase". Ela não vai para o repositório nem para o chat.
2. **SMTP.** Authentication > Emails > SMTP Settings > Enable custom SMTP:
   - Sender email e Username: o Gmail. Sender name: `Sistema Obra`.
   - Host: `smtp.gmail.com`. Port: `465`. Password: a senha de app.
   - Save changes. O limite sobe para 30 e-mails por hora (ajustável em Authentication > Rate Limits). O Gmail manda até uns 500 por dia.
3. **Modelos.** Authentication > Emails > Templates. Em **Magic link or OTP** e **Confirm sign up**, assunto `Código de acesso ao Sistema Obra` e corpo:
   ```html
   <h2>Código de acesso ao Sistema Obra</h2>
   <p>Seu código: <strong>{{ .Token }}</strong></p>
   <p>Digite este código no app. Não compartilhe.</p>
   ```
   **Confirm sign up** é o que vai para quem entra pela primeira vez (cadastro livre).

### Trocar a senha de app (o código parou de chegar)

Sinal: no app, "Não conseguimos mandar o e-mail agora" (ou "Error sending magic link email" / "Error sending confirmation email"); em Logs > Auth do Supabase, erro de SMTP do Gmail (`535`, "Username and Password not accepted"). Acontece quando a senha de app foi revogada ou a senha da Conta Google mudou (o Google apaga as senhas de app ao trocar a senha da conta). Aconteceu de 18/11 a 19/11/2026.

1. Em myaccount.google.com/apppasswords (com a Conta Google do e-mail que manda os códigos), apague a senha de app "Supabase" antiga e crie outra com o mesmo nome. O Google mostra 16 letras uma vez só: copie sem os espaços.
2. No Supabase: Authentication > Emails > SMTP Settings > Password: cole a senha nova (os outros campos ficam iguais: `smtp.gmail.com`, porta `465`, o mesmo Gmail em Sender email e Username) > Save changes.
3. Teste: no app, saia e peça o código de novo com o seu e-mail. Se não chegar em 2 minutos, olhe a pasta de spam e o Logs > Auth.
4. A senha de app não vai para o repositório, para o chat nem para o `.env`: fica só no Supabase. Quem for fazer isso é o Nicolas (conta Google dele).
5. Se aparecer limite ("rate limit"), espere uma hora ou suba o limite em Authentication > Rate Limits.

Neste projeto o código tem 8 dígitos (decisão do Nicolas, 03/11/2026; ajuste em Authentication > Sign In / Providers > Email > "Email OTP length"). O app e o `exportar_obra.py` aceitam de 6 a 10.

## Liberar acesso a uma pessoa

Pelo app (depois do passo 7): a pessoa entra uma vez no app com o e-mail dela; você abre a obra > "Pessoas da obra" e toca em "Dar acesso". Ali também muda o papel e tira o acesso.

Pelo editor SQL (se precisar):

```sql
insert into public.acessos (usuario_id, obra_id, papel)
select u.id, o.id, 'campo'            -- ou 'gestor' / 'leitura'
from auth.users u, public.obras o
where u.email = 'EMAIL_DA_PESSOA' and o.codigo = 'TESTE';
```

Tirar o acesso: `delete from public.acessos where usuario_id = (select id from auth.users where email = 'EMAIL') and obra_id = (select id from public.obras where codigo = 'TESTE');`

## Testar localmente

```bash
bash supabase/testes/rodar_testes.sh
```

Sobe um Postgres descartável, aplica `testes/stub_supabase.sql` (imitação mínima de `auth` e `storage`), as migrações e os testes. Termina com `TODOS OS TESTES PASSARAM` ou para no primeiro `FALHOU [...]`. Precisa de Postgres 15+ instalado (initdb, pg_ctl, psql); nas sessões do Claude já tem.

A imitação não é o Supabase inteiro: o teste final é aplicar no projeto e usar o app.

### Testes do app contra servidor de verdade

```bash
E2E=1 bash supabase/testes/rodar_integracao.sh
```

Sobe o Postgres com as migrações e o PostgREST 13.0.7 (o programa que o Supabase usa para a API, baixado da imagem do Supabase pelo `baixar_postgrest.py`), roda os testes da biblioteca de sincronização (`app/testes/sincronizacao.test.ts`) e, com `E2E=1`, abre o app compilado no Chromium (`app/testes/telas.e2e.test.ts`). Login e armazenamento de arquivos são imitados em `app/testes/servidor_teste.ts`; a permissão dos arquivos é conferida pelas regras do banco. Precisa de `cd app && npm install` antes.
