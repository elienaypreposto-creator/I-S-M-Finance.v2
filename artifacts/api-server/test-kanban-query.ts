
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { db } from "@workspace/db";
import {
    kanbanAnexosTable,
    kanbanCardsTable,
    kanbanComentariosTable,
    usuariosTable,
} from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";

async function run() {
  try {
    const data = await db
        .select({
            id: kanbanCardsTable.id,
            titulo: kanbanCardsTable.titulo,
            comentarios_count: sql<number>`count(distinct ${kanbanComentariosTable.id})::int`,
            anexos_count: sql<number>`count(distinct ${kanbanAnexosTable.id})::int`,
        })
        .from(kanbanCardsTable)
        .leftJoin(usuariosTable, eq(kanbanCardsTable.responsavel_id, usuariosTable.id))
        .leftJoin(kanbanComentariosTable, eq(kanbanCardsTable.id, kanbanComentariosTable.card_id))
        .leftJoin(kanbanAnexosTable, eq(kanbanCardsTable.id, kanbanAnexosTable.card_id))
        .groupBy(kanbanCardsTable.id, usuariosTable.id)
        .orderBy(desc(kanbanCardsTable.created_at));
    console.log(data);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
