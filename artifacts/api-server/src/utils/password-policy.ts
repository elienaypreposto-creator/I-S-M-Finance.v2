/**
 * Política de senha (NIST SP 800-63B: comprimento > composição).
 *
 * - mínimo 12 caracteres, sem exigir maiúscula/número/símbolo
 * - máximo: 128 caracteres E 72 bytes UTF-8 (bcrypt ignora o que passar de 72 bytes;
 *   aceitar mais que isso seria prometer uma senha que o hash não protege)
 * - não pode conter o e-mail nem o nome do utilizador
 * - não pode constar em vazamentos conhecidos (HIBP, k-anonymity: só os 5 primeiros
 *   caracteres do SHA-1 saem do servidor, a senha nunca)
 *
 * Se a HIBP estiver fora do ar, a checagem é ignorada (fail-open) e o aviso vai pro log:
 * uma API de terceiros fora do ar não pode impedir ninguém de definir senha.
 *
 * Para desligar em dev/teste offline:
 * HIBP_DISABLED=true
 */

import crypto from "node:crypto";

/**
 * Marcador gravado em usuarios.senha_hash quando o hash SHA-256 legado
 * foi invalidado.
 */
export const SENHA_RESET_REQUIRED = "RESET_REQUIRED";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MAX_BYTES = 72; // limite real do bcrypt

export type PasswordPolicyCode =
    | "TOO_SHORT"
    | "TOO_LONG"
    | "CONTAINS_EMAIL"
    | "CONTAINS_NAME"
    | "PWNED";

export interface PasswordPolicyViolation {
    code: PasswordPolicyCode;
    message: string;
}

export interface PasswordPolicyContext {
    email?: string | null;
    nome?: string | null;
}

const MESSAGES: Record<PasswordPolicyCode, string> = {
    TOO_SHORT: `A senha é curta demais: use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    TOO_LONG: `A senha é longa demais: o máximo é ${PASSWORD_MAX_BYTES} bytes (acentos e emojis ocupam mais de 1).`,
    CONTAINS_EMAIL: "A senha não pode conter o seu e-mail.",
    CONTAINS_NAME: "A senha não pode conter o seu nome.",
    PWNED: "Esta senha já apareceu em vazamentos de dados. Escolha outra.",
};

const violation = (
    code: PasswordPolicyCode,
): PasswordPolicyViolation => ({
    code,
    message: MESSAGES[code],
});

/**
 * Normaliza:
 * - remove acentos
 * - converte para minúsculas
 *
 * Exemplo:
 * "João" -> "joao"
 */
const normalize = (value: string): string =>
    value
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase();

/**
 * Regras locais, sem acesso à rede.
 */
export function checkLocalRules(
    senha: string,
    ctx: PasswordPolicyContext = {},
): PasswordPolicyViolation | null {
    const length = [...senha].length;

    // Mínimo de caracteres
    if (length < PASSWORD_MIN_LENGTH) {
        return violation("TOO_SHORT");
    }

    // Máximo de caracteres e limite real do bcrypt em UTF-8
    if (
        length > PASSWORD_MAX_LENGTH ||
        Buffer.byteLength(senha, "utf8") > PASSWORD_MAX_BYTES
    ) {
        return violation("TOO_LONG");
    }

    const alvo = normalize(senha);

    /**
     * Verifica e-mail.
     */
    if (ctx.email) {
        const email = normalize(ctx.email.trim());
        const local = email.split("@")[0] ?? "";

        if (email && alvo.includes(email)) {
            return violation("CONTAINS_EMAIL");
        }

        // Também bloqueia somente a parte antes do @ quando tiver pelo menos 4 caracteres.
        if (local.length >= 4 && alvo.includes(local)) {
            return violation("CONTAINS_EMAIL");
        }
    }

    /**
     * Verifica nome.
     *
     * Exemplo:
     * "João Oliveira"
     *
     * Bloqueia:
     * - joao
     * - oliveira
     * - joaooliveira
     */
    if (ctx.nome) {
        const nome = normalize(ctx.nome.trim());

        const partes = nome
            .split(/[^\p{L}\p{N}]+/u)
            .filter((parte) => parte.length >= 4);

        const completo = nome.replace(/[^\p{L}\p{N}]+/gu, "");

        if (completo.length >= 4 && alvo.includes(completo)) {
            return violation("CONTAINS_NAME");
        }

        if (partes.some((parte) => alvo.includes(parte))) {
            return violation("CONTAINS_NAME");
        }
    }

    return null;
}

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const HIBP_TIMEOUT_MS = 3000;

/**
 * Retorno:
 *
 * true  = senha encontrada em vazamentos
 * false = senha não encontrada
 * null  = HIBP indisponível ou desabilitado
 *
 * Somente os primeiros 5 caracteres do SHA-1 são enviados ao HIBP.
 * A senha nunca é enviada.
 */
export async function isPasswordPwned(
    senha: string,
    fetchImpl: typeof fetch = fetch,
): Promise<boolean | null> {
    if (process.env.HIBP_DISABLED === "true") {
        return null;
    }

    const sha1 = crypto
        .createHash("sha1")
        .update(senha, "utf8")
        .digest("hex")
        .toUpperCase();

    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();

    const timer = setTimeout(() => {
        controller.abort();
    }, HIBP_TIMEOUT_MS);

    try {
        const response = await fetchImpl(
            `${HIBP_RANGE_URL}${prefix}`,
            {
                headers: {
                    "Add-Padding": "true",
                    "User-Agent": "ism-finance-password-check",
                },
                signal: controller.signal,
            },
        );

        if (!response.ok) {
            throw new Error(`HIBP respondeu ${response.status}`);
        }

        const body = await response.text();

        for (const line of body.split("\n")) {
            const [hashSuffix, count] = line.trim().split(":");

            // Add-Padding pode devolver linhas falsas com contagem 0.
            if (
                hashSuffix === suffix &&
                Number(count) > 0
            ) {
                return true;
            }
        }

        return false;
    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        console.warn(
            "[password-policy] HIBP indisponível, checagem de vazamento ignorada:",
            message,
        );

        // Fail-open:
        // se o HIBP estiver indisponível, não bloqueia a criação da senha.
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Valida todas as regras.
 *
 * Retorna:
 * - PasswordPolicyViolation quando a senha não atende à política
 * - null quando a senha é aceita
 */
export async function validatePasswordPolicy(
    senha: string,
    ctx: PasswordPolicyContext = {},
    fetchImpl: typeof fetch = fetch,
): Promise<PasswordPolicyViolation | null> {
    // Primeiro executa as regras locais.
    const local = checkLocalRules(senha, ctx);

    if (local) {
        return local;
    }

    // Depois verifica vazamentos conhecidos.
    const pwned = await isPasswordPwned(
        senha,
        fetchImpl,
    );

    if (pwned === true) {
        return violation("PWNED");
    }

    return null;
}