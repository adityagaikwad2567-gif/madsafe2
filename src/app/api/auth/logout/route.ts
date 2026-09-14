import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearSessionCookie, destroySession, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
