import Link from "next/link";
import {
  ScanLine, Upload, Search, Camera, Barcode, Mic, Pill, AlertTriangle, CopyX, Baby, HeartHandshake,
  CalendarClock, Brain, Languages, Package, Flag, ShieldCheck, Stethoscope, ArrowRight, Sparkles, Glasses,
} from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import { HomeHero } from "@/components/home-hero";

const WORKFLOW = [
  { icon: ScanLine, label: "Scan" },
  { icon: Search, label: "Identify" },
  { icon: ShieldCheck, label: "Verify" },
  { icon: Sparkles, label: "Analyze" },
  { icon: Brain, label: "Explain" },
  { icon: AlertTriangle, label: "Alert" },
  { icon: Stethoscope, label: "Consult" },
];

const SAFETY_FEATURES = [
  { icon: Pill, title: "Active ingredient awareness", body: "See exactly what's inside — not just the brand name." },
  { icon: CopyX, title: "Duplicate ingredient detection", body: "Two medicines with the same ingredient? MedSafe flags it before you combine them." },
  { icon: AlertTriangle, title: "Drowsiness & driving alerts", body: "Verified drowsiness information becomes a clear, prominent warning." },
  { icon: CalendarClock, title: "Expiry awareness", body: "Track expiry across your cabinet with reminders before packs expire." },
  { icon: ShieldCheck, title: "Prescription awareness", body: "Know which medicines are prescription-only and must not be self-used." },
  { icon: Baby, title: "Pregnancy & breastfeeding awareness", body: "Documented cautions surface before use, with guidance to consult a doctor." },
  { icon: HeartHandshake, title: "Interaction awareness", body: "Rule-based cross-checks between the medicines in your cabinet." },
  { icon: Flag, title: "Safety reporting", body: "Anonymously report expired or suspicious medicines for review." },
  { icon: Glasses, title: "AR medicine explainer", body: "Project name, expiry and warning highlights straight onto the pack in your viewfinder." },
];

export default function Home() {
  return (
    <div>
      <HomeHero />

      {/* How MedSafe works */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <SectionTitle center title="How MedSafe works" sub="A digital awareness layer between the medicine packet and the patient." />
        <div className="flex flex-wrap items-stretch justify-center gap-2">
          {WORKFLOW.map(({ icon: Icon, label }, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className="flex w-24 flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-4 shadow-[var(--shadow-card)] sm:w-28">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Icon size={18} />
                </span>
                <span className="text-xs font-semibold text-navy-900">{label}</span>
              </div>
              {i < WORKFLOW.length - 1 ? <ArrowRight size={14} className="hidden text-slate-300 sm:block" /> : null}
            </div>
          ))}
        </div>
      </section>

      {/* Safety features */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle title="Safety features" sub="Rule-based checks on verified information — never invented." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SAFETY_FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="hover:border-teal-200">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                  <Icon size={19} />
                </span>
                <h3 className="mt-3 text-sm font-bold text-navy-900">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CycleSafe */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid items-center gap-6 rounded-3xl border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-pink-50/60 p-8 shadow-[var(--shadow-card)] md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-700">
              <HeartHandshake size={13} /> CycleSafe — Women&rsquo;s Health
            </span>
            <h2 className="mt-3 text-2xl font-bold text-navy-900">Menstrual & hormonal medicine awareness</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              CycleSafe surfaces documented menstrual and hormonal effects of medicines — period-delay medicines, heavy
              bleeding support, iron & anaemia awareness — with careful, non-diagnostic wording and clear consultation
              guidance.
            </p>
            <Link
              href="/cyclesafe"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-700"
            >
              Explore CycleSafe <ArrowRight size={15} />
            </Link>
          </div>
          <div className="rounded-2xl border border-pink-100 bg-white/80 p-5 text-sm text-slate-600">
            <p className="font-semibold text-navy-900">Careful by design</p>
            <p className="mt-2">
              “Some medicines may affect menstrual patterns in certain people. This does not confirm that the medicine
              caused a change. Consult a qualified healthcare professional for personal advice.”
            </p>
            <p className="mt-3 text-xs text-slate-500">CycleSafe never diagnoses hormonal problems or predicts fertility effects.</p>
          </div>
        </div>
      </section>

      {/* AI + multilingual + cabinet + reporting */}
      <section className="bg-white py-14">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 md:grid-cols-2">
          <Card>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Brain size={19} /></span>
            <h3 className="mt-3 font-bold text-navy-900">AI-powered explanation</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              MedSafe AI explains verified information in simple language — and says “I don&rsquo;t have enough verified
              information” rather than guessing. Retrieval-augmented, source-backed, refusal-first.
            </p>
            <Link href="/ai" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline">
              Try MedSafe AI <ArrowRight size={14} />
            </Link>
          </Card>
          <Card>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Languages size={19} /></span>
            <h3 className="mt-3 font-bold text-navy-900">English · हिंदी · मराठी</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Key safety information is available in all three languages, with a voice-ready architecture prepared for
              English, Hindi, Marathi and Hinglish speech input.
            </p>
          </Card>
          <Card>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Package size={19} /></span>
            <h3 className="mt-3 font-bold text-navy-900">My medicine cabinet</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Track what&rsquo;s in your cabinet, compare active ingredients, catch duplicates, watch expiry dates and set
              reminders — with Family Safety Mode prepared for future expansion.
            </p>
            <Link href="/cabinet" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline">
              Open your cabinet <ArrowRight size={14} />
            </Link>
          </Card>
          <Card>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Flag size={19} /></span>
            <h3 className="mt-3 font-bold text-navy-900">Safety reporting</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Report expired medicine, damaged packaging, incorrect labels or suspicious sale — anonymously. Reports are
              reviewed for awareness and follow-up.
            </p>
            <Link href="/reports" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline">
              Report an issue <ArrowRight size={14} />
            </Link>
          </Card>
        </div>
      </section>

      {/* Demo notice */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Demo dataset notice</p>
          <p className="mt-1 leading-relaxed">
            This prototype runs on a small, clearly-labelled demo dataset. It is <strong>not</strong> an official
            medical database. Safety classifications follow the platform&rsquo;s rule engine on that demo data — always verify
            with a pharmacist.
          </p>
        </div>
      </section>
    </div>
  );
}
