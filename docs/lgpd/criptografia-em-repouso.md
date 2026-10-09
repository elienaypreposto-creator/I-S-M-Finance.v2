# Criptografia em repouso

## Backup de deploy

`scripts/lgpd-cifrar-backup.sh` só deixa em `backups/` um `.sql.enc` (AES-256, cabeçalho `Salted__`). SQL legível é apagado e o passo falha.

Para abrir: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in ficheiro.sql.enc -out ficheiro.sql`.

## Volume do Postgres

O dado do banco fica num ficheiro LUKS2 por ambiente, `/var/lib/ism/<ambiente>/pgdata.img` (ex.: `ism-tst`, `ism-hml`), aberto por `scripts/lgpd-volume-luks.sh` antes do `docker compose`. O contentor recebe o diretório já montado (`PGDATA_MOUNT`). O `cryptsetup status` tem de mostrar `type: LUKS`. Essa saída fica em `/var/lib/ism/<ambiente>/evidencia-disco.txt` na máquina de deploy.

A frase de unlock vem do secret `TST_LUKS_PASSPHRASE` ou `HML_LUKS_PASSPHRASE`. Não é escrita no `.env` e não pode ser igual a `ISM_OWNER_PASSWORD` nem a `DB_PASSWORD`. O ficheiro de chave que já existir em `/var/lib/ism/<ambiente>/pg-luks.key` não é reescrito neste passo. Trocar a chave de um volume já aberto é `cryptsetup luksChangeKey` manual, fora do deploy.

A montagem antiga `/var/lib/ism/mnt` (mapper `ism-pgdata`, sem o nome do ambiente) é desmontada e o mapper é fechado no início do script. O ficheiro de imagem antigo, se ainda existir, não é apagado pelo script: confirma-se que o Postgres vivo está em `/var/lib/ism/ism-tst` ou `ism-hml` e só então se remove o ficheiro na VM.

O deploy só então escreve `ISM_DISCO_CIFRADO=1`. Se o script não abrir o volume, o deploy pára e não grava `0` para seguir em claro.

Em produção, `assertDiscoCifrado` encerra o processo quando `ISM_DISCO_CIFRADO` não é `1`. O arranque não continua com um aviso.
