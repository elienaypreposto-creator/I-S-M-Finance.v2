import { pool } from "./src/index";

async function run() {
  console.log("Running missing columns migration...");
  try {
    const sql = `
-- Tabela usuarios
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "cargo" text;
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "perfil_base" text;
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "senha_unica_hash" text;
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "senha_unica_utilizada" boolean DEFAULT false NOT NULL;

-- Tabela lancamentos
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "data_quitacao" date;
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "valor_quitado" numeric(15, 2);
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "juros" numeric(15, 2) DEFAULT '0';
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "multa" numeric(15, 2) DEFAULT '0';
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "desconto" numeric(15, 2) DEFAULT '0';
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "acrescimo" numeric(15, 2) DEFAULT '0';
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "is_residuo_parcial" boolean DEFAULT false NOT NULL;
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "lancamento_origem_id" integer;
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "transferencia_grupo_id" text;
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "criado_por" integer;

DO $$ BEGIN
 ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_lancamento_origem_id_fkey" FOREIGN KEY ("lancamento_origem_id") REFERENCES "public"."lancamentos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
    `;
    await pool.query(sql);
    console.log("Migration done");
  } catch (error) {
    console.error("Migration failed", error);
  } finally {
    process.exit(0);
  }
}

run();
