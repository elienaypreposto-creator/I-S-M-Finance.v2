/**
 * Entrada vinda do GovADM (Fase 1). A API valida o token do GovADM em
 * GET /api/auth/govadm e devolve o navegador para o front com 303:
 * - uma empresa: cookie de refresh gravado e redirecionamento para "/";
 * - várias empresas: /login#sso_selecao=<selectionToken> (no hash, para o
 *   token não ir para logs de servidor nem para o Referer);
 * - erro: /login?sso_erro=<codigo>.
 */

export const SSO_SELECAO_PARAM = "sso_selecao";
export const SSO_ERRO_PARAM = "sso_erro";

export const MENSAGENS_SSO_ERRO: Record<string, string> = {
    token_invalido: "Sua sessão do GovADM expirou ou é inválida. Entre de novo pelo GovADM.",
    indisponivel: "Não foi possível confirmar seu acesso no GovADM agora. Tente de novo em instantes.",
    sem_vinculo: "Seu usuário do GovADM ainda não está liberado no ISM Finance. Peça ao administrador para vincular seu acesso.",
    bloqueado: "Seu acesso ao ISM Finance está bloqueado. Fale com o administrador.",
    sem_empresa: "Seu usuário não tem empresa ativa no ISM Finance.",
    nao_permitido: "Este usuário não pode entrar pelo GovADM. Use o login do ISM Finance.",
};

export const MENSAGEM_SSO_ERRO_GENERICA =
    "Não foi possível entrar pelo GovADM. Tente de novo ou use o login do ISM Finance.";

/** Usada quando o selectionToken do hash não é mais aceito pela API. */
export const MENSAGEM_SSO_SELECAO_EXPIRADA =
    "Sua sessão do GovADM expirou. Entre de novo pelo GovADM.";

export function mensagemSsoErro(codigo: string): string {
    return Object.prototype.hasOwnProperty.call(MENSAGENS_SSO_ERRO, codigo)
        ? MENSAGENS_SSO_ERRO[codigo]!
        : MENSAGEM_SSO_ERRO_GENERICA;
}

/** Lê o selectionToken de "#sso_selecao=<token>" (null se ausente ou vazio). */
export function lerSelecaoDoHash(hash: string): string | null {
    const bruto = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!bruto) return null;
    const token = new URLSearchParams(bruto).get(SSO_SELECAO_PARAM)?.trim();
    return token ? token : null;
}

/** Lê o código de "?sso_erro=<codigo>" (null se ausente ou vazio). */
export function lerErroDaQuery(search: string): string | null {
    const codigo = new URLSearchParams(search).get(SSO_ERRO_PARAM)?.trim();
    return codigo ? codigo : null;
}

/**
 * URL relativa sem os parâmetros do SSO: tira o hash inteiro quando ele traz o
 * sso_selecao e remove só o sso_erro da query, preservando o resto.
 */
export function urlSemParametrosSso(pathname: string, search: string, hash: string): string {
    const params = new URLSearchParams(search);
    params.delete(SSO_ERRO_PARAM);
    const query = params.toString();
    const manterHash = hash && lerSelecaoDoHash(hash) === null && hash !== "#";
    return `${pathname}${query ? `?${query}` : ""}${manterHash ? hash : ""}`;
}
