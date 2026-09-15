# MedSafe — AI-Powered Medicine Safety & Awareness Platform

**Scan Before You Take.**

MedSafe is a student innovation prototype: a digital awareness layer between the medicine packet and the patient.
Scan or search a medicine, see its active ingredients, rule-based safety warnings, expiry status and CycleSafe
menstrual/hormonal awareness — then ask MedSafe AI, which answers **only** from verified records and honestly refuses
when information is missing.

> MedSafe is an awareness and information platform. It does not diagnose medical conditions, prescribe medicines,
> recommend dosages, or replace a doctor or pharmacist. Always consult a qualified healthcare professional before
> starting, stopping or changing any medicine.

---

## 1. What's inside

| Area | Details |
| --- | --- |
| Website | Home, Scanner, Medicines database, Medicine profile, CycleSafe, My Cabinet, Safety Reports, About, AI explainer |
| Safety engine | Deterministic rules over verified DB flags — never invented by the AI |
| Duplicate detector | Cross-compares active ingredients of everything in your cabinet |
| Expiry tracker | Expired → red warning; ≤ 90 days → reminder |
| MedSafe AI | Retrieval-augmented Q&A with Source / Last Updated / Information Confidence, refusal-first |
| Multilingual | English · हिंदी · मराठी UI switcher (voice-ready architecture); safety cards, indicator levels, cabinet & AR zones translated server-side |
| Auth | Register / login / logout, bcrypt hashing, httpOnly session cookies, profile + privacy settings, account deletion |
| Reporting | Anonymous safety reports with admin review workflow |
| Admin panel | Stats, medicine CRUD + verification, reports review, most-searched chart |
| PWA / Low-internet mode | Installable app (manifest + service worker); up to 24 recently viewed medicine profiles cached offline; `/offline` launcher; network-first so saved copies auto-refresh; `/api/*` never cached |

## 2. Tech stack

- **Next.js 16** (App Router, Node runtime) + **TypeScript** + **Tailwind CSS 4**
- **SQLite** via `better-sqlite3` (zero-setup; schema is PostgreSQL-ready — see §7)
- **bcryptjs** password hashing, DB-backed session cookies
- **zod** input validation on every API route
- **lucide-react** icons; camera via `getUserMedia`; barcode via browser `BarcodeDetector` (where available); voice via `SpeechRecognition` (where available)

## 3. Quick start (local)

```bash
npm install          # install dependencies
npm run dev          # start on http://localhost:3000
```

The SQLite database (`medsafe.db`) is created and **seeded automatically** on first boot with a clearly-labelled demo
dataset (15 medicines, warnings, interactions, admin + demo users, sample report). Expiry demo dates are generated
relative to today, so the near-expiry reminder and expired-medicine warning are always demonstrable.

Demo accounts (also shown on the login page):

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@medsafe.local` | `Admin@1234` |
| User | `demo@medsafe.local` | `Demo@1234` |

> Change the admin password before any demo/deployment by setting `ADMIN_PASSWORD` (see §6) **before first boot**, or
> via the admin panel once logged in.

### Try these demo flows

1. **Duplicate ingredient detection** — login as the demo user, open **My Cabinet**, add *Dolo 650* and *Calmol Plus*
   (or *Coldrid*). The orange **Duplicate Active Ingredient Detected** banner appears immediately.
2. **Drowsiness & driving alert** — scan/search *Coldrid* or *Alerzo* and open the profile.
3. **Expiry flow** — add *Coldrid* (demo pack date is near/past) to the cabinet, or open the *Coldrid* profile.
4. **Honest uncertainty** — Scanner → “Try the ‘unclear image’ demo”. MedSafe never fakes 100% confidence; unknown
   barcodes and blurry images return the standard “could not be confidently identified” message.
5. **MedSafe AI refusal** — on `/ai`, ask about a non-existent medicine: it refuses instead of inventing.
6. **Admin review** — login as admin → review the seeded report, toggle a medicine's verification, edit/add medicines.

## 4. Environment variables

Copy `.env.example` to `.env.local` and adjust. **No secrets are hard-coded and none are exposed to the frontend.**

```ini
# Admin account seeded on first boot
ADMIN_EMAIL=admin@medsafe.local
ADMIN_PASSWORD=change-me-before-demo

