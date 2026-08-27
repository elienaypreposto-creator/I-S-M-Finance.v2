import {createHash} from "crypto";
import {toCents} from "./money.js";

/** Normaliza descrição para hash estável entre recortes de extrato. */
export function normalizarDescricao(descricao: string | null | undefined): string {
    return (descricao ?? "")
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * hash_linha estável por conta (DEF-02).
 * Preferir FITID do banco como identificador_externo; hash cobre ausência/recorte.
 */
export function hashLinhaExtrato(args: {
    contaId: number;
    data: string;
    tipo: "credito" | "debito";
    valor: string | number;
    descricao: string | null | undefined;
    ordinalNoGrupo: number;
}): string {
    const valorCents = toCents(args.valor);
    const payload = [
        String(args.contaId),
        args.data,
        args.tipo,
        String(valorCents),
        normalizarDescricao(args.descricao),
        String(args.ordinalNoGrupo),
    ].join("|");
    return createHash("sha256").update(payload).digest("hex");
}

/**
 * Conta ordinal dentro do grupo (data, tipo, valor) - nunca o índice global do arquivo.
 */
export function ordinalNoGrupo(
    grupos: Map<string, number>,
    data: string,
    tipo: string,
    valor: string,
): number {
    const key = `${data}|${tipo}|${valor}`;
    const n = grupos.get(key) ?? 0;
    grupos.set(key, n + 1);
    return n;
}
