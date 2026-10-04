# MedSafe API Reference

Base URL (local): `http://localhost:3000` · All responses are JSON.
Auth uses an httpOnly session cookie (`medsafe_session`) set by login/register — no tokens in localStorage.

Generic error shape: `{ "error": "message" }` with proper HTTP status codes
(`400` validation, `401` unauthenticated, `403` forbidden/deactivated, `404` not found, `429` rate-limited with `Retry-After`).

---

## Health

### `GET /api/health`
Always `200` while the process is up.

```json
{ "status": "ok", "service": "medsafe", "database": "ok", "time": "2026-09-13T…" }
```

`database: "error"` signals a DB problem for monitors. Exposes no schema or counts.

---

## Auth

### `POST /api/auth/register`
Body: `{ "name": "…", "email": "…", "password": "…" }` — name ≥2, valid email, password ≥8 with a letter + number.
Rate limit: 5/hour/IP. `201` → `{ ok: true, user: { id, name, email, role } }` and session cookie set.
Errors: `400` validation (specific message), `409` email already registered.

### `POST /api/auth/login`
Body: `{ "email": "…", "password": "…" }`. Rate limit: 10/5min/IP.
`200` → `{ ok: true, user: { … } }`. `401` → generic *"Invalid email or password."* (no user enumeration).
`403` → account deactivated.

### `POST /api/auth/logout`
Destroys the session server-side and clears the cookie. `200` → `{ ok: true }`.

### `GET /api/auth/me`
`200` → `{ user: { id, name, email, role, language, cycle_enabled, … } }` or `{ user: null }`.

### `PATCH /api/auth/profile`
Body (all optional): `{ "name", "language": "en|hi|mr", "privacy": { "anonymous_history": true }, "cycle": { "enabled", "start", "length" } }`.
`200` → updated user. Requires login.

### `DELETE /api/auth/profile`
Deletes the account and **all** associated data (sessions, cabinet, reminders, scan history, reports de-linked).
`200` → `{ ok: true }`. Requires login. Irreversible.

---

## Medicines (public)

### `GET /api/medicines`
Search + filters:

| Param | Meaning |
| --- | --- |
| `q` | free-text across brand/generic/ingredient/manufacturer/category |
| `suggest=1` | lightweight suggestions (no facets) |
| `ingredient=` | exact ingredient name filter |
| `manufacturer=` | manufacturer filter |
| `category=` | category filter |
| `rx=1\|0` | prescription requirement filter |
| `tag=` | engine tag filter (e.g. `drowsiness`, `rx`) |
| `limit` | page size (default 24, max 100) |

`200` → `{ success, count, medicines: [...], facets: [...] }`.
Every row carries `verification` (verified/unverified) and `record_kind` (real; `demo` only exists as a
legacy marker that the boot purge removes). Rows returned for a query also carry `matchScore`/`matchMethod`.

### `GET /api/medicines/search?q=…`
Dedicated normalized search (same engine as the scanner): lowercasing, strength spacing (`500mg` → `500 mg`),
dosage-form unification, an audited OCR-misspelling map (`paracitamol` → `paracetamol`) and bounded typo
tolerance, then ranked matching against the connected database only.

- `200` → `{ success: true, count, query, normalizedQuery, matchQuality: "identified"|"ambiguous", topScore, medicines: [...] }`.
  `matchQuality: "ambiguous"` means several records match about equally — the UI asks the user to pick;
  the engine never silently guesses.
- `404` → `{ success: false, code: "MEDICINE_NOT_FOUND", message, query, normalizedQuery, medicines: [] }`.
- Missing `q` → `400 BAD_REQUEST`.

### `POST /api/medicines/identify`
Body: `{ "query"?, "barcode"?, "ocrConfidence"? }` (typed text, OCR output or a decoded barcode).

- `200` `{ success: true, matchStatus: "identified", medicine: {…full record + source…}, candidates: [...], matchMethod, matchScore }`.
- `200` `{ success: true, matchStatus: "ambiguous", candidates: [...] }` — user picks.
- `404` `{ success: false, code: "MEDICINE_NOT_FOUND" }` · `200` `{ code: "LOW_CONFIDENCE" }` when
  `ocrConfidence < 0.35` (noisy OCR is refused, never guessed).

### `GET /api/medicines/{slug}`
`200` → `{ success: true, medicine: {…, safety-flags, verification block, source block…}, safety: {overall, cards, expiry} }`.
Legacy snake_case fields are still present for existing consumers. `404` → `{ success: false, code: "MEDICINE_NOT_FOUND" }` for unknown slugs.

### `GET /api/medicines/{slug}/warnings`
`200` → `{ success, medicine, warnings: [{level,title,body}], precautions, contraindications, pregnancyCaution, breastfeedingCaution, note }`.
The `note` states honestly when nothing is recorded — absence of warnings is never presented as “safe”.

