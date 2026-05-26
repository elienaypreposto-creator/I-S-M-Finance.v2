/**
 * Seed — Usuário Administrador Padrão + Mapeamento Completo de Permissões
 *
 * Execução:
 *   cd lib/db
 *   tsx --env-file=../../.env src/seed-admin.ts
 *
 *
 * O script é idempotente: se o usuário já existir, apenas sincroniza as permissões.
 */

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./index";
import { usuariosTable, usuarioPermissoesTable } from "./schema";

const ADMIN_EMAIL   = process.env.ADMIN_EMAIL;
const ADMIN_NOME    = process.env.ADMIN_NOME;
const ADMIN_SENHA   = process.env.ADMIN_SENHA;
const BCRYPT_ROUNDS = 12;

const PERMISSOES_ADMIN: string[] = [
  "financeiro:lancamentos:criar",
  "financeiro:lancamentos:editar",
  "financeiro:lancamentos:deletar",
  "financeiro:parceiros:criar",
  "financeiro:parceiros:editar",
  "financeiro:parceiros:deletar",
  "financeiro:metas:editar",
  "configuracoes:contas-bancarias:criar",
  "configuracoes:contas-bancarias:editar",
  "configuracoes:contas-bancarias:deletar",
  "configuracoes:plano-contas:criar",
  "configuracoes:plano-contas:editar",
  "configuracoes:plano-contas:deletar",
  "configuracoes:filiais:criar",
  "configuracoes:filiais:editar",
  "configuracoes:filiais:deletar",
  "configuracoes:departamentos:criar",
  "configuracoes:departamentos:editar",
  "configuracoes:departamentos:deletar",
  "admin:usuarios:listar",
  "admin:usuarios:criar",
  "admin:usuarios:editar",
  "admin:migrate-passwords",
];

/**
 * Mascara a senha e parte do host da DATABASE_URL para log seguro.
 * Ex: postgresql://postgres.abcd:***@aws-0-***.pooler.supabase.com:6543/postgres
 */
function maskDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.password = "***";
    const parts = u.hostname.split(".");
    if (parts.length >= 2) {
      parts[0] = parts[0].slice(0, 4) + "***";
    }
    u.hostname = parts.join(".");
    return u.toString();
  } catch {
    return "(URL não parseável - verifique DATABASE_URL)";
  }
}

function describeConnectionError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const msg = err.message.toLowerCase();
  if (msg.includes("econnrefused"))
    return "ECONNREFUSED — o servidor de banco não aceitou a conexão. Verifique host/porta e se o banco está online.";
  if (msg.includes("authentication failed") || msg.includes("password authentication"))
    return "Falha de autenticação — usuário ou senha incorretos na DATABASE_URL.";
  if (msg.includes("certificate") || msg.includes("ssl"))
    return "Erro SSL — problema de certificado TLS. Verifique NODE_TLS_REJECT_UNAUTHORIZED.";
  if (msg.includes("timeout") || msg.includes("timed out"))
    return "Timeout — o banco não respondeu dentro do prazo. Verifique conectividade de rede.";
  if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("table"))
    return "Tabela ou schema não encontrado — execute as migrations antes do seed.";
  return err.message;
}

async function verificarConexao(): Promise<void> {
  process.stdout.write("\n[1/4] Testando conexão com o banco...\n");

  const dbUrl = process.env.DATABASE_URL ?? "";
  process.stdout.write(`    DATABASE_URL : ${maskDatabaseUrl(dbUrl)}\n`);

  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query<{ now: string }>("SELECT NOW() AS now");
    process.stdout.write(`    Conectado em : ${rows[0]?.now ?? "(sem resposta)"}\n`);
  } finally {
    cliente.release();
  }
}

