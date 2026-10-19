/**
 * Conta do próprio usuário.
 *
 * GET   /me
 * PATCH /me                 nome, telefone, cargo
 * POST  /me/senha           política ISMF-27; derruba as outras sessões
 * GET   /me/sessoes
 * DELETE /me/sessoes/:id
 * DELETE /me/sessoes?outras=true
 */

import {Router} from "express";
import bcrypt from "bcryptjs";
import {and, eq, ne} from "drizzle-orm";
import {db} from "@workspace/db";
import {refreshTokensTable, usuariosTable} from "@workspace/db/schema";
import {lerFalhasRecentes} from "../lib/account-lockout";
import {authLimiter, chaveIp} from "../middlewares/rate-limit";
import {loginLockout} from "../services/login-lockout.service";
import {mascararIp, sessoes} from "../services/sessoes.service";
import {errorResponse, successResponse} from "../utils/response";
import {avaliarTrocaSenha, MSG_SENHA_RECUSADA, patchMeSchema, trocaSenhaSchema} from "./me-conta";

const BCRYPT_SALT_ROUNDS = 12;
const router = Router();

function revogarOutrosRefresh(usuarioId: number, hashAtual: string | null) {
    const filtro = hashAtual
        ? and(
            eq(refreshTokensTable.usuario_id, usuarioId),
            eq(refreshTokensTable.revogado, false),
            ne(refreshTokensTable.token_hash, hashAtual),
        )
        : and(eq(refreshTokensTable.usuario_id, usuarioId), eq(refreshTokensTable.revogado, false));
    return db.update(refreshTokensTable).set({revogado: true}).where(filtro);
}

router.get("/me", async (req, res) => {
    try {
        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                nome: usuariosTable.nome,
                email: usuariosTable.email,
                telefone: usuariosTable.telefone,
                cargo: usuariosTable.cargo,
                ultimo_acesso: usuariosTable.ultimo_acesso,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.id, req.user!.id))
            .limit(1);
        if (!usuario) {
            return errorResponse(res, 404, "NOT_FOUND", "Utilizador não encontrado.");
        }
        const ua = await sessoes.lerUa(usuario.id);
        return successResponse(res, {
            ...usuario,
            empresa_id: req.user!.empresaId,
            ultimo_acesso_dispositivo: ua,
        });
    } catch (error: unknown) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao obter o perfil.", error);
    }
});

router.patch("/me", async (req, res) => {
    const parsed = patchMeSchema.safeParse(req.body);
    if (!parsed.success) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "Dados inválidos. Só nome, telefone e cargo podem ser alterados.");
    }
    try {
        const {nome, telefone, cargo} = parsed.data;
        const [atual] = await db
            .select({
                nome: usuariosTable.nome,
                telefone: usuariosTable.telefone,
                cargo: usuariosTable.cargo,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.id, req.user!.id))
            .limit(1);
        if (!atual) {
            return errorResponse(res, 404, "NOT_FOUND", "Utilizador não encontrado.");
        }
        req.auditAntes = atual;
        const [item] = await db
            .update(usuariosTable)
            .set({
                nome,
                telefone: telefone ?? null,
                cargo: cargo ?? null,
                updated_at: new Date(),
            })
            .where(eq(usuariosTable.id, req.user!.id))
            .returning({
                id: usuariosTable.id,
                nome: usuariosTable.nome,
                email: usuariosTable.email,
                telefone: usuariosTable.telefone,
                cargo: usuariosTable.cargo,
                ultimo_acesso: usuariosTable.ultimo_acesso,
            });
        return successResponse(res, {...item, empresa_id: req.user!.empresaId});
    } catch (error: unknown) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao salvar o perfil.", error);
    }
});

