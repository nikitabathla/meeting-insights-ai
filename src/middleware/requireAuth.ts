import type { NextFunction, Request, Response } from "express";
import { supabase } from "../services/supabase.js";
import type { AuthUser } from "../types/auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!token) {
    return res.status(401).json({ error: "Missing access token." });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  req.user = {
    id: data.user.id,
    email: data.user.email ?? "",
  };
  next();
}
