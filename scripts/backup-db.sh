#!/usr/bin/env bash
# Backup diário do Postgres deste ambiente (ism-tst, ism-hml): pg_dump -Fc cifrado, retenção e cópia fora da VM.
# Corre na pasta do ambiente, como o deploy. O dump nunca toca o disco em claro: pg_dump | openssl > ficheiro.
# Configuração opcional em /etc/ism-backup/<ambiente>.env (ou BACKUP_CONF). Ver docs/backup.md.
set -euo pipefail
umask 077

PROJETO="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
if ! [[ "$PROJETO" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "Nome de projeto inválido: '$PROJETO'." >&2
  exit 1
fi

CONF="${BACKUP_CONF:-/etc/ism-backup/$PROJETO.env}"
if [ -f "$CONF" ]; then
  # shellcheck disable=SC1090
  . "$CONF"
fi

DB_NAME="${BACKUP_DB_NAME:-ismfinance}"
DB_USER="${BACKUP_DB_USER:-ism_user}"
DIR="${BACKUP_DIR:-backups}"
DIARIOS="${BACKUP_DIARIOS:-14}"
SEMANAIS="${BACKUP_SEMANAIS:-8}"
PRE_DEPLOY="${BACKUP_PRE_DEPLOY:-10}"
DIA_SEMANAL="${BACKUP_DIA_SEMANAL:-7}" # date +%u: 7 = domingo
DESTINO="${BACKUP_DESTINO:-}"
ITER=200000 # mesmos parâmetros de scripts/lgpd-cifrar-backup.sh

mkdir -p "$DIR/diario" "$DIR/semanal"
chmod 700 "$DIR" "$DIR/diario" "$DIR/semanal"
LOG="$DIR/backup.log"

log() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PROJETO" "$*" | tee -a "$LOG" >&2; }
ping_alerta() {
  if [ -n "${BACKUP_PING_URL:-}" ]; then
    curl -fsS -m 10 --retry 3 -o /dev/null "${BACKUP_PING_URL}$1" || log "Aviso: ping de monitorização falhou"
  fi
}
TMP=""
falha() {
  trap - ERR
  [ -n "$TMP" ] && rm -f "$TMP"
  log "FALHA: $*"
  ping_alerta /fail
  exit 1
}
trap 'falha "erro na linha $LINENO"' ERR
trap '[ -n "$TMP" ] && rm -f "$TMP"' EXIT

if command -v flock >/dev/null 2>&1; then
  exec 9>"$DIR/.backup.lock"
  if ! flock -n 9; then
    log "Outro backup deste ambiente está a correr. Nada feito."
    exit 0
  fi
fi

ping_alerta /start

# Contentor do Postgres deste projeto (docker compose na pasta do ambiente), nunca o de outro projeto da VM.
CID="${PG_CONTAINER:-$(docker compose ps -q postgres 2>/dev/null || true)}"
[ -n "$CID" ] || falha "contentor postgres de $PROJETO não está a correr"
docker exec "$CID" pg_isready -q -U "$DB_USER" -d "$DB_NAME" || falha "postgres de $PROJETO não aceita conexões"

ler_env() { [ -f .env ] && sed -n "s/^$1=//p" .env | tail -n1 || true; }

if [ -n "${BACKUP_PUBKEY:-}" ]; then
  # Envelope: chave AES aleatória por ficheiro, embrulhada com RSA-OAEP. A chave privada não está na VM.
  [ -r "$BACKUP_PUBKEY" ] || falha "BACKUP_PUBKEY não é legível: $BACKUP_PUBKEY"
  openssl pkey -pubin -in "$BACKUP_PUBKEY" -noout 2>/dev/null || falha "BACKUP_PUBKEY não é uma chave pública válida"
  MODO="chave-publica"
  EXT="dump.pkenc"
else
  # Segredo próprio do backup (em $CONF), como a LUKS_PASSPHRASE do volume: nunca a senha do banco.
  # Fica na VM; preferir BACKUP_PUBKEY.
  [ -n "${BACKUP_CIPHER_PASS:-}" ] || falha "sem BACKUP_PUBKEY nem BACKUP_CIPHER_PASS em $CONF: backup em claro recusado"
  for v in ISM_OWNER_PASSWORD DB_PASSWORD; do
    [ "$BACKUP_CIPHER_PASS" != "$(ler_env "$v")" ] || falha "BACKUP_CIPHER_PASS não pode repetir $v do .env"
  done
  export BACKUP_CIPHER_PASS
  MODO="senha"
  EXT="dump.enc"
  log "Aviso: cifra por senha (segredo na própria VM). Configure BACKUP_PUBKEY para a chave ficar fora da VM."
fi

cifrar() {
  if [ "$MODO" = "chave-publica" ]; then
    local k embrulho
    k="$(openssl rand -hex 32)"
    embrulho="$(printf '%s' "$k" | openssl pkeyutl -encrypt -pubin -inkey "$BACKUP_PUBKEY" \
      -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 | openssl base64 -A)"
    [ -n "$embrulho" ] || return 1
    printf 'ISMBK1\n%s\n' "$embrulho"
    BACKUP_K="$k" openssl enc -aes-256-cbc -pbkdf2 -iter "$ITER" -salt -pass env:BACKUP_K
  else
    openssl enc -aes-256-cbc -pbkdf2 -iter "$ITER" -salt -pass env:BACKUP_CIPHER_PASS
  fi
}

NOME="$PROJETO-$(date +%Y-%m-%d-%H%M%S).$EXT"
OUT="$DIR/diario/$NOME"
TMP="$OUT.parcial"
inicio=$(date +%s)

docker exec "$CID" pg_dump -Fc -U "$DB_USER" -d "$DB_NAME" | cifrar > "$TMP" || falha "pg_dump ou cifra falhou"

# O ficheiro tem de ser cifra, não dump legível.
if [ "$MODO" = "chave-publica" ]; then
  [ "$(head -n1 "$TMP")" = "ISMBK1" ] || falha "ficheiro sem cabeçalho ISMBK1"
  [ "$(head -n3 "$TMP" | tail -n1 | head -c 8)" = "Salted__" ] || falha "corpo sem cabeçalho de cifra do openssl"
else
  [ "$(head -c 8 "$TMP")" = "Salted__" ] || falha "ficheiro sem cabeçalho de cifra do openssl"
  # Com a senha na VM dá para provar já que o ficheiro abre e é um dump completo (lê todos os blocos).
  openssl enc -d -aes-256-cbc -pbkdf2 -iter "$ITER" -pass env:BACKUP_CIPHER_PASS -in "$TMP" \
    | docker exec -i "$CID" pg_restore -f /dev/null || falha "o ficheiro cifrado não abre como dump"
fi

mv "$TMP" "$OUT"
TMP=""
chmod 600 "$OUT"
tamanho=$(wc -c < "$OUT" | tr -d ' ')
soma=$(openssl dgst -sha256 -r "$OUT" | cut -d' ' -f1)
log "OK $OUT ($tamanho bytes, $MODO, $(( $(date +%s) - inicio ))s, sha256 $soma)"

# Semanal: no dia configurado, ou se não houver semanal com menos de 7 dias.
SEMANAL=""
if [ "$(date +%u)" = "$DIA_SEMANAL" ] || [ -z "$(find "$DIR/semanal" -name "$PROJETO-*" -mtime -7 -print -quit)" ]; then
  SEMANAL="$DIR/semanal/$NOME"
  ln "$OUT" "$SEMANAL" 2>/dev/null || cp -p "$OUT" "$SEMANAL"
  log "Semanal: $SEMANAL"
fi

podar() { # pasta padrão quantos
  local f
  # Nomes gerados por este script: sem espaços.
  # shellcheck disable=SC2012
  { ls -1t "$1"/$2 2>/dev/null || true; } | tail -n +"$(( $3 + 1 ))" | while read -r f; do
    rm -f -- "$f"
    log "Retenção: apagado $f"
  done
}
podar "$DIR/diario" "$PROJETO-*.dump.*enc" "$DIARIOS"
podar "$DIR/semanal" "$PROJETO-*.dump.*enc" "$SEMANAIS"
podar "$DIR" "pre-deploy-*.sql.enc" "$PRE_DEPLOY"

# Dumps em claro deixados por versões antigas do deploy: não são apagados aqui, só sinalizados.
claros=$(find "$DIR" -maxdepth 1 -type f \( -name '*.sql' -o -name '*.dump' \) | wc -l | tr -d ' ')
[ "$claros" = "0" ] || log "Aviso: $claros dump(s) em claro em $DIR/ (ver docs/backup.md, secção Dumps antigos)"

enviar() { # ficheiro subpasta
  local f="$1" sub="$2" nome
  nome="$(basename "$f")"
  case "$DESTINO" in
    oci://*)
      local resto="${DESTINO#oci://}" bucket prefixo
      bucket="${resto%%/*}"
      prefixo="${resto#"$bucket"}"; prefixo="${prefixo#/}"; prefixo="${prefixo%/}"
      # shellcheck disable=SC2086
      oci os object put ${BACKUP_OCI_ARGS:-} --bucket-name "$bucket" \
        --name "${prefixo:+$prefixo/}$PROJETO/$sub/$nome" --file "$f" --no-overwrite >/dev/null
      ;;
    rclone:*)
      local alvo="${DESTINO#rclone:}"
      # shellcheck disable=SC2086
      rclone copyto ${BACKUP_RCLONE_ARGS:-} "$f" "${alvo%/}/$PROJETO/$sub/$nome"
      ;;
    dir:*)
      local alvo="${DESTINO#dir:}"
      mkdir -p "$alvo/$PROJETO/$sub"
      cp -p "$f" "$alvo/$PROJETO/$sub/$nome"
      ;;
    *) return 2 ;;
  esac
}

if [ -z "$DESTINO" ]; then
  log "Aviso: BACKUP_DESTINO vazio. Cópia só nesta VM; não conta como backup fora da máquina."
else
  enviar "$OUT" diario || falha "envio para $DESTINO falhou ($OUT fica local)"
  [ -z "$SEMANAL" ] || enviar "$SEMANAL" semanal || falha "envio do semanal para $DESTINO falhou"
  log "Enviado para $DESTINO"
fi

ping_alerta ""
