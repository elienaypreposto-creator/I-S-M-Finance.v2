# Criptografia em repouso

## Backup de deploy

`scripts/lgpd-cifrar-backup.sh` só deixa em `backups/` um `.sql.enc` (AES-256, cabeçalho `Salted__`). SQL legível é apagado e o passo falha.

Para abrir: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in ficheiro.sql.enc -out ficheiro.sql`.

## Volume do Postgres

O dado do banco fica num ficheiro LUKS2, `/var/lib/ism/pgdata.img`, aberto por `scripts/lgpd-volume-luks.sh` antes do `docker compose`. O contentor recebe o diretório já montado (`PGDATA_MOUNT`). O `cryptsetup status` tem de mostrar `type: LUKS`. Essa saída fica em `/var/lib/ism/evidencia-disco.txt` na máquina de deploy.

O deploy só então escreve `ISM_DISCO_CIFRADO=1`. Se o script não abrir o volume, o deploy pára e não grava `0` para seguir em claro.

Em produção, `assertDiscoCifrado` encerra o processo quando `ISM_DISCO_CIFRADO` não é `1`. O arranque não continua com um aviso.
