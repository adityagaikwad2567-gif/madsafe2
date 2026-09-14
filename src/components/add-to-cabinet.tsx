"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Check, LogIn } from "lucide-react";

export function AddToCabinetButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "login">("idle");

  const add = async () => {
    setState("busy");
    const res = await fetch("/api/cabinet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (res.status === 401) {
      setState("login");
      return;
    }
    if (res.ok) {
      setState("done");
      router.refresh();
      setTimeout(() => setState("idle"), 2500);
    } else {
      setState("idle");
    }
  };

  if (state === "login") {
    return (
      <a href="/login?next=/cabinet" className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">
        <LogIn size={15} /> Login to add
      </a>
    );
  }

  return (
    <button
      onClick={add}
      disabled={state === "busy" || state === "done"}
      className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-70"
    >
      {state === "done" ? <Check size={15} /> : <FolderPlus size={15} />}
      {state === "done" ? "Added to cabinet" : "Add to My Cabinet"}
    </button>
  );
}
