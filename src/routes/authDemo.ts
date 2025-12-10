import { Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";

export const authDemoRouter = Router();

authDemoRouter.post("/demo-login", (req, res) => {
  const body = req.body || {};
  const userId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : "demo_user";
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : "demo_user@example.com";

  const payload = {
    sub: userId,
    id: userId,
    email
  };

  const token = jwt.sign(payload, config.authJwtSecret, { algorithm: "HS256", expiresIn: "7d" });
  res.json({ token, user: { id: userId, email } });
});
