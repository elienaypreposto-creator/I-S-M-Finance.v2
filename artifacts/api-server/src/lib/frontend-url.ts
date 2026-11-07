/**
 * FRONTEND_URL é o endereço do front. A API monta com ela os links que manda
 * por e-mail (primeiro acesso de usuário novo e redefinição de senha) e a põe
 * na allowlist de CORS. Sem ela essas rotas respondem 500 genérico ao cliente;
 * o motivo vai só para o log da API, para quem opera o ambiente.
 */

type Env = Record<string, string | undefined>;

/** Valor configurado, ou null quando ausente/em branco. */
export function frontendUrlDefinida(env: Env = process.env): string | null {
    const valor = env.FRONTEND_URL?.trim();
    return valor ? valor : null;
}

/** Log da request recusada por falta de FRONTEND_URL (não vai para o cliente). */
export function logFrontendUrlAusente(operacao: string, requestId?: string): string {
    return (
        `[CONFIG] FRONTEND_URL não definida: ${operacao} recusada com 500 CONFIGURATION_ERROR. ` +
        "A API monta com ela o link enviado por e-mail. Defina FRONTEND_URL no ambiente da API " +
        "(ex.: https://financeiro.exemplo.com.br) e reinicie." +
        (requestId ? ` request_id=${requestId}` : "")
    );
}

/** Aviso do boot quando falta FRONTEND_URL (null quando está tudo certo). */
export function avisoBootFrontendUrl(env: Env = process.env): string | null {
    if (frontendUrlDefinida(env)) return null;
    return (
        "[boot] FRONTEND_URL não definida: criar usuário (POST /usuarios) e esqueci a senha " +
        "(POST /auth/forgot-password) vão responder 500 até ela ser definida no ambiente da API."
    );
}
