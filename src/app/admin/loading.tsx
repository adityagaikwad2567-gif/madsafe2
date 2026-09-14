/**
 * Route-level loading skeleton for the admin dashboard (heavy client fetch).
 */
export default function LoadingAdmin() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="h-8 w-56 animate-pulse rounded-xl bg-slate-200" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-2xl bg-slate-200" />
      <p className="mt-6 text-sm text-slate-400">Loading admin data…</p>
    </main>
  );
}
