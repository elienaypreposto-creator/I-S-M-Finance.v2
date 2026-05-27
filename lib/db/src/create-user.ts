import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { usuariosTable } from "./schema";

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error("Uso: tsx create-user.ts <email> <senha> <nome>");
    console.error("Exemplo: tsx create-user.ts user@example.com 123456 \"João Silva\"");
    process.exit(1);
  }

  const [email, senha, nome] = args;

  try {
    const [existente] = await db
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .where(eq(usuariosTable.email, email))
      .limit(1);

    if (existente) {
      console.error(`Erro: Já existe um usuário com o email ${email}`);
      process.exit(1);
    }

    const BCRYPT_ROUNDS = 12;
    console.log(`Gerando hash para a senha...`);
    const senhaHash = await bcrypt.hash(senha, BCRYPT_ROUNDS);

    console.log(`Criando usuário no banco de dados...`);
    const [criado] = await db
      .insert(usuariosTable)
      .values({
        nome,
        email,
        senha_hash: senhaHash,
        bloqueado: false,
      })
      .returning({
        id: usuariosTable.id,
        nome: usuariosTable.nome,
        email: usuariosTable.email,
      });

    console.log(`✅ Usuário criado com sucesso!`);
    console.log(`ID: ${criado.id}`);
    console.log(`Nome: ${criado.nome}`);
    console.log(`Email: ${criado.email}`);

  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
