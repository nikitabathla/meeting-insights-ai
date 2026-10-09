import type { Session, User } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { supabase } from "../services/supabase.js";

const emailSchema = z.string().trim().email("Enter a valid email.");

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

const signupSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, "Password must be at least 6 characters."),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required."),
});

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstIssue(parsed.error) });
  }

  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    return res.status(400).json({ error: authErrorMessage(error.message) });
  }

  const payload = toAuthPayload(data.user, data.session);
  if (!data.session) {
    return res.json({
      ...payload,
      message: "Check your email to confirm your account, then log in.",
    });
  }

  return res.status(201).json(payload);
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstIssue(parsed.error) });
  }

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.session || !data.user) {
    return res.status(401).json({ error: authErrorMessage(error?.message, "Login failed.") });
  }

  return res.json(toAuthPayload(data.user, data.session));
});

authRouter.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstIssue(parsed.error) });
  }

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: parsed.data.refreshToken,
  });
  if (error || !data.session) {
    return res.status(401).json({ error: "Session expired. Log in again." });
  }

  return res.json(toAuthPayload(data.user, data.session));
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

function toAuthPayload(user: User | null, session: Session | null) {
  return {
    user: user ? { id: user.id, email: user.email ?? "" } : null,
    session: session
      ? {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at ?? null,
        }
      : null,
  };
}

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid request.";
}

function authErrorMessage(message: string | undefined, fallback = "Something went wrong.") {
  if (!message) return fallback;
  if (message === "fetch failed") {
    return "Could not reach Supabase. Check SUPABASE_URL and try again.";
  }
  return message;
}