# SQLite database file location (optional)
MEDSAFE_DB_PATH=./medsafe.db

# ── Production integrations (all optional; the prototype runs fully without them) ──
# OCR provider (e.g. Google Vision / AWS Textract) key
MEDSAFE_OCR_API_KEY=
# Barcode/QR service key (or rely on the browser BarcodeDetector API)
MEDSAFE_BARCODE_API_KEY=
# LLM for the explainer layer (RAG stays deterministic without it)
MEDSAFE_AI_PROVIDER=
MEDSAFE_AI_API_KEY=
# PostgreSQL connection for production deployment
DATABASE_URL=
```

## 5. Project structure

```
src/
  app/
    page.tsx                  # Home (hero, workflow, features, CycleSafe, disclaimer)
    ar/                       # AR Medicine Explainer (projected label zones)
    scan/                     # Scanner: camera / upload / barcode / manual / voice
    medicines/                # Database list + [slug] profile with safety indicator
    cyclesafe/                # CycleSafe — women's health awareness
    cabinet/                  # My Medicine Cabinet (auth-gated dashboard)
    ai/                       # MedSafe AI explainer + RAG architecture
    reports/                  # Anonymous safety reporting
    login/ profile/           # Auth + privacy settings
    admin/                    # Role-guarded admin dashboard
    api/                      # REST route handlers (see §8)
  components/                 # UI + client features
  lib/
    db/                       # schema.sql, client, demo seed
    safety-engine.ts          # Deterministic rules (warnings, expiry, duplicates, interactions)
    scan-pipeline.ts          # Identification pipeline (demo OCR/barcode)
    ar-scene.ts               # AR scene builder (deterministic label zones)
    rag.ts                    # Retrieval + grounded answer composition
    auth.ts                   # Sessions, hashing, validation
    i18n/                     # en/hi/mr dictionaries + provider
