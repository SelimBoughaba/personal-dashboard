import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { password } = req.body || {};
  const hash = process.env.APP_PASSWORD_HASH;

  if (!hash) {
    return res.status(500).json({
      error: "Server ist nicht konfiguriert (APP_PASSWORD_HASH fehlt in .env).",
    });
  }
  if (!password) {
    return res.status(400).json({ error: "Passwort fehlt." });
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    return res.status(401).json({ error: "Falsches Passwort." });
  }

  const token = jwt.sign({ sub: "owner" }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
  res.json({ token });
});
