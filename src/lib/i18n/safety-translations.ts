/**
 * Safety content translations (Hindi + Marathi) — seeded into the `translations`
 * table on boot and served through the deterministic safety engine.
 *
 * Key scheme (entity = 'safety'):
 *   rule.<code>.title / rule.<code>.body   — engine-generated rule cards
 *   interaction.<id>                       — interaction descriptions
 *   level.<green|yellow|orange|red>        — safety indicator level labels
 *   ar.*                                   — AR zone labels + expiry lines
 *
 * Only generic, medicine-independent content lives here. Per-medicine keys
 * (warn.<slug>.*, mednote.<slug>) are NO LONGER seeded from this file — the
 * old demo-medicine entries were fake data, removed with the demo dataset;
 * per-medicine warnings translate from the warnings table rows themselves.
 *
 * English is the source of truth; hi/mr rows mirror the seed content exactly.
 */

export type SafetyTranslation = { entity: string; key: string; lang: "hi" | "mr"; value: string };

const HI = {
  // ── Level labels ──────────────────────────────────────────────
  "level.green": "सामान्य जागरूकता",
  "level.yellow": "सावधानी",
  "level.orange": "पेशेवर पर्यवेक्षण",
  "level.red": "महत्वपूर्ण चेतावनी",

  // ── Rule cards ────────────────────────────────────────────────
  "rule.unverified.title": "असत्यापित रिकॉर्ड",
  "rule.unverified.body":
    "इस दवा के रिकॉर्ड की समीक्षा किसी समीक्षक द्वारा अभी तक नहीं हुई है। दिखाई गई जानकारी अधूरी मानें और फार्मासिस्ट से पुष्टि करें।",
  "rule.prescription.rx.title": "प्रिस्क्रिप्शन जागरूकता",
  "rule.prescription.rx.body":
    "यह केवल-प्रिस्क्रिप्शन दवा है। यह आपके लिए सही है या नहीं, यह योग्य डॉक्टर तय करेगा — खुद-इलाज न करें और इसे दूसरों से साझा न करें।",
  "rule.prescription.schedule.title": "प्रिस्क्रिप्शन जागरूकता",
  "rule.prescription.schedule.body":
    "विनियामक वर्ग: {class}। लेबल जाँचें और एक्सेस नियमों को लेकर अनिश्चित हों तो फार्मासिस्ट से पूछें।",
  "rule.drowsiness.title": "नींद चेतावनी",
  "rule.drowsiness.body":
    "यह दवा सतर्कता या प्रतिक्रिया समय को प्रभावित कर सकती है। सुस्ती या कमज़ोरी महसूस हो तो वाहन चलाने या मशीन चलाने से बचें।",
  "rule.pregnancy.title": "गर्भावस्था जागरूकता",
  "rule.pregnancy.body":
    "यदि आप गर्भवती हैं या गर्भधारण की योजना बना रही हैं, तो इस दवा का उपयोग करने से पहले डॉक्टर से पूछें।",
  "rule.breastfeeding.title": "स्तनपान जागरूकता",
  "rule.breastfeeding.body":
    "यदि आप स्तनपान करा रही हैं, तो इस दवा का उपयोग करने से पहले डॉक्टर या फार्मासिस्ट से जाँच करें।",
  "rule.menstrual.title": "मासिक / हार्मोनल जागरूकता",
  "rule.menstrual.suffix":
    " कुछ दवाएँ कुछ लोगों की मासिक प्रणाली को प्रभावित कर सकती हैं। इसका मतलब यह नहीं कि दवा ने बदलाव किया — व्यक्तिगत सलाह के लिए योग्य स्वास्थ्य पेशेवर से परामर्श करें।",
  "rule.expiry.red.title": "एक्सपायर्ड दवा चेतावनी",
  "rule.expiry.red.body":
    "यह दवा {date} को एक्सपायर हो गई। बिना पेशेवर मार्गदर्शन के एक्सपायर्ड दवा का उपयोग न करें। सुरक्षित निपटान या प्रतिस्थापन के लिए फार्मासिस्ट से संपर्क करें।",
  "rule.expiry.near.title": "एक्सपायरी पास सूचना",
  "rule.expiry.near.body":
    "यह दवा {date} को एक्सपायर होगी (लगभग {days} दिनों में)। प्रतिस्थापन की योजना बनाएं और लंबे समय के उपयोग से पहले फार्मासिस्ट से जाँच करें।",

  // ── AR zone labels + expiry lines (shared with the AR explainer) ──
  "ar.zone.name": "दवा का नाम",
  "ar.zone.ingredients": "सक्रिय तत्व",
  "ar.zone.warnings": "चेतावनी क्षेत्र",
  "ar.zone.expiry": "एक्सपायरी",
  "ar.zone.storage": "भंडारण",
  "ar.zone.nodriving": "ड्राइविंग न करें चिह्न",
  "ar.expiry.ok": "{date} तक वैध",
  "ar.expiry.near": "{date} को एक्सपायर (~{days} दिन) — बदलने की योजना बनाएँ",
  "ar.expiry.expired": "{date} को एक्सपायर्ड — उपयोग न करें; फार्मासिस्ट से परामर्श करें",
  "ar.expiry.unknown": "कोई एक्सपायरी जानकारी दर्ज नहीं",

  // ── Cross-medicine cards (names filled at runtime) ──
  "rule.interaction.title": "इंटरैक्शन जागरूकता",
  "rule.duplicate.title": "डुप्लिकेट सक्रिय सामग्री का पता चला",
  "rule.duplicate.body":
    "दोनों दवाओं में वही सक्रिय सामग्री है ({names})। उन्हें एक साथ उपयोग करने से पहले डॉक्टर या फार्मासिस्ट से जाँच लें।",

  // ── Interactions (interaction.<uniqA>__<uniqB>, names sorted a→z) ──
  "interaction.ibuprofen__tranexamic-acid":
    "दोनों रक्तस्राव संबंधी विचार बढ़ा सकते हैं; NSAID को ट्रानेक्सामिक एसिड के साथ जोड़ना केवल चिकित्सकीय सलाह पर होना चाहिए।",
  "interaction.metformin__omeprazole":
    "अम्ल-घटाने वाली दवाएँ कुछ सह-निर्धारित दवाओं के अवशोषण को थोड़ा बदल सकती हैं; आमतौर पर ठीक — डॉक्टर से पुष्टि करें।",
};