### `GET /api/medicines/{slug}/interactions?with={other-slug}`
Deterministic interaction data from the `interactions` table only. Without `with=`: rows involving this
medicine's ingredients. With `with=`: pairwise checks across the two ingredient sets (duplicate-ingredient
warnings included). `200` → `{ success, medicine, interactions: [...], note }`.

---

## Scanner & identification

### `POST /api/scan`
Body: `{ "mode": "camera|upload|barcode|manual|voice", "query"?, "barcode"?, "ocrConfidence"? }`.
Rate limit: 30/5min (user or IP). Runs the identification pipeline and records privacy-friendly history.

- Match → `{ status: "identified", message, confidence, candidates: [...], method, steps }` — confidence is
  honest, never 100%.
- Unclear input → `{ status: "uncertain", message, candidates, steps }` with guidance to retry/manual search.
- Unknown barcode → `{ status: "not_found", message, … }` (a barcode never proves authenticity).

OCR runs **on-device** in the browser (tesseract.js — the image never leaves the device); barcode decoding
uses the browser `BarcodeDetector` API with a ZXing fallback. Both feed the shared matching engine through
the endpoints below. No external OCR call is made; `MEDSAFE_OCR_API_KEY` is reserved for a future
server-side provider.

### `POST /api/ocr`
Body: `{ "text": "…", "ocrConfidence": 0.82? }` — normalizes recognized text and matches it against the
medicine table. `200` → `{ success, matchStatus, normalizedText, ocrConfidence, candidates, topScore }`;
`{ success: false, code: "LOW_CONFIDENCE" }` when confidence < 0.35;
`{ success: false, code: "MEDICINE_NOT_FOUND" }` with `recognizedText`/`normalizedText` echo.

### `POST /api/barcode`
Body: `{ "code": "8901234567890" }` — database mapping for an already-decoded barcode/QR value.
`200` → `{ success: true, medicine: {…} }` or `404`/`{ success: false, code: "MEDICINE_NOT_FOUND" }` with
the honest message that a barcode cannot prove a medicine is genuine.

---

## Cabinet (login required)

### `GET /api/cabinet` → `{ items: [ { medicine, expiry, reminders, duplicateFlags, warnings… } ] }`
Live safety analysis per item + cross-item duplicate active-ingredient detection (translated by `medsafe_lang` cookie).

### `POST /api/cabinet` — body `{ "slug", "expiry"? }` · `DELETE /api/cabinet?slug=…`

### `GET/POST/DELETE /api/cabinet/reminders` — per-item time-of-day reminders (`HH:MM`).

---

## History & Reports

### `GET /api/history` (login) → recent scans. `DELETE /api/history` clears the user's scan history.

### `POST /api/reports`
Anonymous-aware safety report. Body: `{ "type": "expired|damaged_packaging|incorrect_label|suspicious_sale|info_mismatch", "description": "≥10 chars", "slug"? }`.
Rate limit: 5/hour/IP. `201` → `{ ok: true, id }` with review notice.

### `GET /api/reports` (login) → the user's own reports.

---

## MedSafe AI

### `POST /api/ai/ask`
Body: `{ "question": "…", "slug"?, "lang": "en|hi|mr"? }`. Rate limit: 20/5min.
RAG over the verified database only. Response: `{ answer, sources: [ { title, url, last_updated } ], confidence: "high|medium|low", disclaimer }`.
Refusal contract — when verified context is insufficient:

> "I do not have enough verified information to answer this safely. Please consult a qualified healthcare professional."

---

## Admin (all require role=admin; mutations are audit-logged)

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/admin/stats` | GET | Dashboard counters, most-searched, red-flag counts |
| `/api/admin/medicines` | GET / POST / PUT / DELETE | Medicine CRUD + verification stamping |
| `/api/admin/data?entity=sources\|ingredients\|interactions` | GET / POST / PATCH / DELETE | Governance CRUD |
| `/api/admin/data?entity=audit` | GET | Audit log + import history |
| `/api/admin/users` | GET | User list with scan/cabinet/report counts (no health data, no hashes) |
| `/api/admin/users` | PATCH | `{ id, active }` — deactivate (revokes sessions) / reactivate; self-deactivation blocked |
| `/api/admin/import?mode=preview\|commit` | POST | Multipart `file` (CSV/XLSX/JSON) or JSON manual record; strict validation |
| `/api/admin/import/template?format=csv\|json\|xlsx` | GET | Downloadable import templates |
| `/api/admin/reports` | GET / PATCH | Report review workflow |

### Import validation contract (commit refuses non-conforming rows)

Required per row: `medicine_name`, `generic_name`, `active_ingredients` (≥1),
`source_name` + `source_url`, `last_updated` (YYYY-MM-DD), `verification_status` ∈ verified/unverified.
Rejected rows return `{ row, field, message }` triples (downloadable as an error report CSV in the UI).
Duplicates (slug/barcode/name+strength+form) update the existing record. Max 500 rows/batch.
Committed rows are always stored as `record_kind = "real"` (the legacy `demo` kind exists only so the
boot purge can delete old fake rows).
