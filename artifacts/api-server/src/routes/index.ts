/**
 * Rotas montadas depois de withAuth exigem JWT.
 * withTenantTxMiddleware aplica SET LOCAL app.empresa_id para a RLS.
 */

import {Router, type IRouter} from "express";
import healthRouter from "./health";
import v1Router from "./v1";
import {withAuth} from "../middlewares/auth";
import {withTenant} from "../middlewares/tenant";
import {withTenantTxMiddleware} from "../middlewares/tenant-tx";
import authDomainRouter from "../domains/auth/router";
import financialDomainRouter from "../domains/financial/router";
import reconciliationDomainRouter from "../domains/reconciliation/router";
import reportsDomainRouter from "../domains/reports/router";
import auditoriaRouter from "./auditoria";
import meRouter from "./me";

const router: IRouter = Router();

router.use(healthRouter);

router.use(authDomainRouter);

router.use("/v1", v1Router);

router.use(withAuth);

router.use(withTenant);

router.use(withTenantTxMiddleware);

router.use(meRouter);

router.use(auditoriaRouter);

router.use(reportsDomainRouter);

router.use(financialDomainRouter);

router.use(reconciliationDomainRouter);

export default router;