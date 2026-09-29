"use client";

import {
  Archive,
  ArrowDownLeft,
  ArrowUpLeft,
  BarChart3,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  Clipboard,
  Copy,
  Donut,
  FileText,
  LayoutList,
  Mail,
  RefreshCw,
  Send,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { monthLabel, type MonthlySummaryLeader, type MonthlySummaryManualInput, type MonthlySummarySnapshot } from "@/lib/monthly-summary";
import type { Client, FlashyAccount } from "@/lib/types";

type SummaryRecord = {
  id: string;
  clientId: string;
  accountId: string;
  month: string;
  version: number;
  status: "draft" | "approved" | "sent";
  snapshot: MonthlySummarySnapshot;
  manualInputs: MonthlySummaryManualInput;
  whatsappText: string;
  emailSubject: string;
  internalNote: string;
  shareUrl: string;
  approvedAt: string | null;
  sentAt: string | null;
  updatedAt: string;
};

function priorMonth() {
  const value = new Date();
  value.setDate(1);
  value.setMonth(value.getMonth() - 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function percent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("he-IL", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(value);
}

function statusPresentation(status: SummaryRecord["status"]) {
  return {
    draft: { label: "טיוטה", className: "bg-[#f2f4f7] text-[#475467]" },
    approved: { label: "מאושר", className: "bg-[#fff9d8] text-[#776500]" },
    sent: { label: "נשלח", className: "bg-[#ecfdf9] text-[#087f72]" },
  }[status];
}

type SummarySegment = {
  label: string;
  shortLabel: string;
  revenue: number;
  purchases: number;
  conversionRate: number | null;
  color: string;
};

function SummaryRevenueVisualization({ segments, currency }: { segments: SummarySegment[]; currency: string }) {
  const [view, setView] = useState<"share" | "compare">("share");
  const total = segments.reduce((sum, segment) => sum + segment.revenue, 0);
  const chartData = segments.map((segment) => ({ ...segment, share: total > 0 ? segment.revenue / total : 0 }));

  return (
    <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] px-4 py-4 md:px-5">
        <div>
          <h3 className="text-sm font-bold text-[#111318]">פירוק ההכנסות</h3>
          <p className="mt-1 text-xs text-[#667085]">בחרו את התצוגה שהכי נוח לקרוא</p>
        </div>
        <div className="flex rounded-md bg-[#f2f4f7] p-1" role="group" aria-label="סוג תרשים הכנסות">
          {([
            ["share", "חלוקה", Donut],
            ["compare", "השוואה", BarChart3],
          ] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs transition ${view === value ? "bg-white font-bold text-[#111318] shadow-sm" : "text-[#667085]"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </header>
      <div className="grid min-w-0 items-center gap-4 p-4 md:p-5 lg:grid-cols-[minmax(250px,0.85fr)_minmax(280px,1.15fr)]">
        <div className="relative mx-auto h-[230px] w-full max-w-[300px]" dir="ltr" role="img" aria-label="פירוק הכנסות לפי מקור">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 300, height: 230 }}>
            {view === "share" ? (
              <PieChart>
                <Pie data={chartData} dataKey="revenue" nameKey="label" innerRadius={68} outerRadius={98} startAngle={90} endAngle={-270} paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {chartData.map((segment) => <Cell key={segment.label} fill={segment.color} />)}
                </Pie>
                <Tooltip formatter={(value) => money(Number(value), currency)} contentStyle={{ direction: "rtl", borderRadius: 8, borderColor: "#e4e7ec", fontSize: 12 }} />
              </PieChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef1f4" />
                <XAxis dataKey="shortLabel" axisLine={false} tickLine={false} tick={{ fill: "#667085", fontSize: 11 }} />
                <YAxis width={44} axisLine={false} tickLine={false} tickFormatter={(value) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value))} tick={{ fill: "#667085", fontSize: 10 }} />
                <Tooltip formatter={(value) => money(Number(value), currency)} contentStyle={{ direction: "rtl", borderRadius: 8, borderColor: "#e4e7ec", fontSize: 12 }} />
                <Bar dataKey="revenue" name="הכנסה" radius={[4, 4, 0, 0]} isAnimationActive={false}>{chartData.map((segment) => <Cell key={segment.label} fill={segment.color} />)}</Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
          {view === "share" && <div className="pointer-events-none absolute inset-0 grid place-content-center text-center" dir="rtl"><span className="text-xs text-[#667085]">סה״כ מיוחס</span><strong className="mt-1 text-xl tabular-nums text-[#080123]">{money(total, currency)}</strong></div>}
        </div>
        <div className="divide-y divide-[#eef1f4]">
          {chartData.map((segment) => <div key={segment.label} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-bold"><i className="h-3 w-1 rounded-sm" style={{ backgroundColor: segment.color }} />{segment.label}</span>
              <span className="text-base font-bold tabular-nums">{money(segment.revenue, currency)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 pr-3 text-xs text-[#667085]">
              <span>{number(segment.purchases)} מכירות · המרה {percent(segment.conversionRate)}</span>
              <span className="tabular-nums">{percent(segment.share)}</span>
            </div>
          </div>)}
        </div>
      </div>
    </section>
  );
}

function SummaryLeaderboard({ title, items, currency, color }: { title: string; items: MonthlySummaryLeader[]; currency: string; color: string }) {
  const max = Math.max(...items.map((item) => item.revenue), 0);
  return (
    <section className="rounded-lg border border-[#e4e7ec] bg-white p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{title}</h3><span className="text-[11px] text-[#667085]">לפי הכנסה</span></div>
      <ol className="space-y-4">
        {items.map((item, index) => <li key={item.id}>
          <div className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded bg-[#f2f4f7] text-xs font-bold">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3"><span className="line-clamp-2 text-sm font-medium leading-5" title={item.name}>{item.name}</span><strong className="shrink-0 text-sm tabular-nums">{money(item.revenue, currency)}</strong></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-[#eef1f4]"><div className="h-full rounded-sm" style={{ width: `${max > 0 ? item.revenue / max * 100 : 0}%`, backgroundColor: color }} /></div>
              <div className="mt-1 flex gap-3 text-[11px] text-[#667085]"><span>{number(item.purchases)} מכירות</span><span>המרה {percent(item.conversionRate)}</span></div>
            </div>
          </div>
        </li>)}
      </ol>
    </section>
  );
}

export function MonthlySummaryDashboard({
  client,
  account,
  isStaff,
  initialSummaryId,
}: {
  client: Client;
  account: FlashyAccount;
  isStaff: boolean;
  initialSummaryId?: string;
}) {
  const [month, setMonth] = useState(priorMonth);
  const [siteRevenue, setSiteRevenue] = useState("");
  const [popupSignups, setPopupSignups] = useState("");
  const [popupConversionRate, setPopupConversionRate] = useState("");
  const [note, setNote] = useState("");
  const [summaries, setSummaries] = useState<SummaryRecord[]>([]);
  const [selected, setSelected] = useState<SummaryRecord | null>(null);
  const [tab, setTab] = useState<"report" | "whatsapp" | "email">("report");
  const [whatsappText, setWhatsappText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [recipientText, setRecipientText] = useState("");
  const [suggestedRecipients, setSuggestedRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectSummary = useCallback((summary: SummaryRecord) => {
    setSelected(summary);
    setMonth(summary.month);
    setSiteRevenue(summary.manualInputs.siteRevenue?.toString() ?? "");
    setPopupSignups(summary.manualInputs.popupSignups?.toString() ?? "");
    setPopupConversionRate(summary.manualInputs.popupConversionRate === null
      ? ""
      : String(summary.manualInputs.popupConversionRate * 100));
    setNote(summary.internalNote);
    setWhatsappText(summary.whatsappText);
    setEmailSubject(summary.emailSubject);
  }, []);

  const loadSummaries = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/monthly-summaries?accountId=${encodeURIComponent(account.id)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת הסיכומים נכשלה.");
      const rows = payload.data as SummaryRecord[];
      setSummaries(rows);
      setSuggestedRecipients(payload.suggestedRecipients ?? []);
      setRecipientText((current) => current || (payload.suggestedRecipients ?? []).join(", "));
      if (!initialSummaryId && rows[0]) selectSummary(rows[0]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "טעינת הסיכומים נכשלה.");
    } finally {
      setBusy(false);
    }
  }, [account.id, initialSummaryId, selectSummary]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadSummaries(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSummaries]);

  useEffect(() => {
    if (!initialSummaryId) return;
    let cancelled = false;
    void fetch(`/api/monthly-summaries/${initialSummaryId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "הסיכום לא נמצא.");
        if (!cancelled) selectSummary(payload.data as SummaryRecord);
      })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "הסיכום לא נמצא."); });
    return () => { cancelled = true; };
  }, [initialSummaryId, selectSummary]);

  const channels = useMemo(() => selected ? [
    { label: "קמפיינים במייל", shortLabel: "מייל", revenue: selected.snapshot.emailCampaigns.revenue, purchases: selected.snapshot.emailCampaigns.purchases, conversionRate: selected.snapshot.emailCampaigns.conversionRate, color: "#24282f" },
    { label: "קמפיינים ב־SMS", shortLabel: "SMS", revenue: selected.snapshot.smsCampaigns.revenue, purchases: selected.snapshot.smsCampaigns.purchases, conversionRate: selected.snapshot.smsCampaigns.conversionRate, color: "#20b9a8" },
    { label: "אוטומציות", shortLabel: "אוטומציות", revenue: selected.snapshot.automations.revenue, purchases: selected.snapshot.automations.purchases, conversionRate: selected.snapshot.automations.conversionRate, color: "#6389d9" },
  ] : [], [selected]);

  const approvalChecks = useMemo(() => {
    if (!selected) return [];
    const snapshot = selected.snapshot;
    return [
      {
        label: "נתוני Flashy עדכניים",
        ready: snapshot.completeness.warnings.length === 0,
        detail: snapshot.completeness.warnings.join(" ") || `${snapshot.source.emailReports + snapshot.source.smsReports + snapshot.source.automationReports} דוחות נכללו`,
      },
      {
        label: "מחזור האתר",
        ready: snapshot.totals.siteRevenue !== null,
        detail: snapshot.totals.siteRevenue === null ? "נדרש כדי לחשב את חלק Flashy מהמחזור" : money(snapshot.totals.siteRevenue, snapshot.currency),
      },
      {
        label: "נתוני Popup",
        ready: snapshot.popup.signups !== null && snapshot.popup.conversionRate !== null,
        detail: snapshot.popup.signups === null || snapshot.popup.conversionRate === null
          ? "נדרשים מספר נרשמים ויחס המרה"
          : `${number(snapshot.popup.signups)} נרשמים · ${percent(snapshot.popup.conversionRate)} המרה`,
      },
    ];
  }, [selected]);

  async function generate() {
    setBusy(true);
    setMessage("מחשב ומכין את הסיכום...");
    try {
      const response = await fetch("/api/monthly-summaries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          month,
          siteRevenue: siteRevenue || null,
          popupSignups: popupSignups || null,
          popupConversionRate: popupConversionRate ? Number(popupConversionRate) / 100 : null,
          note,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "יצירת הסיכום נכשלה.");
      const summary = payload.data as SummaryRecord;
      selectSummary(summary);
      setSummaries((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
      setMessage("הסיכום נוצר כטיוטה. אפשר לבדוק, לערוך ולאשר אותו.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "יצירת הסיכום נכשלה.");
    } finally {
      setBusy(false);
    }
  }

  async function patchSummary(action: "save" | "approve") {
    if (!selected) return;
    setBusy(true);
    setMessage(action === "approve" ? "מאשר ונועל את הסיכום..." : "שומר טיוטה...");
    try {
      const response = await fetch(`/api/monthly-summaries/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, whatsappText, emailSubject, internalNote: note }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שמירת הסיכום נכשלה.");
      const saved = payload.data as SummaryRecord;
      selectSummary(saved);
      setSummaries((current) => current.map((item) => item.id === saved.id ? saved : item));
      setMessage(action === "approve" ? "הסיכום אושר וזמין עכשיו ללקוח." : "הטיוטה נשמרה.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "שמירת הסיכום נכשלה.");
    } finally {
      setBusy(false);
    }
  }

  async function copyWhatsapp(withLink: boolean) {
    if (!selected) return;
    const text = withLink
      ? whatsappText
      : whatsappText.replace(/\n*לצפייה בסיכום המלא והאינטראקטיבי:\nhttps?:\/\/\S+\s*$/u, "").trim();
    await navigator.clipboard.writeText(text);
    setMessage(withLink ? "ההודעה והקישור הועתקו ל־WhatsApp." : "ההודעה הועתקה בלי קישור.");
  }

  async function rewriteWhatsapp() {
    if (!selected) return;
    setBusy(true);
    setMessage("משפר את הניסוח בלי לשנות את המספרים...");
    try {
      const response = await fetch(`/api/monthly-summaries/${selected.id}/rewrite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: whatsappText }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שיפור הנוסח נכשל.");
      setWhatsappText(payload.data.text);
      setMessage("הניסוח שופר. המספרים נבדקו ונשארו זהים; שמור את הטיוטה כדי לאשר אותו.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "שיפור הנוסח נכשל.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail() {
    if (!selected) return;
    const recipients = recipientText.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
    setBusy(true);
    setMessage("שולח את הסיכום...");
    try {
      const response = await fetch(`/api/monthly-summaries/${selected.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipients, note }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שליחת המייל נכשלה.");
      const updated = { ...selected, status: "sent" as const, sentAt: payload.data.sentAt };
      selectSummary(updated);
      setSummaries((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage(`הסיכום נשלח בהצלחה ל־${recipients.length} כתובות.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "שליחת המייל נכשלה.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      {isStaff && (
        <section className="rounded-lg border border-[#e4e7ec] bg-white p-4 md:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-[#111318]"><FileText size={17} /> יצירת סיכום חודשי</div>
              <p className="mt-1 text-xs text-[#667085]">המספרים מגיעים מדוחות Flashy. מחזור אתר ו־Popup נשארים להשלמה ידנית.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[150px_170px_150px_150px_auto]">
              <label className="text-xs font-medium text-[#667085]">חודש
                <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#111318]" />
              </label>
              <label className="text-xs font-medium text-[#667085]">מחזור האתר
                <input type="number" min="0" value={siteRevenue} onChange={(event) => setSiteRevenue(event.target.value)} placeholder="₪" className="mt-1 h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-medium text-[#667085]">נרשמי Popup
                <input type="number" min="0" value={popupSignups} onChange={(event) => setPopupSignups(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-medium text-[#667085]">המרת Popup
                <div className="relative mt-1"><input type="number" min="0" max="100" step="0.01" value={popupConversionRate} onChange={(event) => setPopupConversionRate(event.target.value)} className="h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 pl-8 text-sm" /><span className="absolute left-3 top-2.5 text-sm text-[#667085]">%</span></div>
              </label>
              <button type="button" onClick={generate} disabled={busy || !month} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#080123] px-4 text-sm font-bold text-white transition hover:bg-[#21174c] disabled:opacity-50">
                <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> הפק סיכום
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-[#e4e7ec] bg-white p-3">
          <div className="flex items-center gap-2 px-1 pb-3 text-sm font-bold"><Archive size={16} /> ארכיון</div>
          <div className="space-y-1">
            {summaries.map((summary) => {
              const status = statusPresentation(summary.status);
              return <button key={summary.id} type="button" onClick={() => selectSummary(summary)} className={`w-full rounded-md border px-3 py-2.5 text-right transition ${selected?.id === summary.id ? "border-[#080123] bg-[#f7f7fa]" : "border-transparent hover:bg-[#f7f8fa]"}`}>
                <span className="block text-sm font-bold">{monthLabel(summary.month)}</span>
                <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#667085]"><span>גרסה {summary.version}</span><span className={`rounded-sm px-1.5 py-0.5 ${status.className}`}>{status.label}</span></span>
              </button>;
            })}
            {!busy && summaries.length === 0 && <p className="px-2 py-5 text-center text-xs leading-5 text-[#667085]">עדיין אין סיכומים שמורים לחשבון.</p>}
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
          {!selected ? (
            <div className="grid min-h-[420px] place-items-center p-8 text-center text-sm text-[#667085]">
              {busy ? "טוען סיכומים..." : isStaff ? "בחר חודש והפק את הסיכום הראשון." : "עדיין אין סיכום חודשי מאושר לצפייה."}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 border-b border-[#e4e7ec] px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-[#111318]">{monthLabel(selected.month)}</h2><span className={`rounded-sm px-2 py-1 text-xs ${statusPresentation(selected.status).className}`}>{statusPresentation(selected.status).label}</span></div>
                  <p className="mt-1 text-xs text-[#667085]">{client.name} · גרסה {selected.version} · נוצר מנתוני הסנכרון של {new Date(selected.snapshot.lastSyncAt).toLocaleDateString("he-IL")}</p>
                </div>
                <div className="flex gap-1 rounded-md bg-[#f2f4f7] p-1">
                  {([['report', 'דוח', BarChart3], ['whatsapp', 'WhatsApp', Clipboard], ['email', 'מייל', Mail]] as const).map(([key, label, Icon]) => (
                    <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium ${tab === key ? "bg-white text-[#111318] shadow-sm" : "text-[#667085]"}`}><Icon size={14} />{label}</button>
                  ))}
                </div>
              </div>

              {tab === "report" && <div className="bg-[#f8faf9] p-4 md:p-6">
                {(selected.snapshot.completeness.missing.length > 0 || selected.snapshot.completeness.warnings.length > 0) && isStaff && <div className="mb-5 rounded-md border border-[#f1d786] bg-[#fff9d8] px-4 py-3 text-xs leading-5 text-[#6b5a00]">{[...selected.snapshot.completeness.warnings, ...selected.snapshot.completeness.missing.map((item) => `חסר: ${item}`)].join(" · ")}</div>}
                {isStaff && selected.status === "draft" && <section className="mb-5 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white" aria-label="בדיקות לפני אישור">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1f4] px-4 py-3">
                    <div><h3 className="text-sm font-bold">מוכנות לאישור</h3><p className="mt-0.5 text-[11px] text-[#667085]">הסיכום ייפתח ללקוח רק אחרי שכל הבדיקות הושלמו</p></div>
                    <span className={`text-xs font-bold ${selected.snapshot.completeness.ready ? "text-[#087f72]" : "text-[#b45309]"}`}>{approvalChecks.filter((item) => item.ready).length}/{approvalChecks.length} הושלמו</span>
                  </header>
                  <div className="grid divide-y divide-[#eef1f4] sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-y-0">
                    {approvalChecks.map((item) => <div key={item.label} className="flex gap-2.5 p-4">
                      {item.ready ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-[#087f72]" /> : <CircleAlert size={18} className="mt-0.5 shrink-0 text-[#b45309]" />}
                      <div><p className="text-xs font-bold text-[#344054]">{item.label}</p><p className="mt-1 text-[11px] leading-4 text-[#667085]">{item.detail}</p></div>
                    </div>)}
                  </div>
                </section>}
                <section className="overflow-hidden rounded-lg bg-[#080123] text-white">
                  <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)] md:p-7">
                    <div>
                      <p className="text-xs font-medium text-white/60">הכנסה שיוחסה לפעילות Flashy</p>
                      <strong className="mt-2 block text-4xl font-bold tabular-nums sm:text-5xl">{money(selected.snapshot.totals.attributedRevenue, selected.snapshot.currency)}</strong>
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                        {selected.snapshot.previousMonth?.revenueChange !== null && selected.snapshot.previousMonth && <span className={`inline-flex items-center gap-1 rounded px-2 py-1 font-bold ${selected.snapshot.previousMonth.revenueChange >= 0 ? "bg-[#42dfcf] text-[#080123]" : "bg-[#ffe4e0] text-[#b42318]"}`}>
                          {selected.snapshot.previousMonth.revenueChange >= 0 ? <ArrowUpLeft size={14} /> : <ArrowDownLeft size={14} />}{percent(Math.abs(selected.snapshot.previousMonth.revenueChange))}
                        </span>}
                        {selected.snapshot.previousMonth && <span className="text-white/60">לעומת {monthLabel(selected.snapshot.previousMonth.month)}</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-white/15">
                      <div className="bg-white/8 p-3"><span className="text-[11px] text-white/60">מכירות</span><strong className="mt-1 block text-xl tabular-nums">{number(selected.snapshot.totals.purchases)}</strong></div>
                      <div className="bg-white/8 p-3"><span className="text-[11px] text-white/60">מהמחזור באתר</span><strong className="mt-1 block text-xl tabular-nums">{percent(selected.snapshot.totals.attributedShare)}</strong></div>
                      <div className="bg-white/8 p-3"><span className="text-[11px] text-white/60">קמפיינים</span><strong className="mt-1 block text-lg tabular-nums">{money(selected.snapshot.totals.campaignRevenue, selected.snapshot.currency)}</strong></div>
                      <div className="bg-white/8 p-3"><span className="text-[11px] text-white/60">אוטומציות</span><strong className="mt-1 block text-lg tabular-nums">{money(selected.snapshot.totals.automationRevenue, selected.snapshot.currency)}</strong></div>
                    </div>
                  </div>
                </section>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {channels.map((channel) => <div key={channel.label} className="rounded-lg border border-[#e4e7ec] bg-white p-4">
                    <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-bold text-[#475467]"><i className="size-2.5 rounded-sm" style={{ backgroundColor: channel.color }} />{channel.label}</span><span className="text-[11px] tabular-nums text-[#667085]">{percent(selected.snapshot.totals.attributedRevenue > 0 ? channel.revenue / selected.snapshot.totals.attributedRevenue : null)}</span></div>
                    <strong className="mt-3 block text-2xl tabular-nums text-[#080123]">{money(channel.revenue, selected.snapshot.currency)}</strong>
                    <div className="mt-2 flex items-center gap-3 text-xs text-[#667085]"><span>{number(channel.purchases)} מכירות</span><span>המרה {percent(channel.conversionRate)}</span></div>
                  </div>)}
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
                  <SummaryRevenueVisualization segments={channels} currency={selected.snapshot.currency} />
                  <section className="rounded-lg border border-[#e4e7ec] bg-white p-4 md:p-5">
                    <h3 className="text-sm font-bold">תמונת פעילות</h3>
                    <p className="mt-1 text-xs text-[#667085]">היקף הפעילות שנכלל בסיכום</p>
                    <dl className="mt-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-[#eef1f4] pb-4"><dt className="flex items-center gap-2 text-sm text-[#667085]"><ShoppingBag size={16} /> מכירות</dt><dd className="text-xl font-bold tabular-nums">{number(selected.snapshot.totals.purchases)}</dd></div>
                      <div className="flex items-center justify-between border-b border-[#eef1f4] pb-4"><dt className="flex items-center gap-2 text-sm text-[#667085]"><LayoutList size={16} /> דוחות שנכללו</dt><dd className="text-xl font-bold tabular-nums">{number(selected.snapshot.source.emailReports + selected.snapshot.source.smsReports + selected.snapshot.source.automationReports)}</dd></div>
                      <div className="rounded-md bg-[#ecfdf9] p-3"><div className="flex items-center justify-between"><dt className="text-xs text-[#087f72]">נרשמי Popup</dt><dd className="text-lg font-bold tabular-nums text-[#065f55]">{selected.snapshot.popup.signups === null ? "—" : number(selected.snapshot.popup.signups)}</dd></div><div className="mt-2 flex items-center justify-between"><dt className="text-xs text-[#087f72]">יחס המרה</dt><dd className="text-sm font-bold tabular-nums text-[#065f55]">{percent(selected.snapshot.popup.conversionRate)}</dd></div></div>
                    </dl>
                  </section>
                </div>
                {selected.snapshot.listHealth && selected.snapshot.listHealth.total.recipients > 0 && <section className="mt-4 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] px-4 py-3 md:px-5">
                    <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-md bg-[#ecfdf9] text-[#087f72]"><Users size={16} /></span><div><h3 className="text-sm font-bold">בריאות הרשימה</h3><p className="mt-0.5 text-[11px] text-[#667085]">הסרות מקמפיינים · שיעור משוקלל לפי נמענים</p></div></div>
                    {selected.snapshot.listHealth.rateChange !== null && <span className={`rounded-sm px-2 py-1 text-[11px] font-bold ${selected.snapshot.listHealth.rateChange <= 0 ? "bg-[#ecfdf9] text-[#087f72]" : "bg-[#fff4e8] text-[#b45309]"}`}>{selected.snapshot.listHealth.rateChange > 0 ? "+" : ""}{percent(selected.snapshot.listHealth.rateChange)} נק׳ לעומת החודש הקודם</span>}
                  </header>
                  <div className="grid divide-y divide-[#eef1f4] sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-y-0">
                    {([
                      ["סה״כ", selected.snapshot.listHealth.total],
                      ["אימייל", selected.snapshot.listHealth.email],
                      ["SMS", selected.snapshot.listHealth.sms],
                    ] as const).map(([label, health]) => <div key={label} className="p-4 md:px-5"><div className="flex items-baseline justify-between gap-3"><span className="text-xs font-bold text-[#475467]">{label}</span><strong className="text-xl tabular-nums text-[#080123]">{percent(health.unsubscribeRate)}</strong></div><p className="mt-1 text-[11px] text-[#667085]">{number(health.unsubscribed)} הסרות מתוך {number(health.recipients)} נמענים</p></div>)}
                  </div>
                </section>}
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <SummaryLeaderboard title="מיילים מובילים" items={selected.snapshot.leaders.emailCampaigns} currency={selected.snapshot.currency} color="#24282f" />
                  <SummaryLeaderboard title="SMS מובילים" items={selected.snapshot.leaders.smsCampaigns} currency={selected.snapshot.currency} color="#20b9a8" />
                  <SummaryLeaderboard title="אוטומציות מובילות" items={selected.snapshot.leaders.automations} currency={selected.snapshot.currency} color="#6389d9" />
                </div>
                <p className="mt-7 border-t border-[#e4e7ec] pt-4 text-[11px] leading-5 text-[#667085]">{selected.snapshot.source.attributionNote}</p>
              </div>}

              {tab === "whatsapp" && <div className="p-4 md:p-6">
                <textarea value={whatsappText} onChange={(event) => setWhatsappText(event.target.value)} readOnly={!isStaff || selected.status !== "draft"} rows={22} className="w-full resize-y rounded-md border border-[#d0d5dd] bg-[#fbfcfc] p-4 text-sm leading-7 text-[#111318] outline-none focus:border-[#080123]" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {isStaff && selected.status === "draft" && <button type="button" onClick={() => patchSummary("save")} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#080123] px-4 text-sm font-bold text-white"><Check size={15} /> שמור נוסח</button>}
                  {isStaff && selected.status === "draft" && <button type="button" onClick={rewriteWhatsapp} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d8bb00] bg-[#fff9d8] px-4 text-sm font-bold text-[#6b5a00] disabled:opacity-50"><Sparkles size={15} /> שפר ניסוח עם AI</button>}
                  <button type="button" onClick={() => copyWhatsapp(true)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-4 text-sm"><Copy size={15} /> העתק עם קישור</button>
                  <button type="button" onClick={() => copyWhatsapp(false)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-4 text-sm"><Copy size={15} /> העתק בלי קישור</button>
                </div>
              </div>}

              {tab === "email" && <div className="p-4 md:p-6">
                <div className="mx-auto max-w-2xl">
                  <p className="text-sm font-bold text-[#111318]">תצוגת מייל</p>
                  <p className="mt-2 text-sm leading-6 text-[#667085]">המייל כולל את נתוני הסיכום וכפתור מאובטח לצפייה בגרסה האינטראקטיבית.</p>
                  {isStaff && <>
                    <label className="mt-5 block text-xs font-medium text-[#667085]">נושא המייל
                      <input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} readOnly={selected.status !== "draft"} maxLength={180} className="mt-1 h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm read-only:bg-[#f8faf9]" />
                    </label>
                    <label className="mt-5 block text-xs font-medium text-[#667085]">נמענים
                      <textarea value={recipientText} onChange={(event) => setRecipientText(event.target.value)} rows={3} placeholder="client@example.com" className="mt-1 w-full rounded-md border border-[#d0d5dd] bg-white p-3 text-sm" />
                    </label>
                    {suggestedRecipients.length > 0 && <p className="mt-1 text-[11px] text-[#667085]">נמצאו {suggestedRecipients.length} כתובות שמשויכות ללקוח.</p>}
                    <label className="mt-4 block text-xs font-medium text-[#667085]">פתיח אישי, אופציונלי
                      <textarea value={note} onChange={(event) => setNote(event.target.value)} readOnly={selected.status !== "draft"} rows={3} className="mt-1 w-full rounded-md border border-[#d0d5dd] bg-white p-3 text-sm read-only:bg-[#f8faf9]" />
                    </label>
                    {selected.status === "draft" && <button type="button" onClick={() => patchSummary("save")} disabled={busy || !emailSubject.trim()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-4 text-sm font-bold disabled:opacity-50"><Check size={15} /> שמור נושא ופתיח</button>}
                    {selected.status === "draft" ? <div className="mt-5 rounded-md bg-[#fff9d8] p-4 text-sm text-[#6b5a00]">לפני השליחה צריך לאשר ולנעול את הסיכום.</div> : <button type="button" onClick={sendEmail} disabled={busy} className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-[#080123] px-5 text-sm font-bold text-white disabled:opacity-50"><Send size={16} /> שלח סיכום במייל</button>}
                  </>}
                </div>
              </div>}

              {isStaff && <div className="flex flex-col gap-3 border-t border-[#e4e7ec] bg-[#fbfcfc] px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
                <div className="text-xs text-[#667085]">{selected.status === "draft" ? "אישור נועל את המספרים והנוסח לצפיית הלקוח." : selected.status === "approved" ? "הסיכום מאושר ומוכן לשליחה." : `נשלח ${selected.sentAt ? new Date(selected.sentAt).toLocaleString("he-IL") : ""}`}</div>
                {selected.status === "draft" && <button type="button" onClick={() => patchSummary("approve")} disabled={busy || !selected.snapshot.completeness.ready} title={selected.snapshot.completeness.ready ? undefined : "יש להשלים את בדיקות המוכנות לפני האישור"} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#FFE045] px-4 text-sm font-bold text-[#080123] disabled:cursor-not-allowed disabled:opacity-45"><CheckCircle2 size={16} /> אשר ופרסם ללקוח</button>}
              </div>}
            </>
          )}
        </section>
      </div>
      {message && <p aria-live="polite" className="rounded-md border border-[#e4e7ec] bg-white px-4 py-3 text-sm text-[#475467]">{message}</p>}
    </div>
  );
}
