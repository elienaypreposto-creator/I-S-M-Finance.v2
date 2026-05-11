import { Router } from "express";
import authRouter from "../../routes/auth";

const authDomainRouter = Router();

authDomainRouter.use(authRouter);

export default authDomainRouter;
