import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { errorHandler } from "./middlewares/error-handler";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Top-level health check
app.get("/healthz", (req, res) => {
  res.status(200).send("OK - Server is up");
});

app.use("/api", router);

// Global Error Handler
app.use(errorHandler);

export default app;
