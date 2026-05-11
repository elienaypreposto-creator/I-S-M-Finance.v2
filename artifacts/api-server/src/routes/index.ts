import { Router, type IRouter } from "express";
import healthRouter from "./health";
import v1Router from "./v1";
import { authMiddleware } from "../middlewares/auth";
import authDomainRouter from "../domains/auth/router";
import financialDomainRouter from "../domains/financial/router";
import reconciliationDomainRouter from "../domains/reconciliation/router";
import reportsDomainRouter from "../domains/reports/router";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authDomainRouter);
router.use("/v1", v1Router);
router.use(authMiddleware);
router.use(reportsDomainRouter);
router.use(financialDomainRouter);
router.use(reconciliationDomainRouter);

export default router;
