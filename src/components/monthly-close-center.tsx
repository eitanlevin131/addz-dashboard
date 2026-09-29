"use client";

import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Database,
  FileText,
  Plus,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MonthlyCloseStage } from "@/lib/monthly-close";

type CloseRow = {
  accountId: string;
  clientId: string;
  accountName: string;
  clientName: string;
  syncStatus: "healthy" | "syncing" | "failed" | "stale" | "never";
  syncError: string | null;
  lastSyncAt: string | null;
  snapshotDate: string | null;
  snapshotCapturedAt: string | null;
  historicalChangedDays: number;
  reports: { email: number; sms: number; automations: number };
  summary: {
    id: string;
    status: MonthlyCloseStage;
    version: number;
    approvedAt: string | null;
    sentAt: string | null;
    updatedAt: string;
    latestDelivery: {
      recipients: string[];
      status: string;
      errorMessage: string | null;
      sentAt: string | null;
      createdAt: string;
    } | null;
  } | null;
  missingInputs: string[];
  costs: { smsCreditPriceUsd: number; monthlySubscriptionCostUsd: number; agencyRetainerCostIls: number };
  dataIssues: string[];
  costIssues: string[];
  needsAttention: boolean;
};

const statusMeta: Record<MonthlyCloseStage, { label: string; className: string }> = {
  not_started: { label: "טרם הופק", className: "bg-[#f2f4f7] text-[#475467]" },
  draft: { label: "טיוטה", className: "bg-[#fff7ed] text-[#b45309]" },
  approved: { label: "מוכן לשליחה", className: "bg-[#fff9d8] text-[#776500]" },
  sent: { label: "נשלח", className: "bg-[#ecfdf9] text-[#087f72]" },
};

const syncMeta = {
  healthy: { label: "תקין", className: "text-[#087f72]" },
  syncing: { label: "בתהליך", className: "text-[#175cd3]" },
  failed: { label: "נכשל", className: "text-[#b42318]" },
  stale: { label: "לא עדכני", className: "text-[#b54708]" },
  never: { label: "לא סונכרן", className: "text-[#667085]" },
} as const;

