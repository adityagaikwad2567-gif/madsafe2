import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { answerQuestion } from "@/lib/rag";
import { getDb } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const Body = z.object({
  question: z.string().min(3).max(400),
  lang: z.enum(["en", "hi", "mr"]).optional(),
  slug: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const rl = rateLimit(`ai:${user?.id ?? clientIp(req)}`, 20, 300);
  if (!rl.ok) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid question payload." }, { status: 400 });

  const result = answerQuestion(parsed.data.question, { lang: parsed.data.lang });
  const db = getDb();
  db.prepare("INSERT INTO scan_history (user_id, medicine_id, method, query, matched) VALUES (?,?,?,?,0)").run(
    user?.id ?? null,
    result.medicineSlug
      ? (db.prepare("SELECT id FROM medicines WHERE slug = ?").get(result.medicineSlug) as { id: number } | undefined)?.id ?? null
      : null,
    "manual",
    `AI: ${parsed.data.question.slice(0, 180)}`
  );

  return NextResponse.json(result);
}