router.post("/me/senha", authLimiter, async (req, res) => {
    const parsed = trocaSenhaSchema.safeParse(req.body);
    if (!parsed.success) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "Informe a senha atual e a nova senha.");
    }
    try {
        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                nome: usuariosTable.nome,
                email: usuariosTable.email,
                senha_hash: usuariosTable.senha_hash,
                bloqueado: usuariosTable.bloqueado,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.id, req.user!.id))
            .limit(1);
        if (!usuario) {
            return errorResponse(res, 404, "NOT_FOUND", "Utilizador não encontrado.");
        }

        const ip = chaveIp(req);
        if (await loginLockout.bloqueado(usuario.email, ip)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", MSG_SENHA_RECUSADA);
        }

        const avaliacao = await avaliarTrocaSenha({
            senhaAtual: parsed.data.senha_atual,
            senhaNova: parsed.data.senha_nova,
            senhaHash: usuario.senha_hash,
            bloqueado: usuario.bloqueado,
            ctx: {email: usuario.email, nome: usuario.nome},
        });
        if (!avaliacao.ok) {
            if (avaliacao.code === "VALIDATION_ERROR") {
                await loginLockout.registrarFalha(usuario.email, ip);
            }
            return errorResponse(res, avaliacao.status, avaliacao.code, avaliacao.message);
        }

        const senhaHash = await bcrypt.hash(parsed.data.senha_nova, BCRYPT_SALT_ROUNDS);
        await db
            .update(usuariosTable)
            .set({senha_hash: senhaHash, updated_at: new Date()})
            .where(eq(usuariosTable.id, usuario.id));

        const sid = req.user!.sid;
        const hashAtual = sid ? await sessoes.hashDaSessao(sid) : null;
        await sessoes.encerrarOutras(usuario.id, sid);
        await revogarOutrosRefresh(usuario.id, hashAtual);
        await loginLockout.registrarSucesso(usuario.email, ip);

        return successResponse(res, {outras_sessoes_encerradas: true});
    } catch (error: unknown) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao alterar a senha.", error);
    }
});

router.get("/me/sessoes", async (req, res) => {
    try {
        const [usuario] = await db
            .select({
                email: usuariosTable.email,
                ultimo_acesso: usuariosTable.ultimo_acesso,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.id, req.user!.id))
            .limit(1);
        const lista = await sessoes.listar(req.user!.id, req.user!.sid);
        const falhas = usuario ? await lerFalhasRecentes(usuario.email) : null;
        const ua = await sessoes.lerUa(req.user!.id);
        return successResponse(res, {
            sessoes: lista,
            ultimo_acesso: usuario?.ultimo_acesso ?? null,
            ultimo_acesso_dispositivo: ua,
            tentativas: falhas
                ? {total: falhas.total, ips: falhas.ips.map((ip) => mascararIp(ip))}
                : null,
        });
    } catch (error: unknown) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar sessões.", error);
    }
});

router.delete("/me/sessoes", async (req, res) => {
    if (req.query.outras !== "true") {
        return errorResponse(res, 400, "VALIDATION_ERROR", "Informe outras=true para encerrar as outras sessões.");
    }
    try {
        const sid = req.user!.sid;
        const hashAtual = sid ? await sessoes.hashDaSessao(sid) : null;
        const encerradas = await sessoes.encerrarOutras(req.user!.id, sid);
        await revogarOutrosRefresh(req.user!.id, hashAtual);
        return successResponse(res, {encerradas});
    } catch (error: unknown) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao encerrar as outras sessões.", error);
    }
});

router.delete("/me/sessoes/:id", async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
        return errorResponse(res, 404, "NOT_FOUND", "Sessão não encontrada.");
    }
    try {
        const hash = await sessoes.hashDaSessao(id);
        const resultado = await sessoes.encerrarDoUsuario(req.user!.id, id, req.user!.sid);
        if (resultado === "ausente") {
            return errorResponse(res, 404, "NOT_FOUND", "Sessão não encontrada.");
        }
        if (resultado === "atual") {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Use Sair para encerrar esta sessão.");
        }
        if (hash) {
            await db
                .update(refreshTokensTable)
                .set({revogado: true})
                .where(and(eq(refreshTokensTable.usuario_id, req.user!.id), eq(refreshTokensTable.token_hash, hash)));
        }
        return successResponse(res, {encerrada: true});
    } catch (error: unknown) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao encerrar a sessão.", error);
    }
});

export default router;
