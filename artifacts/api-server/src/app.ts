import express, {type Express} from "express";
import cookieParser from "cookie-parser";
import router from "./routes";
import {errorHandler} from "./middlewares/error-handler";
import {auditLogger} from "./middlewares/logger";
import {requestId} from "./middlewares/request-id";
import {globalLimiter} from "./middlewares/rate-limit";
import {securityHeaders} from "./middlewares/security-headers";
import {corsPolicy, parseAllowedOrigins} from "./middlewares/cors-policy";
import {trustProxyHops} from "./lib/client-ip";

const app: Express = express();
app.disable("x-powered-by");
app.use(securityHeaders);

app.use(requestId);

// req.ip = IP real do cliente: número exato de saltos de proxy confiáveis
// (borda -> nginx web -> API). Ver lib/client-ip.ts. Sem isso o rate limit e a
// auditoria enxergam o gateway do docker; com saltos demais, um X-Forwarded-For
// forjado pelo cliente vira o "IP real".
app.set("trust proxy", trustProxyHops());

// CORS por allowlist (CORS_ORIGINS + FRONTEND_URL) + same-origin; em produção,
// Origin fora da lista recebe 403 (fail-closed). Ver middlewares/cors-policy.ts.
const allowedOrigins = parseAllowedOrigins();
if (allowedOrigins.length === 0 && process.env.NODE_ENV === "production") {
    console.warn("[CONFIG] CORS_ORIGINS/FRONTEND_URL não definido: só same-origin será aceito.");
}
app.use(corsPolicy({allowedOrigins, enforce: process.env.NODE_ENV === "production"}));

app.use(cookieParser());

// Limite explícito (mesmo valor do default do Express 5) — documenta a
// decisão em vez de depender de um default implícito do body-parser.
app.use(express.json({limit: "100kb"}));
app.use(express.urlencoded({extended: true, limit: "100kb"}));
app.use(auditLogger);

app.get("/healthz", (_req, res) => {
    res.status(200).send("OK");
});

app.use("/api", globalLimiter, router);

app.use(errorHandler);

export default app;
