# MedSafe Deployment Guide

The app is a single Next.js (Node runtime) service + SQLite file, or the same service pointed at
PostgreSQL. Choose one of the three paths below.

## 0. Prepare (all paths)

```bash
cp .env.example .env.local   # then fill values — never commit .env*
npm run build                # must succeed locally first
```

Required env in production:

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | admin account created on first boot of an **empty** DB — change the defaults |
| `MEDSAFE_DB_PATH` | persistent SQLite path (e.g. `/data/medsafe.db` on Render/Railway) |
| `MEDSAFE_AI_API_KEY` etc. | optional integrations; the app runs fully without them |

## 1. Render / Railway (recommended — persistent disk)

1. Create a **Web Service** from the repo (Node runtime).
2. Build command: `npm ci && npm run build` · Start command: `npm start`.
3. Add a **persistent disk** mounted at `/data` and set `MEDSAFE_DB_PATH=/data/medsafe.db`.
4. Add env vars from the table above (set `NODE_ENV=production`).
5. Health check path: **`/api/health`** (returns `200` + `database:"ok"`).
6. Deploy; first boot creates schema, seeds demo data and creates the admin account.
7. **Immediately sign in at `/admin` and change the admin password via the seeded credentials policy**
   (or set a strong `ADMIN_PASSWORD` before first boot).

## 2. Vercel

1. Import the repo, framework auto-detected (Next.js). Add the env vars in Project → Settings → Environment Variables.
2. Deploy — `next build` runs automatically.
3. **Caveat:** Vercel's filesystem is ephemeral; SQLite resets per instance. For real persistence on
   Vercel, attach a managed Postgres (Neon/Supabase), set `DATABASE_URL`, and switch the DB client per
   `docs/DATABASE.md` §PostgreSQL migration. For a pure demo, Vercel works as-is (data resets on redeploy).
4. Set a custom domain; HTTPS is automatic (session cookies are `Secure` in production).

## 3. Docker / any Node host

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

Mount a volume for the DB (`-v medsafe-data:/data`, `MEDSAFE_DB_PATH=/data/medsafe.db`), put HTTPS in
front (Caddy: `medsafe.example.com { reverse_proxy localhost:3000 }`).

## 4. Database operations in production

```bash
npm run db:backup   # schedule daily via cron; stores medsafe-backup-<date>.db
npm run db:seed     # only on an empty DB (boot auto-seeds anyway)
npm run db:reset    # destructive — re-provision demo state
```

## 5. Monitoring & uptime

- Health probe: `GET /api/health` → `{ status, service, database, time }`; alert if `database != "ok"`.
- UptimeRobot/Better Stack: monitor `https://<host>/api/health` every 5 min.
- Server errors are logged to stdout (visible in Render/Railway/Docker logs).

## 6. Post-deploy smoke test (2 minutes)

1. `/api/health` returns `database:"ok"`.
2. Home loads; switch language to हिंदी and back.
3. Search "Dolo" → open profile → Verified/Demo badge + source link visible.
4. `/scan` → demo barcode `8901234500017` → Dolo 650 match.
5. Register a test user → add two medicines to cabinet → duplicate banner appears.
6. Log in as admin → Users tab lists the test user → deactivate → test user's next request fails auth.

## 7. Temporary Vercel deployment (no account needed)

The Vercel CLI can create a real, public, HTTPS deployment that anyone can open — useful for a
competition demo link. It is **ephemeral** (SQLite lives in `/tmp`, wiped when the instance is
recycled) — for durable data use §1 (Render disk) or the Postgres path.

```bash
vercel deploy --temporary --prod --yes     # prints a https://...vercel.app URL
```

Configuration already handled in-repo: `next.config.ts` traces `schema.sql` into the serverless
bundle and redirects SQLite writes to `/tmp` when `VERCEL=1`; `metadataBase`/robots/sitemap derive
from `NEXT_PUBLIC_SITE_URL` or `VERCEL_URL`, so no localhost URLs are emitted.

## 8. Actual deployment status

- **Deployment attempt (this session):** the sandbox has the Vercel CLI but no account credentials;
  `vercel deploy --temporary` requires login or `--token`, and no Supabase/Render/Railway keys exist
  in the environment. A real public URL therefore requires one credential from the team — the exact
  one-liner is in the chat handoff. Everything else (build, configs, env handling, fresh-boot
  seeding) is verified and waiting.
- **Repository:** initialized on `main`, initial commit `a517c20`, working tree clean — push-ready
  for GitHub → Render blueprint import (`git remote add origin <url> && git push -u origin main`).
- **First-boot production simulation: PASSED.** With an empty database directory and
  `NEXT_PUBLIC_SITE_URL=https://…` set, the production server self-migrated, self-seeded, created
  the admin account, and served health `database:"ok"`, correct robots.txt/sitemap.xml (zero
  localhost references), and a working admin login on the first request.
- Until a URL is recorded here, **no live deployment exists** — no claim of one is made (honesty rules).
