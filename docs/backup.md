# Backup do Postgres (ISMF-10)

Cada ambiente da VM (`~/ism-tst`, `~/ism-hml`) tem o seu backup. Os scripts correm na pasta do ambiente e só usam o contentor `postgres` desse compose, nunca o de outro projeto da máquina.

| Peça | Ficheiro |
|------|----------|
| Backup diário | `scripts/backup-db.sh` |
| Restore e teste de restore | `scripts/restore-db.sh` |
| Timer systemd | `scripts/systemd/ism-backup@.service`, `ism-backup@.timer`, instalados por `scripts/backup-instalar-timer.sh` |
| Configuração (fora do git) | `/etc/ism-backup/<ambiente>.env`, modelo em `scripts/systemd/backup.env.exemplo` |
| Backup antes do deploy | `scripts/lgpd-cifrar-backup.sh` (já no workflow, `backups/pre-deploy-*.sql.enc`) |

## O que o backup diário faz

1. `pg_dump -Fc` do banco `ismfinance` (utilizador `ism_user`, dentro do contentor) direto para o `openssl`. O dump em claro nunca é gravado.
2. Grava `backups/diario/<ambiente>-AAAA-MM-DD-HHMMSS.dump.pkenc` (chave pública) ou `.dump.enc` (senha). Recusa gravar sem cifra.
3. No modo senha, decifra o ficheiro e passa-o pelo `pg_restore` para provar que o dump abre inteiro.
4. Ao domingo (ou se não houver semanal com menos de 7 dias) liga o mesmo ficheiro em `backups/semanal/`.
5. Retenção local: 14 diários, 8 semanais e 10 `pre-deploy-*.sql.enc`. Só apaga ficheiros cifrados com estes nomes. Dumps em claro antigos não são apagados, só aparecem como aviso no log.
6. Envia para fora da VM se `BACKUP_DESTINO` estiver definido. Se o envio falhar, o backup local fica e o script sai com erro.
7. Log em `backups/backup.log` e no `journalctl -u ism-backup@<ambiente>`. Com `BACKUP_PING_URL`, avisa o monitor no início, no sucesso e na falha.

Se o volume LUKS não estiver aberto (ex.: depois de um reboot), o Postgres não está no ar, o backup falha e o alerta dispara.

## Cifra

Dois modos:

- **Chave pública (recomendado, critério do card).** `BACKUP_PUBKEY` aponta para uma chave pública RSA. Cada ficheiro tem uma chave AES-256 aleatória, embrulhada com RSA-OAEP/SHA-256. A chave privada não fica na VM: quem a tiver é quem consegue restaurar.
- **Senha.** Sem `BACKUP_PUBKEY`, usa `BACKUP_CIPHER_PASS` de `/etc/ism-backup/<ambiente>.env`: segredo próprio, como a `LUKS_PASSPHRASE` do volume. O script recusa valor igual a `ISM_OWNER_PASSWORD` ou `DB_PASSWORD` do `.env` e não cai para elas. Mesmo algoritmo do backup de deploy (AES-256-CBC, PBKDF2 200 000 iterações). A senha está na VM; serve de transição.

Gerar o par de chaves numa máquina de confiança (não na VM):

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out ism-backup-privada.pem
openssl pkey -in ism-backup-privada.pem -pubout -out ism-backup-publica.pem
```

A privada vai para o cofre de senhas (com cópia offline). Só a pública vai para a VM: `/etc/ism-backup/ism-backup-publica.pem`, modo 644.

Formato do `.dump.pkenc`: linha 1 `ISMBK1`, linha 2 a chave AES embrulhada em base64, depois o corpo do `openssl enc` (`Salted__...`).

## Instalação na VM (uma vez por ambiente)

```sh
cd ~/ism-tst            # e depois ~/ism-hml
bash scripts/backup-instalar-timer.sh
sudoedit /etc/ism-backup/ism-tst.env   # BACKUP_PUBKEY, BACKUP_DESTINO, BACKUP_PING_URL
sudo systemctl start ism-backup@ism-tst.service
journalctl -u ism-backup@ism-tst -n 20
```

O timer corre às 05:00 UTC (02:00 em Brasília), com até 20 min de atraso aleatório, e recupera a execução perdida se a VM estava desligada. `--remover` desativa o timer do ambiente.

Sem systemd, a linha de cron equivalente (`crontab -e` do `ubuntu`):

```cron
0 5 * * * cd /home/ubuntu/ism-tst && /bin/bash scripts/backup-db.sh >> backups/cron.log 2>&1
```

## Destino fora da VM

Backup no mesmo disco não é backup. Opções de `BACKUP_DESTINO`:

| Valor | Requisito |
|-------|-----------|
| `oci://<bucket>/<prefixo>` | `oci` CLI na VM. Com `BACKUP_OCI_ARGS="--auth instance_principal"`, sem chave de API: dynamic group da instância com `manage objects` só nesse bucket. |
| `rclone:<remote>:<caminho>` | `rclone` configurado (S3, Backblaze B2, SFTP de outro host...). |
| `dir:/caminho` | Disco ou NFS montado de outra máquina. |

