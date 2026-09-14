/**
 * Route-level loading skeleton for medicine profiles (dynamic route — brief
 * server render window while the DB lookup and safety engine run).
 */
export default function LoadingProfile() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="h-6 w-40 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-3 h-10 w-72 animate-pulse rounded-xl bg-slate-200" />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200 lg:col-span-2" />
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200 lg:col-span-3" />
      </div>
      <p className="mt-6 text-sm text-slate-400">Loading verified safety information…</p>
    </main>
  );
}
