/**
 * Router principal da API.
 *
 * Ordem de montagem:
 * 1. /healthz              — sem autenticação
 * 2. /auth/*               — sem autenticação (login, refresh, logout)
 *    └─ /auth/me           — requer withAuth (declarado dentro do router de auth)
 *    └─ /auth/migrate-*    — requer withAuth + withPermission (declarado dentro)
 * 3. /v1/*                 — autenticação por API Token (v1AuthMiddleware)
 * 4. withAuth              — TODAS as rotas abaixo exigem JWT válido
 *    ├─ reports
 *    ├─ financial (lancamentos, parceiros, contas-bancarias, etc.)
 *    └─ reconciliation (conciliacoes, kanban)
 */

import {Router, type IRouter} from "express";
import healthRouter from "./health";
import v1Router from "./v1";
import {withAuth} from "../middlewares/auth";
import authDomainRouter from "../domains/auth/router";
import financialDomainRouter from "../domains/financial/router";
import reconciliationDomainRouter from "../domains/reconciliation/router";
import reportsDomainRouter from "../domains/reports/router";
import auditoriaRouter from "./auditoria";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authDomainRouter);
router.use("/v1", v1Router);

// Barreira de autenticação — todas as rotas abaixo requerem Access Token JWE válido
router.use(withAuth);
router.use(auditoriaRouter);
router.use(reportsDomainRouter);
router.use(financialDomainRouter);
router.use(reconciliationDomainRouter);

export default router;
