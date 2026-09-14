import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ScanLine, Pill, Info, AlertTriangle, ShieldCheck, Ban, Baby, HeartHandshake, CalendarClock,
  ClipboardList, Thermometer, Package, BookOpen, Clock, Car, Droplets, Glasses, FileWarning,
} from "lucide-react";
import { getDb, jsonArray } from "@/lib/db";
import { analyzeMedicine, expiryStatus, getMedicineIngredients, levelLabel, type Level } from "@/lib/safety-engine";
import { getServerLang } from "@/lib/i18n/server";
import { Badge, Card, LevelPill, LEVEL_STYLES } from "@/components/ui";
import { AddToCabinetButton } from "@/components/add-to-cabinet";
import { AskMedSafeAI } from "@/components/ask-ai";
import { OfflineAvailable } from "@/components/offline-available";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

type MedRow = {
  id: number; slug: string; name: string; record_kind: "demo" | "real"; brand_name: string | null; generic_name: string | null;
  form: string | null; strength: string | null; manufacturer: string | null; category: string | null;
  schedule_class: string | null; rx_required: number; uses: string; precautions: string; side_effects: string;
  contraindications: string; storage: string | null; pack_expiry_hint: string | null; drowsiness: number; driving_warning: number;
  pregnancy_caution: number; breastfeeding_caution: number; menstrual_note: string | null; verification: string;
  verification_notes: string | null; data_confidence: "high" | "medium" | "low";
  verified_by: string | null; last_updated: string; source_title: string | null; source_publisher: string | null;
  source_url: string | null; document_name: string | null; publication_date: string | null;
};

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const db = getDb();
  const med = db.prepare("SELECT name FROM medicines WHERE slug = ?").get(slug) as { name: string } | undefined;
  return { title: med ? `${med.name} — Safety Profile` : "Medicine" };
}

const SEC = {
  en: { identity: "Medicine identity", ingredients: "Active ingredients", storage: "Storage", expiry: "Expiry information", safety: "Safety indicator",
    uses: "Uses", precautions: "Precautions", sideEffects: "Common side effects", contraindications: "Contraindications",
    valid: (d?: string) => `Valid until ${d}`,
    ok: (n?: number) => `Valid — about ${n} days remaining (demo pack date).`,
    near: (n?: number) => `Expires soon — about ${n} days remaining.`,
    expired: () => "This demo pack date has passed — see the warning card.", none: () => "No expiry recorded.",
    notRecorded: "Not recorded.", source: "Source", updated: "Last updated", verifiedBy: "Verified by", pending: "Pending review" },
  hi: { identity: "दवा की पहचान", ingredients: "सक्रिय तत्व", storage: "भंडारण", expiry: "एक्सपायरी जानकारी", safety: "सुरक्षा सूचक",
    uses: "उपयोग", precautions: "सावधानियाँ", sideEffects: "आम दुष्प्रभाव", contraindications: "कब उपयोग न करें",
    valid: (d?: string) => `${d} तक वैध`,
    ok: (n?: number) => `वैध — लगभग ${n} दिन शेष (डेमो पैक तिथि).`,
    near: (n?: number) => `जल्द एक्सपायर — लगभग ${n} दिन शेष.`,
    expired: () => "डेमो पैक की तिथि बीत चुकी है — चेतावनी कार्ड देखें.", none: () => "कोई एक्सपायरी दर्ज नहीं.",
    notRecorded: "दर्ज नहीं.", source: "स्रोत", updated: "अंतिम अपडेट", verifiedBy: "सत्यापनकर्ता", pending: "समीक्षा लंबित" },
  mr: { identity: "औषधाची ओळख", ingredients: "सक्रिय घटक", storage: "साठवण", expiry: "मुदत माहिती", safety: "सुरक्षा निर्देशक",
    uses: "वापर", precautions: "खबरदारी", sideEffects: "सामान्य दुष्परिणाम", contraindications: "कधी वापरू नका",
    valid: (d?: string) => `${d} पर्यंत वैध`,
    ok: (n?: number) => `वैध — जवळपास ${n} दिवस शिल्लक (डेमो पॅक तारीख).`,
    near: (n?: number) => `लवकर मुदत समाप्त — जवळपास ${n} दिवस शिल्लक.`,
    expired: () => "डेमो पॅकची तारीख उलटून गेली आहे — सूचना कार्ड पहा.", none: () => "मुदत नोंदलेली नाही.",
    notRecorded: "नोंदलेले नाही.", source: "स्रोत", updated: "शेवटचे अद्ययावत", verifiedBy: "सत्यापक", pending: "छाननी प्रलंबित" },
} as const;

