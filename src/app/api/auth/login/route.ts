import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const Body = z.object({ email: z.string().min(3), password: z.string().min(1) });

export async function POST(req: Request) {
  const rl = rateLimit(`login:${clientIp(req)}`, 10, 300);
  if (!rl.ok) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

  const db = getDb();
  const user = db
    .prepare("SELECT id, name, email, role, password_hash, ifnull(active,1) AS active FROM users WHERE email = ?")
    .get(parsed.data.email.toLowerCase()) as
    | { id: number; name: string; email: string; role: "user" | "admin"; password_hash: string; active: number }
    | undefined;

  // Same generic message for unknown email and wrong password (no user enumeration).
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  if (!user.active) {
    return NextResponse.json({ error: "This account has been deactivated. Contact support if you believe this is an error." }, { status: 403 });
  }

  const token = createSession(user.id);
  await setSessionCookie(token);
  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
