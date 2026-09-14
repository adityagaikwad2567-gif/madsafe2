import { Suspense } from "react";
import { AuthForms } from "@/components/auth-forms";

export const metadata = { title: "Login or Register" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <Suspense fallback={<div className="py-20 text-center text-sm text-slate-500">Loading…</div>}>
        <AuthForms />
      </Suspense>
    </div>
  );
}
