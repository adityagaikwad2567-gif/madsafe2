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

/**
 * Stateless signed sessions.
 *
 * Serverless hosts (Vercel) give each lambda instance its own ephemeral SQLite
 * file in /tmp, so DB-backed session rows silently vanish between requests and
 * logged-in users get bounced back to the login page. The cookie therefore
 * carries its own proof: `v2.<userId>.<expiresMs>.<hmac>` signed with
 * SESSION_SECRET. Verification hits only the stable `users` table, so
 * deactivating a user still revokes their access instantly.
 *
 * Set SESSION_SECRET in production (any long random string). Locally it is
 * random per boot — sessions simply reset when the dev server restarts.
 */
// In production this MUST come from the environment: Next.js can load this
// module once per bundle (pages vs route handlers), and a random per-boot
// fallback would then differ between them — logins would work for /api routes
// but fail verification in server components. A fixed dev default keeps local
// logins consistent across bundles.
const SESSION_SECRET =
  process.env.SESSION_SECRET ??
  (process.env.NODE_ENV === "production"
    ? (() => {
        console.warn("[medsafe:auth] SESSION_SECRET is not set — using an insecure default. Set it in your hosting environment.");
        return "medsafe-insecure-default-set-SESSION_SECRET";
      })()
    : "medsafe-dev-secret-do-not-use-in-production");

function sign(payload: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

export function createSession(userId: number): string {
  const expiresMs = Date.now() + SESSION_DAYS * 86400_000;
  const payload = `v2.${userId}.${expiresMs}`;
  return `${payload}.${sign(payload)}`;
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
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v2") return null;
  const [, userIdRaw, expiresRaw, mac] = parts;
  const expected = sign(`v2.${userIdRaw}.${expiresRaw}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const expiresMs = Number(expiresRaw);
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) return null;
  const userId = Number(userIdRaw);
  if (!Number.isInteger(userId)) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, name, email, role, language, cycle_enabled, cycle_start, cycle_length
       FROM users WHERE id = ? AND ifnull(active,1) = 1`
    )
    .get(userId) as SessionUser | undefined;
  return row ?? null;
}

/** Returns the logged-in user for the current request (server components + route handlers). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUserByToken(token);
}

/** Logout is cookie-clearing; the signed token simply expires unused. */
export function destroySession(_token: string): void {
  // No server-side state to remove by design (see createSession above).
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
