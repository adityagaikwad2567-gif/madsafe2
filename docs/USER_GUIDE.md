# MedSafe User Guide

## Before you start

MedSafe is an **awareness** tool. It shows label-based safety information so you can ask better
questions — it never diagnoses, prescribes, or recommends dosages. Always confirm with a doctor or
pharmacist before starting, stopping or changing any medicine.

## Core loop: Scan → Identify → Analyze → Understand → Alert → Consult

1. **Scan** (`/scan`) — use the camera, upload a pack photo, enter a barcode, or search by name
   (manual search always works; scanning is an aid, not proof of authenticity).
2. **Identify** — the pipeline shows an honest confidence and falls back to manual search when unsure.
3. **Analyze** — the medicine profile shows ingredients, label sections and a 🟢🟡🟠🔴 safety indicator
   driven by fixed database rules.
4. **Understand** — every warning card cites the verified source with last-updated date.
   Missing facts are shown as *"Information not available in the verified database."*
5. **Alert** — the cabinet flags duplicate active ingredients between your medicines, expiry states,
   and drowsiness/driving/pregnancy/breastfeeding awareness.
6. **Consult** — the final step of every card is "consult a qualified healthcare professional."

## Medicines database (`/medicines`)

Search by brand, generic, ingredient, manufacturer or category; filter by prescription requirement;
every profile shows its Verified / Demo / Unverified Information badge, confidence, source link and
reviewer.

## My Cabinet (`/cabinet`)

Add medicines (with expiry dates), get live cross-medicine duplicate-ingredient warnings, expiry
reminders, and per-medicine time-of-day reminders. This is the heart of family safety.

## CycleSafe (`/cyclesafe`) — optional & private

Enable cycle awareness to see menstrual/hormonal medicine categories and careful, non-causal guidance.
Your cycle dates are private: they are never shown to admins and never leave your account.

## MedSafe AI (`/ai`)

Ask about a medicine in plain language. Answers come **only** from verified records, with source,
last-updated and confidence shown. When information is missing, MedSafe AI says so and refuses —
that refusal is a feature, not a failure.

## Reports (`/reports`)

Report expired packaging, damaged packs, label mismatches or suspicious sale. Reports can be
anonymous; you can track your own submissions.

## Language & offline

- Switch **English / हिंदी / मराठी** from the header — safety cards, indicator levels, cabinet alerts
  and AR zones all translate (medicine names stay in Latin script as printed on packs).
- MedSafe is an installable PWA: recently viewed medicine profiles stay readable offline
  (`/offline` lists saved copies). AI, cabinet sync and live checks need a connection.
