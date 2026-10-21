import {useCallback, useEffect, useMemo, useState} from "react";
import {chaveContasOcultas, gravarContasOcultas, lerContasOcultas} from "@/lib/saldo-geral";

function armazenamento(): Storage | null {
    try {
        return typeof window === "undefined" ? null : window.localStorage;
    } catch {
        return null; // acessar localStorage pode lançar (bloqueado, janela privada)
    }
}

type Estado = { chave: string | null; ids: number[] };

function carregar(chave: string | null): Estado {
    return {chave, ids: chave ? lerContasOcultas(armazenamento(), chave) : []};
}

/**
 * Contas tiradas da soma do "Saldo geral". Só visualização e só neste navegador:
 * guarda apenas os ids no localStorage, por usuário e empresa. Sem usuário ou
 * empresa, ou se o storage falhar, vale só em memória (todas visíveis ao recarregar).
 * Como a lista é de ocultas, contas novas aparecem visíveis.
 */
export function useContasOcultas(usuarioId: number | null | undefined, empresaId: number | null | undefined) {
    const chave = usuarioId && empresaId ? chaveContasOcultas(usuarioId, empresaId) : null;
    const [estado, setEstado] = useState<Estado>(() => carregar(chave));

    // Trocou usuário/empresa: relê já neste render, sem mostrar a escolha do contexto anterior.
    let atual = estado;
    if (estado.chave !== chave) {
        atual = carregar(chave);
        setEstado(atual);
    }

    // Mesma escolha em outra aba do mesmo navegador.
    useEffect(() => {
        if (!chave) return;
        const aoMudar = (e: StorageEvent) => {
            if (e.key === chave || e.key === null) setEstado(carregar(chave));
        };
        window.addEventListener("storage", aoMudar);
        return () => window.removeEventListener("storage", aoMudar);
    }, [chave]);

    const aplicar = useCallback((proximo: (ids: number[]) => number[]) => {
        setEstado((anterior) => {
            const ids = proximo(anterior.ids);
            if (anterior.chave) gravarContasOcultas(armazenamento(), anterior.chave, ids);
            return {chave: anterior.chave, ids};
        });
    }, []);

    const alternar = useCallback(
        (id: number) => aplicar((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])),
        [aplicar],
    );
    const mostrarTodas = useCallback(() => aplicar(() => []), [aplicar]);

    const ocultas = useMemo(() => new Set(atual.ids), [atual.ids]);
    return {ocultas, alternar, mostrarTodas};
}