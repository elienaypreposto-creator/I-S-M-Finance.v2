/**
 * Login vindo do GovADM (Fase 1)
 *
 * GET  /auth/govadm?token=...        - Aberto pelo GovADM (window.open). 303 para o front.
 * POST /auth/govadm                  - Mesmo fluxo via form (campo `token` ou `j_password`).
 * POST /auth/selecao-empresas        - Lista as empresas a partir do selectionToken (fragmento
 *                                      `#sso_selecao=` do redirect), no formato do /auth/login.
 *
 * Regras:
 * - Desligado (404) se GOVADM_SSO_HABILITADO != "true" ou faltar configuração.
 * - O parâmetro `passport` (base64 de login+senha do GovADM) é IGNORADO: nunca é lido,
 *   usado, gravado nem logado. O `token` nunca vai para log: só os 8 primeiros hex do sha256.
 * - Sucesso: emite a sessão igual ao login (cookie `rt`) e responde 303 para FRONTEND_URL.
 *   O access token nunca vai na URL; o front chama /auth/refresh ao abrir.
 * - Várias empresas sem padrão: 303 para FRONTEND_URL/login#sso_selecao=<selectionToken>.
 * - Erros: 303 para FRONTEND_URL/login?sso_erro=<código> (sem dado pessoal na URL).
 * - Todas as respostas com Cache-Control: no-store.
 */

