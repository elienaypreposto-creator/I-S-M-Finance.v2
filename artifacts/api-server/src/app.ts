import express, {type Express} from "express";
import cors from "cors";
import router from "./routes";
import {errorHandler} from "./middlewares/error-handler";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.get("/healthz", (_req, res) => {
    res.status(200).send("OK");
});

app.use("/api", router);

app.use(errorHandler);

export default app;
