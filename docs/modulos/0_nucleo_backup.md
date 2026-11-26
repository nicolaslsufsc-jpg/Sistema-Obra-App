# Backup do Sistema Obra no PC

Pedido do Nicolas (21/11/2026): "um backup do programa pode ser físico, pode se manter em algum lugar". Frente 01 · NUC-SINC.

**Combinado:** toda segunda às 12:30 (confirmado pelo Nicolas em 21/11), numa pasta do PC dele, fora do repositório (`C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra\`), com uma cópia no Google Drive dele (`C:\Users\nicol\Meu Drive\Backup Sistema Obra\`, a pasta que o Google Drive para computador espelha), mantendo os 8 últimos nas duas (dois meses).

## O que entra no backup

`pipeline/backup_semanal.py` junta num arquivo `backup_AAAA-MM-DD_HHMM.zip` todas as obras que o login guardado vê. Cada obra é exportada pelo `pipeline/exportar_obra.py` (o mesmo da exportação manual), com:
- `dados/*.json` e `dados/*.csv`: todas as linhas de cada tabela da obra, como estão no servidor (o CSV abre no Excel), inclusive as que ainda não vão para os aparelhos ou não estão no registro do núcleo: `projetos_pedidos_atualizacao`, `fvs_redesenhos`, `fvs_tratativas`, `projetos_formularios` e `recebimento_usos` (desde 25/11; lista `TABELAS_FORA_DA_SINCRONIZACAO` em `pipeline/exportar_obra.py`; tabela que o servidor ainda não tem é pulada). Tabela nova da obra fora da sincronização tem de entrar nessa lista: o relatório do ensaio de restauração aponta as que ficaram de fora;
- em `dados/perfis.json`, o e-mail de login de cada pessoa (desde 25/11; só quando quem exporta é o admin, como no backup). Vem das funções da tela "Pessoas da obra", sem chave secreta e sem migração. O backup fica fora do repositório, mas agora tem os e-mails da equipe: é **dado pessoal**. A pasta do PC e a do Drive não se compartilham com ninguém, e um zip não vai por e-mail nem por chat;
- `arquivos/...`: fotos, plantas e pacotes da obra no armazenamento, conferidos pelo SHA-256;
- `restaurar.sql`: recria a obra num Postgres com as migrações do repositório;
- `manifesto.json` e `LEIAME.txt`: contagens, quem exportou e quando.

E, numa pasta `convites/` do zip, os convites das obras do backup (pessoas convidadas que ainda não entraram, que só o admin vê e não vão para os aparelhos), com o `restaurar_convites.sql`. Se o servidor ainda não tem a tabela de convites, essa parte é pulada.

Depois de gerar o zip, o script **confere o backup**: cria um Postgres descartável neste PC (o portátil dos testes do banco), aplica as migrações, roda cada `restaurar.sql` e compara as linhas com o manifesto. Se faltar uma linha, o backup fica marcado com aviso.

Com `--copia PASTA`, o zip é copiado também para essa pasta (a do Google Drive), que guarda os mesmos 8 últimos. Se a cópia falhar (Drive cheio, pasta sumida), o backup do PC fica e o resultado sai "FEITO COM AVISO".

Na pasta de destino ficam também:
- `ULTIMO_BACKUP.txt`: o resultado do último (DEU CERTO, FEITO COM AVISO ou NÃO FEITO, e o motivo); vai também para a pasta da cópia, para ver pelo Drive no celular;
- `backup.log`: uma linha por backup, para ver o histórico.

O script só apaga arquivos com o nome `backup_AAAA-MM-DD_HHMM.zip`, e só os que passam dos 8 mais novos. Outros arquivos na pasta ficam.

## Login

O backup não usa chave secreta (service_role): entra com o login do administrador guardado no PC (`%LOCALAPPDATA%\SistemaObra\sessao_supabase.json`, o mesmo dos outros scripts do PC). Vê o que esse login vê, pelas mesmas regras do app. O login se renova sozinho a cada backup.

- Primeira vez, ou quando `ULTIMO_BACKUP.txt` disser "O login guardado venceu": abrir o PowerShell na pasta do repositório e rodar `py pipeline\backup_semanal.py --entrar` (pede o e-mail e o código, como o app).
- O arquivo do login dá acesso ao que o administrador vê: trate a pasta `%LOCALAPPDATA%\SistemaObra` como a senha. Para "sair", apague `sessao_supabase.json`.

## Rodar na mão

Na pasta do repositório:

```
py pipeline\backup_semanal.py --destino "C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra" --copia "C:\Users\nicol\Meu Drive\Backup Sistema Obra"
```

Opções: `--manter 8` (quantos guardar), `--obras EXE` (só algumas obras).

Conferir um backup antigo (restaura num Postgres descartável e compara as linhas, sem mexer em nada):

```
py pipeline\backup_semanal.py --conferir "C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra\backup_2026-11-21_0900.zip"
```

## Agendar toda semana (Agendador de Tarefas do Windows)

**Registrado em 21/11/2026** (tarefa "Sistema Obra - backup semanal", primeira execução 23/11 às 12:30). O Agendador roda o script de uma cópia fixa da `main` (um worktree git), `C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra\codigo\`, para não depender da branch em que o checkout principal estiver. Para registrar de novo (no PowerShell, sem ser administrador), um comando só:

```
$repo = "C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra\codigo"; $destino = "C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra"; $copia = "C:\Users\nicol\Meu Drive\Backup Sistema Obra"; Register-ScheduledTask -TaskName "Sistema Obra - backup semanal" -Description "Backup de todas as obras (docs/modulos/0_nucleo_backup.md)" -Action (New-ScheduledTaskAction -Execute "C:\Windows\py.exe" -Argument "-3 pipeline\backup_semanal.py --destino `"$destino`" --copia `"$copia`"" -WorkingDirectory $repo) -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 12:30) -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2))
```

- Segunda às 12:30 (confirmado). Se o PC estiver desligado nessa hora, roda assim que ligar (`StartWhenAvailable`).
- Roda com o usuário do Windows logado, sem senha guardada no Agendador.
- A cópia `codigo\` não se atualiza sozinha. Depois de um merge que mude o backup ou as migrações, atualizar (no checkout principal): `git fetch aberto` e depois `git -C "C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra\codigo" checkout --detach aberto/main`. Sem isso a conferência usa migrações velhas e pode acusar diferença.
- Registrada de novo com `--copia` em 21/11, depois do PR #59. Para trocar algo na tarefa: `Unregister-ScheduledTask -TaskName "Sistema Obra - backup semanal" -Confirm:$false` e o comando acima.
- Ver se rodou: abrir `ULTIMO_BACKUP.txt` na pasta de destino, ou o Agendador de Tarefas > "Sistema Obra - backup semanal" > Último resultado (0 = deu certo, 2 = com aviso, 1 = não feito).
- Rodar agora para testar: `Start-ScheduledTask -TaskName "Sistema Obra - backup semanal"`.
- Tirar: `Unregister-ScheduledTask -TaskName "Sistema Obra - backup semanal"`.

## Como restaurar (ensaio no PC, sem servidor)

Serve para saber se o backup presta e para olhar os dados de um backup antigo. Tudo fica no PC: não lê nem grava no servidor oficial nem no de testes.

1. Abrir o PowerShell na pasta `C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra\codigo` (a cópia fixa da `main`, a mesma do Agendador; atualizar antes se a `main` mudou, como dito acima).
2. Rodar:
   ```
   py pipeline\restaurar_backup.py --backups "C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra" --abrir
   ```
   Ele pega o backup mais novo, cria uma base nova no Postgres portátil do PC, restaura todas as obras, confere e abre o app no navegador (`http://127.0.0.1:54360`). Leva uns 2 minutos (a primeira vez, mais, porque compila o app).
3. Ler o resultado: a primeira linha diz **RESTAUROU E CONFERIU** ou **RESTAUROU COM DIFERENÇA**. O mesmo texto fica em `Backup Sistema Obra\restauracao\RELATORIO_RESTAURACAO.txt`, com, por obra:
   - linhas de cada tabela: manifesto, arquivo de dados e banco restaurado têm de bater;
   - FVS e Concreto: quantos registros e a data do último de cada tabela;
   - arquivos: cada foto, planta e anexo registrado tem de estar no zip, com o tamanho e o SHA-256 certos; e quantas fotos e plantas apontam para arquivo que não veio;
   - o que o backup não traz e as contas que voltaram.
4. No navegador: digitar qualquer e-mail e qualquer código de 6 números (entra como o administrador do backup). Escolher a obra, esperar "Sincronizado" e abrir FVS e Concreto. As plantas abrem dos arquivos do backup.
5. Fechar: Ctrl+C no PowerShell. O que for marcado nesse app fica só na base de ensaio e some na próxima restauração.

Outras opções: `--zip <arquivo>` (um backup específico); sem `--abrir`, só restaura e confere. Se o app não compilar porque falta instalar, rodar uma vez `npm install` dentro da pasta `app` da cópia `codigo`.

Primeiro ensaio, 25/11/2026, com o backup de 23/11 (309 MB): restaurou e conferiu as 3 obras (65.346 linhas e 156 arquivos, nenhum faltando) e o app abriu a obra piloto com a FVS (planta e marcações) e o Concreto (concretagens e laudos). O que faltou está em "Limites".

## Restaurar de verdade (se o servidor se perder)

1. Criar o projeto novo no Supabase e aplicar as migrações (`supabase/README.md`).
2. Abrir o zip; para cada obra, rodar o `restaurar.sql` no editor SQL (o `LEIAME.txt` de cada obra explica). Depois de todas as obras, rodar `convites/restaurar_convites.sql` (se houver).
3. Subir a pasta `arquivos/` de cada obra para o armazenamento `obras`, no mesmo caminho.
4. As contas voltam pelo `restaurar.sql` com nome, papel, os acessos de cada obra e o e-mail de login (backup de 25/11 em diante): a pessoa entra com o mesmo e-mail e cai na conta antiga, com os registros e os acessos. Ainda não ensaiado num Supabase de verdade (o login por código do Supabase pode pedir mais campos na conta criada à mão; o `restaurar.sql` já preenche `instance_id`, `aud` e `role`): ensaiar no servidor de testes antes de precisar.
   - Backup anterior a 25/11, ou feito sem ser admin: as contas voltam **sem e-mail**. Antes de alguém entrar, pôr o e-mail na conta restaurada (no editor SQL, `update auth.users set email = ... where id = ...`; quem é quem está em `dados/perfis.json`). Se a pessoa entrar antes, nasce uma conta nova, sem papel e sem acesso. O relatório do ensaio diz quantas contas voltaram sem e-mail.
   - E-mail que já é de outra conta no servidor novo não é religado (a conta restaurada fica sem e-mail).

## Limites (o que este backup não faz)

- Cópia no Google Drive: depende do Google Drive para computador ligado e com espaço (cada backup tem uns 260 MB; 8 dão uns 2 GB). Se o Drive parar de sincronizar, a pasta do PC continua, mas a cópia na nuvem fica para trás: olhar de vez em quando no drive.google.com se o último zip chegou.
- Não guarda o que está só nos aparelhos e ainda não sincronizou (a fila de cada celular).
- O que foi marcado como apagado no app continua no backup (nada é apagado de fato no servidor).
- Os achados do ensaio de 25/11 (contas sem e-mail; `projetos_pedidos_atualizacao`, `fvs_redesenhos`, `fvs_tratativas`, `projetos_formularios` e `recebimento_usos` fora do backup) foram corrigidos no mesmo dia, sem migração (ok do Nicolas: "blz pode os 3"). Valem do primeiro backup depois do merge em diante: os backups anteriores continuam sem essas coisas.
- **Achado do ensaio com o servidor de testes (25/11, corrigido no mesmo dia):** com várias obras no mesmo backup, a conta é criada pela primeira obra restaurada e, nas seguintes, já existia; pela regra antiga ("conta que já existia não ganha acessos") ficava sem o acesso a elas. Agora cada `restaurar.sql` devolve a todas as pessoas o acesso que tinham **naquela obra**, como no backup, mesmo com a conta já existindo; o papel da conta não muda e nenhum acesso fora do backup é criado (ok do Professor, dentro do "pode corrigir o backup"). Vale para backups feitos depois do merge: num backup anterior, conferir os acessos de cada obra com `dados/acessos.json` depois de restaurar.
- Ensaio contra o servidor de testes (25/11, só leitura, obras EXE, EXE-NO1 e EXE-NO2, restauradas numa base do PC): as 48 tabelas entraram e as 2 contas voltaram com o e-mail. Os 19 arquivos da EXE não estão no armazenamento do servidor de testes (a carga da EXE não subiu os arquivos), então o ensaio os aponta como faltando.
