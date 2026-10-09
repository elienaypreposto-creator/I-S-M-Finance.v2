#!/usr/bin/env bash
# Corre na VM de deploy (utilizador ubuntu). Não imprime senhas, tokens nem o pacote LGPD.
set -euo pipefail
set +x

log() { printf '%s\n' "$*"; }

ler_env() {
  local ficheiro="$1" chave="$2" linha
  linha="$(grep -E "^${chave}=" "$ficheiro" | head -n1 || true)"
  printf '%s' "${linha#*=}"
}

psql_exec() {
  if docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U ism_user -d ismfinance "$@"; then
    return 0
  fi
  local senha
  senha="$(ler_env .env DB_PASSWORD)"
  docker compose exec -T -e PGPASSWORD="$senha" postgres psql -v ON_ERROR_STOP=1 -U ism_user -d ismfinance "$@"
}

psql_ficheiro() {
  local ficheiro="$1"
  if docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U ism_user -d ismfinance < "$ficheiro"; then
    return 0
  fi
  local senha
  senha="$(ler_env .env DB_PASSWORD)"
  docker compose exec -T -e PGPASSWORD="$senha" postgres psql -v ON_ERROR_STOP=1 -U ism_user -d ismfinance < "$ficheiro"
}

aplicar_dpa() {
  local dir="$1" sql
  log "DPA dir=$(basename "$dir")"
  cd "$dir"
  sql="$(mktemp)"
  cat > "$sql" <<'SQL'
UPDATE "empresas"
SET "ativa" = false,
    "updated_at" = now()
WHERE "dpa_assinado_em" IS NULL
  AND "ativa" = true;
ALTER TABLE "empresas" DROP CONSTRAINT IF EXISTS "empresas_ativa_exige_dpa";
ALTER TABLE "empresas"
    ADD CONSTRAINT "empresas_ativa_exige_dpa"
        CHECK ("ativa" = false OR "dpa_assinado_em" IS NOT NULL);
SQL
  psql_ficheiro "$sql"
  rm -f "$sql"
  log "EMPRESAS_DEPOIS dir=$(basename "$dir")"
  psql_exec -c "SELECT id, slug, ativa, (dpa_assinado_em IS NOT NULL) AS dpa FROM empresas ORDER BY id;"
}

chave_igual_a() {
  local ficheiro="$1" valor="$2"
  [ -n "$valor" ] || return 1
  [ -f "$ficheiro" ] || return 1
  printf '%s' "$valor" | sudo cmp -s - "$ficheiro"
}

rotar_luks() {
  local projeto="$1"
  local base="/var/lib/ism/$projeto"
  local img="$base/pgdata.img"
  local key="$base/pg-luks.key"
  local dir="$HOME/$projeto"
  log "LUKS projeto=$projeto"
  if [ ! -d "$dir" ]; then
    log "LUKS_DIR_AUSENTE=$projeto"
    return 1
  fi
  cd "$dir"
  local owner dbpass
  owner="$(ler_env .env ISM_OWNER_PASSWORD)"
  dbpass="$(ler_env .env DB_PASSWORD)"
  if [ ! -f "$img" ] || [ ! -f "$key" ]; then
    log "LUKS_FICHEIRO_AUSENTE=$projeto"
    return 1
  fi
  local igual=0
  if chave_igual_a "$key" "$owner" || chave_igual_a "$key" "$dbpass"; then
    igual=1
  fi
  log "LUKS_KEY_IGUAL_SENHA_ANTES=$igual"
  if [ "$igual" -eq 1 ]; then
    if ! command -v openssl >/dev/null 2>&1; then
      sudo apt-get update -y
      sudo apt-get install -y openssl
    fi
    local nova
    nova="$(mktemp)"
    umask 077
    openssl rand -base64 48 | tr -d '\n' > "$nova"
    sudo cryptsetup luksChangeKey --batch-mode --key-file "$key" --new-keyfile "$nova" "$img"
    sudo install -m 400 -o root "$nova" "$key"
    rm -f "$nova"
    log "LUKS_CHAVE_SUBSTITUIDA=$projeto"
  fi
  igual=0
  if chave_igual_a "$key" "$owner" || chave_igual_a "$key" "$dbpass"; then
    igual=1
  fi
  log "LUKS_KEY_IGUAL_SENHA_DEPOIS=$igual"
  sudo cryptsetup luksDump "$img" | grep -E 'Version:|Cipher:|Keyslots:|^  [0-9]+:' || true
  if findmnt -n "/var/lib/ism/$projeto/mnt" >/dev/null 2>&1; then
    log "MNT_ATIVA=$projeto"
  else
    log "MNT_AUSENTE=$projeto"
  fi
  if [ "$igual" -eq 1 ]; then
    return 1
  fi
}

