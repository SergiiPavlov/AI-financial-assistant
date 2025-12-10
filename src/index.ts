import express from "express";
import cors from "cors";
import path from "path";
import { config } from "./config/env";
import { apiRouter } from "./routes";
import { attachUserFromAuthHeader } from "./lib/auth";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));
app.use(attachUserFromAuthHeader(config));

app.use("/api", apiRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`AI Financial Assistant API running on port ${config.port}`);
});
