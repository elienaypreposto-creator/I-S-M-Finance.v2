#!/usr/bin/env bash
# Abre o volume do Postgres num ficheiro LUKS2 e monta-o antes do contentor.
# Sem este passo o deploy não escreve ISM_DISCO_CIFRADO=1 e a API recusa arrancar.
# Corre na pasta do ambiente (ism-tst, ism-hml): cada ambiente tem o seu ficheiro, chave e montagem.
# A chave em /var/lib/ism/<ambiente>/pg-luks.key é criada uma vez. Não a substituir: sem ela o volume não abre.
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

PROJETO="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
if ! [[ "$PROJETO" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "Nome de projeto inválido: '$PROJETO'." >&2
  exit 1
fi

BASE="/var/lib/ism/$PROJETO"
IMG="$BASE/pgdata.img"
MAP="ism-pgdata-$PROJETO"
MNT="$BASE/mnt"
DATA="$MNT/pg"
KEY="$BASE/pg-luks.key"
VOLUME_ANTIGO="${PROJETO}_pgdata"

# Versão do Postgres do compose (postgres:16-alpine -> 16). Dados de outra versão não sobem.
PG_MAJOR="$(docker compose config --images | sed -n 's/^postgres:\([0-9][0-9]*\).*/\1/p' | head -n1)"
if [ -z "$PG_MAJOR" ]; then
  echo "Imagem postgres:<versão> não encontrada no docker-compose.yml." >&2
  exit 1
fi

sudo mkdir -p "$BASE"

if [ ! -f "$KEY" ]; then
  umask 077
  printf '%s' "$PG_LUKS_PASSPHRASE" | sudo tee "$KEY" >/dev/null
  sudo chmod 400 "$KEY"
fi

if [ ! -f "$IMG" ]; then
  sudo truncate -s "${PG_LUKS_SIZE:-20G}" "$IMG"
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
  # Ponto de montagem imutável: com o volume fechado (ex.: após reboot) o Docker não consegue
  # criar "pg" no disco em claro e o Postgres falha em vez de iniciar um banco vazio.
  sudo chattr +i "$MNT" 2>/dev/null || true
  sudo mount "/dev/mapper/$MAP" "$MNT"
fi

if [ ! -f "$DATA/PG_VERSION" ]; then
  # Só o volume deste ambiente serve de origem; nunca outro projeto da máquina.
  src=""
  mp="$(docker volume inspect -f '{{.Mountpoint}}' "$VOLUME_ANTIGO" 2>/dev/null || true)"
  if [ -n "$mp" ] && sudo test -f "$mp/PG_VERSION"; then
    src="$mp"
  fi

  if [ -n "$src" ]; then
    versao="$(sudo cat "$src/PG_VERSION")"
    if [ "$versao" != "$PG_MAJOR" ]; then
      echo "Volume $VOLUME_ANTIGO é do Postgres $versao; o compose usa o $PG_MAJOR. Cópia recusada." >&2
      exit 1
    fi
    docker compose stop postgres || true
    # Cópia para um diretório temporário: uma cópia interrompida nunca fica com PG_VERSION em $DATA.
    sudo rm -rf "$DATA.tmp"
    if ! sudo cp -a "$src" "$DATA.tmp"; then
      sudo rm -rf "$DATA.tmp"
      docker compose start postgres || true
      echo "Cópia para o volume LUKS falhou. O Postgres anterior foi religado no volume antigo." >&2
      exit 1
    fi
    sudo rm -rf "$DATA"
    sudo mv "$DATA.tmp" "$DATA"
    echo "Dados copiados de $VOLUME_ANTIGO para o volume LUKS (o volume antigo fica intacto)." >&2
  fi
fi

sudo mkdir -p "$DATA"
if sudo test -f "$DATA/PG_VERSION"; then
  versao="$(sudo cat "$DATA/PG_VERSION")"
  if [ "$versao" != "$PG_MAJOR" ]; then
    echo "O volume LUKS tem dados do Postgres $versao; o compose usa o $PG_MAJOR. Postgres não sobe." >&2
    exit 1
  fi
fi

sudo chown -R 70:70 "$DATA"
sudo cryptsetup status "$MAP" | sudo tee "$BASE/evidencia-disco.txt" >/dev/null
echo "DISCO_CIFRADO=1"
echo "PGDATA_MOUNT=$DATA"
