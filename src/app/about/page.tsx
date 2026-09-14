import Link from "next/link";
import {
  ScanLine, CopyX, Car, CalendarClock, ShieldCheck, Baby, HeartHandshake, Brain, Languages, Package,
  Flag, Glasses, Users, Bell, MapPin, Siren, BarChart3, MessageCircle, WifiOff, ArrowRight, FlaskConical,
} from "lucide-react";
import { Card } from "@/components/ui";

export const metadata = { title: "About MedSafe" };

const USP = [
  { icon: ScanLine, label: "Medicine scanning (OCR)" },
  { icon: ScanLine, label: "Barcode / QR support" },
  { icon: CopyX, label: "Duplicate ingredient detection" },
  { icon: HeartHandshake, label: "Interaction awareness" },
  { icon: Car, label: "Drowsiness / driving warning" },
  { icon: CalendarClock, label: "Expiry awareness" },
  { icon: ShieldCheck, label: "Prescription awareness" },
  { icon: Baby, label: "Pregnancy / breastfeeding awareness" },
  { icon: HeartHandshake, label: "CycleSafe menstrual awareness" },
  { icon: Brain, label: "AI + RAG with sources" },
  { icon: Languages, label: "Marathi / Hindi / English" },
  { icon: Languages, label: "Voice-ready architecture" },
  { icon: Package, label: "Personal medicine cabinet" },
  { icon: Users, label: "Family safety" },
  { icon: Flag, label: "Safety reporting" },
  { icon: Glasses, label: "Future AR medicine explainer" },
];

const FUTURE = [
  { icon: Users, title: "Smart Family Cabinet", body: "Per-member medicine views, shared expiry alerts and caregiver reminders under Family Safety Mode." },
  { icon: Bell, title: "Medicine Reminders+", body: "Push/SMS reminders, adherence streaks and refill nudges before a pack runs out." },
  { icon: MapPin, title: "Healthcare Finder", body: "Locate nearby doctors, gynaecologists, pharmacists and hospitals with filters." },
  { icon: Siren, title: "Emergency Guidance", body: "Clear direction to immediate professional or emergency care for serious situations — never diagnosis." },
  { icon: BarChart3, title: "Anonymous Public Health Dashboard", body: "Aggregated, privacy-safe awareness trends (e.g. expired-medicine report clusters) for public insight." },
  { icon: MessageCircle, title: "WhatsApp / Voice Access", body: "Ask MedSafe through WhatsApp or a phone call in English, Hindi, Marathi and Hinglish." },
  { icon: WifiOff, title: "Low-Internet Mode", body: "Offline-first pack with cached medicine data and SMS/IVR fallback for low-connectivity areas." },
];

const AR_POINTS = [
  "Viewfinder with live camera or the labelled demo pack — no setup needed",
  "Projected zones: medicine name, active ingredients, warning zone, expiry state, storage, no-driving icon",
  "Every zone is generated from the verified record and the same deterministic rule engine as the profile page",
  "Tap any highlighted zone for a plain-language explanation; expiry state colours the box (green / amber / red)",
  "Unclear frame → honest low-confidence fallback on the demo pack instead of a forced identification",
  "Privacy-friendly: frames are processed in-session; only the query string is stored in scan history",
];

const STACK = [
  ["Frontend", "Next.js (App Router) + TypeScript + Tailwind CSS"],
  ["Backend", "Next.js Route Handlers (Node runtime)"],
  ["Database", "SQLite (better-sqlite3) — PostgreSQL-ready schema"],
  ["Auth", "Session cookies + bcrypt password hashing"],
  ["AI", "RAG pipeline over the verified DB (LLM-ready adapter)"],
  ["Scanning", "getUserMedia camera + BarcodeDetector + demo OCR"],
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold text-navy-900">About MedSafe</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
        MedSafe is a student-built awareness platform that sits between the medicine packet and the patient. It scans,
        identifies and explains — surfacing verified safety information in simple language and three languages, while
        always directing users to qualified professionals for personal decisions.
      </p>

      <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-5 text-sm font-medium leading-relaxed text-teal-900">
        “MedSafe is not a replacement for doctors. It is a digital awareness layer between the medicine packet and the
        patient.”
      </div>

      {/* USP grid */}
      <h2 className="mt-10 text-lg font-bold text-navy-900">Key differentiators</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {USP.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-[var(--shadow-card)]">
            <Icon size={16} className="shrink-0 text-teal-600" />
            <span className="text-xs font-semibold text-navy-900">{label}</span>
          </div>
        ))}
      </div>

      {/* Future features */}
      <h2 className="mt-10 text-lg font-bold text-navy-900">Future X-factor features</h2>
      <p className="mt-1 text-sm text-slate-500">Designed in the architecture today; implemented in the roadmap tomorrow.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FUTURE.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="border-dashed">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-50 text-navy-600">
              <Icon size={17} />
            </span>
            <h3 className="mt-2.5 text-sm font-bold text-navy-900">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{body}</p>
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700">
              <FlaskConical size={11} /> Planned
            </p>
          </Card>
        ))}
      </div>

      {/* AR Medicine Explainer — now implemented */}
      <div className="mt-10 rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-sky-50 p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white">
            <Glasses size={18} />
          </span>
          <h2 className="text-lg font-bold text-navy-900">AR Medicine Explainer — working prototype</h2>
          <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">New</span>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          What began as a future concept is now a demoable feature: point your camera at a medicine pack and MedSafe
          projects labelled highlight zones — name, ingredients, warnings, expiry state and the no-driving icon —
          directly onto the viewfinder, all driven by the verified database and the deterministic safety engine.
        </p>
        <ul className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {AR_POINTS.map((p) => (
            <li key={p} className="flex gap-2"><span className="text-teal-600">•</span>{p}</li>
          ))}
        </ul>
        <Link href="/ar" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
          Try the AR explainer <ArrowRight size={15} />
        </Link>
      </div>

      {/* Tech stack */}
      <h2 className="mt-10 text-lg font-bold text-navy-900">Technology</h2>
      <Card className="mt-4">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {STACK.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className="text-sm font-medium text-navy-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Disclaimer */}
      <div id="disclaimer" className="mt-10 scroll-mt-24 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-sm font-bold text-amber-900">Medical disclaimer</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-amber-900/90">
          MedSafe is an awareness and information platform. It does not diagnose medical conditions, prescribe
          medicines, recommend dosages, or replace a doctor or pharmacist. Always consult a qualified healthcare
          professional before starting, stopping or changing any medicine.
        </p>
      </div>

      {/* Privacy */}
      <div id="privacy" className="mt-4 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-bold text-navy-900">Data & privacy</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li className="flex gap-2"><span className="text-teal-600">•</span> Minimum personal data: name, email, preferences.</li>
          <li className="flex gap-2"><span className="text-teal-600">•</span> Passwords stored only as bcrypt hashes; sessions are httpOnly cookies.</li>
          <li className="flex gap-2"><span className="text-teal-600">•</span> Scan images are never stored — only the resulting query.</li>
          <li className="flex gap-2"><span className="text-teal-600">•</span> Safety reports can be fully anonymous.</li>
          <li className="flex gap-2"><span className="text-teal-600">•</span> You can delete your account and data from your profile at any time.</li>
        </ul>
        <Link href="/profile#privacy" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline">
          Manage privacy settings <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
