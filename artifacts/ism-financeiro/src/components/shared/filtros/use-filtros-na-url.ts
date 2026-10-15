import {useCallback, useMemo} from "react";
import {useLocation, useSearch} from "wouter";
import {
    chipsDosFiltros,
    contarFiltrosAtivos,
    lerValoresDaQuery,
    patchDosValores,
    removerFiltro,
    type DefinicaoFiltro,
    type ValoresFiltros,
} from "./filtros-core";

/** Parâmetro da página nas telas paginadas. Toda mudança de filtro o remove (volta à página 1). */
export const PARAM_PAGINA = "pagina";

type PatchUrl = Record<string, string | null | undefined>;

/**
 * Leitura e escrita de parâmetros soltos na query string (período, busca, aba, página).
 * Qualquer atualização volta para a página 1, salvo quando o próprio patch traz a página.
 */
export function useParametrosUrl() {
    const search = useSearch();
    const [location, navigate] = useLocation();
    const params = useMemo(() => new URLSearchParams(search), [search]);

    const atualizar = useCallback(
        (patch: PatchUrl) => {
            // Lê a URL do navegador (e não do render) para não perder patches seguidos no mesmo tick.
            const proximo = new URLSearchParams(window.location.search);
            for (const [chave, valor] of Object.entries(patch)) {
                if (valor === null || valor === undefined || valor === "") proximo.delete(chave);
                else proximo.set(chave, valor);
            }
            if (!(PARAM_PAGINA in patch)) proximo.delete(PARAM_PAGINA);
            const qs = proximo.toString();
            navigate(qs ? `${location}?${qs}` : location, {replace: true});
        },
        [location, navigate],
    );

    const ler = useCallback((chave: string) => params.get(chave) ?? "", [params]);

    const pagina = Math.max(1, Number.parseInt(params.get(PARAM_PAGINA) ?? "1", 10) || 1);
    const irParaPagina = useCallback(
        (p: number) => atualizar({[PARAM_PAGINA]: p > 1 ? String(p) : null}),
        [atualizar],
    );

    return {params, ler, atualizar, pagina, irParaPagina};
}

/**
 * Filtros do painel padronizado guardados na URL.
 * Devolve os valores aplicados (= params da API), a contagem e os chips.
 */
export function useFiltrosNaUrl(definicoes: DefinicaoFiltro[]) {
    const url = useParametrosUrl();
    const {params, atualizar} = url;

    const valores: ValoresFiltros = useMemo(
        () => lerValoresDaQuery(definicoes, params),
        // As definições mudam a cada render (opções vindas de queries); só as chaves importam aqui.
        [params, definicoes.map((d) => `${d.tipo}:${d.chave}`).join("|")],
    );

    const aplicar = useCallback(
        (novos: ValoresFiltros) => atualizar(patchDosValores(definicoes, novos)),
        [atualizar, definicoes],
    );

    const remover = useCallback(
        (chave: string) => atualizar(patchDosValores(definicoes, removerFiltro(definicoes, valores, chave))),
        [atualizar, definicoes, valores],
    );

    const limpar = useCallback(() => atualizar(patchDosValores(definicoes, {})), [atualizar, definicoes]);

    return {
        ...url,
        valores,
        aplicar,
        remover,
        limpar,
        contagem: contarFiltrosAtivos(definicoes, valores),
        chips: chipsDosFiltros(definicoes, valores),
    };
}

export type FiltrosNaUrl = ReturnType<typeof useFiltrosNaUrl>;
