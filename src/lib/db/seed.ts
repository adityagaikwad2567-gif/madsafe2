import bcrypt from "bcryptjs";
import { getDb } from "./index";
import { SAFETY_TRANSLATIONS } from "@/lib/i18n/safety-translations";

/**
 * MedSafe demo dataset — CLEARLY LABELLED PROTOTYPE DATA.
 * This is NOT an official medical database. Records exist to demonstrate
 * product flows (single/multiple ingredients, drowsiness, prescription
 * awareness, pregnancy/breastfeeding caution, expiry, duplication).
 * All sources are demo stand-ins for verified label/guideline sources.
 */

/**
 * Safety-content translations (hi/mr) are re-synced on EVERY boot so content
 * updates ship without touching the database. Medicine/demo data seeds once.
 */
export function seedTranslations(): void {
  const db = getDb();
  const ins = db.prepare(
    `INSERT INTO translations (entity, key, lang, value) VALUES ('safety', ?, ?, ?)
     ON CONFLICT(entity, key, lang) DO UPDATE SET value = excluded.value`
  );
  const run = db.transaction(() => {
    for (const t of SAFETY_TRANSLATIONS) ins.run(t.key, t.lang, t.value);
  });
  run();
}

export function seedIfEmpty(): void {
  seedTranslations();
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) AS c FROM medicines").get() as { c: number };
  if (count.c > 0) return;

  const seed = db.transaction(() => {
    const now = new Date().toISOString();
    const year = new Date().getFullYear();
    // Dynamic demo dates so the expiry flow is always demonstrable:
    const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

    // ---------------- Sources ----------------
    // Real, publicly-checkable references are used where the fact pattern matches
    // the public document; demo stand-ins are clearly marked "Demo".
    const insSource = db.prepare(
      `INSERT INTO sources (title, publisher, url, kind, document_name, publication_date, last_checked, verification_status, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const srcLabel = insSource.run(
      "Sample Pack Label (Demo)", "MedSafe Demo Dataset", null, "label",
      "Printed demo pack label", "2026-08-01", now.slice(0, 10), "pending", now
    ).lastInsertRowid as number;
    const srcDemo = insSource.run(
      "MedSafe Demo Knowledge Base (Demo)", "MedSafe Demo Dataset", null, "internal",
      "Prototype teaching dataset", "2026-08-01", now.slice(0, 10), "pending", now
    ).lastInsertRowid as number;
    const srcGuide = insSource.run(
      "Public Drug Label Compilation (Demo)", "MedSafe Demo Dataset", null, "guideline",
      "Compiled public label summaries", "2026-08-01", now.slice(0, 10), "pending", now
    ).lastInsertRowid as number;
    const srcParacetamolLabel = insSource.run(
      "Paracetamol Tablets IP — package label",
      "Central Drugs Standard Control Organisation (CDSCO) — consumer label pattern",
      "https://cdsco.gov.in/", "label",
      "Paracetamol tablet package label", "2025-11-01", now.slice(0, 10), "verified", now
    ).lastInsertRowid as number;
    const srcCetirizineLabel = insSource.run(
      "Cetirizine Tablets IP — package label",
      "Central Drugs Standard Control Organisation (CDSCO) — consumer label pattern",
      "https://cdsco.gov.in/", "label",
      "Cetirizine tablet package label", "2025-11-01", now.slice(0, 10), "verified", now
    ).lastInsertRowid as number;
    const srcWhoEml = insSource.run(
      "WHO Model List of Essential Medicines (23rd list)",
      "World Health Organization",
      "https://www.who.int/groups/expert-committee/essential-medicines", "guideline",
      "WHO EML 2023", "2023-07-01", now.slice(0, 10), "verified", now
    ).lastInsertRowid as number;

    // ---------------- Active ingredients ----------------
    const insIng = db.prepare(
      "INSERT INTO active_ingredients (name, name_hi, name_mr, description, uniq_name) VALUES (?,?,?,?,?)"
    );
    const ing = (name: string, hi: string, mr: string, uniq: string, desc: string) =>
      insIng.run(name, hi, mr, desc, uniq).lastInsertRowid as number;

    const paracetamol = ing("Paracetamol", "पैरासिटामोल", "पॅरासिटामोल", "paracetamol",
      "Widely used analgesic and antipyretic; overdose harms the liver.");
    const cpm = ing("Chlorpheniramine Maleate", "क्लोरफेनिरामीन मेलिएट", "क्लोरफेनिरामीन मॅलिएट", "chlorpheniramine",
      "First-generation antihistamine; commonly causes drowsiness.");
    const phenylephrine = ing("Phenylephrine", "फेनिलेफ्रिन", "फेनिलेफ्रिन", "phenylephrine",
      "Decongestant used in cold medicines; caution with high blood pressure.");
    const amoxicillin = ing("Amoxicillin", "अमोक्सिसिलिन", "अमॉक्सिसिलिन", "amoxicillin",
      "Penicillin-class antibiotic; prescription-only.");
    const clavulanic = ing("Clavulanic Acid", "क्लैवुलैनिक अम्ल", "क्लॅव्हुलॅनिक अ‍ॅसिड", "clavulanic-acid",
      "Beta-lactamase inhibitor combined with amoxicillin.");
    const ibuprofen = ing("Ibuprofen", "इबुप्रोफेन", "इबुप्रोफेन", "ibuprofen",
      "NSAID for pain, fever and inflammation; can irritate the stomach.");
    const cetirizine = ing("Cetirizine", "सेटिरिज़ीन", "सेटिरिझिन", "cetirizine",
      "Second-generation antihistamine; less sedating but may still cause drowsiness.");
    const omeprazole = ing("Omeprazole", "ओमेप्राज़ोल", "ओमेप्राझोल", "omeprazole",
      "Proton-pump inhibitor used for acid-related disorders.");
    const metformin = ing("Metformin", "मेटफॉर्मिन", "मेटफॉर्मिन", "metformin",
      "First-line medicine for type 2 diabetes; prescription-only.");
    const domperidone = ing("Domperidone", "डोम्पेरिडोन", "डोम्पेरिडोन", "domperidone",
      "Anti-nausea medicine with known heart-rhythm cautions.");
    const norethisterone = ing("Norethisterone", "नॉरएथिस्टेरोन", "नॉरएथिस्टेरोन", "norethisterone",
      "Synthetic progestogen; prescription-only hormonal medicine.");
    const mefenamic = ing("Mefenamic Acid", "मेफेनामिक अम्ल", "मेफेनॅमिक अ‍ॅसिड", "mefenamic-acid",
      "NSAID commonly used for period pain; short-term use only.");
    const tranexamic = ing("Tranexamic Acid", "ट्रानेक्सामिक अम्ल", "ट्रानेक्सामिक अ‍ॅसिड", "tranexamic-acid",
      "Antifibrinolytic used for heavy bleeding; clot-risk assessment needed.");
    const iron = ing("Ferrous Sulphate", "फेरस सल्फेट", "फेरस सल्फेट", "ferrous-sulphate",
      "Iron supplement for iron-deficiency anaemia.");
    const folic = ing("Folic Acid", "फोलिक अम्ल", "फोलिक अ‍ॅसिड", "folic-acid",
      "B-vitamin supplement, often paired with iron.");
    const caffeine = ing("Caffeine", "कैफीन", "कॅफीन", "caffeine",
      "Stimulant added to some analgesic combinations.");

    // ---------------- Medicines ----------------
    const insMed = db.prepare(`
      INSERT INTO medicines (
        slug, name, record_kind, brand_name, generic_name, form, strength, manufacturer, category, barcode,
        schedule_class, rx_required, uses, precautions, side_effects, contraindications, storage, pack_expiry_hint,
        drowsiness, driving_warning, pregnancy_caution, breastfeeding_caution, menstrual_note, cycle_tags,
        source_id, verification, verification_notes, data_confidence, verified_by, last_updated
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    type MedArgs = [
      string, string, string, string | null, string | null, string, string, string, string, string | null,
      string, number, string, string, string, string, string, string | null,
      number, number, number, number, string | null, string,
      number | null, string, string | null, string, string | null, string
    ];

    const addMed = (args: MedArgs): number => insMed.run(...args).lastInsertRowid as number;

    const J = (arr: string[]) => JSON.stringify(arr);

    const dolo = addMed([
      "dolo-650", "Dolo 650", "demo", "Dolo 650", "Paracetamol", "Tablet", "650 mg", "Micro Labs (demo)", "Analgesic / Antipyretic", "8901234500017",
      "OTC", 0,
      J(["Relief of mild to moderate pain", "Reducing fever"]),
      J(["Do not exceed the labelled dose", "Avoid other paracetamol-containing medicines", "Consult a doctor if pain or fever lasts more than 3 days", "Tell your doctor about liver problems before use"]),
      J(["Nausea (uncommon)", "Rash (rare)", "Liver stress with overdose or prolonged use"]),
      J(["Severe liver disease", "Known allergy to paracetamol"]),
      "Store below 30°C, away from moisture and direct sunlight.",
      `${String(year + 2)}-06-30`,
      0, 0, 1, 1,
      "Paracetamol is generally considered suitable for menstrual pain, but confirm with a pharmacist if you have liver, kidney or alcohol-related concerns.",
      J(["menstrual"]),
      srcParacetamolLabel, "verified",
      "Facts checked against the CDSCO paracetamol consumer label pattern; brand/manufacturer string kept as demo placeholder.",
      "medium", "Dr. A. Deshmukh (demo reviewer)", "2026-08-14"
    ]);

    // Stored AR label zones for the AR Medicine Explainer demo (normalized 0..1 coords).
    db.prepare("UPDATE medicines SET ar_zones = ? WHERE slug = 'dolo-650'").run(
      JSON.stringify([
        { kind: "name", top: 0.1, left: 0.12, width: 0.76, height: 0.14 },
        { kind: "ingredients", top: 0.28, left: 0.12, width: 0.76, height: 0.13 },
        { kind: "warnings", top: 0.45, left: 0.12, width: 0.76, height: 0.13 },
        { kind: "expiry", top: 0.62, left: 0.12, width: 0.76, height: 0.13 },
        { kind: "storage", top: 0.8, left: 0.12, width: 0.76, height: 0.12 },
      ])
    );

    const coldrid = addMed([
      "coldrid", "Coldrid Cold & Flu", "demo", "Coldrid", "Paracetamol + Chlorpheniramine + Phenylephrine", "Tablet", "500 mg + 2 mg + 5 mg", "Rid Pharma (demo)", "Cold & Flu Combination", "8901234500024",
      "OTC (combination)", 0,
      J(["Symptomatic relief of common cold, runny nose and blocked nose", "Fever with body ache"]),
      J(["May cause drowsiness — see warning below", "Avoid alcohol while using", "Not for children below 12 years without a doctor's advice", "Do not combine with other paracetamol-containing products"]),
      J(["Drowsiness", "Dry mouth", "Dizziness", "Mild stomach upset"]),
      J(["Severe liver disease", "Use with MAOI antidepressants", "Known allergy to any ingredient"]),
      "Store below 30°C, protected from light.",
      inDays(60), // near-expiry demo: shows the reminder flow
      1, 1, 1, 1,
      "Antihistamines may add to tiredness around the menstrual period for some people.",
      J(["menstrual"]),
      srcLabel, "verified", "Demo combination product; facts align with component labels on file.", "low", "Dr. A. Deshmukh (demo reviewer)", "2026-08-14"
    ]);

    const moxikind = addMed([
      "moxikind-cv", "Moxikind-CV 625", "demo", "Moxikind-CV", "Amoxicillin + Clavulanic Acid", "Tablet", "500 mg + 125 mg", "Mankind Demo Labs", "Antibiotic (combination)", "8901234500031",
      "Prescription only (Schedule H)", 1,
      J(["Bacterial infections as prescribed by a doctor (respiratory, urinary, skin and similar infections)"]),
      J(["Complete the full course prescribed by your doctor", "Requires a valid prescription", "Not effective against viral infections like the common cold", "Tell your doctor about penicillin allergy before use"]),
      J(["Diarrhoea (common)", "Nausea", "Rash", "Stomach discomfort"]),
      J(["History of penicillin allergy", "Previous cholestatic jaundice with this combination", "Known allergy to any ingredient"]),
      "Store below 25°C in a dry place. Reconstituted syrup: refrigerate and discard after 7 days.",
      `${year + 1}-09-30`,
      0, 0, 1, 1,
      "Antibiotics do not reduce the effectiveness of most hormonal contraceptives, but always confirm with your doctor while on treatment.",
      J(["hormonal"]),
      srcGuide, "verified", "Demo record; class facts (penicillin allergy, course completion) follow standard label guidance.", "low", "Dr. S. Kulkarni (demo reviewer)", "2026-08-14"
    ]);

    const brufen = addMed([
      "brufen-400", "Brufen 400", "demo", "Brufen", "Ibuprofen", "Tablet", "400 mg", "Abbott Demo", "NSAID (pain relief)", "8901234500048",
      "OTC", 0,
      J(["Relief of pain, inflammation and fever", "Period pain (dysmenorrhoea)", "Muscle and joint pain"]),
      J(["Take after food to reduce stomach irritation", "Avoid if you have stomach ulcers, kidney problems or aspirin allergy", "Use the lowest effective amount for the shortest time", "Not recommended in the third trimester of pregnancy"]),
      J(["Stomach upset or heartburn", "Dizziness (uncommon)", "Fluid retention"]),
      J(["Active peptic ulcer", "Severe heart failure", "Severe kidney disease", "Known NSAID/aspirin allergy", "Third trimester of pregnancy"]),
      "Store below 30°C, away from moisture.",
      `${year + 2}-03-31`,
      0, 0, 1, 1,
      "NSAIDs such as ibuprofen are commonly used for period pain but may affect bleeding patterns in some people; consult a gynaecologist for personal advice.",
      J(["menstrual", "hormonal"]),
      srcGuide, "verified", "Demo record; contraindications follow standard NSAID label guidance.", "low", "Dr. S. Kulkarni (demo reviewer)", "2026-08-14"
    ]);

    const alerzo = addMed([
      "alerzo", "Alerzo", "demo", "Alerzo", "Cetirizine", "Tablet", "10 mg", "Wockhardt Demo", "Antihistamine", "8901234500055",
      "OTC", 0,
      J(["Relief of allergy symptoms: sneezing, runny nose, itching and skin allergies"]),
      J(["May cause drowsiness in some people", "Be careful with alcohol", "Reduce dose in kidney problems — ask a pharmacist"]),
      J(["Sleepiness", "Dry mouth", "Headache (uncommon)"]),
      J(["Severe kidney disease (medical advice required)", "Known allergy to cetirizine"]),
      "Store below 30°C.",
      `${year + 2}-01-31`,
      1, 1, 1, 1,
      null,
      "[]",
      srcCetirizineLabel, "verified", "Facts checked against the CDSCO cetirizine consumer label pattern; brand/manufacturer kept as demo.", "medium", "Dr. A. Deshmukh (demo reviewer)", "2026-08-14"
    ]);

    const omez = addMed([
      "omez", "Omez", "demo", "Omez", "Omeprazole", "Capsule", "20 mg", "Dr. Reddy's Demo", "Acidity / PPI", "8901234500062",
      "Prescription advised", 1,
      J(["Acid reflux, heartburn and stomach ulcers as advised by a doctor"]),
      J(["Best taken before breakfast", "Long-term use should be reviewed by a doctor", "Tell your doctor about any liver problems"]),
      J(["Headache", "Nausea", "Stomach pain (uncommon)"]),
      J(["Known allergy to proton-pump inhibitors", "Use with certain HIV medicines needs doctor review"]),
      "Store below 30°C, protected from moisture.",
      `${year + 2}-05-31`,
      0, 0, 1, 1,
      null,
      "[]",
      srcLabel, "verified", "Demo record; class facts follow standard PPI label guidance.", "low", "Dr. S. Kulkarni (demo reviewer)", "2026-08-14"
    ]);

    const glycomet = addMed([
      "glycomet", "Glycomet 500", "demo", "Glycomet", "Metformin", "Tablet", "500 mg", "USV Demo", "Anti-diabetic", "8901234500079",
      "Prescription only (Schedule H)", 1,
      J(["Type 2 diabetes management as prescribed"]),
      J(["Requires regular medical supervision", "Stop before certain scans/surgery as advised by your doctor", "Avoid alcohol"]),
      J(["Nausea", "Metallic taste", "Stomach upset", "Vitamin B12 deficiency with long-term use"]),
      J(["Severe kidney impairment", "Diabetic ketoacidosis", "Known allergy to metformin"]),
      "Store below 30°C.",
      `${year + 1}-11-30`,
      0, 0, 1, 1,
      "Some studies discuss metformin use in PCOS under medical supervision — this does not mean it regulates periods for everyone. Consult a gynaecologist.",
      J(["hormonal"]),
      srcGuide, "verified", "Demo record; contraindications follow standard metformin label guidance.", "low", "Dr. S. Kulkarni (demo reviewer)", "2026-08-14"
    ]);

    const norluc = addMed([
      "norluc-d", "Norluc-D", "demo", "Norluc-D", "Omeprazole + Domperidone", "Capsule", "20 mg + 10 mg", "Lucid Demo Pharma", "Acidity + anti-nausea combination", "8901234500086",
      "Prescription advised", 1,
      J(["Acid reflux with nausea and slow stomach emptying as advised by a doctor"]),
      J(["Do not use for long periods without review", "Tell your doctor about heart rhythm problems"]),
      J(["Headache", "Dry mouth", "Stomach pain"]),
      J(["Known heart-rhythm disorders (QT prolongation)", "Prolactinoma", "Known allergy to any ingredient"]),
      "Store below 30°C.",
      `${year + 2}-02-28`,
      0, 0, 1, 1,
      null,
      "[]",
      srcLabel, "verified", "Demo record; domperidone QT cautions follow standard label guidance.", "low", "Dr. A. Deshmukh (demo reviewer)", "2026-08-14"
    ]);

    const primolut = addMed([
      "primolut-n", "Primolut-N (demo)", "demo", "Primolut-N", "Norethisterone", "Tablet", "5 mg", "Bayer Demo", "Hormonal (progestogen)", "8901234500093",
      "Prescription only", 1,
      J(["Prescribed to delay a period on specific occasions, or for certain menstrual conditions — only under a doctor's advice"]),
      J(["Strictly prescription-only", "Never start or stop without a doctor", "Not a contraceptive", "Tell your doctor about clotting history, liver problems or migraine"]),
      J(["Breast tenderness", "Mood changes", "Spotting between periods", "Nausea"]),
      J(["Pregnancy", "History of thrombosis or thrombophilic disorders", "Severe liver disease", "Undiagnosed abnormal bleeding"]),
      "Store below 30°C.",
      `${year + 2}-07-31`,
      0, 0, 1, 1,
      "Norethisterone is sometimes prescribed to delay a period. It changes hormone levels and must be prescribed after checking your history. It does not suit everyone and is not a contraceptive.",
      J(["menstrual", "hormonal", "delay"]),
      srcGuide, "verified", "Demo record; contraindications follow standard norethisterone label guidance.", "low", "Dr. S. Kulkarni (demo reviewer)", "2026-08-14"
    ]);

    const meftal = addMed([
      "meftal-spas", "Meftal-Spas (demo)", "demo", "Meftal-Spas", "Mefenamic Acid + Dicyclomine", "Tablet", "250 mg + 10 mg", "Blue Cross Demo", "Period pain relief", "8901234500109",
      "OTC / Pharmacy", 0,
      J(["Period pain (dysmenorrhoea) and stomach cramps"]),
      J(["Take after food", "Avoid with other NSAIDs", "Not for long-term use without medical advice"]),
      J(["Stomach upset", "Dizziness", "Dry mouth"]),
      J(["Active peptic ulcer", "Known NSAID allergy", "Glaucoma or urinary retention (dicyclomine component)"]),
      "Store below 30°C.",
      `${year + 2}-04-30`,
      0, 0, 1, 1,
      "Designed for period pain; heavy or unusual bleeding should still be discussed with a gynaecologist.",
      J(["menstrual"]),
      srcLabel, "verified", "Demo record; NSAID contraindications follow standard label guidance.", "low", "Dr. A. Deshmukh (demo reviewer)", "2026-08-14"
    ]);

    const trof = addMed([
      "trof-n", "Trof-N (demo)", "demo", "Trof-N", "Tranexamic Acid + Mefenamic Acid", "Tablet", "500 mg + 250 mg", "Troikaa Demo", "Heavy period support", "8901234500116",
      "Prescription advised", 1,
      J(["Heavy menstrual bleeding as advised by a doctor"]),
      J(["Prescription advised", "Not suitable with a history of clots — doctor must check", "Avoid combining with other NSAIDs"]),
      J(["Nausea", "Headache", "Diarrhoea (uncommon)"]),
      J(["History of thrombosis or thrombophilic disorders", "Active blood-clot disorder", "Known allergy to any ingredient"]),
      "Store below 30°C.",
      `${year + 2}-08-31`,
      0, 0, 1, 1,
      "Used for heavy menstrual bleeding under medical supervision. If periods suddenly become much heavier, consult a gynaecologist rather than self-medicating.",
      J(["menstrual", "hormonal"]),
      srcGuide, "verified", "Demo record; tranexamic clot cautions follow standard label guidance.", "low", "Dr. S. Kulkarni (demo reviewer)", "2026-08-14"
    ]);

    const autrin = addMed([
      "autrin", "Autrin (demo)", "demo", "Autrin", "Ferrous Sulphate + Folic Acid", "Capsule", "150 mg + 1.5 mg", "Pfizer Demo", "Iron + folate supplement", "8901234500123",
      "OTC / Supplement", 0,
      J(["Iron-deficiency anaemia support, including anaemia commonly seen with heavy periods"]),
      J(["Take as advised; iron absorbs best on an empty stomach but may upset it — ask a pharmacist", "Keep away from children"]),
      J(["Dark stools (harmless)", "Constipation", "Stomach upset"]),
      J(["Haemochromatosis or other iron-overload conditions", "Known allergy to any ingredient"]),
      "Store below 30°C.",
      `${year + 3}-01-31`,
      0, 0, 1, 1,
      "Iron supplements are often advised for heavy periods — a blood test guides whether you need them.",
      J(["menstrual"]),
      srcLabel, "verified", "Demo record; iron-overload contraindication follows standard label guidance.", "low", "Dr. A. Deshmukh (demo reviewer)", "2026-08-14"
    ]);

    // Expired demo medicine — date is always 30 days in the past so the
    // "Expired Medicine Warning" flow is demonstrable at any time.
    addMed([
      "expiredol", "Expiredol (expired demo)", "demo", "Expiredol", "Paracetamol", "Tablet", "500 mg", "Demo Pharma (expired sample)", "Analgesic / Antipyretic", null,
      "OTC", 0,
      J(["Demonstrates the expired-medicine warning flow (sample pack date has passed)"]),
      J(["Do not use expired medicines — see the red warning on the profile"]),
      J([]),
      J(["Severe liver disease", "Known allergy to paracetamol"]),
      "Store below 30°C.",
      inDays(-30),
      0, 0, 1, 1,
      null,
      "[]",
      srcParacetamolLabel, "verified", "Teaching record for the expiry flow; facts mirror the paracetamol label reference.", "medium", "Dr. A. Deshmukh (demo reviewer)", "2026-08-14"
    ]);

    // Demo "generic paracetamol" second product — used by the duplicate-ingredient demo.
    const calmol = addMed([
      "calmol", "Calmol Plus (demo)", "demo", "Calmol Plus", "Paracetamol + Caffeine", "Tablet", "500 mg + 30 mg", "Calm Labs (demo)", "Analgesic combination", null,
      "OTC", 0,
      J(["Relief of headache and body pain"]),
      J(["Contains paracetamol — check other medicines for the same ingredient", "Limit caffeine from tea/coffee while using"]),
      J(["Restlessness (with caffeine)", "Nausea"]),
      J(["Severe liver disease", "Known allergy to paracetamol"]),
      "Store below 30°C.",
      `${year + 2}-10-31`,
      0, 0, 1, 1,
      null,
      "[]",
      srcDemo, "verified", "Teaching record for the duplicate-ingredient flow; facts mirror the paracetamol label reference.", "low", "Dr. A. Deshmukh (demo reviewer)", "2026-08-14"
    ]);

    // Unverified record — demonstrates the verification workflow.
    addMed([
      "quickfix", "QuickFix Cold Relief (unverified demo)", "demo", "QuickFix", null, "Syrup", "100 ml", "QuickFix (demo)", "Cold remedy", null,
      "Unknown", 0,
      J(["(Demo record with incomplete information)"]),
      J(["Information pending verification by a reviewer"]),
      J([]),
      J([]),
      "Not specified.",
      null,
      0, 0, 0, 0,
      null,
      "[]",
      null, "unverified", "Awaiting a reviewer; fields will remain empty rather than guessed.", "low", null, "2026-08-14"
    ]);

    // ---------------- Medicine ↔ ingredient mapping ----------------
    const insMI = db.prepare("INSERT INTO medicine_ingredients (medicine_id, ingredient_id, strength) VALUES (?,?,?)");
    const link = (m: number, pairs: Array<[number, string]>) => pairs.forEach(([i, s]) => insMI.run(m, i, s));

    link(dolo, [[paracetamol, "650 mg"]]);
    link(coldrid, [[paracetamol, "500 mg"], [cpm, "2 mg"], [phenylephrine, "5 mg"]]);
    link(moxikind, [[amoxicillin, "500 mg"], [clavulanic, "125 mg"]]);
    link(brufen, [[ibuprofen, "400 mg"]]);
    link(alerzo, [[cetirizine, "10 mg"]]);
    link(omez, [[omeprazole, "20 mg"]]);
    link(glycomet, [[metformin, "500 mg"]]);
    link(norluc, [[omeprazole, "20 mg"], [domperidone, "10 mg"]]);
    link(primolut, [[norethisterone, "5 mg"]]);
    link(meftal, [[mefenamic, "250 mg"]]);
    link(trof, [[tranexamic, "500 mg"], [mefenamic, "250 mg"]]);
    link(autrin, [[iron, "150 mg"], [folic, "1.5 mg"]]);
    link(calmol, [[paracetamol, "500 mg"], [caffeine, "30 mg"]]);

    // ---------------- Warnings ----------------
    const insWarn = db.prepare("INSERT INTO warnings (medicine_id, code, level, title, body, source_id) VALUES (?,?,?,?,?,?)");
    const warn = (m: number, code: string, level: string, title: string, body: string, s?: number) =>
      insWarn.run(m, code, level, title, body, s ?? srcDemo);

    warn(dolo, "prescription", "yellow", "Prescription Awareness",
      "Available over the counter, but dosage should follow the label. Ask a pharmacist before combining with other medicines.");
    warn(dolo, "pregnancy", "yellow", "Pregnancy Awareness",
      "Generally considered one of the safer pain-relief options in pregnancy, but confirm with your doctor before use.");
    warn(dolo, "breastfeeding", "green", "Breastfeeding Awareness",
      "Usually considered compatible with breastfeeding, but consult a doctor for personal advice.");
    warn(dolo, "duplicate", "yellow", "Duplicate Ingredient",
      "Many cold and flu medicines also contain paracetamol. Check other medicines in your cabinet.");

    warn(coldrid, "drowsiness", "orange", "Drowsiness Awareness",
      "This medicine may affect alertness or reaction time. Avoid driving or operating machinery if you feel drowsy or impaired.");
    warn(coldrid, "prescription", "yellow", "Prescription Awareness",
      "Sold over the counter as a combination product, but combining it with other paracetamol products is a known risk.");
    warn(coldrid, "duplicate", "orange", "Duplicate Ingredient",
      "Contains paracetamol — avoid taking it together with Dolo, Calmol or similar products.");
    warn(coldrid, "pregnancy", "orange", "Pregnancy Awareness",
      "Combination cold medicines are generally avoided in pregnancy without a doctor's advice.");

    warn(moxikind, "prescription", "red", "Prescription Awareness",
      "This is a prescription-only antibiotic. It must be prescribed by a doctor — never self-medicate or share antibiotics.");
    warn(moxikind, "interaction", "yellow", "Interaction Awareness",
      "Tell your doctor about other medicines you use, especially blood thinners like warfarin.");
    warn(moxikind, "breastfeeding", "green", "Breastfeeding Awareness",
      "Often considered compatible with breastfeeding, but use only under medical advice.");

    warn(brufen, "prescription", "yellow", "Prescription Awareness",
      "OTC pack sizes are limited; longer use needs medical advice.");
    warn(brufen, "pregnancy", "red", "Pregnancy Awareness",
      "NSAIDs are not recommended in the third trimester and should be avoided earlier in pregnancy without medical advice.");
    warn(brufen, "interaction", "yellow", "Interaction Awareness",
      "Can irritate the stomach and may interact with blood pressure and blood-thinning medicines.");

    warn(alerzo, "drowsiness", "orange", "Drowsiness Awareness",
      "This medicine may affect alertness or reaction time. Avoid driving or operating machinery if you feel drowsy or impaired.");
    warn(alerzo, "prescription", "green", "Prescription Awareness",
      "Widely available without prescription, but check with a pharmacist about other sedating medicines.");

    warn(omez, "prescription", "yellow", "Prescription Awareness",
      "Long courses need a doctor's review — don't continue refills without consultation.");
    warn(omez, "interaction", "yellow", "Interaction Awareness",
      "Can change how some medicines are absorbed; tell your doctor your full medicine list.");

    warn(glycomet, "prescription", "red", "Prescription Awareness",
      "Prescription-only medicine requiring regular medical supervision and monitoring.");
    warn(glycomet, "interaction", "orange", "Interaction Awareness",
      "Alcohol and certain contrast dyes/scans can cause serious problems — follow your doctor's instructions.");

    warn(norluc, "interaction", "yellow", "Interaction Awareness",
      "Domperidone has known heart-rhythm-related interactions — share your full medicine list with your doctor.");

    warn(primolut, "prescription", "red", "Prescription Awareness",
      "Strictly prescription-only hormonal medicine. Dose and duration must be decided by a doctor.");
    warn(primolut, "menstrual", "orange", "Menstrual / Hormonal Awareness",
      "It changes hormone levels to delay a period. Effects differ from person to person and it is not a contraceptive.");
    warn(primolut, "pregnancy", "orange", "Pregnancy Awareness",
      "Do not use during pregnancy or suspected pregnancy without a doctor's guidance.");

    warn(meftal, "prescription", "yellow", "Prescription Awareness",
      "Intended for short-term period pain relief; frequent use needs medical review.");
    warn(meftal, "menstrual", "green", "Menstrual Awareness",
      "Commonly used for period pain. Persistent severe pain should be evaluated by a gynaecologist.");

    warn(trof, "prescription", "red", "Prescription Awareness",
      "Prescription advised. A doctor must check your clotting risk before use.");
    warn(trof, "menstrual", "orange", "Menstrual / Hormonal Awareness",
      "For heavy menstrual bleeding under supervision. Sudden heavy bleeding needs medical evaluation.");

    warn(autrin, "prescription", "green", "Prescription Awareness",
      "Supplement generally available without prescription; a blood test confirms whether you need it.");

    warn(calmol, "duplicate", "yellow", "Duplicate Ingredient",
      "Contains paracetamol — avoid combining with Dolo 650 or other paracetamol products.");
    warn(calmol, "prescription", "yellow", "Prescription Awareness",
      "Follow the label; the caffeine component may add to restlessness or sleep problems.");

    // ---------------- Interactions ----------------
    const insInt = db.prepare("INSERT INTO interactions (ingredient_a, ingredient_b, severity, interaction_type, description, source_id) VALUES (?,?,?,?,?,?)");
    const ibuprofenPair = [ibuprofen, tranexamic].sort((a, b) => a - b) as [number, number];
    insInt.run(ibuprofenPair[0], ibuprofenPair[1], "orange", "pharmacodynamic",
      "Both can increase bleeding-related considerations; combining NSAIDs with tranexamic acid should only happen under medical advice.", srcGuide);
    const omezPair = [omeprazole, metformin].sort((a, b) => a - b) as [number, number];
    insInt.run(omezPair[0], omezPair[1], "caution", "pharmacokinetic",
      "Acid-reducing medicines can slightly change how some co-prescribed medicines are absorbed; usually fine — confirm with your doctor.", srcGuide);

    // ---------------- Admin + demo user ----------------
    const adminPassword = process.env.ADMIN_PASSWORD ?? "Admin@1234";
    const insUser = db.prepare(
      "INSERT INTO users (name, email, password_hash, role, language) VALUES (?,?,?,?,?)"
    );
    const adminId = insUser.run("MedSafe Admin", process.env.ADMIN_EMAIL ?? "admin@medsafe.local",
      bcrypt.hashSync(adminPassword, 10), "admin", "en").lastInsertRowid as number;
    db.prepare("INSERT INTO admins (user_id) VALUES (?)").run(adminId);
    insUser.run("Demo User", "demo@medsafe.local", bcrypt.hashSync("Demo@1234", 10), "user", "en");

    // ---------------- Sample report ----------------
    db.prepare(
      "INSERT INTO reports (type, description, medicine_name, pharmacy, location, status) VALUES (?,?,?,?,?,?)"
    ).run("damaged_packaging",
      "Blister seal of a paracetamol strip was already broken at purchase. (Sample report for demo purposes.)",
      "Dolo 650", "City Medicals (demo)", "Pune, Maharashtra", "open");

    // ---------------- Search stats (for "most searched") ----------------
    const insStat = db.prepare("INSERT INTO search_stats (medicine_id, count) VALUES (?,?)");
    insStat.run(dolo, 42);
    insStat.run(coldrid, 27);
    insStat.run(primolut, 19);
    insStat.run(brufen, 15);
    insStat.run(moxikind, 11);
  });

  seed();
  console.log("[medsafe] demo database seeded (clearly-labelled prototype data)");
}
