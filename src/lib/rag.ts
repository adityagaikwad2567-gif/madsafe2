import { getDb, jsonArray } from "@/lib/db";
import { getMedicineIngredients } from "@/lib/safety-engine";

/**
 * RAG pipeline for MedSafe AI.
 *
 *   User question → medicine identification → verified medicine DB
 *   → relevant knowledge retrieval (keyword scoring) → safety rules (deterministic)
 *   → AI explanation (only from retrieved, verified context)
 *
 * The retriever scores keyword overlap between the question and verified
 * medicine fields, warning cards and knowledge snippets. If retrieval
 * confidence is low, the assistant refuses rather than inventing content.
 *
 * To plug in a real LLM: set MEDSAFE_AI_PROVIDER / MEDSAFE_AI_API_KEY and
 * replace `composeAnswer` with a call that receives `retrieval.context` only.
 * The safety rules and refusal behavior stay deterministic regardless.
 */

export type RagSource = { title: string; publisher: string; updated: string };

export type RagAnswer = {
  answer: string;
  confidence: "high" | "medium" | "low" | "refused";
  sources: RagSource[];
  lastUpdated: string | null;
  medicineSlug: string | null;
};

type MedRow = {
  id: number;
  slug: string;
  name: string;
  brand_name: string | null;
  generic_name: string | null;
  form: string | null;
  strength: string | null;
  manufacturer: string | null;
  category: string | null;
  schedule_class: string | null;
  rx_required: number;
  uses: string;
  precautions: string;
  side_effects: string;
  storage: string | null;
  drowsiness: number;
  pregnancy_caution: number;
  breastfeeding_caution: number;
  menstrual_note: string | null;
  verification: string;
  last_updated: string;
  source_title: string | null;
  source_publisher: string | null;
};

const STOPWORDS = new Set([
  "what", "is", "this", "the", "a", "an", "does", "do", "for", "why", "it", "its", "are", "of",
  "and", "to", "in", "on", "my", "i", "can", "should", "how", "about", "with", "medicine",
  "used", "use", "using", "take", "taking", "tell", "explain", "simple", "language",
]);

function keywords(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function intentOf(q: string): "uses" | "precautions" | "drowsiness" | "supervision" | "menstrual" | "general" {
  const s = q.toLowerCase();
  if (/(drows|sleep|alert|drive|why does it cause)/.test(s)) return "drowsiness";
  if (/(precaution|care|avoid|warning|safe)/.test(s)) return "precautions";
  if (/(supervis|doctor|prescription|pharmacist)/.test(s)) return "supervision";
  if (/(period|menstrual|hormon|cycle|pregnan|breastfeed)/.test(s)) return "menstrual";
  if (/(what.*used|purpose|why.*given|indication)/.test(s)) return "uses";
  return "general";
}

function retrieveMedicine(q: string): MedRow | null {
  const db = getDb();
  const kws = keywords(q);
  if (kws.length === 0) return null;
  const all = db.prepare("SELECT * FROM medicines").all() as unknown as MedRow[];
  let best: { med: MedRow; score: number } | null = null;
  for (const med of all) {
    const hay = [med.name, med.brand_name ?? "", med.generic_name ?? "", med.category ?? ""]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const k of kws) if (hay.includes(k)) score += 2;
    if (score > (best?.score ?? 0)) best = { med, score };
  }
  return best && best.score >= 2 ? best.med : null;
}

type Snippet = { text: string; score: number; source: RagSource; tag: string };

function buildContext(med: MedRow, intent: string): { snippets: Snippet[]; best: number } {
  const snippets: Snippet[] = [];
  const src: RagSource = {
    title: med.source_title ?? "MedSafe demo knowledge base",
    publisher: med.source_publisher ?? "MedSafe demo dataset",
    updated: med.last_updated,
  };
  const K = (text: string, tag: string, base: number) =>
    snippets.push({ text, score: base, source: src, tag });

  K(`Name: ${med.name} (${med.brand_name ?? "brand not recorded"}). Generic: ${med.generic_name ?? "not recorded"}; form ${med.form ?? "?"} ${med.strength ?? ""} by ${med.manufacturer ?? "unknown"}.`, "identity", 1.2);
  jsonArray(med.uses).forEach((u) => K(`Documented use: ${u}`, "uses", intent === "uses" ? 2.5 : 1.6));
  jsonArray(med.precautions).forEach((p) => K(`Precaution: ${p}`, "precautions", intent === "precautions" ? 2.5 : 1.4));
  jsonArray(med.side_effects).forEach((s) => K(`Commonly documented side effect: ${s}`, "side-effects", 1.2));
  if (med.storage) K(`Storage: ${med.storage}`, "storage", 1.0);
  if (med.rx_required || med.schedule_class)
    K(`Regulatory class: ${med.schedule_class ?? "Prescription required"}.`, "regulatory", intent === "supervision" ? 2.6 : 1.3);
  if (med.drowsiness)
    K("Verified label information indicates this medicine may cause drowsiness in some people.", "drowsiness", intent === "drowsiness" ? 3.0 : 1.5);
  if (med.pregnancy_caution)
    K("Pregnancy awareness: consult a doctor before use if pregnant or planning pregnancy.", "pregnancy", 1.3);
  if (med.breastfeeding_caution)
    K("Breastfeeding awareness: check with a doctor or pharmacist before use while breastfeeding.", "breastfeeding", 1.3);
  if (med.menstrual_note)
    K(`Menstrual/hormonal awareness: ${med.menstrual_note}`, "menstrual", intent === "menstrual" ? 3.0 : 1.5);

  const ings = getMedicineIngredients(med.id);
  if (ings.length > 0)
    K(`Active ingredients: ${ings.map((i) => `${i.name} ${i.strength ?? ""}`.trim()).join(", ")}.`, "ingredients", 1.4);

  const db = getDb();
  const warns = db.prepare("SELECT code, level, title, body FROM warnings WHERE medicine_id = ?").all(med.id) as Array<{
    code: string; level: string; title: string; body: string;
  }>;
  for (const w of warns) K(`${w.title}: ${w.body}`, "warning", w.code === intent ? 2.2 : 1.1);

  return { snippets, best: Math.max(...snippets.map((s) => s.score)) };
}

