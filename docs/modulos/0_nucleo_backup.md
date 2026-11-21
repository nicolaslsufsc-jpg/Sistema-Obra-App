# Backup do Sistema Obra no PC

Pedido do Nicolas (21/11/2026): "um backup do programa pode ser físico, pode se manter em algum lugar". Frente 01 · NUC-SINC.

**Combinado (estimado, até o Nicolas dizer o contrário):** uma vez por semana, numa pasta do PC dele, fora do repositório (`C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra\`), mantendo os 8 últimos (dois meses).

## O que entra no backup

`pipeline/backup_semanal.py` junta num arquivo `backup_AAAA-MM-DD_HHMM.zip` todas as obras que o login guardado vê. Cada obra é exportada pelo `pipeline/exportar_obra.py` (o mesmo da exportação manual), com:
- `dados/*.json` e `dados/*.csv`: todas as linhas de cada tabela da obra, como estão no servidor (o CSV abre no Excel);
- `arquivos/...`: fotos, plantas e pacotes da obra no armazenamento, conferidos pelo SHA-256;
- `restaurar.sql`: recria a obra num Postgres com as migrações do repositório;
- `manifesto.json` e `LEIAME.txt`: contagens, quem exportou e quando.

Depois de gerar o zip, o script **confere o backup**: cria um Postgres descartável neste PC (o portátil dos testes do banco), aplica as migrações, roda cada `restaurar.sql` e compara as linhas com o manifesto. Se faltar uma linha, o backup fica marcado com aviso.

Na pasta de destino ficam também:
- `ULTIMO_BACKUP.txt`: o resultado do último (DEU CERTO, FEITO COM AVISO ou NÃO FEITO, e o motivo);
- `backup.log`: uma linha por backup, para ver o histórico.

O script só apaga arquivos com o nome `backup_AAAA-MM-DD_HHMM.zip`, e só os que passam dos 8 mais novos. Outros arquivos na pasta ficam.

## Login

O backup não usa chave secreta (service_role): entra com o login do administrador guardado no PC (`%LOCALAPPDATA%\SistemaObra\sessao_supabase.json`, o mesmo dos outros scripts do PC). Vê o que esse login vê, pelas mesmas regras do app. O login se renova sozinho a cada backup.

- Primeira vez, ou quando `ULTIMO_BACKUP.txt` disser "O login guardado venceu": abrir o PowerShell na pasta do repositório e rodar `py pipeline\backup_semanal.py --entrar` (pede o e-mail e o código, como o app).
- O arquivo do login dá acesso ao que o administrador vê: trate a pasta `%LOCALAPPDATA%\SistemaObra` como a senha. Para "sair", apague `sessao_supabase.json`.

## Rodar na mão

Na pasta do repositório:

```
py pipeline\backup_semanal.py --destino "C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra"
```

Opções: `--manter 8` (quantos guardar), `--obras EXE` (só algumas obras).

Conferir um backup antigo (restaura num Postgres descartável e compara as linhas, sem mexer em nada):

```
py pipeline\backup_semanal.py --conferir "C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra\backup_2026-11-21_0900.zip"
```

## Agendar toda semana (Agendador de Tarefas do Windows)

Não registrado ainda: o Nicolas registra quando quiser. No PowerShell (sem ser administrador), um comando só:

```
$repo = "C:\Users\nicol\Nicolas\07_DESENVOLVIMENTO\03_Sistema_Obra"; $destino = "C:\Users\nicol\Nicolas\09_ESTAGIO\Backup Sistema Obra"; Register-ScheduledTask -TaskName "Sistema Obra - backup semanal" -Description "Backup de todas as obras (docs/modulos/0_nucleo_backup.md)" -Action (New-ScheduledTaskAction -Execute "C:\Windows\py.exe" -Argument "-3 pipeline\backup_semanal.py --destino `"$destino`"" -WorkingDirectory $repo) -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 12:30) -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2))
```

- Segunda às 12:30 (estimado). Se o PC estiver desligado nessa hora, roda assim que ligar (`StartWhenAvailable`).
- Roda com o usuário do Windows logado, sem senha guardada no Agendador.
- O `$repo` é a pasta do repositório no PC. Ela precisa estar com a `main` atualizada (com o `pipeline/backup_semanal.py`).
- Ver se rodou: abrir `ULTIMO_BACKUP.txt` na pasta de destino, ou o Agendador de Tarefas > "Sistema Obra - backup semanal" > Último resultado (0 = deu certo, 2 = com aviso, 1 = não feito).
- Rodar agora para testar: `Start-ScheduledTask -TaskName "Sistema Obra - backup semanal"`.
- Tirar: `Unregister-ScheduledTask -TaskName "Sistema Obra - backup semanal"`.

## Restaurar de verdade (se o servidor se perder)

1. Criar o projeto novo no Supabase e aplicar as migrações (`supabase/README.md`).
2. Abrir o zip; para cada obra, rodar o `restaurar.sql` no editor SQL (o `LEIAME.txt` de cada obra explica).
3. Subir a pasta `arquivos/` de cada obra para o armazenamento `obras`, no mesmo caminho.
4. As pessoas entram de novo no app com o e-mail (as contas voltam pelo `restaurar.sql`).

## Limites (o que este backup não faz)

- Fica num disco só: se o PC se perder, o backup vai junto. Copiar de vez em quando a pasta para um HD externo ou para o Drive (decisão do Nicolas).
- Não guarda o que está só nos aparelhos e ainda não sincronizou (a fila de cada celular).
- O que foi marcado como apagado no app continua no backup (nada é apagado de fato no servidor).
