#!/usr/bin/env bash
# Abre o volume do Postgres num ficheiro LUKS2 e monta-o antes do contentor.
# Sem este passo o deploy não escreve ISM_DISCO_CIFRADO=1 e a API recusa arrancar.
# A chave em /var/lib/ism/pg-luks.key é criada uma vez. Não a substituir: sem ela o volume não abre.
set -euo pipefail

if [ -z "${PG_LUKS_PASSPHRASE:-}" ]; then
  echo "PG_LUKS_PASSPHRASE vazio. Volume em claro recusado." >&2
  exit 1
fi

if ! sudo -n true 2>/dev/null; then
  echo "sudo sem password é obrigatório para cryptsetup." >&2
  exit 1
fi

if ! command -v cryptsetup >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y cryptsetup
fi

IMG=/var/lib/ism/pgdata.img
MAP=ism-pgdata
MNT=/var/lib/ism/mnt
DATA=/var/lib/ism/mnt/pg
KEY=/var/lib/ism/pg-luks.key

sudo mkdir -p /var/lib/ism

if [ ! -f "$KEY" ]; then
  umask 077
  printf '%s' "$PG_LUKS_PASSPHRASE" | sudo tee "$KEY" >/dev/null
  sudo chmod 400 "$KEY"
fi

if [ ! -f "$IMG" ]; then
  sudo truncate -s 20G "$IMG"
  sudo cryptsetup luksFormat --batch-mode --type luks2 --key-file "$KEY" "$IMG"
fi

if [ ! -b "/dev/mapper/$MAP" ]; then
  sudo cryptsetup luksOpen --key-file "$KEY" "$IMG" "$MAP"
fi

if ! sudo cryptsetup status "$MAP" | grep -Eq 'type:[[:space:]]+LUKS'; then
  echo "cryptsetup status não mostra LUKS. Postgres não sobe em claro." >&2
  sudo cryptsetup status "$MAP" >&2 || true
  exit 1
fi

if ! findmnt -n "$MNT" >/dev/null 2>&1; then
  # Primeira abertura: o sistema de ficheiros ainda não existe.
  if ! sudo blkid "/dev/mapper/$MAP" >/dev/null 2>&1; then
    sudo mkfs.ext4 -q "/dev/mapper/$MAP"
  fi
  sudo mkdir -p "$MNT"
  sudo mount "/dev/mapper/$MAP" "$MNT"
fi

sudo mkdir -p "$DATA"
# lost+found fica na raiz do ext4. O Postgres recusa um diretório de dados que não esteja vazio.
if [ ! -f "$DATA/PG_VERSION" ]; then
  src=""
  while IFS= read -r vol; do
    [ -z "$vol" ] && continue
    mp="$(docker volume inspect -f '{{.Mountpoint}}' "$vol" 2>/dev/null || true)"
    if [ -n "$mp" ] && sudo test -f "$mp/PG_VERSION"; then
      src="$mp"
      break
    fi
  done < <(docker volume ls -q 2>/dev/null | grep 'pgdata$' || true)

  if [ -n "$src" ]; then
    docker compose stop postgres || true
    if ! sudo cp -a "$src"/. "$DATA"/; then
      docker compose start postgres || true
      echo "Cópia para o volume LUKS falhou. O Postgres anterior foi religado no volume antigo." >&2
      exit 1
    fi
  fi
fi

sudo chown -R 70:70 "$DATA"
sudo cryptsetup status "$MAP" | sudo tee /var/lib/ism/evidencia-disco.txt >/dev/null
echo "DISCO_CIFRADO=1"
echo "PGDATA_MOUNT=$DATA"
