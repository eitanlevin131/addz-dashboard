"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Globe, Play, RefreshCw, Square, ChevronDown } from "lucide-react";
import { CATEGORY_LABELS, SCAN_STATUS_LABELS, websiteWarningLabel } from "@/lib/website-intelligence/config";
import { clientButtonClass, clientFieldClass, clientPrimaryClass } from "./client-profile-form";
import type { scanDetails, scanHistory } from "@/lib/website-intelligence/repository";
type Details = Awaited<ReturnType<typeof scanDetails>>;
type History = Awaited<ReturnType<typeof scanHistory>>;
const terminal = (status: string) => ["completed", "completed_with_warnings", "failed", "cancelled"].includes(status);
const reviewLabels = { normal: "רגיל", needs_review: "דורש בדיקה", ignored: "לא לשימוש" };
function valueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value ?? "");
  const row = value as Record<string, unknown>;
  if (typeof row.summary === "string") return row.summary;
  if (typeof row.text === "string") return row.text;
  if (row.name) return [row.name, row.price != null ? `${row.price} ${row.currency || ""}` : "", row.description].filter(Boolean).join(" · ");
  return Object.entries(row).filter(([, value]) => typeof value === "string" || typeof value === "number").map(([key, value]) => `${key}: ${value}`).join(" · ");
}
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "טעינת הסריקה נכשלה.");
  return result.data;
}
export function WebsiteIntelligence({ clientId }: { clientId: string }) {
  const base = `/api/clients/${clientId}/website-scans`;
  const [history, setHistory] = useState<History | null>(null);
  const [scanId, setScanId] = useState("");
  const [details, setDetails] = useState<Details | null>(null);
  const [category, setCategory] = useState("");
  const [disposition, setDisposition] = useState("");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    api<History>(base).then(value => { if (active) {
      const requested = new URLSearchParams(window.location.search).get("scanId");
      setHistory(value); setScanId(value.scans.find(scan => scan.id === requested)?.id || value.scans[0]?.id || "");
    } }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [base]);
  useEffect(() => {
    if (!scanId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await api<Details>(`${base}/${scanId}?${new URLSearchParams({ category, disposition })}`);
        if (!active) return;
        setDetails(value);
        setHistory(history => history ? { ...history, scans: history.scans.map(scan => scan.id === value.scan.id ? { ...scan, status: value.scan.status } : scan) } : history);
        if (terminal(value.scan.status)) { setRunning(false); return; }
        if (running) await api(`${base}/${scanId}/advance`, "POST");
        if (active) timer = setTimeout(poll, 2500);
      } catch (error) { if (active) { setError(error instanceof Error ? error.message : "טעינת הסריקה נכשלה."); setRunning(false); } }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [base, scanId, category, disposition, running]);
  async function newScan() {
    setBusy(true); setError("");
    try {
      const scan = await api<Details["scan"]>(base, "POST");
      setHistory(await api<History>(base)); setDetails(null); setScanId(scan.id); setRunning(true);
    } catch (error) { setError(error instanceof Error ? error.message : "הסריקה לא התחילה."); }
    finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true);
    try { await api(`${base}/${scanId}/cancel`, "POST"); setRunning(false); setDetails(await api<Details>(`${base}/${scanId}`)); }
    catch (error) { setError(error instanceof Error ? error.message : "לא ניתן לעצור."); }
    finally { setBusy(false); }
  }
  async function review(id: string, reviewDisposition: string) {
    try {
      await api(`/api/clients/${clientId}/website-findings/${id}`, "PATCH", { reviewDisposition });
      setDetails(await api<Details>(`${base}/${scanId}?${new URLSearchParams({ category, disposition })}`)); setNotice("תיוג הממצא נשמר.");
    } catch (error) { setError(error instanceof Error ? error.message : "התיוג לא נשמר."); }
  }
  const scan = details?.scan;
  const sources = new Map(details?.sources.map(source => [source.id, source]));
  return <section dir="rtl" className="min-w-0 space-y-5 py-4" aria-label="סריקת אתר">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Globe size={18} /> מודיעין אתר</h2>
        {history?.website && <a href={history.website} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-sm text-[#087f72]"><span dir="ltr">{history.website}</span><ExternalLink size={13} /></a>}</div>
      <div className="flex flex-wrap gap-2">
        {scan && !terminal(scan.status) ? <><button disabled={busy || running} className={clientPrimaryClass} onClick={() => { setError(""); setRunning(true); }}><Play size={14} />{running ? "סריקה פעילה" : "המשך סריקה"}</button><button disabled={busy} className={clientButtonClass} onClick={cancel}><Square size={13} /> עצור</button></> : <button disabled={busy || !history?.website} className={clientPrimaryClass} onClick={newScan}><RefreshCw size={14} />{busy ? "מתחילה…" : scanId ? "סריקה חדשה" : "סרוק אתר"}</button>}
      </div>
    </header>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-[#087f72]">{notice}</p>}
    {!history ? <p className="text-sm text-[#667085]">טוען…</p> : !history.website ? <p className="text-sm text-[#667085]">יש להוסיף כתובת אתר בפרטי הלקוח.</p> : !scanId ? <p className="text-sm text-[#667085]">טרם בוצעה סריקת אתר.</p> : <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-[#e4e7ec] py-3 text-sm">
        <span className="rounded border border-[#b7ded8] bg-[#f0faf8] px-2 py-1 font-semibold">{scan ? SCAN_STATUS_LABELS[scan.status] : "טוען…"}</span>
        <span>{details?.sources.filter(source => source.status === "completed").length || 0} / {details?.sources.length || 0} מקורות</span>
        <span>{details?.findings.length || 0} ממצאים בתצוגה</span>
        <label className="flex items-center gap-2 text-[#667085]">היסטוריה<select aria-label="היסטוריית סריקות" className={clientFieldClass + " max-w-52"} value={scanId} onChange={event => { setRunning(false); setScanId(event.target.value); setDetails(null); }}>{history.scans.map(scan => <option key={scan.id} value={scan.id}>{new Date(scan.createdAt).toLocaleString("he-IL")} · {SCAN_STATUS_LABELS[scan.status]}</option>)}</select></label>
      </div>
      {!!scan?.state.warnings.length && <details className="border-b border-[#e4e7ec] pb-3" open><summary className="cursor-pointer text-sm font-semibold text-amber-800">אזהרות · {scan.state.warnings.length}</summary><ul className="mt-2 space-y-1 text-sm text-[#667085]">{scan.state.warnings.map(value => <li key={value}>{websiteWarningLabel(value)}</li>)}</ul></details>}
      {scan?.errorCode && <p role="alert" className="text-sm text-red-700">הסריקה לא הושלמה: {scan.errorCode}</p>}
      <div className="flex flex-wrap gap-3"><label className="text-xs text-[#667085]">קטגוריה<select aria-label="קטגוריית ממצאים" value={category} onChange={event => setCategory(event.target.value)} className={clientFieldClass}><option value="">הכל</option>{Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-xs text-[#667085]">תיוג בדיקה<select aria-label="סינון תיוג" value={disposition} onChange={event => setDisposition(event.target.value)} className={clientFieldClass}><option value="">הכל</option>{Object.entries(reviewLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <div className="divide-y divide-[#e4e7ec]">{details?.findings.map(finding => <article key={finding.id} className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2 text-xs text-[#667085]"><span>{CATEGORY_LABELS[finding.category]}</span><span className={`rounded px-2 py-1 ${finding.observationStatus === "observed" ? "bg-[#edf8f5] text-[#087f72]" : "bg-[#f4f1ff] text-[#6651a6]"}`}>{finding.observationStatus === "observed" ? "נצפה באתר" : "הסקת AI"}</span><span>ביטחון {({ high: "גבוה", medium: "בינוני", low: "נמוך" } as Record<string, string>)[finding.confidence]}</span></div><select className={clientFieldClass + " !w-auto"} aria-label={`תיוג ${finding.key}`} value={finding.reviewDisposition} onChange={event => review(finding.id, event.target.value)}>{Object.entries(reviewLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <p dir="auto" className="mt-2 line-clamp-3 whitespace-pre-line break-words text-sm font-medium">{valueText(finding.value)}</p>
        {valueText(finding.value).length > 300 && <details className="mt-1 text-xs text-[#667085]"><summary className="cursor-pointer">הממצא המלא</summary><p dir="auto" className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-sm">{valueText(finding.value)}</p></details>}
        <details className="mt-2 text-xs text-[#667085]"><summary className="inline-flex cursor-pointer items-center gap-1"><ChevronDown size={13} /> מקור והוכחה</summary><blockquote dir="auto" className="mt-2 max-w-3xl whitespace-pre-wrap break-words border-s-2 border-[#cde6e1] ps-3">{finding.evidence}</blockquote><a href={sources.get(finding.sourceId)?.canonicalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-[#087f72]"><span dir="ltr">{sources.get(finding.sourceId)?.canonicalUrl}</span><ExternalLink size={12} /></a></details>
      </article>)}</div>
      {details && !details.findings.length && <p className="text-sm text-[#667085]">אין ממצאים להצגה בסינון הנוכחי.</p>}
      <details className="border-t border-[#e4e7ec] pt-3"><summary className="cursor-pointer text-sm font-semibold">מקורות וריצות AI</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-right text-xs"><thead><tr className="border-b"><th className="py-2">מקור</th><th>מצב</th><th>סוג</th></tr></thead><tbody>{details?.sources.map(source => <tr key={source.id} className="border-b border-[#eef0f3]"><td className="max-w-80 break-all py-2"><a href={source.canonicalUrl} target="_blank" rel="noopener noreferrer" className="text-[#087f72]" dir="ltr">{source.title || source.url}</a></td><td>{source.errorCode || source.status}</td><td>{source.pageType}</td></tr>)}</tbody></table></div><div className="mt-3 space-y-1 text-xs text-[#667085]">{details?.runs.map(run => <p key={run.id} dir="ltr">{run.task} · {run.model} · v{run.promptVersion} · {run.status} · {run.durationMs || 0}ms · {run.inputTokens || 0}/{run.outputTokens || 0} tokens</p>)}</div></details>
    </>}
  </section>;
}
