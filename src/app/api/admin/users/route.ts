import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * Admin user management (read-only + deactivation).
 *
 * GET  /api/admin/users            — user list with per-user counts
 * PATCH /api/admin/users {id, active} — deactivate / reactivate a user
 *
 * Design notes:
 *  - Never returns password hashes, session tokens, or cycle dates (health data).
 *  - Self-deactivation is blocked so an admin cannot lock themselves out.
 *  - Deactivation destroys the user's sessions immediately.
 *  - Every mutation is written to audit_log.
 */

const PatchBody = z.object({
  id: z.number().int().positive(),
  active: z.boolean(),
});

export async function GET() {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const db = getDb();
  const users = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              u.active,
              (SELECT COUNT(*) FROM scan_history s WHERE s.user_id = u.id) AS scans,
              (SELECT COUNT(*) FROM user_medicines m WHERE m.user_id = u.id) AS cabinet_items,
              (SELECT COUNT(*) FROM reports r WHERE r.user_id = u.id) AS reports
       FROM users u
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT 200`
    )
    .all();

  return NextResponse.json({ users });
}

export async function PATCH(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "id (number) and active (boolean) are required." }, { status: 400 });

  const { id, active } = parsed.data;
  if (id === admin.id && !active) {
    return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
  }

  const db = getDb();
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id) as { id: number; role: string } | undefined;
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  db.prepare("UPDATE users SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
  if (!active) {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }
  db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?,?,?,?,?)").run(
    admin.email,
    active ? "user.reactivate" : "user.deactivate",
    "user",
    String(id),
    JSON.stringify({ sessionsDestroyed: !active })
  );

  return NextResponse.json({ ok: true });
}
