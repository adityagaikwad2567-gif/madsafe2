import { getCurrentUser } from "@/lib/auth";
import { AdminClient } from "@/components/admin-client";
import { Card } from "@/components/ui";
import Link from "next/link";
import { ShieldAlert, LogIn } from "lucide-react";

export const metadata = { title: "Admin Dashboard" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <Card className="text-center">
          <ShieldAlert size={26} className="mx-auto text-navy-400" />
          <h1 className="mt-3 text-lg font-bold text-navy-900">Admin access</h1>
          <p className="mt-2 text-sm text-slate-600">Login with an administrator account to continue.</p>
          <Link href="/login?next=/admin" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
            <LogIn size={15} /> Login
          </Link>
        </Card>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <Card className="text-center">
          <ShieldAlert size={26} className="mx-auto text-red-400" />
          <h1 className="mt-3 text-lg font-bold text-navy-900">Not authorised</h1>
          <p className="mt-2 text-sm text-slate-600">
            This area is restricted to administrators. Your account does not have admin rights.
          </p>
          <Link href="/" className="mt-5 inline-block rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">
            Back to home
          </Link>
        </Card>
      </div>
    );
  }

  return <AdminClient adminName={user.name} />;
}
