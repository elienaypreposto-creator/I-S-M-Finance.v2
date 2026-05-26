/**
 * Rotas de Usuários
 *
 * GET    /usuarios                — Lista paginada
 * POST   /usuarios                — Cria utilizador + envia OTP por e-mail
 * PUT    /usuarios/:id            — Atualização
 * GET    /usuarios/:id/permissoes — Leitura de permissões
 * PUT    /usuarios/:id/permissoes — Substituição de permissões
 *
 * Fluxo de onboarding:
 *   1. Admin cria utilizador (sem senha) → OTP enviado por e-mail.
 *   2. Utilizador chama POST /auth/verify-otp → recebe setupToken.
 *   3. Utilizador chama POST /auth/setup-password → define senha permanente.
 *
 * Segurança:
 *   - senha_hash e campos OTP nunca retornados nas respostas.
 *   - Todos os campos extraídos explicitamente do body (anti-mass assignment).
 *   - Criação atómica: se o envio de e-mail falhar, o hash OTP é revertido.
 *   - Edição: sessões revogadas imediatamente quando a conta é bloqueada
 *     ou quando o admin define uma nova senha.
 */

import {Router} from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {and, count, eq, ilike} from "drizzle-orm";
import {db} from "@workspace/db";
import {permissoesTable, usuariosTable} from "@workspace/db/schema";
import {sendWelcomeEmail} from "../services/email.service";
import {revokeAllTokensForUser} from "../services/session.service";
import {generateOtp} from "../services/token.service";
import {errorResponse, successResponse} from "../utils/response";
import {withPermission} from "../middlewares/withPermission";

const BCRYPT_SALT_ROUNDS = 12;

/** Projeção pública reutilizada. */
const USUARIO_PUBLIC_COLS = {
    id: usuariosTable.id,
    nome: usuariosTable.nome,
    email: usuariosTable.email,
    cargo: usuariosTable.cargo,
    perfil_base: usuariosTable.perfil_base,
    telefone: usuariosTable.telefone,
    celular: usuariosTable.celular,
    bloqueado: usuariosTable.bloqueado,
    ultimo_acesso: usuariosTable.ultimo_acesso,
    created_at: usuariosTable.created_at,
} as const;

const router = Router();

router.get(
    "/usuarios",
    withPermission("admin:usuarios:listar"),
    async (req, res) => {
        try {
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
            const offset = (page - 1) * limit;

            const conditions = [];
            if (typeof req.query.search === "string" && req.query.search.trim()) {
                conditions.push(ilike(usuariosTable.nome, `%${req.query.search.trim()}%`));
            }

            const where = conditions.length > 0 ? and(...conditions) : undefined;

            const [totalResult] = await db.select({count: count()}).from(usuariosTable).where(where);
            const items = await db
                .select(USUARIO_PUBLIC_COLS)
                .from(usuariosTable)
                .where(where)
                .limit(limit)
                .offset(offset)
                .orderBy(usuariosTable.nome);

            return successResponse(res, items, {total: totalResult.count, page, limit});
        } catch (e: unknown) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar usuários.", String(e));
        }
    },
);

router.post(
    "/usuarios",
    withPermission("admin:usuarios:criar"),
    async (req, res) => {
        try {
            // Extracção explícita — anti-mass assignment; senha nunca é aceita no body
            const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : null;
            const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;
            const cargo = typeof req.body?.cargo === "string" ? req.body.cargo.trim() : null;
            const perfil_base = typeof req.body?.perfil_base === "string" ? req.body.perfil_base.trim() : null;
            const telefone = typeof req.body?.telefone === "string" ? req.body.telefone.trim() : null;
            const celular = typeof req.body?.celular === "string" ? req.body.celular.trim() : null;

            if (!nome || !email) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "Campos obrigatórios: nome e email.");
            }

            const otp = generateOtp();
            const otpHash = await bcrypt.hash(otp, BCRYPT_SALT_ROUNDS);

            // Placeholder bcrypt indevassável — substituído quando o utilizador chama /auth/setup-password
            const placeholderHash = await bcrypt.hash(
                crypto.randomBytes(32).toString("hex"),
                BCRYPT_SALT_ROUNDS,
            );

            // Transacção: garante que user + OTP hash são criados atomicamente
            const novoUsuario = await db.transaction(async (tx) => {
                const [user] = await tx
                    .insert(usuariosTable)
                    .values({
                        nome,
                        email,
                        cargo: cargo ?? undefined,
                        perfil_base: perfil_base ?? undefined,
                        telefone: telefone ?? undefined,
                        celular: celular ?? undefined,
                        senha_hash: placeholderHash,
                        senha_unica_hash: otpHash,
                        senha_unica_utilizada: false,
                        bloqueado: false,
                    })
                    .returning(USUARIO_PUBLIC_COLS);

                return user;
            });

            // E-mail fora da transacção DB - se falhar, reverte o OTP para forçar retry
            try {
                await sendWelcomeEmail(email, otp);
            } catch (emailErr) {
                await db
                    .update(usuariosTable)
                    .set({senha_unica_hash: null})
                    .where(eq(usuariosTable.id, novoUsuario.id));

                console.error("Falha ao enviar e-mail de boas-vindas:", emailErr);
                return errorResponse(
                    res,
                    503,
                    "EMAIL_ERROR",
                    "Utilizador criado, mas o e-mail de boas-vindas falhou. Tente reenviar o OTP.",
                );
            }

            return successResponse(res, novoUsuario, {message: "OTP enviado para o e-mail."}, 201);
        } catch (e: unknown) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao criar usuário.", String(e));
        }
    },
);

