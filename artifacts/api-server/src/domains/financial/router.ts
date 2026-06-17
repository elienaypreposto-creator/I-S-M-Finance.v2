import {Router} from "express";
import contasBancariasDomainRouter from "./contas-bancarias/router";
import planoContasDomainRouter from "./plano-contas/router";
import metasDomainRouter from "./metas/router";
import filiaisDomainRouter from "./filiais/router";
import departamentosDomainRouter from "./departamentos/router";
import tokensApiRouter from "../../routes/tokens-api";
import usuariosRouter from "../../routes/usuarios";
import lancamentosDomainRouter from "./lancamentos/router";
import parceirosDomainRouter from "./parceiros/router";
import transferenciasDomainRouter from "./transferencias/router";

const financialDomainRouter = Router();

financialDomainRouter.use(contasBancariasDomainRouter);
financialDomainRouter.use(lancamentosDomainRouter);
financialDomainRouter.use(parceirosDomainRouter);
financialDomainRouter.use(planoContasDomainRouter);
financialDomainRouter.use(metasDomainRouter);
financialDomainRouter.use(filiaisDomainRouter);
financialDomainRouter.use(departamentosDomainRouter);
financialDomainRouter.use(transferenciasDomainRouter);
financialDomainRouter.use(tokensApiRouter);
financialDomainRouter.use(usuariosRouter);

export default financialDomainRouter;