function composeAnswer(med: MedRow, intent: string): string {
  const name = med.name;
  switch (intent) {
    case "uses": {
      const uses = jsonArray(med.uses);
      return uses.length
        ? `${name} is documented for: ${uses.join("; ")}. A doctor decides whether it is right for your situation.`
        : "";
    }
    case "precautions": {
      const p = jsonArray(med.precautions);
      return p.length
        ? `Important precautions for ${name}: ${p.join("; ")}. Always follow your doctor's or pharmacist's advice.`
        : "";
    }
    case "drowsiness":
      return med.drowsiness
        ? `${name}'s verified label information lists drowsiness as a possible effect. Antihistamine-type ingredients can affect the parts of the brain that control alertness. If you feel drowsy, avoid driving or operating machinery and ask a pharmacist.`
        : `The verified information for ${name} does not list drowsiness as a typical effect. Individual reactions vary — if you feel unusually sleepy, avoid driving and consult a pharmacist.`;
    case "supervision":
      return med.rx_required
        ? `${name} is prescription-only (${med.schedule_class ?? "Schedule H"}). It must be prescribed and monitored by a doctor — do not start, stop or share it on your own.`
        : `${name} is generally available without a prescription, but ask a pharmacist before combining it with other medicines.`;
    case "menstrual":
      return med.menstrual_note
        ? `${med.menstrual_note} Some medicines may affect menstrual patterns in certain people; this does not confirm the medicine caused a change. Please consult a qualified healthcare professional for personal advice.`
        : `I don't have verified menstrual or hormonal information for ${name}. Consult a gynaecologist for personal advice.`;
    default: {
      const uses = jsonArray(med.uses).slice(0, 2).join("; ");
      const ings = getMedicineIngredients(med.id).map((i) => i.name).join(", ");
      return `${name} (${med.generic_name ?? "generic name not recorded"}) is a ${med.category ?? "medicine"} containing ${ings || "ingredient details below"}. Documented uses: ${uses || "see the medicine profile"}. This is general awareness information, not medical advice.`;
    }
  }
}

export function answerQuestion(question: string, opts?: { lang?: "en" | "hi" | "mr" }): RagAnswer {
  const lang = opts?.lang ?? "en";
  const intent = intentOf(question);
  const med = retrieveMedicine(question);

  if (!med) {
    return {
      answer:
        lang === "hi"
          ? "मेरे पास इसे सुरक्षित रूप से बताने के लिए पर्याप्त सत्यापित जानकारी नहीं है। कृपया दवा का नाम बताएं या पैकेट स्कैन करें।"
          : lang === "mr"
            ? "माझ्याकडे हे सुरक्षितपणे सांगण्यासाठी पुरेशी सत्यापित माहिती नाही. कृपया औषधाचे नाव सांगा किंवा पॅकेट स्कॅन करा."
            : "I don't have enough verified information to answer this safely. Please name the medicine or scan the package first.",
      confidence: "refused",
      sources: [],
      lastUpdated: null,
      medicineSlug: null,
    };
  }

  const { best } = buildContext(med, intent);
  const answer = composeAnswer(med, intent);
  if (!answer || best < 1.3) {
    return {
      answer: "I don't have enough verified information to answer this safely.",
      confidence: "refused",
      sources: [],
      lastUpdated: med.last_updated,
      medicineSlug: med.slug,
    };
  }

  const confidence: RagAnswer["confidence"] =
    med.verification === "verified" ? (best >= 2.4 ? "high" : "medium") : "low";

  const sources: RagSource[] = [
    {
      title: med.source_title ?? "MedSafe demo knowledge base",
      publisher: med.source_publisher ?? "MedSafe demo dataset",
      updated: med.last_updated,
    },
  ];

  const finalAnswer =
    lang !== "en"
      ? `${answer}\n\n(Note: this prototype answers in English; the verified summary is available in Hindi and Marathi on the medicine profile.)`
      : answer;

  return {
    answer: finalAnswer,
    confidence,
    sources,
    lastUpdated: med.last_updated,
    medicineSlug: med.slug,
  };
}
