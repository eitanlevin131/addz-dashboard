"use client";

import {
  Archive,
  BarChart3,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  FileText,
  Mail,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { monthLabel, type MonthlySummaryManualInput, type MonthlySummarySnapshot } from "@/lib/monthly-summary";
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

function RevenueBar({ label, value, total, color, currency }: { label: string; value: number; total: number; color: string; currency: string }) {
  const width = total > 0 ? Math.max(2, value / total * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-[#344054]">{label}</span>
        <span className="tabular-nums text-[#111318]">{money(value, currency)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-[#eef1f4]">
        <div className="h-full rounded-sm transition-[width] duration-500" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
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
    { label: "קמפיינים במייל", value: selected.snapshot.emailCampaigns.revenue, color: "#080123" },
    { label: "קמפיינים ב־SMS", value: selected.snapshot.smsCampaigns.revenue, color: "#42dfcf" },
    { label: "אוטומציות", value: selected.snapshot.automations.revenue, color: "#ffe045" },
  ] : [], [selected]);

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
        body: JSON.stringify({ action, whatsappText, internalNote: note }),
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

              {tab === "report" && <div className="p-4 md:p-6">
                {(selected.snapshot.completeness.missing.length > 0 || selected.snapshot.completeness.warnings.length > 0) && isStaff && <div className="mb-5 rounded-md border border-[#f1d786] bg-[#fff9d8] px-4 py-3 text-xs leading-5 text-[#6b5a00]">{[...selected.snapshot.completeness.warnings, ...selected.snapshot.completeness.missing.map((item) => `חסר: ${item}`)].join(" · ")}</div>}
                <div className="grid gap-px overflow-hidden rounded-lg border border-[#e4e7ec] bg-[#e4e7ec] sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["הכנסה מיוחסת", money(selected.snapshot.totals.attributedRevenue, selected.snapshot.currency)],
                    ["חלק ממחזור האתר", percent(selected.snapshot.totals.attributedShare)],
                    ["קמפיינים", money(selected.snapshot.totals.campaignRevenue, selected.snapshot.currency)],
                    ["אוטומציות", money(selected.snapshot.totals.automationRevenue, selected.snapshot.currency)],
                  ].map(([label, value]) => <div key={label} className="bg-white p-4"><span className="text-xs text-[#667085]">{label}</span><strong className="mt-2 block text-2xl font-bold tabular-nums text-[#080123]">{value}</strong></div>)}
                </div>
                <div className="mt-7 grid gap-8 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-4 text-sm font-bold text-[#111318]">פירוק ההכנסות</h3>
                    <div className="space-y-4">{channels.map((item) => <RevenueBar key={item.label} {...item} total={selected.snapshot.totals.attributedRevenue} currency={selected.snapshot.currency} />)}</div>
                    {selected.snapshot.previousMonth && <div className="mt-5 flex items-center justify-between border-t border-[#e4e7ec] pt-4 text-sm"><span className="text-[#667085]">לעומת {monthLabel(selected.snapshot.previousMonth.month)}</span><strong className={selected.snapshot.previousMonth.revenueChange !== null && selected.snapshot.previousMonth.revenueChange >= 0 ? "text-[#087f72]" : "text-[#b42318]"}>{percent(selected.snapshot.previousMonth.revenueChange)}</strong></div>}
                  </div>
                  <div>
                    <h3 className="mb-4 text-sm font-bold text-[#111318]">פעילות</h3>
                    <dl className="grid grid-cols-2 gap-3">
                      <div className="border-b border-[#e4e7ec] pb-3"><dt className="text-xs text-[#667085]">מכירות</dt><dd className="mt-1 text-xl font-bold">{number(selected.snapshot.totals.purchases)}</dd></div>
                      <div className="border-b border-[#e4e7ec] pb-3"><dt className="text-xs text-[#667085]">דוחות שנכללו</dt><dd className="mt-1 text-xl font-bold">{number(selected.snapshot.source.emailReports + selected.snapshot.source.smsReports + selected.snapshot.source.automationReports)}</dd></div>
                      <div className="border-b border-[#e4e7ec] pb-3"><dt className="text-xs text-[#667085]">נרשמי Popup</dt><dd className="mt-1 text-xl font-bold">{selected.snapshot.popup.signups === null ? "—" : number(selected.snapshot.popup.signups)}</dd></div>
                      <div className="border-b border-[#e4e7ec] pb-3"><dt className="text-xs text-[#667085]">המרת Popup</dt><dd className="mt-1 text-xl font-bold">{percent(selected.snapshot.popup.conversionRate)}</dd></div>
                    </dl>
                  </div>
                </div>
                <div className="mt-8 grid gap-6 lg:grid-cols-3">
                  {[
                    ["מיילים מובילים", selected.snapshot.leaders.emailCampaigns],
                    ["SMS מובילים", selected.snapshot.leaders.smsCampaigns],
                    ["אוטומציות מובילות", selected.snapshot.leaders.automations],
                  ].map(([title, items]) => <div key={title as string}><h3 className="mb-3 text-sm font-bold">{title as string}</h3><ol className="space-y-3">{(items as MonthlySummarySnapshot["leaders"]["emailCampaigns"]).map((item, index) => <li key={item.id} className="flex items-start gap-3 border-b border-[#eef1f4] pb-3"><span className="grid size-6 shrink-0 place-items-center rounded-sm bg-[#f2f4f7] text-xs font-bold">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium" title={item.name}>{item.name}</span><span className="mt-1 block text-xs tabular-nums text-[#667085]">{money(item.revenue, selected.snapshot.currency)} · {number(item.purchases)} מכירות</span></span></li>)}</ol></div>)}
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
                  <p className="text-sm font-bold text-[#111318]">{selected.emailSubject}</p>
                  <p className="mt-2 text-sm leading-6 text-[#667085]">המייל כולל את נתוני הסיכום וכפתור מאובטח לצפייה בגרסה האינטראקטיבית.</p>
                  {isStaff && <>
                    <label className="mt-5 block text-xs font-medium text-[#667085]">נמענים
                      <textarea value={recipientText} onChange={(event) => setRecipientText(event.target.value)} rows={3} placeholder="client@example.com" className="mt-1 w-full rounded-md border border-[#d0d5dd] bg-white p-3 text-sm" />
                    </label>
                    {suggestedRecipients.length > 0 && <p className="mt-1 text-[11px] text-[#667085]">נמצאו {suggestedRecipients.length} כתובות שמשויכות ללקוח.</p>}
                    <label className="mt-4 block text-xs font-medium text-[#667085]">פתיח אישי, אופציונלי
                      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-[#d0d5dd] bg-white p-3 text-sm" />
                    </label>
                    {selected.status === "draft" ? <div className="mt-5 rounded-md bg-[#fff9d8] p-4 text-sm text-[#6b5a00]">לפני השליחה צריך לאשר ולנעול את הסיכום.</div> : <button type="button" onClick={sendEmail} disabled={busy} className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-[#080123] px-5 text-sm font-bold text-white disabled:opacity-50"><Send size={16} /> שלח סיכום במייל</button>}
                  </>}
                </div>
              </div>}

              {isStaff && <div className="flex flex-col gap-3 border-t border-[#e4e7ec] bg-[#fbfcfc] px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
                <div className="text-xs text-[#667085]">{selected.status === "draft" ? "אישור נועל את המספרים והנוסח לצפיית הלקוח." : selected.status === "approved" ? "הסיכום מאושר ומוכן לשליחה." : `נשלח ${selected.sentAt ? new Date(selected.sentAt).toLocaleString("he-IL") : ""}`}</div>
                {selected.status === "draft" && <button type="button" onClick={() => patchSummary("approve")} disabled={busy} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#FFE045] px-4 text-sm font-bold text-[#080123] disabled:opacity-50"><CheckCircle2 size={16} /> אשר ופרסם ללקוח</button>}
              </div>}
            </>
          )}
        </section>
      </div>
      {message && <p aria-live="polite" className="rounded-md border border-[#e4e7ec] bg-white px-4 py-3 text-sm text-[#475467]">{message}</p>}
    </div>
  );
}
