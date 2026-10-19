/**
 * Preferências do menu do usuário.
 * Só neste navegador, por usuário. Falha de storage não quebra a tela.
 */

export const PAGINAS_INICIAIS = [
    {rota: "/", rotulo: "Painel de Controle"},
    {rota: "/lancamentos", rotulo: "Lançamentos"},
    {rota: "/conciliacao", rotulo: "Conciliação"},
    {rota: "/cadastros/contas-bancarias", rotulo: "Contas Bancárias"},
] as const;

export type RotaInicial = (typeof PAGINAS_INICIAIS)[number]["rota"];

export interface PreferenciasUsuario {
    /** Ligado quando o usuário ainda não escolheu. */
    ocultarSaldos: boolean;
    paginaInicial: RotaInicial;
}

const PADRAO: PreferenciasUsuario = {ocultarSaldos: true, paginaInicial: "/"};

export function chavePreferencias(usuarioId: number): string {
    return `ism:preferencias:${usuarioId}`;
}

type Armazenamento = Pick<Storage, "getItem" | "setItem"> | null;

function rotaValida(valor: unknown): valor is RotaInicial {
    return PAGINAS_INICIAIS.some((p) => p.rota === valor);
}

export function lerPreferencias(usuarioId: number | null | undefined, armazenamento: Armazenamento = armazenamentoLocal()): PreferenciasUsuario {
    if (!usuarioId) return {...PADRAO};
    try {
        const bruto = armazenamento?.getItem(chavePreferencias(usuarioId));
        if (!bruto) return {...PADRAO};
        const json: unknown = JSON.parse(bruto);
        if (!json || typeof json !== "object") return {...PADRAO};
        const obj = json as { ocultarSaldos?: unknown; paginaInicial?: unknown };
        return {
            ocultarSaldos: typeof obj.ocultarSaldos === "boolean" ? obj.ocultarSaldos : true,
            paginaInicial: rotaValida(obj.paginaInicial) ? obj.paginaInicial : "/",
        };
    } catch {
        return {...PADRAO};
    }
}

export function gravarPreferencias(
    usuarioId: number,
    prefs: PreferenciasUsuario,
    armazenamento: Armazenamento = armazenamentoLocal(),
): boolean {
    try {
        if (!armazenamento) return false;
        const paginaInicial = rotaValida(prefs.paginaInicial) ? prefs.paginaInicial : "/";
        armazenamento.setItem(
            chavePreferencias(usuarioId),
            JSON.stringify({ocultarSaldos: prefs.ocultarSaldos, paginaInicial}),
        );
        return true;
    } catch {
        return false;
    }
}

export function paginaInicialDe(usuarioId: number | null | undefined, armazenamento?: Armazenamento): RotaInicial {
    return lerPreferencias(usuarioId, armazenamento).paginaInicial;
}

function armazenamentoLocal(): Armazenamento {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}
