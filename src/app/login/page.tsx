import { Suspense } from "react";
import { AuthForms } from "@/components/auth-forms";

export const dynamic = "force-dynamic"; // read ADMIN_* env at request time so the hint never drifts
export const metadata = { title: "Login or Register" };

export default function LoginPage() {
  // The on-page hint mirrors the credentials the database is actually seeded with
  // (src/lib/db/seed.ts reads the same env vars). Set HIDE_DEMO_HINTS=1 to suppress.
  const demoAdmin =
    process.env.HIDE_DEMO_HINTS === "1"
      ? undefined
      : {
          email: process.env.ADMIN_EMAIL ?? "admin@medsafe.local",
          password: process.env.ADMIN_PASSWORD ?? "Admin@1234",
        };
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <Suspense fallback={<div className="py-20 text-center text-sm text-slate-500">Loading…</div>}>
        <AuthForms demoAdmin={demoAdmin} />
      </Suspense>
    </div>
  );
}
