import { db } from "./src/index.ts";
import { usuariosTable, permissoesTable } from "./src/schema/usuarios.ts";
import { eq } from "drizzle-orm";

async function main() {
    const email = process.argv[2];

    if (!email) {
        console.error("Por favor, forneça o e-mail do usuário. Exemplo: pnpm tsx delete_user.ts joao@email.com");
        process.exit(1);
    }

    try {
        console.log(`Buscando usuário: ${email}...`);
        const [user] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, email)).limit(1);

        if (!user) {
            console.log(`⚠️ Nenhum usuário encontrado com o e-mail: ${email}`);
            process.exit(0);
        }

        console.log(`Deletando permissões do usuário...`);
        await db.delete(permissoesTable).where(eq(permissoesTable.usuario_id, user.id));

        console.log(`Deletando usuário: ${email}...`);
        const result = await db.delete(usuariosTable).where(eq(usuariosTable.id, user.id)).returning();

        if (result.length > 0) {
            console.log(`✅ Usuário ${email} deletado com sucesso!`);
        }
    } catch (e) {
        console.error("❌ Erro ao deletar usuário:", e);
    } finally {
        process.exit(0);
    }
}

main();
