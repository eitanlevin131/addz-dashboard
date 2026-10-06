import { SCAN_LIMITS, TERMINAL_SCAN_STATUSES } from "./config.ts";
import type { ScanNotification } from "./notification-core";
export type ScanState = {
  stage: "bootstrap" | "sitemaps" | "fetch" | "ai" | "finalize";
  robots: string; robotsRoot?: string; crawlDelay: number; crawlDelayOriginal?: number | null;
  websiteRetryAfterAt?: string;
  sitemapQueue: string[]; sitemapVisited: string[];
  candidates: { url: string; type: string; depth: number }[];
  taskIndex: number; aiAttempts: number; warnings: string[];
  evidence?: { sufficient: boolean; pages: number; characters: number; reason: string | null };
  request?: { originalUrl: string; currentUrl: string; redirects: string[] };
  notification?: ScanNotification;
  researchSkipped?: boolean;
  crawlPhase?: "discovery" | "deep";
};
export function initialScanState(): ScanState {
  return { stage: "bootstrap", crawlPhase: "discovery", robots: "", crawlDelay: 1, sitemapQueue: [], sitemapVisited: [], candidates: [], taskIndex: 0, aiAttempts: 0, warnings: [] };
}
export function terminalScan(status: string) { return TERMINAL_SCAN_STATUSES.includes(status); }
export function crawlDelayPolicy(requested?: number) {
  const original = typeof requested === "number" && Number.isFinite(requested) && requested >= 0 ? requested : null;
  const effective = Math.min(original ?? 1, 5);
  return { original, effective, warning: original !== null && original > 5 ? `crawl_delay_capped:${original}:5` : null };
}
export function retryAfterDeadline(header: string | undefined, now = Date.now()): Date | null {
  if (!header?.trim()) return null;
  const value = header.trim();
  const time = /^\d+$/.test(value) ? now + Number(value) * 1000
    : /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/i.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time >= now && time <= 8640000000000000 ? new Date(time) : null;
}
export function transientWebsiteStatus(status: number) { return status === 429 || status >= 500 && status < 600; }
export function websiteRequestsPending(state: ScanState, pendingSource: boolean) {
  return state.stage === "bootstrap" || state.stage === "sitemaps" && state.sitemapQueue.length > 0 && state.sitemapVisited.length < SCAN_LIMITS.sitemaps
    || state.stage === "fetch" && pendingSource;
}
export function retryAt(attempt: number, now = Date.now(), retryAfterSeconds = 0) {
  return new Date(now + Math.max(retryAfterSeconds * 1000, Math.min(60000, 2000 * 2 ** attempt)));
}
export function canClaim(status: string, leaseUntil: Date | null, nextRetryAt: Date | null, now = Date.now()) {
  return !terminalScan(status) && (!leaseUntil || leaseUntil.getTime() <= now) && (!nextRetryAt || nextRetryAt.getTime() <= now);
}
export function defaultIntelligence<T extends { reviewDisposition: string }>(findings: T[]) {
  return findings.filter(finding => finding.reviewDisposition !== "ignored").map(finding => ({ ...finding, unresolved: finding.reviewDisposition === "needs_review" }));
}
