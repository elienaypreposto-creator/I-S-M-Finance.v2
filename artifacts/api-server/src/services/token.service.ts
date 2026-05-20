/**
 * Token Service — emissão e verificação de tokens JWT.
 *
 * Access Token  → JWE (dir / A256GCM, 15 min): payload criptografado com
 *   permissions[] embutidas, permitindo autorização stateless sem query ao banco.
 *
 * Refresh Token → JWS (HS256, 7 dias): payload mínimo { sub, email }.
 *   Permissões são re-consultadas no banco a cada /auth/refresh para garantir
 */

import { EncryptJWT, jwtDecrypt, SignJWT, jwtVerify } from "jose";
import crypto from "crypto";

export const ACCESS_TOKEN_TTL  = 15 * 60;
export const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

/** Payload do Access Token JWE — carrega permissões para autorização stateless. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  permissions: string[];
}

/** Payload mínimo do Refresh Token JWS — sem permissões por design. */
export interface RefreshTokenPayload {
  sub: string;
  email: string;
}

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
  return deriveKey(`refresh:${raw}`);
};

/**
 * Emite um Access Token JWE com permissões embutidas no payload criptografado.
 * O conteúdo é opaco para intermediários — apenas o servidor pode descriptografar.
 */
export const signAccessToken = async (payload: AccessTokenPayload): Promise<string> =>
  new EncryptJWT({
    sub:         payload.sub,
    email:       payload.email,
    permissions: payload.permissions,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
    .setIssuer("ism-finance")
    .setAudience("ism-finance-api")
    .encrypt(getEncryptKey());

/** Descriptografa e valida um Access Token JWE. */
export const verifyAccessToken = async (token: string): Promise<AccessTokenPayload> => {
  const { payload } = await jwtDecrypt(token, getEncryptKey(), {
    issuer:   "ism-finance",
    audience: "ism-finance-api",
  });

  const sub         = payload.sub         as string | undefined;
  const email       = payload.email       as string | undefined;
  const permissions = payload.permissions as unknown;

  if (!sub || !email) {
    throw new Error("Payload do token inválido: sub ou email ausente.");
  }

  const safePermissions = Array.isArray(permissions)
    ? (permissions as unknown[]).filter((p): p is string => typeof p === "string")
    : [];

  return { sub, email, permissions: safePermissions };
};

/**
 * Emite um Refresh Token JWS (HS256).
 * Retorna o token, seu hash SHA-256 para persistência no banco, e a data de expiração.
 */
export const signRefreshToken = async (
  payload: RefreshTokenPayload,
): Promise<{ token: string; tokenHash: string; expiresAt: Date }> => {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);

  const token = await new SignJWT({ sub: payload.sub, email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL}s`)
    .setIssuer("ism-finance")
    .setAudience("ism-finance-refresh")
    .sign(getRefreshKey());

  const tokenHash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
  return { token, tokenHash, expiresAt };
};

/** Verifica um Refresh Token JWS. Lança exceção se inválido ou expirado. */
export const verifyRefreshToken = async (token: string): Promise<RefreshTokenPayload> => {
  const { payload } = await jwtVerify(token, getRefreshKey(), {
    issuer:   "ism-finance",
    audience: "ism-finance-refresh",
  });

  const sub   = payload.sub   as string | undefined;
  const email = payload.email as string | undefined;

  if (!sub || !email) throw new Error("Payload do refresh token inválido.");
  return { sub, email };
};

/** SHA-256 de senhas legadas — usado exclusivamente para migração transparente no login. */
export const sha256Hash = (value: string): string =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

/** SHA-256 de um token opaco — usado para armazenar e comparar refresh tokens no banco. */
export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token, "utf8").digest("hex");