exportar_eliminar_tst() {
  local dir="$HOME/ism-tst"
  cd "$dir"
  local alvo
  alvo="$(psql_exec -t -A -c "SELECT id || '|' || slug FROM empresas WHERE slug = 'filial-sul-teste' LIMIT 1;" | tr -d '\r')"
  if [ -z "$alvo" ]; then
    log "ALVO_AUSENTE=filial-sul-teste"
    return 0
  fi
  local id slug
  id="${alvo%%|*}"
  slug="${alvo#*|}"
  log "ALVO_ID=$id ALVO_SLUG=$slug"
  if [ "$slug" != "filial-sul-teste" ]; then
    log "ALVO_SLUG_INESPERADO"
    return 1
  fi

  local super
  super="$(psql_exec -t -A -c "SELECT id FROM usuarios WHERE superadmin = true AND bloqueado = false ORDER BY id LIMIT 1;" | tr -d '\r')"
  super="${super%%$'\n'*}"
  if ! [[ "$super" =~ ^[0-9]+$ ]]; then
    log "SUPERADMIN_AUSENTE"
    return 1
  fi
  log "SUPERADMIN_ID=$super"

  local email razao js
  email="$(mktemp)"
  razao="$(mktemp)"
  js="$(mktemp)"
  psql_exec -t -A -c "SELECT email FROM usuarios WHERE id = $super;" | tr -d '\r' > "$email"
  psql_exec -t -A -c "SELECT razao_social FROM empresas WHERE id = $id;" | tr -d '\r' > "$razao"
  cat > "$js" <<'JS'
import { createHash } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

let EncryptJWT;
try {
  ({ EncryptJWT } = await import("jose"));
} catch {
  const encontrado = execSync("find /app -path '*/node_modules/jose/package.json' | head -n1", { encoding: "utf8" }).trim();
  const dir = encontrado.replace(/\/package.json$/, "");
  ({ EncryptJWT } = await import(pathToFileURL(dir + "/dist/node/esm/index.js").href));
}

const secret = process.env.JWT_ENCRYPT_SECRET || process.env.JWT_SECRET;
if (!secret) {
  console.log("TOKEN_SEGREDO_AUSENTE");
  process.exit(2);
}
const key = createHash("sha256").update(secret, "utf8").digest();
const email = readFileSync("/tmp/lgpd-email.txt", "utf8").trim();
const razao = readFileSync("/tmp/lgpd-razao.txt", "utf8").trim();
const empresaId = String(process.env.LGPD_EMPRESA || "");
const sub = String(process.env.LGPD_SUB || "");
unlinkSync("/tmp/lgpd-email.txt");
unlinkSync("/tmp/lgpd-razao.txt");

const token = await new EncryptJWT({
  sub,
  email,
  permissions: [],
  empresa_id: 1,
  superadmin: true,
})
  .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
  .setIssuedAt()
  .setExpirationTime("900s")
  .setIssuer("ism-finance")
  .setAudience("ism-finance-api")
  .encrypt(key);

async function chamar(caminho, opcoes = {}) {
  const resposta = await fetch("http://127.0.0.1:5000" + caminho, {
    ...opcoes,
    headers: {
      Authorization: "Bearer " + token,
      ...(opcoes.headers || {}),
    },
  });
  const texto = await resposta.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { json = null; }
  return { status: resposta.status, texto, json };
}

const inicio = await chamar("/api/admin/empresas/" + empresaId + "/export");
console.log("EXPORT_HTTP=" + inicio.status);
let job = inicio.json && inicio.json.data ? inicio.json.data : null;
const jobId = job && job.job_id ? job.job_id : "";
if (inicio.status === 202 && jobId) {
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await chamar("/api/admin/empresas/" + empresaId + "/export?job_id=" + encodeURIComponent(jobId));
    job = poll.json && poll.json.data ? poll.json.data : null;
    console.log("EXPORT_POLL_HTTP=" + poll.status + " STATUS=" + (job && job.status ? job.status : ""));
    if (poll.status !== 202) {
      inicio.status = poll.status;
      break;
    }
  }
}
console.log("EXPORT_STATUS=" + (job && job.status ? job.status : ""));
if (!job || job.status !== "pronto" || !job.url) {
  const codigo = inicio.json && inicio.json.errors && inicio.json.errors[0] ? inicio.json.errors[0].code : "";
  console.log("EXPORT_ERRO=" + codigo);
  process.exit(2);
}
const pacoteResp = await chamar(job.url);
console.log("EXPORT_DOWNLOAD_HTTP=" + pacoteResp.status);
console.log("EXPORT_BYTES=" + Buffer.byteLength(pacoteResp.texto));
if (pacoteResp.json && typeof pacoteResp.json === "object") {
  console.log("EXPORT_CHAVES=" + Object.keys(pacoteResp.json).join(","));
  const tabelas = pacoteResp.json.tabelas || {};
  const contagens = Object.entries(tabelas).map(([nome, linhas]) => nome + ":" + (Array.isArray(linhas) ? linhas.length : 0));
  console.log("EXPORT_TABELAS=" + contagens.join(","));
}

