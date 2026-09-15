# MedSafe Admin Guide

Audience: competition reviewers and the team member playing "data steward".

## Signing in

Go to **/login** and use the admin account (seeded on first boot from `ADMIN_EMAIL` /
`ADMIN_PASSWORD`, default `admin@medsafe.local` / `Admin@1234` locally; **the live Vercel deployment
uses a rotated password** stored only as a Vercel secret — see `DEPLOYMENT.md` §8). Admins land on **/admin**;
every `/api/admin/*` route re-checks the role server-side — a normal user session gets `403`.

## Dashboard tabs

### Overview
Live counters (users, medicines + verified count, scans, orange/red safety flags, reports) and the
most-searched chart (anonymous `search_stats`).

### Medicines
Full CRUD. Each medicine form includes identity, ingredients, label sections, regulatory fields,
expiry hint and the verification block. **Verification workflow:**

1. Set `verification_status` to *verified* only after opening the source document.
2. Fill `verification_notes` with what you checked.
3. Set `data_confidence` (high/medium/low).
4. Save — your name is stamped as reviewer, the date updates, and the change lands in the audit log.

### Data governance (Sources / Ingredients / Interactions / Import / Audit)
- **Sources**: every dataset citation. New imports start *pending*; open the URL/document, then mark
  verified (records `last_checked`) or rejected. Delete is blocked while medicines cite the source.
- **Ingredients / Interactions**: CRUD; interactions must cite an existing source — the safety engine
  never invents them.
- **Import**: CSV / Excel / JSON.
  1. **Download Import Template** (`medicines.csv` / `.json` / `.xlsx`; the Excel file has a field-notes sheet).
  2. Fill it — required per row: `medicine_name`, `generic_name`, `active_ingredients`, `source_name`,
     `source_url`, `last_updated`, `verification_status`.
  3. **Preview** — every row classified new / update / rejected with per-row errors; rejected rows are
     marked "This record will be rejected."
  4. **Error report (N)** downloads a CSV of `{row, field, message}` for fixing upstream.
  5. **Confirm import** — disabled until ≥1 valid row; commits valid rows in one transaction, writes
     `import_history` and the audit log. Re-importing the same file safely updates.
- **Audit**: complete mutation trail + import history.

### Users
List with per-user scan/cabinet/report counts (no health data, no hashes). **Deactivate** signs the user
out immediately and blocks new sign-ins (`403` at login); **Reactivate** restores access. Admin accounts
cannot be deactivated from the table; you cannot deactivate yourself.

### Reports
Review user-submitted safety reports: mark *reviewed* / *resolved*. Reports are anonymous unless the
user chose to sign them; no health data is collected.

## Safety guardrails (do not bypass)

- Never import a row as `verified` without checking its source document.
- Never fill missing medical facts by guessing — the UI renders
  "Information not available in the verified database." instead.
- The demo dataset is labelled `record_kind = demo`; keep real records separate and sourced.
- Barcode/QR identification is an *aid* — the app never claims authenticity.
