/**
 * Token Service — emissão e verificação de tokens JWT.
 *
 * Access Token  → JWE (dir / A256GCM, 15 min): payload criptografado com
 *   permissions[] embutidas, permitindo autorização stateless sem I/O de banco.
 *
 * Refresh Token → JWS (HS256, 7 dias): payload mínimo { sub, email }.
 *   Permissões são re-consultadas no banco a cada /auth/refresh para garantir
 *   frescor quando há alterações de papel após a emissão do token.
 *
 * Purpose Tokens → JWS (HS256, 1 h): tokens de uso único para fluxos de
 *   configuração de senha (setup) e recuperação (reset). O audience encoda o
 *   propósito para prevenir reutilização cross-flow.
 */

import {EncryptJWT, jwtDecrypt, SignJWT, jwtVerify} from "jose";
import crypto from "crypto";

export const ACCESS_TOKEN_TTL = 15 * 60;
export const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;
export const PURPOSE_TOKEN_TTL = 60 * 60; // 1 h — setup e reset de senha

/**
 * Deriva 256 bits a partir de uma string via SHA-256.
 * Normaliza qualquer valor de env para uma chave AES-256 válida.
 */
const deriveKey = (secret: string): Uint8Array =>
    crypto.createHash("sha256").update(secret, "utf8").digest();

const getEncryptKey = (): Uint8Array => {
    const raw = process.env.JWT_ENCRYPT_SECRET ?? process.env.JWT_SECRET;
    if (!raw) throw new Error("JWT_ENCRYPT_SECRET (ou JWT_SECRET) não configurado.");
    return deriveKey(raw);
};

const getRefreshKey = (): Uint8Array => {
    const raw = process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET;
    if (!raw) throw new Error("JWT_REFRESH_SECRET (ou JWT_SECRET) não configurado.");
    // Prefixo garante separação de domínio de chave quando JWT_SECRET é reutilizado
    return deriveKey(`refresh:${raw}`);
};

const getPurposeKey = (): Uint8Array => {
    const raw = process.env.JWT_SECRET;
    if (!raw) throw new Error("JWT_SECRET não configurado.");
    return deriveKey(`purpose:${raw}`);
};

/** Payload do Access Token JWE — carrega permissões para autorização stateless. */
export interface AccessTokenPayload {
    sub: string;
    email: string;
    permissions: string[];
}

/**
 * Emite um Access Token JWE com permissões embutidas no payload criptografado.
 * O conteúdo é opaco para intermediários — apenas o servidor pode descriptografar.
 */
export const signAccessToken = async (payload: AccessTokenPayload): Promise<string> =>
    new EncryptJWT({
        sub: payload.sub,
        email: payload.email,
        permissions: payload.permissions,
    })
        .setProtectedHeader({alg: "dir", enc: "A256GCM"})
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
        .setIssuer("ism-finance")
        .setAudience("ism-finance-api")
        .encrypt(getEncryptKey());

/** Descriptografa e valida um Access Token JWE. O(1) — zero I/O de banco. */
export const verifyAccessToken = async (token: string): Promise<AccessTokenPayload> => {
    const {payload} = await jwtDecrypt(token, getEncryptKey(), {
        issuer: "ism-finance",
        audience: "ism-finance-api",
    });

    const sub = payload.sub as string | undefined;
    const email = payload.email as string | undefined;
    const permissions = payload.permissions as unknown;

    if (!sub || !email) throw new Error("Payload do token inválido: sub ou email ausente.");

    const safePermissions = Array.isArray(permissions)
        ? (permissions as unknown[]).filter((p): p is string => typeof p === "string")
        : [];

    return {sub, email, permissions: safePermissions};
};

/** Payload mínimo do Refresh Token JWS — sem permissões por design. */
export interface RefreshTokenPayload {
    sub: string;
    email: string;
}

/**
 * Emite um Refresh Token JWS (HS256).
 * Retorna o token, seu hash SHA-256 para persistência no banco, e a data de expiração.
 */
export const signRefreshToken = async (
    payload: RefreshTokenPayload,
): Promise<{ token: string; tokenHash: string; expiresAt: Date }> => {
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);

    const token = await new SignJWT({sub: payload.sub, email: payload.email})
        .setProtectedHeader({alg: "HS256"})
        .setIssuedAt()
        .setExpirationTime(`${REFRESH_TOKEN_TTL}s`)
        .setIssuer("ism-finance")
        .setAudience("ism-finance-refresh")
        .setJti(crypto.randomUUID())
        .sign(getRefreshKey());

    const tokenHash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
    return {token, tokenHash, expiresAt};
};

/** Verifica um Refresh Token JWS. Lança exceção se inválido ou expirado. */
export const verifyRefreshToken = async (token: string): Promise<RefreshTokenPayload> => {
    const {payload} = await jwtVerify(token, getRefreshKey(), {
        issuer: "ism-finance",
        audience: "ism-finance-refresh",
    });

    const sub = payload.sub as string | undefined;
    const email = payload.email as string | undefined;

    if (!sub || !email) throw new Error("Payload do refresh token inválido.");
    return {sub, email};
};

export type TokenPurpose = "password_setup" | "password_reset";

export interface PurposeTokenPayload {
    sub: string;
    email: string;
    purpose: TokenPurpose;
}

/**
 * Emite um Purpose Token JWS de uso único (1 h) para fluxos de setup ou reset de senha.
 * O purpose é codificado no audience para prevenir reutilização cross-flow.
 */
export const signPurposeToken = async (payload: PurposeTokenPayload): Promise<string> =>
    new SignJWT({sub: payload.sub, email: payload.email, purpose: payload.purpose})
        .setProtectedHeader({alg: "HS256"})
        .setIssuedAt()
        .setExpirationTime(`${PURPOSE_TOKEN_TTL}s`)
        .setIssuer("ism-finance")
        .setAudience(`ism-finance-${payload.purpose}`)
        .sign(getPurposeKey());

/**
 * Verifica um Purpose Token JWS.
 * Rejeita tokens com purpose diferente do esperado — previne reutilização cross-flow.
 */
export const verifyPurposeToken = async (
    token: string,
    purpose: TokenPurpose,
): Promise<PurposeTokenPayload> => {
    const {payload} = await jwtVerify(token, getPurposeKey(), {
        issuer: "ism-finance",
        audience: `ism-finance-${purpose}`,
    });

    const sub = payload.sub as string | undefined;
    const email = payload.email as string | undefined;
    const claimedPurpose = payload.purpose as string | undefined;

    if (!sub || !email || claimedPurpose !== purpose) {
        throw new Error("Token inválido ou propósito incorreto.");
    }

    return {sub, email, purpose};
};

/** SHA-256 de senhas legadas — usado exclusivamente para migração transparente no login. */
export const sha256Hash = (value: string): string =>
    crypto.createHash("sha256").update(value, "utf8").digest("hex");

/** SHA-256 de um token opaco — usado para armazenar e comparar refresh tokens no banco. */
export const hashToken = (token: string): string =>
    crypto.createHash("sha256").update(token, "utf8").digest("hex");

/**
 * Gera um OTP alfanumérico de 8 caracteres usando crypto.randomBytes.
 * Exclui caracteres visualmente ambíguos (0/O, 1/I/l) para melhor usabilidade.
 */
export const generateOtp = (length = 8): string => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.randomBytes(length);
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};
