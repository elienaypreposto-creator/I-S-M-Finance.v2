import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from "react";
import {useAuth} from "@/hooks/use-auth";
import {lerPreferencias} from "@/lib/preferencias-usuario";

type SaldosVisiveis = {
    visivel: boolean;
    alternar: () => void;
    texto: (valor: string) => string;
};

const Ctx = createContext<SaldosVisiveis | null>(null);

/**
 * O padrão vem da preferência "Ocultar saldos" (ligada até o usuário desligar).
 * O botão da tela só revela ou esconde nesta visita; não grava no navegador.
 */
export function SaldosVisiveisProvider({children}: { children: ReactNode }) {
    const {user} = useAuth();
    const [versao, setVersao] = useState(0);

    useEffect(() => {
        const atualizar = () => setVersao((v) => v + 1);
        window.addEventListener("ism-preferencias", atualizar);
        window.addEventListener("storage", atualizar);
        return () => {
            window.removeEventListener("ism-preferencias", atualizar);
            window.removeEventListener("storage", atualizar);
        };
    }, []);

    const ocultarSaldos = useMemo(() => lerPreferencias(user?.id).ocultarSaldos, [user?.id, versao]);
    const [visivel, setVisivel] = useState(!ocultarSaldos);

    useEffect(() => {
        setVisivel(!ocultarSaldos);
    }, [ocultarSaldos, user?.id]);

    const alternar = useCallback(() => setVisivel((v) => !v), []);
    const value = useMemo<SaldosVisiveis>(
        () => ({
            visivel,
            alternar,
            texto: (valor) => (visivel ? valor : "••••••"),
        }),
        [visivel, alternar],
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSaldosVisiveis(): SaldosVisiveis {
    const ctx = useContext(Ctx);
    if (!ctx) {
        return {visivel: false, alternar: () => undefined, texto: () => "••••••"};
    }
    return ctx;
}
