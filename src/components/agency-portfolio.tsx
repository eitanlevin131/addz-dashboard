"use client";

import { useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Search,
} from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/metrics";
import type { MetricSummary } from "@/lib/types";

export type AgencyPortfolioRow = {
  clientId: string;
  clientName: string;
  accountName: string;
  accountCount: number;
  currency: string;
  summary: MetricSummary;
  previousSummary: MetricSummary | null;
  activityCount: number;
  syncStatus: "healthy" | "syncing" | "failed" | "stale" | "never";
  syncError?: string | null;
  lastSyncAt: string | null;
};

type SortKey = "revenue" | "profit" | "roas" | "purchases" | "activity" | "change";

function percentChange(current: number, previous: number | null | undefined) {
  if (previous == null || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function formatRoas(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}x`;
}

function syncPresentation(status: AgencyPortfolioRow["syncStatus"]) {
  return {
    healthy: { label: "מסונכרן", dot: "bg-[#20b9a8]", text: "text-[#087f72]" },
    syncing: { label: "מסתנכרן", dot: "bg-[#2e90fa]", text: "text-[#175cd3]" },
    failed: { label: "נכשל", dot: "bg-[#f04438]", text: "text-[#b42318]" },
    stale: { label: "לא עדכני", dot: "bg-[#f79009]", text: "text-[#b54708]" },
    never: { label: "טרם סונכרן", dot: "bg-[#98a2b3]", text: "text-[#667085]" },
  }[status];
}

function MetricTile({ label, value, comparison, detail }: { label: string; value: string; comparison?: number | null; detail: string }) {
  return (
    <div className="min-w-0 border-b border-l border-[#e4e7ec] bg-white p-4 last:border-l-0 sm:p-5 lg:border-b-0">
      <p className="text-xs font-medium text-[#667085]">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold tabular-nums text-[#111318] sm:text-3xl" dir="ltr">{value}</p>
      <div className="mt-2 flex min-h-5 items-center gap-2 text-[11px]">
        {comparison != null && Number.isFinite(comparison) ? (
          <span className={comparison >= 0 ? "font-bold text-[#087f72]" : "font-bold text-[#b54708]"}>
            {comparison >= 0 ? "+" : ""}{formatPercent(comparison)} מול התקופה הקודמת
          </span>
        ) : (
          <span className="text-[#98a2b3]">{detail}</span>
        )}
      </div>
    </div>
  );
}

export function AgencyPortfolio({
  rows,
  summary,
  previousSummary,
  currency,
  mixedCurrencies,
  onOpenClient,
}: {
  rows: AgencyPortfolioRow[];
  summary: MetricSummary;
  previousSummary: MetricSummary | null;
  currency: string;
  mixedCurrencies: boolean;
  onOpenClient: (clientId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const normalizedQuery = query.trim().toLocaleLowerCase("he-IL");
  const activeClients = rows.filter((row) => row.activityCount > 0).length;
  const syncIssues = rows.filter((row) => row.syncStatus !== "healthy").length;
  const financialValue = (value: number) => mixedCurrencies ? "מטבעות שונים" : formatCurrency(value, currency);
  const sortableValue = (row: AgencyPortfolioRow, key: SortKey) => {
    if (key === "revenue") return row.summary.revenue;
    if (key === "profit") return row.summary.profit;
    if (key === "roas") return row.summary.roas ?? Number.NEGATIVE_INFINITY;
    if (key === "purchases") return row.summary.purchases;
    if (key === "activity") return row.activityCount;
    return percentChange(row.summary.revenue, row.previousSummary?.revenue) ?? Number.NEGATIVE_INFINITY;
  };
  const filteredRows = rows
    .filter((row) => !normalizedQuery || `${row.clientName} ${row.accountName}`.toLocaleLowerCase("he-IL").includes(normalizedQuery))
    .sort((a, b) => (sortableValue(a, sortKey) - sortableValue(b, sortKey)) * (sortDirection === "desc" ? -1 : 1));
  const maxRevenue = Math.max(0, ...filteredRows.map((row) => row.summary.revenue));
  const sort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };
  const revenueChange = percentChange(summary.revenue, previousSummary?.revenue);
  const profitChange = percentChange(summary.profit, previousSummary?.profit);
  const roasChange = percentChange(summary.roas ?? 0, previousSummary?.roas);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#e4e7ec] bg-[#e4e7ec] lg:grid-cols-4">
        <MetricTile label="הכנסות הסוכנות" value={financialValue(summary.revenue)} comparison={mixedCurrencies ? null : revenueChange} detail="כל החשבונות בטווח" />
        <MetricTile label="רווח אחרי עלויות" value={financialValue(summary.profit)} comparison={mixedCurrencies ? null : profitChange} detail="SMS ועלויות קבועות" />
        <MetricTile label="ROAS משוקלל" value={mixedCurrencies ? "—" : formatRoas(summary.roas)} comparison={mixedCurrencies ? null : roasChange} detail="מחושב מסך ההכנסה והעלות" />
        <MetricTile label="לקוחות עם פעילות" value={`${formatNumber(activeClients)} / ${formatNumber(rows.length)}`} detail={syncIssues ? syncIssues === 1 ? "חשבון אחד דורש בדיקת סנכרון" : `${formatNumber(syncIssues)} חשבונות דורשים בדיקת סנכרון` : "כל החשבונות מסונכרנים"} />
      </section>

      <section className="overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
        <header className="flex flex-col gap-3 border-b border-[#e4e7ec] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-base font-bold text-[#111318]">ביצועים לפי לקוח</h2>
            <p className="mt-1 text-xs text-[#667085]">לחיצה על לקוח פותחת את הדוח המלא שלו</p>
          </div>
          <label className="relative block w-full sm:w-64">
            <Search className="pointer-events-none absolute right-3 top-2.5 text-[#98a2b3]" size={16} />
            <span className="sr-only">חיפוש לקוח</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לקוח" className="h-9 w-full rounded-md border border-[#d0d5dd] bg-white pr-9 pl-3 text-sm outline-none focus:border-[#42dfcf]" />
          </label>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-right text-sm">
            <thead className="bg-[#f8fafb] text-[11px] font-medium text-[#667085]">
              <tr>
                <th className="px-5 py-3">לקוח</th>
                {[
                  ["revenue", "הכנסות"],
                  ["change", "שינוי"],
                  ["profit", "רווח"],
                  ["roas", "ROAS"],
                  ["purchases", "רכישות"],
                  ["activity", "פעילות"],
                ].map(([key, label]) => (
                  <th key={key} className="px-3 py-3">
                    <button type="button" onClick={() => sort(key as SortKey)} className={sortKey === key ? "inline-flex items-center gap-1 font-bold text-[#111318]" : "inline-flex items-center gap-1 hover:text-[#111318]"}>
                      {label}<ArrowDownWideNarrow size={12} />
                    </button>
                  </th>
                ))}
                <th className="px-3 py-3">סנכרון</th>
                <th className="w-12 px-3 py-3"><span className="sr-only">פתיחה</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef0f2]">
              {filteredRows.map((row) => {
                const change = percentChange(row.summary.revenue, row.previousSummary?.revenue);
                const sync = syncPresentation(row.syncStatus);
                return (
                  <tr key={row.clientId} className="group transition hover:bg-[#f8fbfa]">
                    <td className="px-5 py-4">
                      <button type="button" onClick={() => onOpenClient(row.clientId)} className="flex min-w-0 items-center gap-3 text-right">
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#ecfdf9] text-[#087f72]"><Building2 size={17} /></span>
                        <span className="min-w-0"><b className="block truncate text-[#111318]">{row.clientName}</b><span className="mt-0.5 block truncate text-[11px] text-[#667085]">{row.accountCount > 1 ? `${row.accountCount} חשבונות Flashy` : row.accountName}</span></span>
                      </button>
                    </td>
                    <td className="px-3 py-4">
                      <b className="tabular-nums text-[#111318]" dir="ltr">{formatCurrency(row.summary.revenue, row.currency)}</b>
                      <div className="mt-2 h-1 w-24 overflow-hidden rounded-full bg-[#eef0f2]"><div className="h-full rounded-full bg-[#20b9a8]" style={{ width: `${maxRevenue > 0 ? Math.max(2, row.summary.revenue / maxRevenue * 100) : 0}%` }} /></div>
                    </td>
                    <td className="px-3 py-4 tabular-nums"><span className={change == null ? "text-[#98a2b3]" : change >= 0 ? "font-bold text-[#087f72]" : "font-bold text-[#b54708]"}>{change == null ? "—" : `${change >= 0 ? "+" : ""}${formatPercent(change)}`}</span></td>
                    <td className="px-3 py-4 font-medium tabular-nums" dir="ltr">{formatCurrency(row.summary.profit, row.currency)}</td>
                    <td className="px-3 py-4 font-medium tabular-nums" dir="ltr">{formatRoas(row.summary.roas)}</td>
                    <td className="px-3 py-4 tabular-nums">{formatNumber(row.summary.purchases)}</td>
                    <td className="px-3 py-4 tabular-nums">{formatNumber(row.activityCount)}</td>
                    <td className="px-3 py-4"><span title={row.syncError || undefined} className={`inline-flex items-center gap-1.5 text-xs font-medium ${sync.text}`}><i className={`size-1.5 rounded-full ${sync.dot}`} />{sync.label}</span>{row.lastSyncAt && <span className="mt-1 block text-[10px] text-[#98a2b3]">{new Date(row.lastSyncAt).toLocaleDateString("he-IL")}</span>}</td>
                    <td className="px-3 py-4"><button type="button" onClick={() => onOpenClient(row.clientId)} aria-label={`פתח את ${row.clientName}`} className="grid size-8 place-items-center rounded-md text-[#667085] transition group-hover:bg-white group-hover:text-[#111318]"><ArrowLeft size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filteredRows.length && <div className="grid min-h-40 place-content-center gap-2 text-center text-sm text-[#667085]"><CheckCircle2 className="mx-auto text-[#98a2b3]" size={22} /><span>לא נמצאו לקוחות</span></div>}
      </section>
    </div>
  );
}
