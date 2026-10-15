#!/usr/bin/env bash
# Restaura um backup do ISM Finance num banco NOVO do Postgres deste ambiente. Nunca escreve por cima de um banco existente.
#
#   scripts/restore-db.sh ARQUIVO                 teste: restaura num banco descartável, confere e apaga
#   scripts/restore-db.sh ARQUIVO --banco NOME    restaura em NOME (tem de não existir) e mantém
#   scripts/restore-db.sh --decifrar ARQUIVO > saida.dump   só decifra (ex.: na máquina que tem a chave privada)
#
# ARQUIVO: .dump.pkenc (BACKUP_PRIVKEY), .dump.enc / .sql.enc (BACKUP_CIPHER_PASS), .dump / .sql em claro.
# Corre na pasta do ambiente (ism-tst, ism-hml). PG_CONTAINER aponta outro contentor (ex.: teste local).
set -euo pipefail
umask 077

ITER=200000
DB_USER="${BACKUP_DB_USER:-ism_user}"

uso() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

SO_DECIFRAR=0
ARQ=""
BANCO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --decifrar) SO_DECIFRAR=1 ;;
    --banco) shift; BANCO="${1:-}" ;;
    -h|--help) uso ;;
    -*) echo "Opção desconhecida: $1" >&2; uso ;;
    *) ARQ="$1" ;;
  esac
  shift
done
[ -n "$ARQ" ] && [ -f "$ARQ" ] || { echo "Ficheiro não encontrado: ${ARQ:-<vazio>}" >&2; uso; }

senha() {
  # Sem fallback para senhas do .env: o backup diário usa segredo próprio. Os pre-deploy-*.sql.enc
  # do deploy (lgpd-cifrar-backup.sh) seguem a senha que o main.yml passa; exporte-a à mão para esses.
  if [ -z "${BACKUP_CIPHER_PASS:-}" ]; then
    CONF="${BACKUP_CONF:-/etc/ism-backup/${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}.env}"
    # shellcheck disable=SC1090
    if [ -r "$CONF" ]; then BACKUP_CIPHER_PASS="$(. "$CONF"; printf '%s' "${BACKUP_CIPHER_PASS:-}")"; fi
  fi
  [ -n "${BACKUP_CIPHER_PASS:-}" ] || { echo "BACKUP_CIPHER_PASS vazio (defina no ambiente ou em /etc/ism-backup/<ambiente>.env)." >&2; exit 1; }
  export BACKUP_CIPHER_PASS
}

decifrar() { # escreve o dump em claro no stdout (nunca em disco)
  case "$ARQ" in
    *.pkenc)
      [ -r "${BACKUP_PRIVKEY:-}" ] || { echo "BACKUP_PRIVKEY (chave privada) não definido ou ilegível." >&2; return 1; }
      [ "$(head -n1 "$ARQ")" = "ISMBK1" ] || { echo "Ficheiro sem cabeçalho ISMBK1." >&2; return 1; }
      local k
      k="$(head -n2 "$ARQ" | tail -n1 | openssl base64 -d -A \
        | openssl pkeyutl -decrypt -inkey "$BACKUP_PRIVKEY" -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256)"
      [ -n "$k" ] || return 1
      tail -n +3 "$ARQ" | BACKUP_K="$k" openssl enc -d -aes-256-cbc -pbkdf2 -iter "$ITER" -pass env:BACKUP_K
      ;;
    *.enc)
      openssl enc -d -aes-256-cbc -pbkdf2 -iter "$ITER" -pass env:BACKUP_CIPHER_PASS -in "$ARQ"
      ;;
    *) cat "$ARQ" ;;
  esac
}

case "$ARQ" in *.enc) senha ;; esac
case "$ARQ" in *.sql|*.sql.enc) FORMATO=sql ;; *) FORMATO=custom ;; esac

if [ "$SO_DECIFRAR" = 1 ]; then
  [ -t 1 ] && { echo "Redirecione a saída para um ficheiro (dump em claro)." >&2; exit 1; }
  decifrar
  exit 0
fi

CID="${PG_CONTAINER:-$(docker compose ps -q postgres 2>/dev/null || true)}"
[ -n "$CID" ] || { echo "Contentor postgres deste ambiente não está a correr." >&2; exit 1; }

psql_adm() { docker exec -i "$CID" psql -X -q -v ON_ERROR_STOP=1 -U "$DB_USER" "$@"; }

DESCARTAVEL=0
if [ -z "$BANCO" ]; then
  BANCO="ism_restore_teste_$(date +%Y%m%d%H%M%S)"
  DESCARTAVEL=1
fi
if ! [[ "$BANCO" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
  echo "Nome de banco inválido: '$BANCO'." >&2
  exit 1
fi
existe="$(psql_adm -d postgres -Atc "select 1 from pg_database where datname = '$BANCO'")"
if [ -n "$existe" ]; then
  echo "O banco '$BANCO' já existe. O restore só escreve num banco novo (renomeie o atual antes)." >&2
  exit 1
fi

OK=0
limpar() {
  # O banco foi criado por este script (não existia): apaga-o se for de teste ou se o restore falhou.
  if [ "$DESCARTAVEL" = 1 ] || [ "$OK" != 1 ]; then
    psql_adm -d postgres -c "DROP DATABASE IF EXISTS \"$BANCO\" WITH (FORCE)" >/dev/null 2>&1 || true
  fi
}
trap limpar EXIT

inicio=$(date +%s)
if [ "$FORMATO" = custom ]; then
  # O --list só lê o índice; o resto do stdin é consumido para o openssl não falhar com pipe fechado.
  entradas="$(decifrar | docker exec -i "$CID" sh -c 'pg_restore --list; rc=$?; cat > /dev/null; exit $rc' \
    | grep -cv '^;' || true)"
  [ "${entradas:-0}" -gt 0 ] || { echo "pg_restore --list falhou: o ficheiro não é um dump válido." >&2; exit 1; }
  echo "pg_restore --list: $entradas entradas no índice."
fi

psql_adm -d postgres -c "CREATE DATABASE \"$BANCO\""
echo "Banco $BANCO criado. A restaurar..."

if [ "$FORMATO" = custom ]; then
  # shellcheck disable=SC2086
  decifrar | docker exec -i "$CID" pg_restore -U "$DB_USER" -d "$BANCO" --exit-on-error ${RESTORE_ARGS:-}
else
  decifrar | psql_adm -d "$BANCO" > /dev/null
fi

# Contagem de linhas por tabela, para comparar com a origem.
psql_adm -d "$BANCO" -At -F ' ' <<'SQL'
select 'tabelas', count(*) from information_schema.tables
 where table_schema not in ('pg_catalog','information_schema') and table_type = 'BASE TABLE';
with c as (
  select table_schema, table_name,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as n
    from information_schema.tables
   where table_schema not in ('pg_catalog','information_schema') and table_type = 'BASE TABLE')
select 'linhas', coalesce(sum(n), 0) from c
union all
(select table_schema || '.' || table_name, n from c order by n desc, 1 limit 10);
SQL

OK=1
echo "Restore OK em $(( $(date +%s) - inicio ))s."
if [ "$DESCARTAVEL" = 1 ]; then
  echo "Banco de teste $BANCO será apagado."
else
  echo "Banco $BANCO mantido."
fi
