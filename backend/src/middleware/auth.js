import jwt from "jsonwebtoken";
import { getJwtSecret } from "../configStore.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Nicht angemeldet." });
  }

  try {
    req.user = jwt.verify(token, getJwtSecret());
    next();
  } catch {
    return res.status(401).json({ error: "Sitzung ungültig oder abgelaufen." });
  }
}
