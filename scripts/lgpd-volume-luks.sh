#!/usr/bin/env bash
# Abre o volume do Postgres num ficheiro LUKS2 e monta-o antes do contentor.
# Sem este passo o deploy não escreve ISM_DISCO_CIFRADO=1 e a API recusa arrancar.
# Corre na pasta do ambiente (ism-tst, ism-hml): cada ambiente tem o seu ficheiro, chave e montagem.
# pg-luks.key abre o volume. Se o conteúdo ainda for a senha do banco, este script troca a chave.
set -euo pipefail

# A frase pode repetir a senha do banco em deploys antigos. Isso não pode
# continuar a ser a chave do volume: mais abaixo ela é trocada se o ficheiro
# pg-luks.key ainda for essa senha.

# Montagem legada compartilhada (mapper ism-pgdata em /var/lib/ism/mnt).
# Não é o volume do ambiente. Fecha a montagem. O ficheiro de imagem não é apagado aqui.
LEGACY_MNT=/var/lib/ism/mnt
LEGACY_MAP=ism-pgdata
if findmnt -n "$LEGACY_MNT" >/dev/null 2>&1; then
  sudo chattr -i "$LEGACY_MNT" 2>/dev/null || true
  if ! sudo umount "$LEGACY_MNT"; then
    echo "Não foi possível desmontar $LEGACY_MNT." >&2
    exit 1
  fi
  echo "Montagem LUKS antiga $LEGACY_MNT desmontada." >&2
fi
if [ -b "/dev/mapper/$LEGACY_MAP" ]; then
  if ! sudo cryptsetup luksClose "$LEGACY_MAP"; then
    echo "Não foi possível fechar o mapper $LEGACY_MAP." >&2
    exit 1
  fi
  echo "Mapper antigo $LEGACY_MAP fechado." >&2
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

chave_igual_a() {
  local valor="$1"
  [ -n "$valor" ] || return 1
  [ -f "$KEY" ] || return 1
  printf '%s' "$valor" | sudo cmp -s - "$KEY"
}

if [ -f "$KEY" ] && [ -f "$IMG" ]; then
  if chave_igual_a "${ISM_OWNER_PASSWORD:-}" || chave_igual_a "${DB_PASSWORD:-}" || chave_igual_a "${PG_LUKS_PASSPHRASE:-}"; then
    nova="$(mktemp)"
    umask 077
    openssl rand -base64 48 | tr -d '\n' > "$nova"
    sudo cryptsetup luksChangeKey --batch-mode --key-file "$KEY" --new-keyfile "$nova" "$IMG"
    sudo install -m 400 -o root "$nova" "$KEY"
    rm -f "$nova"
    echo "Chave LUKS substituída. O ficheiro deixou de ser a senha do banco." >&2
  fi
fi

if [ ! -f "$KEY" ]; then
  if [ -z "${PG_LUKS_PASSPHRASE:-}" ]; then
    echo "PG_LUKS_PASSPHRASE vazio e não há chave. Volume em claro recusado." >&2
    exit 1
  fi
  if [ -n "${ISM_OWNER_PASSWORD:-}" ] && [ "$PG_LUKS_PASSPHRASE" = "$ISM_OWNER_PASSWORD" ]; then
    echo "PG_LUKS_PASSPHRASE não pode ser ISM_OWNER_PASSWORD ao criar a chave." >&2
    exit 1
  fi
  if [ -n "${DB_PASSWORD:-}" ] && [ "$PG_LUKS_PASSPHRASE" = "$DB_PASSWORD" ]; then
    echo "PG_LUKS_PASSPHRASE não pode ser DB_PASSWORD ao criar a chave." >&2
    exit 1
  fi
  if [ -f "$IMG" ]; then
    echo "A imagem LUKS existe e o ficheiro de chave não. Não invento outra chave." >&2
    exit 1
  fi
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
igual_owner=0
if chave_igual_a "${ISM_OWNER_PASSWORD:-}" || chave_igual_a "${DB_PASSWORD:-}"; then
  igual_owner=1
fi
echo "LUKS_KEY_IGUAL_OWNER=$igual_owner" | sudo tee -a "$BASE/evidencia-disco.txt" >/dev/null
if [ "$igual_owner" -eq 1 ]; then
  echo "A chave LUKS continua igual à senha do banco." >&2
  exit 1
fi
echo "DISCO_CIFRADO=1"
echo "PGDATA_MOUNT=$DATA"