```

## 6. Admin credentials setup

The admin account is created on **first boot** from environment variables:

1. Create `.env.local` with `ADMIN_EMAIL` and `ADMIN_PASSWORD` (8+ chars).
2. Delete `medsafe.db*` if it already exists (seeding runs only on an empty database).
3. Start the server — the admin row is inserted with your credentials and a bcrypt hash.

To promote an existing user instead: `UPDATE users SET role='admin' WHERE email='...';` (and insert a matching row
into the `admins` table).

## 7. Database schema

Eleven core tables (SQLite; identical design ports to PostgreSQL):

`users`, `sessions`, `admins`, `sources`, `medicines`, `active_ingredients`, `medicine_ingredients`,
`warnings`, `interactions`, `user_medicines`, `reminders`, `scan_history`, `reports`, `translations`, `search_stats`

- Medicines support **multiple active ingredients** via `medicine_ingredients`.
- Every medicine record carries `verification` (verified/unverified), `verified_by`, `last_updated` and a `source_id`.
- Warnings and interactions are rows — the AI never writes them.
- Full SQL: [`src/lib/db/schema.sql`](src/lib/db/schema.sql).

### Production database (PostgreSQL)

The schema maps 1:1. For production swap `src/lib/db/index.ts` for a `pg`/`postgres` Pool client:

```bash
npm i pg
# DATABASE_URL=postgres://user:pass@host:5432/medsafe
```

Then replace the `better-sqlite3` calls (prepare/run/get/all map to query/values/rows) and translate
`INTEGER` booleans to `BOOLEAN`, `datetime('now')` to `now()`. `schema.sql` already uses compatible types.

## 8. API routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create account (zod-validated, bcrypt, rate-limited) |
| POST | `/api/auth/login` | Login, sets httpOnly session cookie (rate-limited: 10 / 5 min / IP) |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/me` | Current user |
| PATCH/DELETE | `/api/auth/profile` | Update profile / delete account + data |
| GET | `/api/health` | **Health check** — service + database status, no secrets |
| GET | `/api/medicines` | Search: `?q=` (name/brand/generic/ingredient/manufacturer/category), `?ingredient=`, `?manufacturer=`, `?category=`, `?rx=1\|0`, `?tag=`, `?suggest=1`, `?limit=` — returns facets + verification/record_kind labels |
| GET | `/api/medicines/[slug]` | **Medicine details API** — full record + source/verification metadata + safety cards |
| GET | `/api/admin/data?entity=…` | Admin governance: `sources\|ingredients\|interactions\|audit` (+ import history under `audit`) |
| POST | `/api/ar/features` | AR explainer: label zones for a frame (`query`/`barcode`/`uncertain`) |
| POST | `/api/scan` | Identification pipeline (`mode`: camera/upload/barcode/manual/voice) |
| GET/POST/DELETE | `/api/cabinet` | Cabinet items with live safety analysis |
| GET/POST/DELETE | `/api/cabinet/reminders` | Reminders per cabinet item |
| GET/DELETE | `/api/history` | Privacy-friendly scan history |
| POST | `/api/ai/ask` | MedSafe AI (RAG; returns source/updated/confidence) |
| POST/GET | `/api/reports` | Anonymous report / my reports |
| GET | `/api/admin/stats` | Dashboard counters + most-searched (admin-only) |
| GET/POST/DELETE | `/api/admin/medicines` | Medicine CRUD (admin-only) |
| GET/PATCH | `/api/admin/reports` | Report review workflow (admin-only) |
| GET/PATCH | `/api/admin/users` | User management: list with counts, deactivate/reactivate (admin-only, audit-logged) |
| GET | `/api/admin/import/template?format=csv\|json\|xlsx` | Downloadable import templates (admin-only) |
| POST/GET | `/api/admin/import` | **Import API**: `?mode=preview\|commit`, multipart `file` (CSV/Excel/JSON) or JSON manual record; GET returns import history |
| GET | `/api/admin/stats` | Dashboard counters + most-searched (admin-only) |

All routes validate input with **zod**, enforce auth/roles server-side, and return generic errors (no user
enumeration, no stack traces). Sensitive routes are **rate-limited** (login 10/5min/IP, register 5/h/IP,
scan 30/5min/user, AI 20/5min/user, reports 5/h/IP) with `429 + Retry-After` responses.

Full request/response documentation: [`docs/API.md`](docs/API.md).

### Import & verification workflow (data governance)

1. **Templates**: download `medicines.csv` / `medicines.json` / `medicines.xlsx` directly from
   **Admin → Data → Import → Download Import Template** (served by `GET /api/admin/import/template?format=…`,
   generated from one shared definition in `src/lib/import/template.ts` so all three never drift).
   The Excel file includes a second sheet explaining every field. The examples are clearly fictional —
   delete them before importing real data.
2. **Preview**: Admin → Data → Import → choose file → *Preview*. The engine validates every row and shows
   new/update/rejected classification with per-row errors, each marked “This record will be rejected.”
   If any row fails, **Error report (N)** downloads a CSV of `{row, field, message}`. **Nothing is written yet**,
   and *Confirm import* stays disabled when there are no valid rows.
3. **Confirm**: press *Confirm import* — valid rows commit in one transaction (duplicates update the existing
   record and re-link ingredients), the run is written to `import_history`, and an `audit_log` entry records actor + counts.
4. **Verify**: new sources start as `pending`. A reviewer checks the linked document, then marks the source
   verified/rejected in Admin → Data → Sources. Medicine records carry their own
   `verification_status` + `verification_notes` + `data_confidence` (high/medium/low), stamped by the reviewer.
