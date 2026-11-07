/**
 * Permissão que abre cada tela. Fonte única para o menu lateral e para as
 * rotas (App.tsx): o item some do menu e a URL digitada mostra "Acesso negado"
 * em vez de abrir a tela e tomar 403 da API.
 *
 * Telas sem entrada aqui abrem para qualquer usuário com vínculo na empresa:
 * Home, Departamentos e Filiais (não há permissão de consulta no catálogo; a
 * API lista sem exigir permissão). Empresas tem regra própria (App.tsx).
 *
 * Cadastros usam a permissão de consulta da tela de permissões. A API de
 * listagem desses cadastros não a exige (os combos de outras telas a usam),
 * então aqui é só a porta da tela, não uma trava de dados.
 */
import {PERM} from "./permissoes.ts";

export const PERMISSAO_TELA = {
    "/kanban": PERM.KANBAN_LISTAR,
    "/lancamentos": PERM.LANCAMENTOS_LISTAR,
    "/conciliacao": PERM.CONCILIACAO_ACESSAR,

    "/cadastros/parceiros": PERM.PARCEIROS_LISTAR,
    "/cadastros/contas-bancarias": PERM.CONTAS_BANCARIAS_LISTAR,
    "/cadastros/plano-contas": PERM.PLANO_CONTAS_LISTAR,
    "/cadastros/metas": PERM.METAS_LISTAR,

    "/relatorios/fechamento-mensal": PERM.RELATORIOS_FECHAMENTO,
    "/relatorios/contabil-fiscal": PERM.RELATORIOS_CONTABIL,
    "/relatorios/dre": PERM.RELATORIOS_DRE,
    "/relatorios/fluxo-caixa": PERM.RELATORIOS_FLUXO_CAIXA,
    "/relatorios/metas": PERM.RELATORIOS_METAS,

    "/configuracoes/usuarios": PERM.ADMIN_USUARIOS_LISTAR,
    "/configuracoes/tokens-api": PERM.ADMIN_TOKENS_API_LISTAR,
} as const satisfies Record<string, string>;

export type TelaComPermissao = keyof typeof PERMISSAO_TELA;

/** Permissão exigida pela tela (ou undefined quando qualquer usuário abre). */
export function permissaoDaTela(url: string): string | undefined {
    return (PERMISSAO_TELA as Record<string, string>)[url];
}

/** Tela liberada para quem tem as permissões dadas. */
export function telaLiberada(url: string, temPermissao: (codigo: string) => boolean): boolean {
    const permissao = permissaoDaTela(url);
    return !permissao || temPermissao(permissao);
}
