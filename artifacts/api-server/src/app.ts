import express, {type Express} from "express";
import cors from "cors";
import router from "./routes";
import {errorHandler} from "./middlewares/error-handler";
import {auditLogger} from "./middlewares/logger";
import {globalLimiter} from "./middlewares/rate-limit";

const app: Express = express();

// Necessário para que req.ip reflita o IP real do cliente (via X-Forwarded-For)
// atrás do proxy da Vercel / reverse proxy, em vez do IP do proxy — do contrário
// todo o tráfego cairia no mesmo balde do rate limiter.
app.set("trust proxy", 1);

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    })
);
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