5. **Display**: every medicine page shows a **Verified / Demo / Unverified Information** badge, the confidence
   level, a clickable source (URL or document name + publication date), last-updated date, reviewer, and notes.
   Missing facts render as “Information not available in the verified database.” — never filled with guesses.

**Validation rules (enforced in `src/lib/import/medicine-import.ts`)**

- `medicine_name` required — record rejected otherwise
- `generic_name` required
- `active_ingredients` required — at least one parseable ingredient entry
- source required — `source_name` + `source_url` (document_name optional), or `source_id` of an existing source
- `last_updated` required, `YYYY-MM-DD`
- `verification_status` required ∈ `verified \| unverified`; `data_confidence` ∈ `high \| medium \| low` (optional, defaults by status)
- `record_kind` ∈ `demo \| real` (controls the Demo Information badge)
- dates `YYYY-MM-DD`; lists via `;`, `\|` or newlines; booleans `true/false/yes/no/1/0`
- duplicate detection: slug → barcode → name+strength+form; duplicates become updates
- max 500 rows/batch; every rejection includes `{row, field, message}` for the error report

> **Data honesty note:** the bundled dataset is a clearly-labelled **demo** dataset (`record_kind='demo'`).
> Fact patterns follow public label references (CDSCO consumer-label patterns, WHO EML) so the product flows are
> realistic, but brand/manufacturer strings are placeholders and nothing here is an official medical database.
> Import real records via the admin CSV/Excel/JSON pipeline with their own sources, then verify them.

### Admin verification checklist

1. Import (or manually add) a record with a real source document link.
2. Open the source document; confirm uses/precautions/side effects/contraindications match it.
3. Mark the **source** verified (Sources tab) — this records `last_checked`.
4. Edit the medicine, set `verification_status = verified`, fill `verification_notes` (what you checked) and
   `data_confidence`, then save. Your name is stamped as reviewer; the audit log records the change.

## 9. Local run & deployment

### Local

```bash
npm install
npm run dev              # development
npm run build && npm start   # production build
npm run db:seed          # create + seed the database manually
npm run db:backup        # consistent snapshot -> medsafe-backup-<date>.db
npm run db:reset         # delete the DB (fresh reseed on next boot)
npm run typecheck        # tsc --noEmit
```

### Live deployment

**MedSafe is deployed on Vercel (Production):**

- **App:** https://medsafe-adityagaikwad2567-gifs-projects.vercel.app
- **Short alias:** https://medsafe-one.vercel.app
- **Health check:** `GET /api/health` → `{"status":"ok","database":"ok"}`

The production admin password was rotated at deploy time (stored as a Vercel secret; not committed
anywhere). To rotate it: `vercel env rm ADMIN_PASSWORD production` → `vercel env add ADMIN_PASSWORD production`
→ redeploy (the SQLite store re-seeds its admin from these env vars on cold start).

### Deploy (step-by-step)

Detailed, copy-paste instructions per platform: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Summary:

1. **Vercel (done — live, see above):** import the repo, add env vars from §4, deploy. Note Vercel's serverless
   filesystem is ephemeral — for persistent data use Render/Railway below, or attach Postgres and set `DATABASE_URL`.
2. **Render / Railway (persistent SQLite):** Node service, build `npm run build`, start `npm start`,
   set `MEDSAFE_DB_PATH=/data/medsafe.db` with a persistent disk. Health check path: `/api/health`.
3. **Docker-ready:** the app is a standard Node server; a minimal `Dockerfile` is a copy + `npm ci --omit=dev` +
   `npm start`.

HTTPS-ready: cookies are issued with `Secure` in production, `SameSite=Lax`, `httpOnly`; no secrets reach the client
bundle. Uptime monitoring: point any checker at `GET /api/health` (200 + `database:"ok"`).

## 10. Implemented vs future features

### Implemented in this prototype

