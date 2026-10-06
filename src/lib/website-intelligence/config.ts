export const SCAN_VERSION = "website-v3";
export const SCAN_LIMITS = {
  pages: 60, candidates: 2000, sitemaps: 12, requests: 140, depth: 4,
  responseBytes: 2 * 1024 * 1024, textCharacters: 20000,
  requestMs: 10000, aiMs: 40000, chunkMs: 45000, leaseMs: 90000,
  redirects: 5, aiAttempts: 6, evidenceCharacters: 2000,
} as const;
export const COVERAGE_LIMITS = {
  discoveryPages: 28, categories: 12, listingPages: 20, pagesPerCollection: 3,
  minDeepProducts: 8, maxDeepProducts: 32, catalogPerSource: 100, catalogProducts: 1000,
} as const;
export const TERMINAL_SCAN_STATUSES = ["completed", "completed_with_warnings", "failed", "cancelled"];
export const AI_TASKS = ["brand_voice", "products_commercial", "audience_problems", "differentiation_operations"] as const;
export const REVIEW_DISPOSITIONS = ["normal", "needs_review", "ignored"] as const;
export const CATEGORY_LABELS: Record<string, string> = {
  brand: "מותג", products: "מוצרים", audience: "קהל ושימושים", problems: "צרכים ותוצאות",
  differentiation: "בידול והוכחות", commercial: "הצעות ומסחר", operations: "תפעול ושירות",
  voice: "שפה וקול", visual: "רמזים חזותיים",
};
export const SCAN_STATUS_LABELS: Record<string, string> = {
  pending: "ממתינה", running: "איסוף מקורות", processing: "עיבוד ממצאים",
  completed: "הושלמה", completed_with_warnings: "הושלמה עם אזהרות", failed: "נכשלה", cancelled: "נעצרה",
};
const WARNING_LABELS: Record<string, string> = {
  insufficient_evidence_ai_skipped: "לא נאסף מספיק תוכן שימושי להפעלת AI. מוצגים רק ממצאים ישירים.",
  challenge: "האתר דורש אימות דפדפן; לא בוצע ניסיון לעקוף אותו.",
  javascript_required: "חלק מהאתר דורש JavaScript ואינו זמין לסריקה זו.",
  noindex: "עמודים שסומנו noindex לא עובדו.",
  sitemap_unavailable: "מפת האתר לא הייתה זמינה; האיסוף הסתמך גם על קישורים.",
  text_truncated: "תוכן ארוך קוצר בהתאם למגבלות הסריקה.",
  inventory_conflict: "קיימת סתירה בין נתוני המלאי המובנים לבין התוכן הגלוי. המלאי אינו מוצג כעובדה ודאית.",
};
const TASK_LABELS: Record<string, string> = {
  brand_voice: "מותג ושפה", products_commercial: "מוצרים ומסחר",
  audience_problems: "קהל וצרכים", differentiation_operations: "בידול ושירות",
};
export function websiteWarningLabel(code: string): string {
  if (WARNING_LABELS[code]) return WARNING_LABELS[code];
  const capped = /^crawl_delay_capped:(\d+(?:\.\d+)?(?:e\+?\d+)?):5$/.exec(code);
  if (capped) return `מרווח הסריקה המבוקש באתר הוא ${capped[1]} שניות; המרווח האפקטיבי הוגבל ל־5 שניות.`;
  const task = AI_TASKS.find(task => code.startsWith(task + "_"));
  const prefix = task ? TASK_LABELS[task] + ": " : "";
  if (code.includes("insufficient_evidence")) return prefix + "אין מספיק מקורות לניתוח AI.";
  if (code.endsWith("invalid_findings_rejected")) return prefix + "ממצאים ללא הוכחה תקינה הוסרו; הממצאים התקינים נשמרו.";
  if (code.endsWith("invalid_ai_evidence")) return prefix + "תשובת AI לא התאימה להוכחות במקורות ולא פורסמה.";
  if (code.endsWith("attempts_exhausted")) return prefix + "הניתוח לא הושלם לאחר ניסיונות חוזרים.";
  if (code.endsWith("ai_not_configured")) return prefix + "AI אינו מוגדר בסביבה זו.";
  return prefix + "חלק מהמידע לא היה זמין לעיבוד; יש לעיין במקורות ובריצות AI.";
}
export type ReviewDisposition = typeof REVIEW_DISPOSITIONS[number];
export type FindingInput = {
  category: string; key: string; value: unknown; sourceId: string;
  evidence: string; locator?: string; observationStatus: "observed" | "inferred";
  confidence: "high" | "medium" | "low"; sourceType: "html" | "json_ld" | "ai";
};
