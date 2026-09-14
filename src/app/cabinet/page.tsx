import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { CabinetClient } from "@/components/cabinet-client";
import { Card } from "@/components/ui";
import Link from "next/link";
import { LogIn } from "lucide-react";

export const metadata = { title: "My Medicine Cabinet" };
export const dynamic = "force-dynamic";

export default async function CabinetPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <Card className="text-center">
          <h1 className="text-lg font-bold text-navy-900">My Medicine Cabinet</h1>
          <p className="mt-2 text-sm text-slate-600">
            Login to track your medicines, catch duplicate ingredients and watch expiry dates.
          </p>
          <Link
            href="/login?next=/cabinet"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
          >
            <LogIn size={15} /> Login or register
          </Link>
        </Card>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Suspense fallback={<div className="py-20 text-center text-sm text-slate-500">Loading cabinet…</div>}>
        <CabinetClient userName={user.name} />
      </Suspense>
    </div>
  );
}