const desafio = await chamar("/api/admin/empresas/" + empresaId + "/eliminacao", { method: "POST" });
console.log("DESAFIO_HTTP=" + desafio.status);
const tokenDesafio = desafio.json && desafio.json.data ? desafio.json.data.desafio : "";
console.log("DESAFIO_PRESENTE=" + (tokenDesafio ? "1" : "0"));
if (!tokenDesafio) {
  process.exit(3);
}
const eliminacao = await chamar("/api/admin/empresas/" + empresaId, {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ desafio: tokenDesafio, confirmacao: razao }),
});
console.log("DELETE_HTTP=" + eliminacao.status);
const data = eliminacao.json && eliminacao.json.data ? eliminacao.json.data : {};
console.log("DELETE_ELIMINADA=" + (data.eliminada === true ? "1" : "0"));
console.log("DELETE_USUARIOS=" + (data.usuarios_anonimizados ?? ""));
const apagadas = data.apagadas || {};
console.log("DELETE_APAGADAS=" + Object.entries(apagadas).map(([nome, n]) => nome + ":" + n).join(","));
if (eliminacao.status !== 200 || data.eliminada !== true) {
  const codigo = eliminacao.json && eliminacao.json.errors && eliminacao.json.errors[0] ? eliminacao.json.errors[0].code : "";
  console.log("DELETE_ERRO=" + codigo);
  process.exit(3);
}
JS

  docker compose exec -T api sh -c 'cat > /tmp/lgpd-http.mjs' < "$js"
  docker compose exec -T api sh -c 'cat > /tmp/lgpd-email.txt' < "$email"
  docker compose exec -T api sh -c 'cat > /tmp/lgpd-razao.txt' < "$razao"
  rm -f "$js" "$email" "$razao"
  if docker compose exec -T -e "LGPD_SUB=$super" -e "LGPD_EMPRESA=$id" -w /app/artifacts/api-server api node /tmp/lgpd-http.mjs; then
    log "HTTP_LGPD=ok"
  else
    log "HTTP_LGPD=falhou"
    docker compose exec -T api rm -f /tmp/lgpd-http.mjs /tmp/lgpd-email.txt /tmp/lgpd-razao.txt || true
    return 1
  fi
  docker compose exec -T api rm -f /tmp/lgpd-http.mjs /tmp/lgpd-email.txt /tmp/lgpd-razao.txt || true
}

log "EVIDENCIA_INICIO"
falha=0
aplicar_dpa "$HOME/ism-tst" || falha=1
exportar_eliminar_tst || falha=1
log "EMPRESAS_TST_FINAL"
cd "$HOME/ism-tst"
psql_exec -c "SELECT id, slug, ativa, (dpa_assinado_em IS NOT NULL) AS dpa FROM empresas ORDER BY id;" || falha=1
aplicar_dpa "$HOME/ism-hml" || falha=1
rotar_luks "ism-tst" || falha=1
rotar_luks "ism-hml" || falha=1
if findmnt -n /var/lib/ism/mnt >/dev/null 2>&1; then
  log "LEGACY_MNT=montada"
  falha=1
else
  log "LEGACY_MNT=ausente"
fi
if [ -b /dev/mapper/ism-pgdata ]; then
  log "LEGACY_MAP=aberto"
  falha=1
else
  log "LEGACY_MAP=ausente"
fi
log "EVIDENCIA_FIM falha=$falha"
exit "$falha"
