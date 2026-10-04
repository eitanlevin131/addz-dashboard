import { TERMINAL_SCAN_STATUSES } from "./config.ts";
import type { ScanNotification } from "./notification-core";
export type ScanState = {
  stage: "bootstrap" | "sitemaps" | "fetch" | "ai" | "finalize";
  robots: string; robotsRoot?: string; crawlDelay: number;
  sitemapQueue: string[]; sitemapVisited: string[];
  candidates: { url: string; type: string; depth: number }[];
  taskIndex: number; aiAttempts: number; warnings: string[];
  evidence?: { sufficient: boolean; pages: number; characters: number; reason: string | null };
  notification?: ScanNotification;
};
export function initialScanState(): ScanState {
  return { stage: "bootstrap", robots: "", crawlDelay: 1, sitemapQueue: [], sitemapVisited: [], candidates: [], taskIndex: 0, aiAttempts: 0, warnings: [] };
}
export function terminalScan(status: string) { return TERMINAL_SCAN_STATUSES.includes(status); }
export function retryAt(attempt: number, now = Date.now(), retryAfterSeconds = 0) {
  return new Date(now + Math.max(retryAfterSeconds * 1000, Math.min(60000, 2000 * 2 ** attempt)));
}
export function canClaim(status: string, leaseUntil: Date | null, nextRetryAt: Date | null, now = Date.now()) {
  return !terminalScan(status) && (!leaseUntil || leaseUntil.getTime() <= now) && (!nextRetryAt || nextRetryAt.getTime() <= now);
}
export function defaultIntelligence<T extends { reviewDisposition: string }>(findings: T[]) {
  return findings.filter(finding => finding.reviewDisposition !== "ignored").map(finding => ({ ...finding, unresolved: finding.reviewDisposition === "needs_review" }));
}
