/**
 * Rotas de Usuários
 *
 * GET    /usuarios                — Lista paginada
 * POST   /usuarios                — Cria utilizador + envia OTP por e-mail
 * PUT    /usuarios/:id            — Atualização
 * GET    /usuarios/:id/permissoes — Leitura de permissões
 * PUT    /usuarios/:id/permissoes — Substituição de permissões
 *
 * Validações no POST /usuarios:
 *   - Parceiro com flag "Cliente" ou "Fornecedor" ativa → 422 com mensagem clara
 *   - Parceiro já vinculado a um usuário → 422 com mensagem clara
 *   - Perfil base obrigatório → validado no schema Zod
 */

import {Router} from "express";
import {z} from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {and, count, eq, ilike} from "drizzle-orm";
import {db} from "@workspace/db";
import {parceirosTable, permissoesTable, usuariosTable} from "@workspace/db/schema";
import {sendWelcomeEmail} from "../services/email.service";
import {revokeAllTokensForUser} from "../services/session.service";
import {generateOtp} from "../services/token.service";
import {errorResponse, successResponse} from "../utils/response";
import {withPermission} from "../middlewares/withPermission";
import {validateBody} from "../middlewares/validate";

// ---------------------
// Schemas de validação
// ---------------------

const createUsuarioBodySchema = z.object({
    nome: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres."),
    email: z.string().trim().email("E-mail inválido.").toLowerCase(),
    // [ALTERADO] perfil_base agora é obrigatório
    perfil_base: z.string().trim().min(1, "Perfil base é obrigatório."),
    cargo: z.string().trim().min(1).optional(),
    telefone: z.string().trim().min(1).optional(),
    celular: z.string().trim().min(1).optional(),
});

const updateUsuarioBodySchema = z.object({
    nome: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").optional(),
    cargo: z.string().trim().min(1).optional(),
    perfil_base: z.string().trim().min(1).optional(),
    telefone: z.string().trim().min(1).optional(),
    celular: z.string().trim().min(1).optional(),
    bloqueado: z.boolean().optional(),
    senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").optional(),
});

const updatePermissoesBodySchema = z.object({
    permissoes: z.array(z.string().trim().min(1)).default([]),
});

type CreateUsuarioBody = z.infer<typeof createUsuarioBodySchema>;
type UpdateUsuarioBody = z.infer<typeof updateUsuarioBodySchema>;
type UpdatePermissoesBody = z.infer<typeof updatePermissoesBodySchema>;

const BCRYPT_SALT_ROUNDS = 12;

// Flags que impedem o cadastro de um parceiro como usuário
const FLAGS_BLOQUEADAS = ["Cliente", "Fornecedor"];

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
    validateBody(createUsuarioBodySchema),
    async (req, res) => {
        try {
            const {nome, email, cargo, perfil_base, telefone, celular} = req.body as CreateUsuarioBody;

            // ── Validação: parceiro já tem usuário cadastrado ─────────────────────────
            const [usuarioExistente] = await db
                .select({ id: usuariosTable.id })
                .from(usuariosTable)
                .where(ilike(usuariosTable.nome, nome.trim()))
                .limit(1);

            if (usuarioExistente) {
                return errorResponse(
                    res,
                    422,
                    "PARCEIRO_JA_CADASTRADO",
                    "Este parceiro já possui um usuário cadastrado no sistema.",
                );
            }

            // ── Validação: parceiro com flag Cliente ou Fornecedor ativa ──────────────
            const [parceiro] = await db
                .select({ id: parceirosTable.id, tipos: parceirosTable.tipos })
                .from(parceirosTable)
                .where(ilike(parceirosTable.nome, nome.trim()))
                .limit(1);

            if (parceiro) {
                const tipos = (parceiro.tipos ?? []) as string[];
                const flagsAtivas = tipos.filter((t) => FLAGS_BLOQUEADAS.includes(t));
                if (flagsAtivas.length > 0) {
                    return errorResponse(
                        res,
                        422,
                        "PARCEIRO_FLAG_BLOQUEADA",
                        `Usuário não pode ser cadastrado, pois a flag ${flagsAtivas.map((f) => `"${f}"`).join(" e ")} está habilitada. Desabilite essa flag para prosseguir.`,
                    );
                }
            }
            // ─────────────────────────────────────────────────────────────────────────

            const otp = generateOtp();
            const otpHash = await bcrypt.hash(otp, BCRYPT_SALT_ROUNDS);

            const placeholderHash = await bcrypt.hash(
                crypto.randomBytes(32).toString("hex"),
                BCRYPT_SALT_ROUNDS,
            );

            const novoUsuario = await db.transaction(async (tx) => {
                const [user] = await tx
                    .insert(usuariosTable)
                    .values({
                        nome,
                        email,
                        cargo,
                        perfil_base,
                        telefone,
                        celular,
                        senha_hash: placeholderHash,
                        senha_unica_hash: otpHash,
                        senha_unica_utilizada: false,
                        bloqueado: false,
                    })
                    .returning(USUARIO_PUBLIC_COLS);
                return user;
            });

            try {
                const originUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
                await sendWelcomeEmail(email, nome, otp, originUrl);
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
    validateBody(updateUsuarioBodySchema),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "ID de usuário inválido.");
            }

            const {nome, cargo, perfil_base, telefone, celular, bloqueado, senha} = req.body as UpdateUsuarioBody;

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
                updateData.senha_hash = await bcrypt.hash(senha, BCRYPT_SALT_ROUNDS);
            }

            const [item] = await db
                .update(usuariosTable)
                .set(updateData)
                .where(eq(usuariosTable.id, id))
                .returning(USUARIO_PUBLIC_COLS);

            if (!item) return errorResponse(res, 404, "NOT_FOUND", "Utilizador não encontrado.");

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
    validateBody(updatePermissoesBodySchema),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "ID de usuário inválido.");
            }

            const {permissoes} = req.body as UpdatePermissoesBody;

            await db.transaction(async (tx) => {
                await tx.delete(permissoesTable).where(eq(permissoesTable.usuario_id, id));

                if (permissoes.length > 0) {
                    await tx.insert(permissoesTable).values(
                        permissoes.map((p) => ({usuario_id: id, codigo_permissao: p})),
                    );
                }
            });

            return successResponse(res, permissoes);
        } catch (e: unknown) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar permissões.", String(e));
        }
    },
);

export default router;