export default async function MedicineProfilePage({ params }: Params) {
  const { slug } = await params;
  const db = getDb();
  const med = db
    .prepare(
      `SELECT m.*, s.title AS source_title, s.publisher AS source_publisher, s.url AS source_url,
              s.document_name, s.publication_date
       FROM medicines m LEFT JOIN sources s ON s.id = m.source_id WHERE m.slug = ?`
    )
    .get(slug) as MedRow | undefined;
  if (!med) notFound();

  const lang = await getServerLang();
  const L = SEC[lang];
  const ingredients = getMedicineIngredients(med.id);
  const analysis = analyzeMedicine(med, { expiryDate: med.pack_expiry_hint, lang });
  const expiry = expiryStatus(med.pack_expiry_hint);

  const NOT_AVAILABLE = "Information not available in the verified database.";

  // Three-state information label per the data-quality spec.
  const infoLabel =
    med.record_kind === "demo" && med.verification === "verified"
      ? { text: "Demo Information", tone: "navy" as const, hint: "Clearly-labelled prototype record for demonstrating product flows. Fact patterns follow public label references, but this is not an official database entry." }
      : med.verification === "verified"
        ? { text: "Verified Information", tone: "teal" as const, hint: "Reviewed against the cited source document by the listed reviewer." }
        : { text: "Unverified Information", tone: "amber" as const, hint: "This record has not completed review. Missing fields are shown as unavailable — never guessed." };

  const FACTS: Array<{ icon: typeof Pill; label: string; value: string }> = [
    { icon: Pill, label: "Brand name", value: med.brand_name ?? NOT_AVAILABLE },
    { icon: Info, label: "Generic name", value: med.generic_name ?? NOT_AVAILABLE },
    { icon: ClipboardList, label: "Strength & form", value: [med.strength, med.form].filter(Boolean).join(" · ") || NOT_AVAILABLE },
    { icon: Package, label: "Manufacturer", value: med.manufacturer ?? NOT_AVAILABLE },
    { icon: BookOpen, label: "Category", value: med.category ?? NOT_AVAILABLE },
    { icon: ShieldCheck, label: "Regulatory class", value: med.schedule_class ?? NOT_AVAILABLE },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-navy-900">{med.name}</h1>
            <span title={infoLabel.hint}><Badge tone={infoLabel.tone}>{infoLabel.text}</Badge></span>
            <Badge tone={med.data_confidence === "high" ? "teal" : med.data_confidence === "medium" ? "amber" : "slate"}>
              {med.data_confidence} confidence
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {med.generic_name ?? med.brand_name} {med.strength ? `· ${med.strength}` : ""} {med.form ? `· ${med.form}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OfflineAvailable slug={med.slug} />
          <AddToCabinetButton slug={med.slug} />
          <Link href={`/ar?slug=${med.slug}`} className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-100">
            <Glasses size={15} /> AR view
          </Link>
          <Link href={`/ai?slug=${med.slug}`} className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-100">
            Ask MedSafe AI
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Left column: identity + facts */}
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-900">
              <ScanLine size={16} className="text-teal-600" /> {L.identity}
            </h2>
            <dl className="space-y-2.5">
              {FACTS.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-2.5">
                  <Icon size={15} className="mt-0.5 shrink-0 text-slate-400" />
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className="text-sm font-medium text-navy-900">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-900">
              <Pill size={16} className="text-teal-600" /> {L.ingredients}
            </h2>
            <ul className="space-y-2">
              {ingredients.length === 0 ? <li className="text-sm text-slate-400">{L.notRecorded}</li> : null}
              {ingredients.map((i) => (
                <li key={i.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-navy-900">{i.name}</span>
                  <span className="text-xs text-slate-500">{i.strength ?? ""}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-900">
              <Thermometer size={16} className="text-teal-600" /> {L.storage}
            </h2>
            <p className="text-sm text-slate-600">{med.storage ?? L.notRecorded}</p>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h3 className="flex items-center gap-2 text-xs font-bold text-navy-900">
                <CalendarClock size={14} className="text-teal-600" /> {L.expiry} {expiry.date ? `· ${expiry.date}` : ""}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {expiry.state === "ok" ? L.ok(expiry.days)
                  : expiry.state === "near" ? L.near(expiry.days)
                  : expiry.state === "expired" ? L.expired()
                  : L.none()}
              </p>
            </div>
          </Card>
        </div>

        {/* Middle column: safety indicator + warnings */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-navy-900">{L.safety}</h2>
              <LevelPill level={analysis.overall} label={levelLabel(lang, analysis.overall)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(LEVEL_STYLES) as Level[]).map((lv) => (
                <div key={lv} className={`rounded-xl border px-3 py-2 text-xs font-medium ${LEVEL_STYLES[lv].bg} ${LEVEL_STYLES[lv].border} ${LEVEL_STYLES[lv].text} ${lv === analysis.overall ? "ring-2 ring-offset-1 ring-slate-300" : "opacity-70"}`}>
                  {LEVEL_STYLES[lv].emoji} {levelLabel(lang, lv)}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Safety classifications come from MedSafe&rsquo;s rule engine and verified records — they are not medical risk scores.
            </p>
          </Card>

          {/* Warning cards */}
          <div className="space-y-3">
            {analysis.cards.map((w) => {
              const s = LEVEL_STYLES[w.level];
              const IconMap: Record<string, typeof AlertTriangle> = {
                prescription: ShieldCheck, drowsiness: Car, pregnancy: Baby, breastfeeding: HeartHandshake,
                menstrual: Droplets, expiry: CalendarClock, duplicate: AlertTriangle, unverified: Info,
                interaction: Ban,
              };
              const Icon = IconMap[w.code] ?? AlertTriangle;
              return (
                <div key={w.code + w.title} className={`rounded-2xl border p-4 ${s.bg} ${s.border}`}>
                  <p className={`flex items-center gap-2 text-sm font-bold ${s.text}`}>
                    <Icon size={17} /> {w.title}
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide opacity-70">{levelLabel(lang, w.level)}</span>
                  </p>
                  <p className={`mt-1.5 text-sm leading-relaxed ${s.text} opacity-90`}>{w.body}</p>
                </div>
              );
            })}
            {analysis.cards.length === 0 ? (
              <Card className="text-sm text-slate-500">No rule-based warnings for this record.</Card>
            ) : null}
          </div>

          {/* Uses / precautions / side effects / contraindications */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {([
              [L.uses, jsonArray(med.uses), "text-teal-600"],
              [L.precautions, jsonArray(med.precautions), "text-amber-500"],
              [L.sideEffects, jsonArray(med.side_effects), "text-slate-400"],
              [L.contraindications, jsonArray(med.contraindications), "text-red-500"],
            ] as Array<[string, string[], string]>).map(([title, items, dot]) => (
              <Card key={title}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
                {items.length === 0 ? (
                  <p className="mt-2 text-xs italic text-slate-400">{L.notRecorded}</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                    {items.map((item) => <li key={item} className="flex gap-1.5"><span className={dot}>•</span>{item}</li>)}
                  </ul>
                )}
              </Card>
            ))}
          </div>

          {/* Source & metadata */}
          <Card>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div className="min-w-52">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{L.source}</p>
                {med.source_title ? (
                  <p className="font-medium text-navy-900">
                    {med.source_url ? (
                      <a href={med.source_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline decoration-teal-200 hover:decoration-teal-500">
                        {med.source_title}
                      </a>
                    ) : (
                      med.source_title
                    )}
                  </p>
                ) : (
                  <p className="font-medium italic text-slate-400">{NOT_AVAILABLE}</p>
                )}
                <p className="text-xs text-slate-500">{med.source_publisher ?? ""}</p>
                {med.document_name ? <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><FileWarning size={11} /> {med.document_name}{med.publication_date ? ` · ${med.publication_date}` : ""}</p> : null}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{L.updated}</p>
                <p className="font-medium text-navy-900">{med.last_updated?.slice(0, 10) ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{L.verifiedBy}</p>
                <p className="font-medium text-navy-900">{med.verified_by ?? L.pending}</p>
              </div>
            </div>
            {med.verification_notes ? (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
                <strong className="text-navy-900">Verification notes:</strong> {med.verification_notes}
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      {/* AI explainer scoped to this medicine */}
      <div className="mt-8">
        <AskMedSafeAI slug={med.slug} medicineName={med.name} />
      </div>
    </div>
  );
}