function priorMonth() {
  const value = new Date();
  value.setDate(1);
  value.setMonth(value.getMonth() - 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

function sourceCount(row: CloseRow) {
  return row.reports.email + row.reports.sms + row.reports.automations;
}

export function MonthlyCloseCenter({ onOpenSummary }: { onOpenSummary: (clientId: string, summaryId?: string) => void }) {
  const [month, setMonth] = useState(priorMonth);
  const [mode, setMode] = useState<"close" | "qa">("close");
  const [filter, setFilter] = useState<"all" | "attention" | "ready" | "sent">("all");
  const [rows, setRows] = useState<CloseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const loadRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/monthly-close?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת מרכז סגירת החודש נכשלה.");
      if (requestId !== loadRequestId.current) return;
      setRows(payload.data.rows as CloseRow[]);
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "טעינת מרכז סגירת החודש נכשלה.");
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const metrics = useMemo(() => ({
    total: rows.length,
    sent: rows.filter((row) => row.summary?.status === "sent").length,
    ready: rows.filter((row) => row.summary?.status === "approved").length,
    attention: rows.filter((row) => row.needsAttention).length,
  }), [rows]);

  const visibleRows = useMemo(() => rows.filter((row) => {
    if (filter === "attention") return row.needsAttention;
    if (filter === "ready") return row.summary?.status === "approved";
    if (filter === "sent") return row.summary?.status === "sent";
    return true;
  }), [filter, rows]);

  async function createDraft(row: CloseRow) {
    setBusyAccountId(row.accountId);
    setMessage("");
    try {
      const response = await fetch("/api/monthly-summaries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: row.accountId, month }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "יצירת הטיוטה נכשלה.");
      await load();
      setMessageTone("success");
      setMessage(`הטיוטה של ${row.clientName} נוצרה. אפשר לפתוח אותה ולהשלים את הנתונים החסרים.`);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "יצירת הטיוטה נכשלה.");
    } finally {
      setBusyAccountId(null);
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <section className="border-b border-[#e4e7ec] pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <p className="text-sm text-[#667085]">סטטוס אמיתי לכל חשבון, לפני אישור ושליחה ללקוח.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-[#667085]">
              <span className="mb-1 block">חודש</span>
              <input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setMessage(""); }} className="h-9 rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#111318]" />
            </label>
            <button type="button" onClick={() => { setMessage(""); void load(); }} disabled={loading} title="רענון" className="grid size-9 place-items-center rounded-md border border-[#d0d5dd] bg-white text-[#475467] hover:bg-[#f8fafb] disabled:opacity-50">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </section>

      <section className="grid overflow-hidden rounded-lg border border-[#e4e7ec] bg-[#e4e7ec] sm:grid-cols-4">
        {[
          { label: "חשבונות", value: metrics.total, icon: Database },
          { label: "נשלחו", value: metrics.sent, icon: CheckCircle2 },
          { label: "מוכנים לשליחה", value: metrics.ready, icon: FileText },
          { label: "דורשים בדיקה", value: metrics.attention, icon: CircleAlert },
        ].map((item) => <div key={item.label} className="flex items-center justify-between bg-white px-4 py-3">
          <div><p className="text-[11px] text-[#667085]">{item.label}</p><p className="mt-1 text-2xl font-bold tabular-nums text-[#111318]">{item.value}</p></div>
          <item.icon size={17} className="text-[#667085]" />
        </div>)}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-md bg-[#eef1f4] p-1" role="group" aria-label="תצוגת מרכז תפעול">
          <button type="button" onClick={() => setMode("close")} aria-pressed={mode === "close"} className={`h-8 rounded px-3 text-xs ${mode === "close" ? "bg-white font-bold text-[#111318] shadow-sm" : "text-[#667085]"}`}>סגירת חודש</button>
          <button type="button" onClick={() => setMode("qa")} aria-pressed={mode === "qa"} className={`h-8 rounded px-3 text-xs ${mode === "qa" ? "bg-white font-bold text-[#111318] shadow-sm" : "text-[#667085]"}`}>איכות נתונים</button>
        </div>
        <div className="flex gap-1 overflow-x-auto" role="group" aria-label="סינון חשבונות">
          {([['all', 'הכל'], ['attention', 'דורש טיפול'], ['ready', 'מוכן'], ['sent', 'נשלח']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`h-8 shrink-0 rounded-md px-3 text-xs ${filter === value ? "bg-[#111318] text-white" : "border border-[#d0d5dd] bg-white text-[#475467]"}`}>{label}</button>)}
        </div>
      </div>

      {message && <p role={messageTone === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${messageTone === "success" ? "border-[#a6f4e8] bg-[#ecfdf9] text-[#087f72]" : "border-[#fecdca] bg-[#fef3f2] text-[#b42318]"}`}>{message}</p>}

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <div className="hidden grid-cols-[minmax(180px,1.4fr)_110px_150px_minmax(180px,1fr)_120px] gap-3 border-b border-[#e4e7ec] bg-[#f8fafb] px-4 py-2.5 text-[11px] font-bold text-[#667085] lg:grid">
          <span>לקוח</span>
          <span>{mode === "close" ? "סטטוס" : "סנכרון"}</span>
          <span>{mode === "close" ? "מקורות" : "Snapshot"}</span>
          <span>{mode === "close" ? "המשך טיפול" : "בדיקות"}</span>
          <span aria-hidden="true" />
        </div>
        <div className="divide-y divide-[#eef1f4]">
          {loading && rows.length === 0 ? <div className="px-4 py-12 text-center text-sm text-[#667085]">טוען חשבונות...</div> : visibleRows.map((row) => {
            const status = statusMeta[row.summary?.status ?? "not_started"];
            const sync = syncMeta[row.syncStatus];
            const closeIssues = [...row.missingInputs.map((item) => `חסר ${item}`), ...row.dataIssues];
            const qaIssues = [...row.dataIssues, ...(row.costIssues.length ? [`חסרות עלויות: ${row.costIssues.join(", ")}`] : [])];
            const issues = mode === "close" ? closeIssues : qaIssues;
            const delivery = row.summary?.latestDelivery;
            const workflowDetail = row.summary?.status === "sent" && delivery
              ? delivery.status === "sent"
                ? `נשלח ${formatDate(delivery.sentAt)} אל ${delivery.recipients.join(", ")}`
                : `ניסיון שליחה נכשל ${formatDate(delivery.createdAt)}${delivery.errorMessage ? ` · ${delivery.errorMessage}` : ""}`
              : row.summary?.status === "approved"
                ? `אושר ${formatDate(row.summary.approvedAt)} · ממתין לשליחה`
                : issues.length
                  ? issues.join(" · ")
                  : "כל שדות החובה הושלמו";
            return <article key={row.accountId} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(180px,1.4fr)_110px_150px_minmax(180px,1fr)_120px] lg:items-center">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-[#111318]">{row.clientName}</h3>
                <p className="mt-0.5 truncate text-xs text-[#667085]">{row.accountName}</p>
              </div>
              {mode === "close" ? <div><span className={`inline-block rounded-sm px-2 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>{row.summary && <p className="mt-1 text-[10px] text-[#667085]">גרסה {row.summary.version}</p>}</div> : <div><p className={`text-xs font-bold ${sync.className}`}>{sync.label}</p><p className="mt-1 text-[10px] text-[#667085]">{formatDate(row.lastSyncAt)}</p></div>}
              {mode === "close" ? <div className="text-xs text-[#475467]"><p>{sourceCount(row)} מקורות נתונים</p><p className="mt-1 text-[10px] text-[#667085]">{row.reports.email} מייל · {row.reports.sms} SMS · {row.reports.automations} אוטומציות</p></div> : <div className="text-xs text-[#475467]"><p>{row.snapshotDate ? "קיים" : "חסר"}</p><p className="mt-1 text-[10px] text-[#667085]">{row.historicalChangedDays ? `${row.historicalChangedDays} ימים השתנו` : row.snapshotCapturedAt ? formatDate(row.snapshotCapturedAt) : "—"}</p></div>}
              <div className="min-w-0 text-xs leading-5 text-[#667085]" title={mode === "close" ? workflowDetail : undefined}>{mode === "close" ? workflowDetail : issues.length ? issues.join(" · ") : "הנתונים והעלויות תקינים"}</div>
              {mode === "close" && !row.summary ? (
                <button type="button" onClick={() => void createDraft(row)} disabled={busyAccountId !== null} className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-[#080123] px-3 text-xs font-bold text-white hover:bg-[#21174c] disabled:opacity-50">
                  {busyAccountId === row.accountId ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} צור טיוטה
                </button>
              ) : (
                <button type="button" onClick={() => onOpenSummary(row.clientId, row.summary?.id)} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[#d0d5dd] bg-white px-3 text-xs font-bold text-[#344054] hover:bg-[#f8fafb]">
                  {mode === "qa" ? "פתח חשבון" : row.summary?.status === "draft" ? "פתח טיוטה" : row.summary?.status === "approved" ? "פתח ושלח" : "פתח סיכום"} <ArrowLeft size={14} />
                </button>
              )}
            </article>;
          })}
          {!loading && visibleRows.length === 0 && <div className="px-4 py-12 text-center text-sm text-[#667085]">אין חשבונות בסינון הזה.</div>}
        </div>
      </section>

      {mode === "qa" && <p className="flex items-center gap-2 text-xs text-[#667085]"><Settings2 size={14} /> העלויות מוצגות כחוסרות רק כאשר הערך בחשבון הוא אפס; המסך אינו משנה נתונים.</p>}
    </div>
  );
}
