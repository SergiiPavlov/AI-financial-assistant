import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { config } from "./config/env";
import { apiRouter } from "./routes";
import { attachUserFromAuthHeader } from "./lib/auth";
import { HttpError } from "./lib/httpError";

const app = express();

const corsOptions = config.corsOrigin
  ? { origin: config.corsOrigin, credentials: true }
  : undefined;

if (corsOptions) {
  app.use(cors(corsOptions));
} else {
  app.use(cors());
}

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

app.use(attachUserFromAuthHeader(config));
app.use("/api", apiRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (err instanceof HttpError || (typeof err === "object" && err && typeof err.status === "number")) {
    const status = err.status;
    const message = err.message || "Error";
    return res.status(status).json({ error: message });
  }

  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`AI Financial Assistant API running on port ${config.port}`);
});
