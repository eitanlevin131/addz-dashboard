export const SCAN_VERSION = "website-v1";
export const SCAN_LIMITS = {
  pages: 20, candidates: 2000, sitemaps: 6, requests: 60, depth: 2,
  responseBytes: 2 * 1024 * 1024, textCharacters: 20000,
  requestMs: 10000, aiMs: 40000, chunkMs: 45000, leaseMs: 90000,
  redirects: 5, aiAttempts: 6, evidenceCharacters: 2000,
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
export type ReviewDisposition = typeof REVIEW_DISPOSITIONS[number];
export type FindingInput = {
  category: string; key: string; value: unknown; sourceId: string;
  evidence: string; locator?: string; observationStatus: "observed" | "inferred";
  confidence: "high" | "medium" | "low"; sourceType: "html" | "json_ld" | "ai";
};
