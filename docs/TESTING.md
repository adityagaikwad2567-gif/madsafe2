# MedSafe Testing Report

Date: 2026-09-13 (local battery) · **Live re-run: 2026-09-15 against the production deployment on Vercel**
**Live URL:** https://medsafe-adityagaikwad2567-gifs-projects.vercel.app (alias: https://medsafe-one.vercel.app)

## 0. Live production smoke test (2026-09-15) — ALL PASS

| Check | Result |
| --- | --- |
| Pages: `/`, `/medicines`, `/scan`, `/ai`, `/cyclesafe`, `/medicines/dolo-650`, `/offline` | ✅ 200 |
| Custom 404 (unknown slug + unknown page) | ✅ 404 |
| `GET /api/health` | ✅ `{"status":"ok","database":"ok"}` |
| PWA manifest | ✅ 200 |
| Search API (`?q=dolo`) | ✅ returns seeded verified records |
| Register + session (`/api/auth/me`) | ✅ user id issued, session valid |
| Admin login (rotated production credential) | ✅ 200 |
| Admin guard: anon / normal user / admin → `/api/admin/users` | ✅ denied / 403 / 200 |
| Scan contract (unknown barcode) | ✅ honest `uncertain` + manual-search guidance |
| AI explainer (Dolo 650) | ✅ verified-DB answer, no invented facts |
| `localhost` references in served HTML | ✅ 0 |

Deployment notes live in [`DEPLOYMENT.md`](DEPLOYMENT.md) §8.

---

Date: 2026-09-13 · Environment: Windows, Node 24, production build (`next build` + `next start`), SQLite `medsafe.db`.
Method: automated curl/Node assertion battery against the running production server + database-level assertions.

## 1. Summary

| Area | Checks | Result |
| --- | --- | --- |
| Page rendering (all routes incl. 404) | 15 | ✅ 15/15 |
| Public APIs (health, search, suggest, filters, unknown-slug, scan) | 7 | ✅ 7/7 |
| Auth & authorization (validation, enum, brute-force, lockout, admin guard) | 12 | ✅ 12/12 |
| User lifecycle (register → profile → cabinet → duplicates → reminders → report → AI → logout → delete) | 14 | ✅ 14/14 |
| Admin flows (stats, report review, user deactivation/reactivation, import templates) | 9 | ✅ 9/9 |
| Data quality gates (import validation, demo labels, source display) | verified earlier batch | ✅ pass |
| Static analysis (`tsc --noEmit`, ESLint) | whole repo | ✅ 0 errors |
| Production build (`next build`, 34 routes) | — | ✅ success |

## 2. Functional results (highlights)

- All pages return 200: home, about, medicines, medicine profile, scan, cabinet, cyclesafe, AI, reports,
  login, profile, offline, admin; unknown URLs render the custom 404 (status 404).
- `GET /api/health` → `{status:"ok", database:"ok"}`.
- Search: `q`, `suggest`, `ingredient`, `manufacturer` filters all 200 with results; unknown slug → 404.
- Scanner: demo barcode `8901234500017` → *identified* (confidence 0.97, never 1.0); unknown barcode →
  `status:"not_found"` with manual-search guidance (honest uncertainty, no fake match).
- User: register → me → profile update (name/language) → cabinet add ×2 → **duplicate active-ingredient
  detection fired both ways** (Dolo 650 ↔ Calmol Plus: `duplicates: ["Paracetamol"]`) → reminder add →
  history → anonymous-capable report → AI grounded answer → **AI refusal for an unknown medicine**
  ("I don't have enough verified information to answer this safely…") → logout clears session →
  `me` returns `null` afterwards.
- Admin: stats, reports list + review (`open→reviewing→resolved`), users list, **deactivate → login 403 +
  sessions revoked → reactivate → login 200**, self-deactivation blocked (400), templates (CSV/XLSX) 200.
- Privacy: `DELETE /api/history` clears scan history; `DELETE /api/auth/profile` removes the account —
  database assertion: 0 rows remain.

## 3. Validation & abuse results

| Case | Expected | Result |
| --- | --- | --- |
| Register: invalid email / short name | 400 | ✅ |
| Register: password without number | 400 | ✅ |
| Login: wrong password | 401 generic message | ✅ |
| Login: malformed JSON | 400 | ✅ |
| Cabinet/AI/reports without auth | 401 | ✅ |
| Admin APIs without admin session | 403 | ✅ |
| Import templates without admin | 403 | ✅ |
| XSS payload in search | reflected nowhere | ✅ (no `<script>` in response) |
| SQL-injection payload in search | parameterized query | ✅ 200, no effect |
| Register rate limit (5/h/IP) | 3rd+ attempt → 429 | ✅ 429 with Retry-After |
| Self-deactivation by admin | 400 | ✅ |
| Unknown barcode | honest `not_found` | ✅ |

## 4. Performance notes

- Production build: 34 routes, static generation where possible; server start ≈1s.
- Search is SQL `LIKE` over indexed `name/brand_name/generic_name` + joins; sub-50 ms locally at 15 medicines.
- Rate limiter memory is bounded (10k keys, reaped per call).
- Session GC runs on login; expired cookies are rejected server-side on every request.

## 5. Known limitations (by design, documented in README)

- OCR is a simulation (demo barcodes + text heuristics); `MEDSAFE_OCR_API_KEY` marks the future integration.
- Offline PWA copies show safety text as saved; always re-confirm expiry with a pharmacist.
- Multi-instance deployments need the Redis swap in `src/lib/rate-limit.ts` (single-node profile today).
- Bundled medicine records are clearly-labelled demo data; real records must enter via the admin import
  pipeline with cited sources and the verification workflow.