async function verificarTabelas(): Promise<void> {
  process.stdout.write("\n[2/4] Verificando existência das tabelas...\n");

  const tabelasNecessarias = ["usuarios", "usuario_permissoes"];

  for (const tabela of tabelasNecessarias) {
    const resultado = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = ${tabela}
      ) AS "existe"
    `);

    const existe = (resultado.rows[0] as { existe: boolean }).existe;
    if (!existe) {
      throw new Error(
        `Tabela "${tabela}" não encontrada no schema public.\n` +
        `   Execute as migrations antes do seed:\n` +
        `   cd lib/db && pnpm push (ou pnpm drizzle-kit migrate)`,
      );
    }
    process.stdout.write(` Tabela "${tabela}" encontrada.\n`);
  }
}

async function upsertAdmin(): Promise<number> {
  process.stdout.write(`\n[3/4] Criando/verificando usuário admin (${ADMIN_EMAIL})...\n`);

  const [existente] = await db
    .select({ id: usuariosTable.id, email: usuariosTable.email })
    .from(usuariosTable)
    .where(eq(usuariosTable.email, ADMIN_EMAIL))
    .limit(1);

  if (existente) {
    process.stdout.write(`    Usuário já existe - id=${existente.id}, email=${existente.email}\n`);
    process.stdout.write(`    Pulando criação. Permissões serão resincronizadas.\n`);
    return existente.id;
  }

  process.stdout.write(`    Gerando bcrypt hash (rounds=${BCRYPT_ROUNDS})... `);
  const senhaHash = await bcrypt.hash(ADMIN_SENHA, BCRYPT_ROUNDS);
  process.stdout.write(`concluído.\n`);

  const [criado] = await db
    .insert(usuariosTable)
    .values({
      nome:       ADMIN_NOME,
      email:      ADMIN_EMAIL,
      senha_hash: senhaHash,
      bloqueado:  false,
    })
    .returning({
      id:    usuariosTable.id,
      nome:  usuariosTable.nome,
      email: usuariosTable.email,
    });

  if (!criado?.id) {
    throw new Error(
      "INSERT executado mas .returning() não retornou o ID. " +
      "Verifique se a tabela 'usuarios' possui a coluna 'id' como SERIAL/PK.",
    );
  }

  process.stdout.write(`\n    Usuário Admin gravado com ID ${criado.id}\n`);
  process.stdout.write(`    nome  : ${criado.nome}\n`);
  process.stdout.write(`    email : ${criado.email}\n`);

  return criado.id;
}

async function sincronizarPermissoes(adminId: number): Promise<void> {
  process.stdout.write(`\n[4/4] Sincronizando ${PERMISSOES_ADMIN.length} permissões para id=${adminId}...\n`);

  const deletadas = await db
    .delete(usuarioPermissoesTable)
    .where(eq(usuarioPermissoesTable.usuario_id, adminId));

  process.stdout.write(`    Permissões antigas removidas: ${(deletadas as { rowCount?: number }).rowCount ?? "?"}\n`);

  await db.insert(usuarioPermissoesTable).values(
    PERMISSOES_ADMIN.map((p) => ({
      usuario_id:       adminId,
      codigo_permissao: p,
    })),
  );

  process.stdout.write(`    ${PERMISSOES_ADMIN.length} permissões inseridas com sucesso.\n`);

  // Confirmação de leitura — garante que as permissões foram de facto persistidas
  const gravadas = await db
    .select({ codigo: usuarioPermissoesTable.codigo_permissao })
    .from(usuarioPermissoesTable)
    .where(eq(usuarioPermissoesTable.usuario_id, adminId));

  if (gravadas.length !== PERMISSOES_ADMIN.length) {
    throw new Error(
      `Inconsistência pós-insert: esperado ${PERMISSOES_ADMIN.length} permissões, ` +
      `encontrado ${gravadas.length} no banco.`,
    );
  }

  process.stdout.write(`    Verificação de leitura: ${gravadas.length}/${PERMISSOES_ADMIN.length} permissões confirmadas no banco.\n`);
}

async function seedAdmin(): Promise<void> {
  process.stdout.write("═══════════════════════════════════════════════\n");
  process.stdout.write("  ISM Finance - Seed: Usuário Administrador\n");
  process.stdout.write("═══════════════════════════════════════════════\n");

  try {
    await verificarConexao();
    await verificarTabelas();
    const adminId = await upsertAdmin();
    await sincronizarPermissoes(adminId);

    process.stdout.write("\n═══════════════════════════════════════════════\n");
    process.stdout.write("    Seed concluído com sucesso!\n");
    process.stdout.write("═══════════════════════════════════════════════\n\n");
  } catch (err: unknown) {
    const descricao = describeConnectionError(err);

    process.stderr.write("\n═══════════════════════════════════════════════\n");
    process.stderr.write("    SEED FALHOU\n");
    process.stderr.write("═══════════════════════════════════════════════\n");
    process.stderr.write(`  Diagnóstico : ${descricao}\n`);

    if (err instanceof Error && err.stack) {
      process.stderr.write(`\n  Stack trace:\n`);
      err.stack.split("\n").forEach((line) =>
        process.stderr.write(`    ${line}\n`),
      );
    }

    process.stderr.write("\n");
    process.exit(1);
  }
}

seedAdmin().finally(() => pool.end());
