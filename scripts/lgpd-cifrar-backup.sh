#!/usr/bin/env bash
# Cifra o pg_dump antes de o gravar. O ficheiro em disco é AES-256 (openssl enc), não SQL.
# Segredo: BACKUP_CIPHER_PASS. Sem segredo, não grava nada.
set -euo pipefail

if [ -z "${BACKUP_CIPHER_PASS:-}" ]; then
  echo "BACKUP_CIPHER_PASS vazio: backup em claro recusado." >&2
  exit 1
fi

mkdir -p backups
raw="$(mktemp)"
trap 'rm -f "$raw"' EXIT

if ! docker compose exec -T postgres pg_dump -U ism_user ismfinance > "$raw"; then
  echo "Backup ignorado (postgres ainda não está no ar)"
  exit 0
fi

out="backups/pre-deploy-$(date +%Y%m%d%H%M%S).sql.enc"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -pass env:BACKUP_CIPHER_PASS -in "$raw" -out "$out"
rm -f "$raw"
trap - EXIT

sig="$(head -c 8 "$out" || true)"
if [ "$sig" != "Salted__" ]; then
  rm -f "$out"
  echo "Backup recusado: o ficheiro não tem o cabeçalho de cifra do openssl." >&2
  exit 1
fi

if grep -q "PostgreSQL database dump" "$out"; then
  rm -f "$out"
  echo "Backup recusado: conteúdo SQL legível." >&2
  exit 1
fi

chmod 600 "$out"
echo "Backup cifrado em $out"
