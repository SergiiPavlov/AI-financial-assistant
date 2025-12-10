import express from "express";
import cors from "cors";
import { config } from "./config/env";
import { apiRouter } from "./routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`Voice Finance Agent API running on port ${config.port}`);
});
