import { normalizeText } from "./extraction.ts";

const comparable = (text: string) => normalizeText(text).normalize("NFKC").toLocaleLowerCase();
export function copiedInferenceSummary(summary: string, evidence: string) {
  const tokens = (text: string) => comparable(text).normalize("NFD").replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]+/gu) || [];
  // A cosmetic type label does not turn the following quote into interpretation.
  const claim = tokens(summary.replace(/^(?:tone|positioning|audience(?: hypothesis)?|pain|desire|use case|טון|מיצוב|קהל|השערה|הסקה)\s*[:：]\s*/i, ""));
  const source = tokens(evidence);
  if (!claim.length || !source.length) return false;
  const contained = source.some((_, start) => claim.every((word, index) => source[start + index] === word));
  if (contained) return true;
  // Count only copied phrases, not shared individual terms. Multiple copied
  // spans also count, so trimming/rejoining a quote cannot evade the boundary.
  const phrases = new Set(source.slice(0, -2).map((_, start) => source.slice(start, start + 3).join(" ")));
  const copied = new Set<number>();
  for (let start = 0; start + 2 < claim.length; start++) {
    if (phrases.has(claim.slice(start, start + 3).join(" "))) {
      copied.add(start); copied.add(start + 1); copied.add(start + 2);
    }
  }
  return copied.size >= 3 && copied.size / claim.length >= 0.7;
}
export function truncatedFindingSpan(span: string, context: string) {
  const claim = normalizeText(span), source = normalizeText(context), index = source.indexOf(claim);
  if (/(?:\.\.\.|…)$/.test(claim) || /(?:\b(?:of|and|with|by|from|the|a|an)|(?:^|\s)(?:פרי|של|את|עם|על|כדי|באמצעות))$/i.test(claim)) return true;
  const next = index < 0 ? "" : source[index + claim.length] || "";
  return /[\p{L}\p{N}]/u.test(claim.at(-1) || "") && /[\p{L}\p{N}]/u.test(next);
}
const moneyOrDiscount = /₪|[$€£]|\b(?:ils|nis|usd|eur)\b|ש["״”']?ח|\d\s*%/i;
const commercialLanguage = /\b(?:price|discount|offer|shipping|delivery|free|purchase|orders?|minimum|members?)\b|מחיר|הנח[הת]|מבצע|משלוח|חינם|ברכיש|בקני|בהזמנ|מינימום|לחברי/i;
const conditionLanguage = /\b(?:if|only|unless|except|excluding|until|over|above|below|minimum|maximum|members?|with|without|valid|eligible|expires|within|at least|per customer)\b|בתנאי|בלבד|למעט|ללא|מעל|ומעלה|מתחת|עד |בקני|ברכיש|בהזמנ|מינימום|לחברי|קופון|תוקף|מותנה|מוגבל/i;

// Flattened HTML can lose heading boundaries. Ambiguous commercial blocks need
// their surrounding rules; the cheapest quoted threshold is not self-contained.
export function commercialConditionSupported(value: { summary: string; details: string[] }, evidence: string, sourceText: string, category: string) {
  const claim = [value.summary, ...value.details].join(" ");
  const conditional = moneyOrDiscount.test(claim + " " + evidence) || /(?<![\w-])free\b|חינם/i.test(claim + " " + evidence) || commercialLanguage.test(evidence) && conditionLanguage.test(evidence)
    || category === "commercial" && commercialLanguage.test(claim);
  if (!conditional) return true;
  const source = normalizeText(sourceText), excerpt = normalizeText(evidence);
  if (!comparable(claim).includes(comparable(excerpt))) return false;
  const sentences = source.split(/(?<=[.!?;])\s+|\n+/).filter(Boolean);
  const relevant = sentences.flatMap((sentence, index) => {
    if (!(moneyOrDiscount.test(sentence) || conditionLanguage.test(sentence))) return [];
    // The preceding heading/sentence can scope delivery, membership or offers.
    return index > 0 ? [sentences[index - 1], sentence] : [sentence];
  });
  return relevant.length > 0 && relevant.every(sentence => comparable(excerpt).includes(comparable(sentence)));
}

export function categoryIsProduct(summary: string, productNames: string[], pageType: string) {
  if (pageType === "product") return true;
  const claim = comparable(summary);
  return productNames.some(name => {
    const product = comparable(name);
    return product.length > 2 && (claim === product || claim.includes(product));
  });
}

export function genericCategoryLabel(summary: string) {
  return /^(?:shop|store|catalog(?:ue)?|products|all products|categories|collections|חנות|מוצרים|כל המוצרים|קטגוריות|קטלוג)[.!:]*$/i.test(comparable(summary));
}

// These are material premises, not a word-overlap score: a dietary group,
// duration promise or usage effect needs its own support in the same citation.
const materialFacets = [
  /\bvegan\w*\b|טבעונ/i,
  /\bvegetarian\w*\b|צמחונ/i,
  /\bgluten\b|גלוטן/i,
  /\b(?:celiac|coeliac)\b|צליאק/i,
  /\bpaleo\b|פליאו/i,
  /\b(?:novice|beginner|inexperienced|no experience|without experience)\w*\b|חסרי ניסיון|ללא ניסיון|בלי ניסיון|מתחילים/i,
  /\b(?:sav(?:e|es|ing) time|time[- ]saving|fast(?:er)?|quick(?:er)?|shorten|reduce.{0,25}(?:time|duration))\b|חוס[ךכת].{0,12}זמן|חיסכון בזמן|מקצר|קיצור זמן|מהיר|פחות זמן/i,
  /\b(?:daily|every day|frequently|high frequency)\b|יומיומי|יום[- ]יום|כל יום|בתדירות גבוהה/i,
  /\b(?:trust|confidence in the brand|conversion|profit|willing.{0,15}pay)\b|אמון|המרות|רווח|מוכנים לשלם/i,
];
export function publicationWordingIssue(claim: string, evidence: string, key: string) {
  if (materialFacets.some(facet => facet.test(claim) && !facet.test(evidence))) return "unsupported_claim_expansion";
  if (["tone", "positioning"].includes(key)) {
    const globalPattern = /throughout|across (?:the )?(?:site|website)|site-wide|recurring|consisten|regularly|בכל האתר|חוזר|עקבי|נוהג(?:ת|ים)?/i;
    if (globalPattern.test(claim) && !globalPattern.test(evidence)) return "unsupported_interpretation_scope";
    const instructionClaim = /practical (?:instructions|guidance)|step[- ]by[- ]step|tutorial|instructional|educational|הנחיות מעשיות|הדרכתי|מלמד|מדריך/i;
    const instructionalEvidence = /\b(?:step \d|how to|first .{1,80}then|tutorial|learn|teach)\b|שלב \d|איך |כיצד |ערבבו|חממו|הוסיפו|ללמד|מלמד|למדו/i;
    if (instructionClaim.test(claim) && !instructionalEvidence.test(evidence)) return "unsupported_voice_quality";
  }
  return null;
}

export function narrowPublicationSummary(summary: string, evidence: string, key: string, observationStatus: string) {
  if (!publicationWordingIssue(summary, evidence, key)) return summary;
  // Only remove whole trailing sentences from an inference. Never edit facts,
  // conditional rules, qualifiers within a sentence or the original evidence.
  if (observationStatus !== "inferred" || moneyOrDiscount.test(summary) || conditionLanguage.test(summary)) return summary;
  const sentences = [...new Intl.Segmenter("he", { granularity: "sentence" }).segment(summary)].map(s => s.segment.trim());
  if (sentences.length < 2 || !/[.!?]$/.test(sentences[0]) || publicationWordingIssue(sentences[0], evidence, key)
    || sentences.slice(1).some(s => !publicationWordingIssue(s, evidence, key))) return summary;
  return sentences[0];
}

export function genuineCategoryEvidence(evidence: string, pageType: string) {
  if (/select options|choose options|ניתן לבחור את האפשרויות|בחר אפשרויות/i.test(evidence)) return false;
  const containerContents = /\b(?:bundle|pack(?:age)?|kit|box)\b.{0,100}\b(?:contains?|includes?|comes with|contents|items)\b|(?:המארז|הקופסה|הערכה|במארז|בקופסה).{0,100}(?:כולל|מכיל|תכול|יש |קבועות)|תכולת (?:מארז|הקופסה)|כרטיסיות|קוד QR/i;
  const variants = /\b(?:variants?|available in|sizes?|colou?rs?)\b|וריאנט|מידות|צבעים|אפשרויות בחירה/i;
  if (containerContents.test(evidence) || variants.test(evidence)) return false;
  const taxonomy = /\b(?:categories|collections|product groups|product range|range of)\b|קטגוריות|קטגוריה|קולקציות|משפחות מוצרים/i;
  return taxonomy.test(evidence) || ["category", "best_sellers"].includes(pageType)
    && evidence.length <= 160 && !/[.!?]/.test(evidence) && !moneyOrDiscount.test(evidence);
}

function practicalProductBenefit(evidence: string) {
  const storageAdvice = /\b(?:store|storage|keep .{0,40}(?:cool|dry|visible)|place .{0,40}(?:shelf|visible))\b|אחסון|לאחסן|לשמור במקום|ככל שתראו|יהיו נגישים|על המדף/i;
  return !storageAdvice.test(evidence)
    && /\b(?:make.{0,40}(?:easy|easier|faster|simple)|help.{0,40}(?:cook|prepare)|simplif|tastes? (?:great|good)|rich flavou?r|save.{0,12}time|without (?:long )?preparation)\w*\b|הופכ.{0,40}(?:פשוט|קל)|מפשט|מקלים|עושר של טעמים|טעם עשיר|טעים|חוס[ךכת].{0,12}זמן|בלי הכנה|ללא הכנה/i.test(evidence);
}

export function directlyStatedAudience(summary: string, evidence: string) {
  const statement = comparable(evidence), claim = comparable(summary);
  const audienceMarker = /\b(?:our (?:audience|customers)|target audience|intended for|designed for|suitable for (?:people|customers)|for (?:people|customers) who)\b|הקהל שלנו|קהל היעד|קהל (?:הלקוחות|לקוחות)|הלקוחות שלנו|מיועד(?:ת|ים|ות)? ל|מתאים(?:ה|ים|ות)? ל(?:אנשים|נשים|גברים|ילדים|לקוחות)/i;
  if (/\b(?:not|except|excluding)\b|אינו|אינה|לא מיועד|למעט|מלבד/i.test(statement) && !claim.includes(statement)) return false;
  return claim.length > 2 && statement.includes(claim) && audienceMarker.test(statement);
}

const customerSubject = "(?:\\b(?:customers?|clients?|consumers?|people|parents?)\\b|(?:ה)?לקוחות(?: שלנו)?|(?:ה)?צרכנים|אנשים|נשים|הורים)";
const customerPredicates: Record<string, string> = {
  problem: "(?:\\s+(?:often\\s+|regularly\\s+|who\\s+|are\\s+)?(?:struggle|struggling|suffer|experience (?:problems|difficulty|pain)|have (?:trouble|difficulty)|find .{1,80} (?:difficult|challenging)|complain)\\b|\\s*(?:ש)?(?:מתקשים|מתקשות|סובלים|סובלות|חווים קושי|חוות קושי|מתלוננים|מתלוננות|חסר להם))",
  desire: "(?:\\s+(?:often\\s+)?(?:want|wish|seek|desire|hope|ask for)\\b|\\s*(?:ש)?(?:רוצים|רוצות|מבקשים|מבקשות|מחפשים|מחפשות|מעוניינים|מעוניינות))",
  belief: "(?:\\s+(?:often\\s+)?(?:believe|think|feel that)\\b|\\s*(?:ש)?(?:מאמינים|מאמינות|חושבים|חושבות|סבורים|סבורות))",
};
const brandFraming = /\b(?:our (?:mission|vision|philosophy|aspiration)|we (?:believe|hope|want|aspire|aim)|we would like)\b|החזון|המשימה שלנו|הפילוסופיה שלנו|השאיפה שלנו|אנחנו (?:מאמינים|שואפים|מקווים|רוצים)|הרצון שלנו/i;

// Textual overlap does not entail a customer experience. Require a matching
// subject/predicate span, preserving framing that a shortened quote can hide.
export function semanticFindingSupported(key: string, value: { summary: string; details: string[] }, evidence: string, sourceText: string, observationStatus: string, category = "", allowStrategicHypothesis = false) {
  const citation = comparable(evidence), source = comparable(sourceText);
  const start = source.indexOf(citation);
  if (start < 0) return false;
  if (observationStatus === "observed" && !["brand", "voice"].includes(category)) {
    for (const claim of [value.summary, ...value.details]) {
      const offset = citation.indexOf(comparable(claim));
      const prefix = source.slice(Math.max(0, start + offset - 400), start + offset).split(/[.!?;]/).at(-1) || "";
      if (brandFraming.test(prefix + " " + claim)) return false;
    }
  }
  const kind = ["stated_problems", "pain_points_likely"].includes(key) ? "problem"
    : key === "desired_outcomes" ? "desire" : /customer.*belief/.test(key) ? "belief" : null;
  if (!kind) return true;
  if (allowStrategicHypothesis && kind === "desire" && observationStatus === "inferred"
    && practicalProductBenefit(citation)
    && !brandFraming.test(citation)) return true;
  const matches = [...citation.matchAll(new RegExp(customerSubject + customerPredicates[kind] + "[^.!?;]{0,700}[.!?;]?", "giu"))];
  const supported = matches.filter(match => {
    const position = start + match.index!;
    const before = source.slice(Math.max(0, position - 400), position).split(/[.!?;]/).at(-1) || "";
    return !brandFraming.test(before) && !/\b(?:if|imagine|might|may|could|not|never)\b|אולי|אילו|אם |לא |אינם/i.test(before);
  });
  if (!supported.length) return false;
  // Inference may interpret an explicit customer experience, not invent one
  // solely from an aspiration or a product benefit.
  if (observationStatus !== "observed") return true;
  return [value.summary, ...value.details].every(claim => supported.some(match => comparable(match[0]).includes(comparable(claim))));
}

export function publicationTypeSupported(key: string, evidence: string, pageType: string) {
  if (key === "categories") return genuineCategoryEvidence(evidence, pageType);
  if (key !== "benefits") return true;
  if (practicalProductBenefit(evidence)) return true;
  // Functional effects/benefit claims can be observed; composition or directions
  // alone are not benefits. Detailed semantic entailment still requires review.
  return !/\b(?:store|storage|add|mix|pour|keep|instructions?)\b|לאחסן|אחסון|ככל שתראו|יהיו נגישים|הוסיפו|ערבבו/i.test(evidence)
    && /\b(?:helps?|benefits?|improves?|reduces?|protects?|tastes?|flavou?r|aroma|freshness|comfort|ergonomic|support|convenient)\b|עוזר|תועלת|משפר|מפחית|מגן|טעמים|טעם|ארומה|טריות|נוח|ארגונומי|תמיכה|ישיבה ממושכת/i.test(evidence);
}
