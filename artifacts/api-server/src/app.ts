import express, {type Express} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";
import {errorHandler} from "./middlewares/error-handler";
import {auditLogger} from "./middlewares/logger";
import {requestId} from "./middlewares/request-id";
import {globalLimiter} from "./middlewares/rate-limit";

const app: Express = express();

app.use(requestId);

// Necessário para que req.ip reflita o IP real do cliente (via X-Forwarded-For)
// atrás do proxy da Vercel / reverse proxy, em vez do IP do proxy — do contrário
// todo o tráfego cairia no mesmo balde do rate limiter.
app.set("trust proxy", 1);

// Allowlist de origens: "*" é incompatível com `credentials: true`.
// Lista separada por vírgula em CORS_ORIGINS (fallback: FRONTEND_URL).
// Normaliza para `origin` (sem path nem barra final), que é o formato do header Origin.
const toOrigin = (value: string): string | null => {
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
};

const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(toOrigin)
    .filter((o): o is string => o !== null);

if (allowedOrigins.length === 0 && process.env.NODE_ENV === "production") {
    console.warn("[CONFIG] CORS_ORIGINS/FRONTEND_URL não definido: requisições cross-origin serão bloqueadas.");
}

app.use(
    cors({
        // Sem header Origin (same-origin, curl, healthchecks) passa; com Origin, só se estiver na allowlist.
        origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-Id"],
        exposedHeaders: ["X-Request-Id"],
    })
);

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