O script grava em `<prefixo>/<ambiente>/diario/` e `<prefixo>/<ambiente>/semanal/` com `--no-overwrite`. A retenção remota fica na lifecycle policy do bucket (ex.: apagar `*/diario/` após 15 dias e `*/semanal/` após 60). De preferência o bucket deve estar noutra região ou conta e ter retention rule, para um invasor da VM não conseguir apagar as cópias.

## Alerta

Criar um check no Healthchecks.io (ou similar) com período de 1 dia e tolerância de 2 horas, e pôr a URL em `BACKUP_PING_URL`. Se o backup não correr ou falhar, o monitor avisa.

## Restaurar

Teste (banco descartável: cria, restaura, conta linhas por tabela, apaga):

```sh
cd ~/ism-tst
BACKUP_PRIVKEY=/caminho/ism-backup-privada.pem bash scripts/restore-db.sh backups/diario/<ficheiro>.dump.pkenc
bash scripts/restore-db.sh backups/diario/<ficheiro>.dump.enc        # modo senha: lê o .env
bash scripts/restore-db.sh backups/pre-deploy-<data>.sql.enc          # backup de deploy (SQL)
```

A chave privada não deve ficar na VM. Alternativa: decifrar na máquina que tem a chave e mandar só o dump para o restore:

```sh
BACKUP_PRIVKEY=ism-backup-privada.pem bash scripts/restore-db.sh --decifrar X.dump.pkenc > X.dump
```

Restaurar para valer (o script nunca escreve num banco existente):

```sh
docker compose stop api
docker compose exec -T postgres psql -U ism_user -d postgres \
  -c 'ALTER DATABASE ismfinance RENAME TO ismfinance_antes_restore'
bash scripts/restore-db.sh <ficheiro> --banco ismfinance
docker compose start api
```

Validar o dashboard e os totais; depois apagar `ismfinance_antes_restore`.

Num servidor novo, criar antes as roles `ism_app`, `ism_admin` e `ism_owner` (o dump define donos e GRANTs para elas). Sem as roles o restore pára em `role "ism_owner" does not exist`. Para só inspecionar os dados, `RESTORE_ARGS="--no-owner --no-privileges"`.

Restore de uma só empresa: restaurar num banco à parte (`--banco ism_restore_x`) e copiar as linhas daquele `empresa_id`. Não há ferramenta automática para isso.

## Testes feitos

| Data | Onde | Resultado |
|------|------|-----------|
| 2026-10-09 | Local, `ism-local-pg` (Git Bash e Ubuntu 22.04/OpenSSL 3.0.2 em contentor) | Backup nos dois modos, retenção, envio `dir:`, lock, falhas (contentor parado, sem segredo, destino inválido). Restore em banco descartável: 30 tabelas, 6117 linhas, contagens iguais à origem. Ficheiro truncado e senha errada recusados, banco descartável apagado. Restore num Postgres 16 novo: falha sem roles, OK com `--no-owner --no-privileges`. |
| pendente | TST | Restaurar o dump de HML no TST, subir a aplicação e conferir os totais do dashboard (critério do card). |

## Dumps antigos

Antes deste card ficaram dumps em claro na VM (levantamento de 2026-10-09):

- `~/ism-tst/backups/`: 13 `pre-deploy-*.sql` (23/09 a 01/10, 0,5 a 1 MB cada) e 3 `ism-tst-pre-*.dump` (17/09, 25/09, 28/09). Modo 600.
- `~/ism-hml/backups/ism-hml-pre-ismf3-2026-09-17-1233.dump`. Modo 600.
- `~/ism-hml-2026-08-27-1221.dump`, fora de `backups/` e com modo 664.

O backup diário substitui-os. Decisão do responsável: apagar, ou cifrar e manter. Para cifrar com o segredo do backup do ambiente:

```sh
cd ~/ism-tst/backups
export BACKUP_CIPHER_PASS="$(sudo sed -n 's/^BACKUP_CIPHER_PASS=//p' /etc/ism-backup/ism-tst.env)"
for f in *.sql *.dump; do
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_CIPHER_PASS -in "$f" -out "$f.enc" \
    && [ "$(head -c 8 "$f.enc")" = "Salted__" ] && shred -u "$f"
done
unset BACKUP_CIPHER_PASS
```

Os `.sql.enc` e `.dump.enc` resultantes abrem com `scripts/restore-db.sh`.
