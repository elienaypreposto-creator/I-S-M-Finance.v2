import { Router } from "express";
import contasBancariasRouter from "../../routes/contas-bancarias";
import planoContasRouter from "../../routes/plano-contas";
import metasRouter from "../../routes/metas";
import filiaisRouter from "../../routes/filiais";
import departamentosRouter from "../../routes/departamentos";
import tokensApiRouter from "../../routes/tokens-api";
import usuariosRouter from "../../routes/usuarios";
import lancamentosDomainRouter from "./lancamentos/router";
import parceirosDomainRouter from "./parceiros/router";

const financialDomainRouter = Router();

financialDomainRouter.use(contasBancariasRouter);
financialDomainRouter.use(lancamentosDomainRouter);
financialDomainRouter.use(parceirosDomainRouter);
financialDomainRouter.use(planoContasRouter);
financialDomainRouter.use(metasRouter);
financialDomainRouter.use(filiaisRouter);
financialDomainRouter.use(departamentosRouter);
financialDomainRouter.use(tokensApiRouter);
financialDomainRouter.use(usuariosRouter);

export default financialDomainRouter;