import {Router, type NextFunction, type Request, type Response} from "express";
import {and, eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {logsSistemaTable, usuarioIdentidadesExternasTable, usuariosTable} from "@workspace/db/schema";
import {listEmpresasAtivasDoUsuario} from "../services/tenant.service";
import {signPurposeToken, verifyPurposeToken} from "../services/token.service";
import {attachTenantForAudit, emitSession, metaSessao} from "../services/auth-session";
import {
    decidirDestinoGovadm,
    lerConfigGovadm,
    pareceJwt,
    prefixoHashToken,
    urlDestinoGovadm,
    validarTokenGovadm,
    type CodigoErroSso,
    type GovadmConfig,
    type ResultadoSso,
    type UsuarioGovadm,
    type ValidarTokenGovadm,
} from "../services/govadm.service";
import {loginLimiter, ssoLimiter} from "../middlewares/rate-limit";
import {isSameHost, parseAllowedOrigins} from "../middlewares/cors-policy";
import {setRefreshCookie} from "../utils/refresh-cookie";
import {errorResponse, successResponse} from "../utils/response";
import {AppError} from "../utils/app-error";
import {clientIp} from "../lib/client-ip";
import {auditRequestId} from "../middlewares/request-id";

/** Validade do selectionToken emitido pelo SSO (vai no fragmento da URL): curta de propósito. */
export const SSO_SELECAO_TTL_S = 10 * 60;

type Env = Record<string, string | undefined>;

export interface DepsAuthGovadm {
    /** Validação do token no GovADM (mockável nos testes). */
    validarToken?: ValidarTokenGovadm;
    env?: Env;
}

const noStore = (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    next();
};

/** Token do GovADM: query `token` (GET) ou body `token`/`j_password` (POST). Nunca `passport`. */
function tokenDaRequisicao(req: Request): string | null {
    const candidatos: unknown[] = req.method === "GET"
        ? [req.query?.token]
        : [req.body?.token, req.body?.j_password];
    for (const c of candidatos) {
        if (typeof c === "string" && c.trim()) return c.trim();
    }
    return null;
}

/** POST com Origin: só do GovADM (GOVADM_ORIGENS), do próprio front ou same-origin. */
function origemPostPermitida(req: Request, config: GovadmConfig, env: Env): boolean {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (origin === "null") return false;
    return config.origens.includes(origin)
        || parseAllowedOrigins(env).includes(origin)
        || isSameHost(origin, req.headers.host);
}

interface EventoGovadm {
    resultado: ResultadoSso;
    tokenHash8: string | null;
    usuarioGovadm?: UsuarioGovadm | null;
    /** idUsuario declarado no token quando a validação falhou (não confirmado pelo GovADM). */
    idDeclarado?: string | null;
    usuarioId?: number | null;
    empresaId?: number | null;
    etapa?: "sessao" | "selecao";
    detalhe?: string;
}

/** Evento próprio do login GovADM em logs_sistema. Nunca leva o token nem o passport. */
function registrarEvento(req: Request, config: GovadmConfig, ev: EventoGovadm): void {
    void db
        .insert(logsSistemaTable)
        .values({
            servico: "auth-govadm",
            mensagem: `Login GovADM: ${ev.resultado}`,
            detalhes: {
                provedor: "govadm",
                emissor: config.emissor,
                resultado: ev.resultado,
                etapa: ev.etapa ?? null,
                detalhe: ev.detalhe ?? null,
                id_usuario_govadm: ev.usuarioGovadm?.idUsuario ?? null,
                id_usuario_govadm_declarado: ev.usuarioGovadm ? null : (ev.idDeclarado ?? null),
                login_govadm: ev.usuarioGovadm?.login ?? null,
                sigla_unidade: ev.usuarioGovadm?.siglaUnidade ?? null,
                token_sha256_8: ev.tokenHash8,
                usuario_id: ev.usuarioId ?? null,
                empresa_id: ev.empresaId ?? null,
                metodo: req.method,
                ip: clientIp(req),
                request_id: auditRequestId(req.id),
            },
        })
        .catch((err: unknown) => {
            console.error("[audit] Falha ao gravar evento do login GovADM:", err instanceof Error ? err.message : err);
        });
}

export function criarRouterAuthGovadm(deps: DepsAuthGovadm = {}) {
    const router = Router();
    const validarToken = deps.validarToken ?? validarTokenGovadm;
    const lerEnv = (): Env => deps.env ?? process.env;

    async function fluxoGovadm(req: Request, res: Response) {
        const env = lerEnv();
        const cfg = lerConfigGovadm(env);
        if (!cfg.ativo) {
            return errorResponse(res, 404, "NOT_FOUND", "Recurso não encontrado.");
        }
        const config = cfg.config;

        if (req.method === "GET") {
            // window.open/link é navegação; fetch/XHR/iframe de outro site não.
            const modo = req.get("sec-fetch-mode");
            if (modo && modo !== "navigate") {
                return errorResponse(res, 400, "NAVEGACAO_OBRIGATORIA", "Abra este endereço pelo navegador.");
            }
        } else if (!origemPostPermitida(req, config, env)) {
            return errorResponse(res, 403, "ORIGIN_NOT_ALLOWED", "Origem não permitida.");
        }

        const erro = (codigo: CodigoErroSso, ev: Omit<EventoGovadm, "resultado">) => {
            registrarEvento(req, config, {...ev, resultado: codigo});
            return res.redirect(303, urlDestinoGovadm(config.frontendUrl, {tipo: "erro", codigo}));
        };

        const token = tokenDaRequisicao(req);
        if (!token || !pareceJwt(token)) {
            return erro("token_invalido", {tokenHash8: token ? prefixoHashToken(token) : null, detalhe: "token ausente ou mal formado"});
        }
        const tokenHash8 = prefixoHashToken(token);

        let usuarioGovadm: UsuarioGovadm | null = null;
        let usuarioId: number | null = null;
        try {
            const validacao = await validarToken(token, config);
            if (!validacao.ok) {
                return erro(validacao.motivo, {tokenHash8, idDeclarado: validacao.idDeclarado, detalhe: validacao.detalhe});
            }
            usuarioGovadm = validacao.usuario;

            const [vinculo] = await db
                .select({
                    id: usuarioIdentidadesExternasTable.id,
                    usuario_id: usuarioIdentidadesExternasTable.usuario_id,
                    ativo: usuarioIdentidadesExternasTable.ativo,
                    empresa_id_padrao: usuarioIdentidadesExternasTable.empresa_id_padrao,
                })
                .from(usuarioIdentidadesExternasTable)
                .where(and(
                    eq(usuarioIdentidadesExternasTable.provedor, "govadm"),
                    eq(usuarioIdentidadesExternasTable.emissor, config.emissor),
                    eq(usuarioIdentidadesExternasTable.sujeito_externo, usuarioGovadm.idUsuario),
                ))
                .limit(1);

            const [usuario] = vinculo?.ativo
                ? await db
                    .select({
                        id: usuariosTable.id,
                        nome: usuariosTable.nome,
                        email: usuariosTable.email,
                        bloqueado: usuariosTable.bloqueado,
                        superadmin: usuariosTable.superadmin,
                        ultimo_acesso: usuariosTable.ultimo_acesso,
                        senha_unica_utilizada: usuariosTable.senha_unica_utilizada,
                    })
                    .from(usuariosTable)
                    .where(eq(usuariosTable.id, vinculo.usuario_id))
                    .limit(1)
                : [];
            usuarioId = usuario?.id ?? null;

            const podeListar = usuario && !usuario.bloqueado && !usuario.superadmin;
            const empresas = podeListar ? await listEmpresasAtivasDoUsuario(usuario.id) : [];
            const decisao = decidirDestinoGovadm({vinculo: vinculo ?? null, usuario: usuario ?? null, empresas});

            if (decisao.tipo === "erro" || !usuario || !vinculo) {
                const codigo = decisao.tipo === "erro" ? decisao.codigo : "sem_vinculo";
                return erro(codigo, {tokenHash8, usuarioGovadm, usuarioId});
            }

            // Mesmo critério do /auth/login: no primeiro acesso ultimo_acesso não é gravado,
            // senão a senha temporária (se houver) viraria permanente no login por senha.
            const ehPrimeiroAcesso = !usuario.ultimo_acesso && !usuario.senha_unica_utilizada;
            const agora = new Date();
            const marcarUso = async () => {
                if (!ehPrimeiroAcesso) {
                    await db.update(usuariosTable).set({ultimo_acesso: agora}).where(eq(usuariosTable.id, usuario.id));
                }
                await db
                    .update(usuarioIdentidadesExternasTable)
                    .set({ultimo_uso_em: agora})
                    .where(eq(usuarioIdentidadesExternasTable.id, vinculo.id));
            };

            if (decisao.tipo === "selecao") {
                const selectionToken = await signPurposeToken(
                    {sub: String(usuario.id), email: usuario.email, purpose: "empresa_select"},
                    SSO_SELECAO_TTL_S,
                );
                await marcarUso();
                registrarEvento(req, config, {resultado: "ok", etapa: "selecao", tokenHash8, usuarioGovadm, usuarioId});
                return res.redirect(303, urlDestinoGovadm(config.frontendUrl, {tipo: "selecao", selectionToken}));
            }

            let session;
            try {
                session = await emitSession(
                    {id: usuario.id, nome: usuario.nome, email: usuario.email, superadmin: usuario.superadmin},
                    decisao.empresaId,
                    metaSessao(req),
                    undefined,
                    {acessoAnteriorDb: usuario.ultimo_acesso},
                );
            } catch (e) {
                // Vínculo desativado entre a listagem e a emissão.
                if (e instanceof AppError) return erro("sem_empresa", {tokenHash8, usuarioGovadm, usuarioId});
                throw e;
            }
            await marcarUso();
            setRefreshCookie(res, session.refreshToken);
            attachTenantForAudit(req, usuario, decisao.empresaId);
            registrarEvento(req, config, {
                resultado: "ok",
                etapa: "sessao",
                tokenHash8,
                usuarioGovadm,
                usuarioId,
                empresaId: decisao.empresaId,
            });
            return res.redirect(303, urlDestinoGovadm(config.frontendUrl, {tipo: "sessao"}));
        } catch (e: unknown) {
            // Nunca loga o objeto da requisição (query/body têm o token).
            console.error(`[${req.id}] Erro no login GovADM:`, e instanceof Error ? e.message : e);
            return erro("indisponivel", {tokenHash8, usuarioGovadm, usuarioId, detalhe: "erro interno"});
        }
    }

    router.get("/auth/govadm", noStore, ssoLimiter, fluxoGovadm);
    router.post("/auth/govadm", noStore, ssoLimiter, fluxoGovadm);

    router.post("/auth/selecao-empresas", noStore, loginLimiter, async (req, res) => {
        try {
            const selectionToken = typeof req.body?.selectionToken === "string" ? req.body.selectionToken : null;
            if (!selectionToken) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "Campo obrigatório: selectionToken.");
            }

            let tokenPayload: { sub: string; email: string };
            try {
                tokenPayload = await verifyPurposeToken(selectionToken, "empresa_select");
            } catch {
                return errorResponse(res, 401, "INVALID_TOKEN", "selectionToken inválido ou expirado.");
            }

            const [usuario] = await db
                .select({
                    id: usuariosTable.id,
                    nome: usuariosTable.nome,
                    email: usuariosTable.email,
                    bloqueado: usuariosTable.bloqueado,
                })
                .from(usuariosTable)
                .where(eq(usuariosTable.id, parseInt(tokenPayload.sub, 10)))
                .limit(1);

            if (!usuario || usuario.bloqueado) {
                return errorResponse(res, 401, "UNAUTHORIZED", "Usuário inválido ou bloqueado.");
            }

            const empresas = await listEmpresasAtivasDoUsuario(usuario.id);
            if (empresas.length === 0) {
                return errorResponse(res, 403, "SEM_EMPRESA", "Usuário sem vínculo ativo com nenhuma empresa.");
            }

            return successResponse(
                res,
                {
                    requiresEmpresaSelection: true,
                    selectionToken,
                    empresas,
                    user: {id: usuario.id, nome: usuario.nome, email: usuario.email},
                },
                {message: "Selecione a empresa para emitir a sessão."},
            );
        } catch (error: unknown) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar empresas para seleção.", error);
        }
    });

    return router;
}

export default criarRouterAuthGovadm();
