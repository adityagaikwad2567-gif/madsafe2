import { getCurrentUser } from "@/lib/auth";
import { ProfileClient } from "@/components/profile-client";
import { Card } from "@/components/ui";
import Link from "next/link";
import { LogIn } from "lucide-react";

export const metadata = { title: "My Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <Card className="text-center">
          <h1 className="text-lg font-bold text-navy-900">My Profile</h1>
          <p className="mt-2 text-sm text-slate-600">Login to manage your profile and privacy settings.</p>
          <Link href="/login?next=/profile" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
            <LogIn size={15} /> Login
          </Link>
        </Card>
      </div>
    );
  }
  return <ProfileClient user={user} />;
}
