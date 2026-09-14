import { cookies } from "next/headers";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

export const SESSION_COOKIE = "medsafe_session";
const SESSION_DAYS = 7;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  language: "en" | "hi" | "mr";
  cycle_enabled: boolean;
  cycle_start: string | null;
  cycle_length: number | null;
};

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function createSession(userId: number): string {
  const db = getDb();
  // Hygiene: expired sessions are garbage-collected whenever a new one is created.
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, userId, expires);
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export function getSessionUserByToken(token: string): SessionUser | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.language, u.cycle_enabled, u.cycle_start, u.cycle_length
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now') AND ifnull(u.active,1) = 1`
    )
    .get(token) as SessionUser | undefined;
  return row ?? null;
}

/** Returns the logged-in user for the current request (server components + route handlers). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUserByToken(token);
}

export function destroySession(token: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Za-z]/.test(pw)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
  return null;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
