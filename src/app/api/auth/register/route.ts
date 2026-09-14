import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { createSession, hashPassword, setSessionCookie, validateEmail, validatePassword } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const Body = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(120),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const rl = rateLimit(`register:${clientIp(req)}`, 5, 3600);
  if (!rl.ok) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a name, valid email and 8+ character password." }, { status: 400 });
  }
  const { name, email, password } = parsed.data;
  if (!validateEmail(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  const db = getDb();
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (exists) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const info = db
    .prepare("INSERT INTO users (name, email, password_hash, role, language) VALUES (?,?,?, 'user', 'en')")
    .run(name.trim(), email.toLowerCase(), hashPassword(password));
  const userId = Number(info.lastInsertRowid);

  const token = createSession(userId);
  await setSessionCookie(token);
  return NextResponse.json({ ok: true, user: { id: userId, name, email: email.toLowerCase(), role: "user" } });
}