router.put(
    "/usuarios/:id",
    withPermission("admin:usuarios:editar"),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "ID de usuário inválido.");
            }

            // email e id são imutáveis via esta rota
            const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : undefined;
            const cargo = typeof req.body?.cargo === "string" ? req.body.cargo.trim() : undefined;
            const perfil_base = typeof req.body?.perfil_base === "string" ? req.body.perfil_base.trim() : undefined;
            const telefone = typeof req.body?.telefone === "string" ? req.body.telefone.trim() : undefined;
            const celular = typeof req.body?.celular === "string" ? req.body.celular.trim() : undefined;
            const bloqueado = typeof req.body?.bloqueado === "boolean" ? req.body.bloqueado : undefined;
            const senha = typeof req.body?.senha === "string" ? req.body.senha : undefined;

            type UsuarioUpdate = {
                updated_at: Date;
                nome?: string;
                cargo?: string;
                perfil_base?: string;
                telefone?: string;
                celular?: string;
                bloqueado?: boolean;
                senha_hash?: string;
            };

            const updateData: UsuarioUpdate = {updated_at: new Date()};
            if (nome !== undefined) updateData.nome = nome;
            if (cargo !== undefined) updateData.cargo = cargo;
            if (perfil_base !== undefined) updateData.perfil_base = perfil_base;
            if (telefone !== undefined) updateData.telefone = telefone;
            if (celular !== undefined) updateData.celular = celular;
            if (bloqueado !== undefined) updateData.bloqueado = bloqueado;

            if (senha !== undefined) {
                if (senha.length < 8) {
                    return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve ter pelo menos 8 caracteres.");
                }
                updateData.senha_hash = await bcrypt.hash(senha, BCRYPT_SALT_ROUNDS);
            }

            const [item] = await db
                .update(usuariosTable)
                .set(updateData)
                .where(eq(usuariosTable.id, id))
                .returning(USUARIO_PUBLIC_COLS);

            if (!item) return errorResponse(res, 404, "NOT_FOUND", "Utilizador não encontrado.");

            // Revogação imediata de sessões:
            // - Bloqueio de conta: utilizador não pode continuar com tokens existentes.
            // - Troca de senha: tokens emitidos com a senha anterior devem ser invalidados.
            if (bloqueado === true || senha !== undefined) {
                await revokeAllTokensForUser(id);
            }

            return successResponse(res, item);
        } catch (e: unknown) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar usuário.", String(e));
        }
    },
);

router.get(
    "/usuarios/:id/permissoes",
    withPermission("admin:usuarios:listar"),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "ID de usuário inválido.");
            }

            const items = await db
                .select({permissao: permissoesTable.codigo_permissao})
                .from(permissoesTable)
                .where(eq(permissoesTable.usuario_id, id));

            return successResponse(res, items.map((i) => i.permissao));
        } catch (e: unknown) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar permissões.", String(e));
        }
    },
);

router.put(
    "/usuarios/:id/permissoes",
    withPermission("admin:usuarios:editar"),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "ID de usuário inválido.");
            }

            const rawPermissoes = req.body?.permissoes;
            if (!Array.isArray(rawPermissoes)) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "permissoes deve ser um array de strings.");
            }

            const permissoes = rawPermissoes.filter(
                (p): p is string => typeof p === "string" && p.trim().length > 0,
            );

            await db.delete(permissoesTable).where(eq(permissoesTable.usuario_id, id));

            if (permissoes.length > 0) {
                await db.insert(permissoesTable).values(
                    permissoes.map((p) => ({usuario_id: id, codigo_permissao: p})),
                );
            }

            return successResponse(res, permissoes);
        } catch (e: unknown) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar permissões.", String(e));
        }
    },
);

export default router;
