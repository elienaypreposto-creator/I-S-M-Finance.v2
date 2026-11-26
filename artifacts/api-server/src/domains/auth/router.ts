import { Router } from "express";
import authRouter from "../../routes/auth";
import authGovadmRouter from "../../routes/auth-govadm";

const authDomainRouter = Router();

authDomainRouter.use(authRouter);
authDomainRouter.use(authGovadmRouter);

export default authDomainRouter;
