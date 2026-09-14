import Link from "next/link";
import {
  HeartHandshake, Droplets, Pill, Baby, MilkOff, CalendarClock, Info, ShieldAlert, Stethoscope, ArrowRight,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { AskMedSafeAI } from "@/components/ask-ai";
import { CycleInfoPanel } from "@/components/cycle-info-panel";

export const metadata = { title: "CycleSafe — Women's Health" };
export const dynamic = "force-dynamic";

const CATEGORIES = [
  {
    icon: Droplets,
    title: "Menstrual medicine awareness",
    body: "Period-pain relief and heavy-bleeding support medicines, with documented effects and clear limits on what is known.",
    tag: "menstrual",
  },
  {
    icon: Pill,
    title: "Hormonal medicine awareness",
    body: "Hormonal treatments such as progestogens — strictly prescription-only, with doctor-supervision guidance.",
    tag: "hormonal",
  },
  {
    icon: CalendarClock,
    title: "Menstrual-delay medicine information",
    body: "Why period-delay medicines are prescription-only, and what documented effects and cautions exist.",
    tag: "delay",
  },
  {
    icon: Baby,
    title: "Pregnancy-related caution",
    body: "Medicines that need a doctor's guidance during pregnancy or when planning pregnancy.",
    tag: "menstrual",
  },
  {
    icon: MilkOff,
    title: "Breastfeeding caution",
    body: "Awareness entries for breastfeeding safety, always pointing to professional advice.",
    tag: "hormonal",
  },
  {
    icon: ShieldAlert,
    title: "Documented effects — stated carefully",
    body: "Where reliable information exists, it is shared with non-diagnostic wording and uncertainty made explicit.",
    tag: "menstrual",
  },
];

export default async function CycleSafePage() {
  const db = getDb();
  const meds = db
    .prepare(
      `SELECT slug, name, brand_name, generic_name, form, strength, category, verification, cycle_tags, menstrual_note
       FROM medicines WHERE cycle_tags != '[]' ORDER BY name`
    )
    .all() as Array<{
      slug: string; name: string; brand_name: string | null; generic_name: string | null;
      form: string | null; strength: string | null; category: string | null; verification: string;
      cycle_tags: string; menstrual_note: string | null;
    }>;

  const byTag = (tag: string) => meds.filter((m) => m.cycle_tags.includes(`"${tag}"`));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header with pink identity */}
      <div className="rounded-3xl border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-pink-100/70 p-8 shadow-[var(--shadow-card)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-700">
          <HeartHandshake size={13} /> MedSafe for Women&rsquo;s Health
        </span>
        <h1 className="mt-3 text-3xl font-bold text-navy-900">CycleSafe</h1>
        <p className="mt-1 font-medium text-pink-700">Menstrual & hormonal medicine awareness</p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
          CycleSafe helps you understand how medicines relate to menstrual and hormonal health — carefully, without
          diagnosing. It surfaces documented effects, prescription requirements and consultation guidance so you can
          have a better conversation with a qualified professional.
        </p>
      </div>

      {/* Careful-wording banner */}
      <div className="mt-5 rounded-2xl border border-pink-200 bg-pink-50/70 p-4 text-sm leading-relaxed text-pink-900">
        <p className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>
            Some medicines may affect menstrual patterns in certain people. This does not confirm that the medicine
            caused a change. Consult a qualified healthcare professional for personal advice. CycleSafe does not
            diagnose hormonal problems and never claims a medicine causes infertility.
          </span>
        </p>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {/* Left: cycle info (optional, private) */}
        <div className="space-y-5">
          <CycleInfoPanel />
          <Card className="border-pink-100">
            <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
              <Stethoscope size={15} className="text-pink-600" /> Consultation guidance
            </h2>
            <ul className="mt-2.5 space-y-2 text-sm text-slate-600">
              <li className="flex gap-2"><span className="text-pink-500">•</span> Sudden, heavy or prolonged bleeding → see a gynaecologist.</li>
              <li className="flex gap-2"><span className="text-pink-500">•</span> Severe period pain that limits daily life → medical evaluation, not self-medication.</li>
              <li className="flex gap-2"><span className="text-pink-500">•</span> Considering period-delay medicines → prescription-only; consult a doctor first.</li>
              <li className="flex gap-2"><span className="text-pink-500">•</span> Pregnant or breastfeeding → check every medicine with a professional.</li>
            </ul>
          </Card>
        </div>

        {/* Right: categories + medicines */}
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {CATEGORIES.map(({ icon: Icon, title, body, tag }) => (
              <Card key={title} className="border-pink-100">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
                  <Icon size={17} />
                </span>
                <h3 className="mt-2.5 text-sm font-bold text-navy-900">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{body}</p>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {byTag(tag).slice(0, 3).map((m) => (
                    <Link key={m.slug} href={`/medicines/${m.slug}`} className="rounded-full bg-pink-50 px-2.5 py-0.5 text-xs font-medium text-pink-700 hover:bg-pink-100">
                      {m.name}
                    </Link>
                  ))}
                  {byTag(tag).length === 0 ? <span className="text-xs text-slate-400">Demo records coming soon.</span> : null}
                </div>
              </Card>
            ))}
          </div>

          <Card className="border-pink-100">
            <h2 className="text-sm font-bold text-navy-900">Medicines with CycleSafe awareness notes</h2>
            <p className="mt-0.5 text-xs text-slate-500">Demo records — verified information shown where available.</p>
            <ul className="mt-3 divide-y divide-pink-50">
              {meds.map((m) => (
                <li key={m.slug} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/medicines/${m.slug}`} className="text-sm font-semibold text-navy-900 hover:text-pink-700">
                      {m.name}
                    </Link>
                    <Badge tone={m.verification === "verified" ? "pink" : "slate"}>
                      {m.verification === "verified" ? "Verified" : "Unverified"}
                    </Badge>
                    {m.cycle_tags.includes('"delay"') ? <Badge tone="red">Prescription-only</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{m.menstrual_note}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-8">
        <AskMedSafeAI />
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        CycleSafe is awareness, not diagnosis. <Link href="/reports" className="inline-flex items-center gap-1 text-teal-700 hover:underline">Report a safety concern <ArrowRight size={11} /></Link>
      </p>
    </div>
  );
}