- Full navigation & responsive, mobile-first UI (navy/teal design system, CycleSafe pink identity)
- **AR Medicine Explainer** (`/ar`): viewfinder that projects verified label zones — name, ingredients, warning zone,
  expiry state (green/amber/red), storage, no-driving icon — onto the demo pack or a live camera frame, with
  tap-for-details and an honest low-confidence fallback for unclear frames
- Scanner: camera (`getUserMedia` + fallback), image upload, barcode/QR (browser `BarcodeDetector` + manual entry),
  manual search, voice search (`SpeechRecognition` + fallback) — with demo OCR simulation
- Identification pipeline with staged UI, honest confidence (never 100%) and uncertainty fallback
- Medicine profile: identity, ingredients, uses, precautions, side effects, storage, expiry, prescription/drowsiness/
  driving/pregnancy/breastfeeding/menstrual awareness, source + last updated + verified-by
- Safety indicator (🟢🟡🟠🔴) driven 100% by the deterministic rule engine on database flags
- Duplicate active ingredient detection + rule-based interaction awareness in the cabinet
- Expiry tracking (expired → red warning; ≤90 days → reminder) + reminders
- Medicine cabinet with scan history (privacy-friendly) and Family Safety Mode placeholder
- CycleSafe: cycle-info panel (optional, private), menstrual/hormonal/delay categories, careful wording
- MedSafe AI with RAG over verified data, sources, information confidence and refusal behaviour
- English / हिंदी / मराठी switcher; voice-ready structure (en-IN / hi-IN / mr-IN recognition hints)
- Full safety content layer in hi/mr: warning cards, indicator levels, menstrual notes, interaction descriptions and AR zone labels served from the `translations` table (re-synced on every boot), rendered server-side via the `medsafe_lang` cookie that the switcher keeps in sync
- Auth (bcrypt + sessions), profile with privacy settings and full data deletion
- Anonymous safety reporting + admin review (status, notes, resolve)
- Admin dashboard: stats cards, most-searched chart, medicine CRUD, verification workflow
- Seeded, clearly-labelled demo dataset covering all required scenarios

### Prototype simulations (production would replace)

- OCR is simulated (text heuristics + demo barcodes); plug in Google Vision/Tesseract via `MEDSAFE_OCR_API_KEY`
- AR zone projection uses stored/demo coordinates on a stylized pack; production would combine real OCR with
  on-device text recognition to locate regions in the lens
- Offline profile copies show safety content as saved; expired/near-expiry statuses render from the stored date —
  always re-confirm with a pharmacist when offline
- LLM answer composition is template-based RAG; plug any LLM via `MEDSAFE_AI_PROVIDER/API_KEY`
- Voice input uses the browser API where available; WhatsApp/IVR channels are future work

### Future X-factor features (UI/architecture placeholders ready)

AR Medicine Explainer (working prototype) · Smart Family Cabinet · Medicine Reminder+ · Healthcare Finder ·
Emergency Guidance · Anonymous Public Health Dashboard · WhatsApp/Voice Access · **Low-Internet Mode (working: installable PWA + offline profile cache)**

### Admin dashboard (full inventory)

Overview (stats + most-searched chart + latest reports) · Medicines CRUD + verification workflow · Data governance
(sources / ingredients / interactions CRUD, CSV/Excel/JSON import with preview + error report, import history,
audit log) · Users (list with activity counts, deactivate/reactivate with session revocation) · Reports review.

### Documentation set

- [`docs/API.md`](docs/API.md) — full REST API reference
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema, relationships, migrations, backup
- [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) — verification workflow, import, user management
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — end-user walkthrough
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel / Render / Railway steps + monitoring
- [`docs/TESTING.md`](docs/TESTING.md) — test plan and results report

---

## Team Adi²

- **Aditya Vijay Gaikwad**
- **Aditi Naik**

Built as a student innovation prototype for a national-level technology competition.
MedSafe is not a replacement for doctors — it is the awareness layer between the packet and the patient.
