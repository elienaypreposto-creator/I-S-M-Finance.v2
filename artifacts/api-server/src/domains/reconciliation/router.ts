import { Router } from "express";
import conciliacoesRouter from "../../routes/conciliacoes";
import kanbanRouter from "../../routes/kanban";

const reconciliationDomainRouter = Router();

reconciliationDomainRouter.use(conciliacoesRouter);
reconciliationDomainRouter.use("/kanban", kanbanRouter);

export default reconciliationDomainRouter;