const MR = {
  // ── Level labels ──────────────────────────────────────────────
  "level.green": "सामान्य जाणीव",
  "level.yellow": "सावध",
  "level.orange": "व्यावसायिक देखरेख",
  "level.red": "महत्त्वाची सूचना",

  // ── Rule cards ────────────────────────────────────────────────
  "rule.unverified.title": "असत्यापित रेकॉर्ड",
  "rule.unverified.body":
    "या औषधाच्या रेकॉर्डचे पुनरावलोकन अद्याप समीक्षकाकडून झालेले नाही. दाखवलेली माहिती अपूर्ण समजा आणि फार्मासिस्टकडून खात्री करा.",
  "rule.prescription.rx.title": "प्रिस्क्रिप्शन जाणकारी",
  "rule.prescription.rx.body":
    "हे केवळ-प्रिस्क्रिप्शन औषध आहे. ते तुमच्यासाठी योग्य आहे का हे पात्र डॉक्टर ठरवतील — स्वतः औषध करू नका आणि इतरांसोबत सामायिक करू नका.",
  "rule.prescription.schedule.title": "प्रिस्क्रिप्शन जाणकारी",
  "rule.prescription.schedule.body":
    "नियामक वर्ग: {class}. लेबल तपासा आणि प्रवेश नियमांबाबत खात्री नसल्यास फार्मासिस्टला विचारा.",
  "rule.drowsiness.title": "झोप येण्याची सूचना",
  "rule.drowsiness.body":
    "हे औषध जागृती किंवा प्रतिक्रिया वेग प्रभावित करू शकते. झोपळट वाटत असल्यास वाहन चालवणे किंवा यंत्र चालवणे टाळा.",
  "rule.pregnancy.title": "गर्भधारणा जाणकारी",
  "rule.pregnancy.body":
    "तुम्ही गर्भवती असाल किंवा गर्भधारणेची योजना करत असाल, तर हे औषध वापरण्यापूर्वी डॉक्टरांचा सल्ला घ्या.",
  "rule.breastfeeding.title": "स्तनपान जाणकारी",
  "rule.breastfeeding.body":
    "तुम्ही स्तनपान देत असल, तर हे औषध वापरण्यापूर्वी डॉक्टर किंवा फार्मासिस्टकडून तपासा.",
  "rule.menstrual.title": "मासिक / हार्मोनल जाणकारी",
  "rule.menstrual.suffix":
    " काही औषधे काही लोकांच्या मासिक पाळीवर परिणाम करू शकतात. याचा अर्थ औषधाने बदल घडवला असे नाही — वैयक्तिक सल्ल्यासाठी पात्र आरोग्य व्यावसायिकाचा सल्ला घ्या.",
  "rule.expiry.red.title": "मुदत संपलेल्या औषधाची सूचना",
  "rule.expiry.red.body":
    "हे औषध {date} रोजी मुदत संपले. व्यावसायिक मार्गदर्शनाशिवाय मुदत संपलेले औषध वापरू नका. सुरक्षित निकाल किंवा बदलीसाठी फार्मासिस्टशी संपर्क साधा.",
  "rule.expiry.near.title": "मुदत जवळ सूचना",
  "rule.expiry.near.body":
    "हे औषध {date} रोजी संपेल (जवळपास {days} दिवसांत). बदलीची योजना करा आणि दीर्घ वापरापूर्वी फार्मासिस्टकडून तपासा.",

  // ── AR zone labels + expiry lines (shared with the AR explainer) ──
  "ar.zone.name": "औषधाचे नाव",
  "ar.zone.ingredients": "सक्रिय घटक",
  "ar.zone.warnings": "सूचना क्षेत्र",
  "ar.zone.expiry": "मुदत",
  "ar.zone.storage": "साठवण",
  "ar.zone.nodriving": "वाहन चालवू नये चिन्ह",
  "ar.expiry.ok": "{date} पर्यंत वैध",
  "ar.expiry.near": "{date} रोजी मुदत समाप्त (~{days} दिवस) — बदलण्याची तयारी करा",
  "ar.expiry.expired": "{date} रोजी मुदत संपली — वापरू नका; फार्मासिस्टचा सल्ला घ्या",
  "ar.expiry.unknown": "मुदतीची माहिती नोंदलेली नाही",

  // ── Cross-medicine cards (names filled at runtime) ──
  "rule.interaction.title": "औषध संवाद जाणकारी",
  "rule.duplicate.title": "डुप्लिकेट सक्रिय घटक आढळले",
  "rule.duplicate.body":
    "दोन्ही औषधांमध्ये तेच सक्रिय घटक आहेत ({names}). ती एकत्र वापरण्यापूर्वी डॉक्टर किंवा फार्मासिस्टकडून तपासा.",

  // ── Interactions (interaction.<uniqA>__<uniqB>, names sorted a→z) ──
  "interaction.ibuprofen__tranexamic-acid":
    "दोन्ही रक्तस्राव संबंधी विचार वाढवू शकतात; NSAID ट्रानेक्सामिक अ‍ॅसिडसोबत फक्त वैद्यकीय सल्ल्यानेच घावे.",
  "interaction.metformin__omeprazole":
    "अ‍ॅसिड कमी करणारी औषधे काही सह-निर्धारित औषधांचे शोषण थोडे बदलू शकतात; बहुधा ठीक — डॉक्टरांकडून खात्री करा.",
};

/** Interaction keys are `interaction.<a>-<b>` with a = lower ingredient id. */
export const SAFETY_TRANSLATIONS: SafetyTranslation[] = [
  ...Object.entries(HI).map(([key, value]) => ({ entity: "safety", key, lang: "hi" as const, value })),
  ...Object.entries(MR).map(([key, value]) => ({ entity: "safety", key, lang: "mr" as const, value })),
];
