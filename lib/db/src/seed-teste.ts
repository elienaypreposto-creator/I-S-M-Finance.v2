/**
 * Massa mínima para a esteira de testes: duas empresas e um usuário admin
 * com o catálogo completo de permissões nas duas, já fora do fluxo de
 * primeiro acesso.
 * Idempotente. Nunca rodar contra TST/HML.
 *
 * Uso: DATABASE_MIGRATE_URL=... E2E_EMAIL=... E2E_SENHA=... pnpm --filter @workspace/db run seed:teste
 */

import bcrypt from "bcryptjs";
import pg from "pg";
import {PERMISSOES_ADMIN} from "./permissoes-catalog";

async function main(): Promise<void> {
    const url = process.env.DATABASE_MIGRATE_URL;
    const email = process.env.E2E_EMAIL;
    const senha = process.env.E2E_SENHA;
    if (!url || !email || !senha) {
        throw new Error("Defina DATABASE_MIGRATE_URL, E2E_EMAIL e E2E_SENHA.");
    }

    const client = new pg.Client({connectionString: url});
    await client.connect();
    try {
        await client.query("BEGIN");
        const empresas: number[] = [];
        for (const [razao, slug] of [
            ["Empresa Teste A", "teste-a"],
            ["Empresa Teste B", "teste-b"],
        ]) {
            const {rows} = await client.query<{id: number}>(
                `INSERT INTO empresas (razao_social, nome_fantasia, slug, dpa_representante, dpa_assinado_em)
                 VALUES ($1, $1, $2, 'Esteira de testes', now())
                 ON CONFLICT (slug) DO UPDATE SET ativa = true,
                     dpa_assinado_em = COALESCE(empresas.dpa_assinado_em, now()),
                     dpa_representante = COALESCE(empresas.dpa_representante, 'Esteira de testes')
                 RETURNING id`,
                [razao, slug],
            );
            empresas.push(rows[0].id);
        }

        const hash = await bcrypt.hash(senha, 10);
        const {rows: usuario} = await client.query<{id: number}>(
            `INSERT INTO usuarios (nome, email, senha_hash, senha_unica_utilizada, ultimo_acesso)
             VALUES ('Usuário E2E', $1, $2, true, now())
             ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, bloqueado = false,
                 senha_unica_utilizada = true, ultimo_acesso = now()
             RETURNING id`,
            [email, hash],
        );

        for (const empresaId of empresas) {
            await client.query(
                `INSERT INTO usuario_empresas (usuario_id, empresa_id, papel, ativo)
                 VALUES ($1, $2, 'admin', true)
                 ON CONFLICT (usuario_id, empresa_id) DO UPDATE SET papel = 'admin', ativo = true`,
                [usuario[0].id, empresaId],
            );
            await client.query(
                `INSERT INTO usuario_permissoes (usuario_id, empresa_id, codigo_permissao)
                 SELECT $1, $2, unnest($3::text[])
                 ON CONFLICT DO NOTHING`,
                [usuario[0].id, empresaId, [...PERMISSOES_ADMIN]],
            );
        }
        await client.query("COMMIT");
        console.log(`[seed:teste] empresas ${empresas.join(", ")}; usuário ${usuario[0].id} admin nas duas.`);
        console.log(`E2E_EMPRESA_ID=${empresas[0]}`);
        console.log(`E2E_EMPRESA_B_ID=${empresas[1]}`);
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        await client.end();
    }
}

main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
