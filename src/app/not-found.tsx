import Link from "next/link";
import { Compass, ScanLine, Pill } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * Global 404 page — friendly navigation back into the app.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-16">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
        <Compass size={26} />
      </span>
      <h1 className="mt-5 text-3xl font-bold text-navy-900">Page not found</h1>
      <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-slate-500">
        The page you are looking for does not exist or may have moved. Your saved data is safe —
        use the links below to continue.
      </p>
      <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
        <Link href="/scan" className="group">
          <Card className="flex items-center gap-3 transition group-hover:border-teal-300">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <ScanLine size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-navy-900">Scan a medicine</p>
              <p className="text-xs text-slate-400">Identify before you take</p>
            </div>
          </Card>
        </Link>
        <Link href="/medicines" className="group">
          <Card className="flex items-center gap-3 transition group-hover:border-teal-300">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Pill size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-navy-900">Browse medicines</p>
              <p className="text-xs text-slate-400">Search the verified database</p>
            </div>
          </Card>
        </Link>
      </div>
      <Link href="/" className="mt-6 text-sm font-semibold text-teal-700 hover:underline">
        ← Back to home
      </Link>
    </main>
  );
}
