/**
 * Inventário de rotas gerado a partir do router real (não de uma lista manual).
 *
 * Express 5 não guarda o prefixo de `router.use("/x", sub)` de forma reversível,
 * então registramos o prefixo interceptando `Router.use` ANTES de carregar o app.
 * Por isso `loadAppWithInventory()` deve ser a única forma de importar o app nos
 * testes de isolamento.
 *
 * "Autenticada" = registrada depois da camada `withAuth` do router raiz
 * (ver src/routes/index.ts). Rotas anteriores (healthz, /auth/*, /v1/*) ficam
 * fora porque têm barreira própria.
 */

import express, {type Express} from "express";

export type RouteEntry = {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    /** Caminho completo relativo a /api, ex.: "/lancamentos/:id". */
    path: string;
    /** Chave estável usada nos cenários: "GET /lancamentos/:id". */
    key: string;
};

type LayerLike = {
    handle: ((...args: unknown[]) => unknown) & { stack?: LayerLike[] };
    route?: { path: string; methods: Record<string, boolean>; stack: LayerLike[] };
};

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function joinPath(prefix: string, path: string): string {
    const joined = `${prefix}/${path}`.replace(/\/+/g, "/");
    return joined.length > 1 ? joined.replace(/\/$/, "") : joined;
}

/** Intercepta Router.use para lembrar o prefixo de cada sub-router montado. */
function installMountRecorder(): Map<unknown, string> {
    const mounts = new Map<unknown, string>();
    // Router() devolve uma função cujo protótipo é uma instância de Router;
    // o `use` real vive em Router.prototype, então subimos a cadeia até achá-lo.
    let cursor: object | null = Object.getPrototypeOf(express.Router());
    while (cursor && !Object.prototype.hasOwnProperty.call(cursor, "use")) {
        cursor = Object.getPrototypeOf(cursor);
    }
    if (!cursor) throw new Error("Router.prototype.use não encontrado: revise route-inventory.ts.");
    const proto = cursor as {
        use: (...args: unknown[]) => unknown;
        __ismPatched?: boolean;
    };
    if (proto.__ismPatched) {
        return (proto as unknown as { __ismMounts: Map<unknown, string> }).__ismMounts;
    }
    const original = proto.use;
    proto.use = function patchedUse(this: unknown, ...args: unknown[]) {
        const [first, ...rest] = args;
        if (typeof first === "string") {
            for (const handler of rest.flat()) {
                if (typeof handler === "function" && Array.isArray((handler as { stack?: unknown }).stack)) {
                    mounts.set(handler, first);
                }
            }
        }
        return original.apply(this, args);
    };
    proto.__ismPatched = true;
    (proto as unknown as { __ismMounts: Map<unknown, string> }).__ismMounts = mounts;
    return mounts;
}

function walk(stack: LayerLike[], prefix: string, mounts: Map<unknown, string>, out: RouteEntry[]): void {
    for (const layer of stack) {
        if (layer.route) {
            const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
            for (const p of paths) {
                for (const method of METHODS) {
                    if (!layer.route.methods[method.toLowerCase()]) continue;
                    const full = joinPath(prefix, p);
                    out.push({method, path: full, key: `${method} ${full}`});
                }
            }
        } else if (Array.isArray(layer.handle.stack)) {
            const sub = mounts.get(layer.handle) ?? "";
            walk(layer.handle.stack, joinPath(prefix, sub), mounts, out);
        }
    }
}

export async function loadAppWithInventory(): Promise<{ app: Express; authenticatedRoutes: RouteEntry[] }> {
    const mounts = installMountRecorder();

    const [{default: app}, {withAuth}, {default: apiRouter}] = await Promise.all([
        import("../../src/app"),
        import("../../src/middlewares/auth"),
        import("../../src/routes"),
    ]);

    const rootStack = (apiRouter as unknown as { stack: LayerLike[] }).stack;
    const authIdx = rootStack.findIndex((l) => l.handle === (withAuth as unknown));
    if (authIdx === -1) {
        throw new Error("withAuth não encontrado no router raiz: o inventário de rotas precisa ser revisto.");
    }

    const routes: RouteEntry[] = [];
    walk(rootStack.slice(authIdx + 1), "", mounts, routes);

    const seen = new Set<string>();
    const authenticatedRoutes = routes.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
    return {app, authenticatedRoutes};
}