import {randomBytes} from "node:crypto";

const TTL_MS = 10 * 60 * 1000;

export type DesafioEliminacao = {
    token: string;
    empresaId: number;
    razaoSocial: string;
    expiraEm: number;
};

export type ResultadoDesafio =
    | {ok: true}
    | {ok: false; code: "DESAFIO_AUSENTE" | "DESAFIO_EXPIRADO" | "CONFIRMACAO_DIVERGENTE" | "EMPRESA_DIVERGENTE"};

const store = new Map<string, DesafioEliminacao>();

export function resetDesafiosEliminacao(): void {
    store.clear();
}

/** Um desafio ativo por empresa. A confirmação é a razão social exata, não um segundo clique. */
export function emitirDesafio(empresaId: number, razaoSocial: string, agora = Date.now()): DesafioEliminacao {
    for (const [token, item] of store) {
        if (item.empresaId === empresaId || item.expiraEm <= agora) {
            store.delete(token);
        }
    }

    const item: DesafioEliminacao = {
        token: randomBytes(24).toString("base64url"),
        empresaId,
        razaoSocial,
        expiraEm: agora + TTL_MS,
    };
    store.set(item.token, item);
    return item;
}

/**
 * Confirma e consome o desafio. Erro de digitação da razão social não consome:
 * o operador pode repetir dentro do prazo. Empresa trocada também não consome.
 */
export function consumirDesafio(
    token: string,
    empresaId: number,
    confirmacao: string,
    agora = Date.now(),
): ResultadoDesafio {
    const item = store.get(token);
    if (!item) return {ok: false, code: "DESAFIO_AUSENTE"};
    if (item.expiraEm <= agora) {
        store.delete(token);
        return {ok: false, code: "DESAFIO_EXPIRADO"};
    }
    if (item.empresaId !== empresaId) return {ok: false, code: "EMPRESA_DIVERGENTE"};
    if (confirmacao !== item.razaoSocial) return {ok: false, code: "CONFIRMACAO_DIVERGENTE"};
    store.delete(token);
    return {ok: true};
}
