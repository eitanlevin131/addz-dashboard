import { AI_TASKS, CATEGORY_LABELS } from "./config.ts";

type Source = { id: string; status: string; pageType: string };
type Finding = {
  id: string; sourceId: string; category: string; key: string; value: unknown;
  observationStatus: string; reviewDisposition: string;
};
export function sameWebsiteForQuestionnaire(left: string | null, right: string): boolean {
  const identity = (value: string | null) => {
    try {
      const url = new URL(value || "");
      return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
    } catch { return null; }
  };
  const site = identity(left);
  return site !== null && site === identity(right);
}
export function findingText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value ?? "");
  const row = value as Record<string, unknown>;
  if (typeof row.summary === "string") return row.summary;
  if (typeof row.text === "string") return row.text;
  if (row.name) return [row.name, row.price != null ? `${row.price} ${row.currency || ""}` : "", row.description].filter(Boolean).join(" · ");
  return Object.entries(row).filter(([, item]) => typeof item === "string" || typeof item === "number").map(([key, item]) => `${key}: ${item}`).join(" · ");
}
// A projection of published findings, never a new AI summary or a claim of completeness.
export function websiteOverview(sources: Source[], findings: Finding[]) {
  const usable = findings.filter(item => item.reviewDisposition !== "ignored");
  const completed = sources.filter(source => source.status === "completed");
  const products = usable.filter(item => item.key === "product");
  return {
    pages: completed.length, selected: sources.length,
    failed: sources.filter(source => source.status === "failed").length,
    observed: usable.filter(item => item.observationStatus === "observed").length,
    inferred: usable.filter(item => item.observationStatus === "inferred").length,
    needsReview: usable.filter(item => item.reviewDisposition === "needs_review").length,
    ignored: findings.length - usable.length,
    products: new Set(products.map(item => findingText(item.value))).size,
    pricedProducts: new Set(products.filter(item => {
      const value = item.value as Record<string, unknown> | null;
      return value && value.price != null && value.price !== "";
    }).map(item => findingText(item.value))).size,
    sections: Object.entries(CATEGORY_LABELS).map(([category, label]) => {
      const priority = (item: Finding) => item.value && typeof item.value === "object" && "summary" in item.value ? 0
        : item.key === "product" || item.key === "brand_name" ? 1 : 2;
      const items = usable.filter(item => item.category === category && item.key !== "page_title").sort((left, right) => priority(left) - priority(right));
      const seen = new Set<string>();
      const examples = items.filter(item => {
        const text = findingText(item.value);
        if (seen.has(text)) return false;
        seen.add(text); return true;
      });
      return { category, label, count: items.length, items: examples.slice(0, 2).map(item => ({
        id: item.id, sourceId: item.sourceId, text: findingText(item.value),
        observationStatus: item.observationStatus, reviewDisposition: item.reviewDisposition,
      })) };
    }).filter(section => section.count > 0),
    coverage: (["faq", "shipping", "returns", "contact"] as const).map(type => ({
      type, source: completed.some(source => source.pageType === type),
      finding: usable.some(item => item.key === type + "_text" || item.category === "operations" && item.key === type
        || type === "contact" && ["contact_email", "support"].includes(item.key)
        || type === "shipping" && item.key === "shipping_threshold_claim"),
    })),
  };
}
type DateValue = Date | string | null;
export function websiteProductSample(sources: Source[], candidates: { url: string; type: string }[]) {
  return { discovered: new Set(candidates.filter(item => item.type === "product").map(item => item.url)).size,
    selected: sources.filter(item => item.pageType === "product").length,
    processed: sources.filter(item => item.pageType === "product" && item.status === "completed").length };
}
export function websiteProgress(scan: {
  status: string; startedAt: DateValue; createdAt: Date | string; completedAt: DateValue;
  state: { stage: string; taskIndex: number };
}, sources: Source[], now: number) {
  const finished = ["completed", "completed_with_warnings", "failed", "cancelled"].includes(scan.status);
  const steps = ["גילוי עמודים", "איסוף תוכן", "מחקר וניתוח", "בדיקת ראיות"];
  const stage = scan.state.stage === "bootstrap" || scan.state.stage === "sitemaps" ? 0
    : scan.state.stage === "fetch" ? 1 : scan.state.stage === "ai" ? 2 : 3;
  const end = scan.completedAt ? new Date(scan.completedAt).getTime() : now;
  const elapsedSeconds = Math.max(0, Math.floor((end - new Date(scan.startedAt || scan.createdAt).getTime()) / 1000));
  return {
    finished, stage, steps, elapsedSeconds,
    processed: sources.filter(source => ["completed", "failed", "skipped"].includes(source.status)).length,
    selected: sources.length,
    analysisCompleted: Math.min(AI_TASKS.length, scan.state.taskIndex), analysisTotal: AI_TASKS.length,
  };
}
