import {MutationCache, QueryCache, QueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {queryFamily, tenantQueryKey} from "@/lib/tenant-query";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
    queryCache: new QueryCache({
        onError: (error: unknown) => {
            const message = error instanceof Error ? error.message : "Erro na requisição.";
            if (message.toLowerCase().includes("sessão expirada")) return;
            toast.error(message);
        },
    }),
    mutationCache: new MutationCache({
        onError: (error: unknown) => {
            const message = error instanceof Error ? error.message : "Erro ao salvar.";
            if (message.toLowerCase().includes("sessão expirada")) return;
            toast.error(message);
        },
    }),
});

const QUERY_DEPENDENCIES: Record<string, string[]> = {
    lancamentos: ["dashboard", "relatorio", "conciliacoes-list"],
    "kanban-cards": ["dashboard"],
    "conciliacoes-list": ["dashboard", "lancamentos"],
    "plano-contas": ["dashboard", "relatorio", "lancamentos"],
    parceiros: ["lancamentos"],
    metas: ["dashboard"],
};

/**
 * Invalida a família `key` (já prefixada com empresaId) e dependentes por prefixo.
 */
export function invalidateRelated(qc: QueryClient, key: string) {
    void qc.invalidateQueries({queryKey: tenantQueryKey(key)});

    const prefixes = QUERY_DEPENDENCIES[key] ?? [];
    if (prefixes.length === 0) return;

    void qc.invalidateQueries({
        predicate: (query) => {
            const family = queryFamily(query.queryKey);
            if (!family) return false;
            return prefixes.some((prefix) => family.startsWith(prefix));
        },
    });
}
