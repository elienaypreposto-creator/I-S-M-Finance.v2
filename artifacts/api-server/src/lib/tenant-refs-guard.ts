/**
 * Guard de referências entre tabelas: toda FK recebida do cliente (conta_id, parceiro_id, ...)
 * tem de apontar para uma linha da MESMA empresa da sessão.
 *
 * As FKs do Postgres só garantem que o id existe, não de qual empresa ele é. Sem este guard,
 * um usuário da empresa A grava `conta_id` de B num lançamento seu: o dado de B não vaza na
 * leitura (RLS), mas o vínculo entre empresas fica gravado e passa a bloquear a exclusão do
 * registro de B por FK. O teste test/isolation ("integridade referencial entre empresas")
 * varre todas as FKs do catálogo e acusa qualquer ocorrência.
 */

import {eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {
    centrosCustosTable,
    contasBancariasTable,
    departamentosTable,
    parceirosTable,
    planoContasTable,
} from "@workspace/db/schema";
import {AppError} from "../utils/app-error";
import {tenantWhere} from "./tenant-scope";

type TabelaComId = { id: unknown; empresa_id: unknown };

const REFERENCIAS = {
    conta_id: contasBancariasTable,
    parceiro_id: parceirosTable,
    plano_conta_id: planoContasTable,
    departamento_id: departamentosTable,
    centro_custo_id: centrosCustosTable,
} as const satisfies Record<string, TabelaComId>;

export type CampoReferencia = keyof typeof REFERENCIAS;

export async function assertRefsDaEmpresa(
    empresaId: number,
    refs: Partial<Record<CampoReferencia, number | null | undefined>>,
): Promise<void> {
    for (const campo of Object.keys(refs) as CampoReferencia[]) {
        const valor = refs[campo];
        if (valor === null || valor === undefined) continue;

        const tabela = REFERENCIAS[campo];
        const [achado] = await db
            .select({id: tabela.id})
            .from(tabela as typeof contasBancariasTable)
            .where(tenantWhere(tabela, empresaId, eq(tabela.id as typeof contasBancariasTable.id, valor)))
            .limit(1);

        if (!achado) {
            throw new AppError(422, "REFERENCIA_INVALIDA", `${campo} não pertence à empresa da sessão.`);
        }
    }
}