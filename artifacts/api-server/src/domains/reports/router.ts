import { Router } from "express";
import dashboardRouter from "../../routes/dashboard";
import relatoriosRouter from "../../routes/relatorios";

const reportsDomainRouter = Router();

reportsDomainRouter.use(dashboardRouter);
reportsDomainRouter.use(relatoriosRouter);

export default reportsDomainRouter;
