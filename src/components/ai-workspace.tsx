"use client";

import {
  Bot,
  Calculator,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Lightbulb,
  MessageSquareText,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AiAccountMemory } from "@/lib/ai";
import type { AiGroundedResponse, AiReportView } from "@/lib/ai-grounding";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/metrics";
import type {
  AutomationReport,
  EmailCampaignReport,
  FlashyAccount,
  MetricSummary,
  NewsletterPlan,
  SmsCampaignReport,
} from "@/lib/types";

type AiWorkspaceTab = "ask" | "create" | "knowledge";
type CreationTool = "sms" | "subject";

export type AiWorkspaceProps = {
  clientId: string;
  account: FlashyAccount;
  summary: MetricSummary;
  emails: EmailCampaignReport[];
  sms: SmsCampaignReport[];
  automations: AutomationReport[];
  plans: NewsletterPlan[];
  onNavigate: (view: AiReportView) => void;
};

const confidenceLabels = { high: "ביטחון גבוה", medium: "ביטחון בינוני", low: "ביטחון נמוך" } as const;

function GroundedAnswer({ grounding, onNavigate }: { grounding: AiGroundedResponse; onNavigate: (view: AiReportView) => void }) {
  const evidenceIndex = new Map(grounding.sources.map((source, index) => [source.id, index + 1]));
  const badges = (ids: string[]) => ids.map((id) => evidenceIndex.get(id)).filter(Boolean).map((index) => `[${index}]`).join(" ");

  return <div className="mt-5 border-t border-[#e4e7ec] pt-5">
    <p className="text-base font-bold leading-7 text-[#111318]">{grounding.answer}</p>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="divide-y divide-[#e4e7ec]">
        {grounding.facts.length > 0 && <section className="pb-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-black text-[#344054]"><Database size={15} />נתונים שנמדדו</h3>
          <div className="space-y-2">{grounding.facts.map((item, index) => <p key={`${item.text}-${index}`} className="text-sm leading-6 text-[#344054]"><span className="ml-1 text-[11px] font-black text-[#087f72]">{badges(item.evidenceIds)}</span>{item.text}</p>)}</div>
        </section>}
        {grounding.calculations.length > 0 && <section className="py-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-black text-[#344054]"><Calculator size={15} />חישובים</h3>
          <div className="space-y-3">{grounding.calculations.map((item, index) => <div key={`${item.text}-${index}`}><p className="text-sm leading-6 text-[#344054]"><span className="ml-1 text-[11px] font-black text-[#087f72]">{badges(item.evidenceIds)}</span>{item.text}</p><code className="mt-1 block text-xs text-[#667085]">{item.formula}</code></div>)}</div>
        </section>}
        {grounding.inferences.length > 0 && <section className="pt-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-black text-[#344054]"><Lightbulb size={15} />הסקנות</h3>
          <div className="space-y-3">{grounding.inferences.map((item, index) => <div key={`${item.text}-${index}`}><p className="text-sm leading-6 text-[#344054]"><span className="ml-1 text-[11px] font-black text-[#087f72]">{badges(item.evidenceIds)}</span>{item.text}</p><span className="text-[11px] text-[#667085]">{confidenceLabels[item.confidence]}</span></div>)}</div>
        </section>}
      </div>
      <aside>
        <h3 className="mb-3 text-xs font-black text-[#344054]">מקורות</h3>
        <div className="overflow-hidden rounded-lg border border-[#dfe7ee] bg-white">
          {grounding.sources.map((source, index) => <button key={source.id} type="button" onClick={() => onNavigate(source.reportView)} className="flex w-full items-start justify-between gap-3 border-b border-[#edf2f6] px-3 py-3 text-right transition last:border-b-0 hover:bg-[#f4fbfa]">
            <span className="min-w-0"><span className="block truncate text-xs font-black text-[#111318]">[{index + 1}] {source.title}</span><span className="mt-1 block text-[11px] leading-5 text-[#667085]">{source.metrics.slice(0, 3).map((item) => `${item.label} ${item.display}`).join(" · ") || source.subtitle}</span></span><ExternalLink className="mt-0.5 shrink-0 text-[#087f72]" size={14} />
          </button>)}
        </div>
      </aside>
    </div>
  </div>;
}

type SmsCopyResult = {
  model: string;
  patterns: string[];
  variants: Array<{ label: string; text: string; rationale: string; basedOnCampaignIds: number[] }>;
  evidence: Array<{ campaignId: number; name: string; revenue: number; purchases: number; roas: number | null }>;
};

function smsLength(text: string) {
  const unicode = /[^\x00-\x7F]/.test(text);
  const singleLimit = unicode ? 70 : 160;
  const multipartLimit = unicode ? 67 : 153;
  return { characters: text.length, segments: text.length <= singleLimit ? 1 : Math.ceil(text.length / multipartLimit) };
}

function SmsCopyWorkspace({ account }: { account: FlashyAccount }) {
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [offer, setOffer] = useState("");
  const [mustInclude, setMustInclude] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SmsCopyResult | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/sms-copy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: account.clientId, accountId: account.id, objective, audience, offer, mustInclude }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "יצירת הטיוטות נכשלה.");
      setResult(payload as SmsCopyResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "יצירת הטיוטות נכשלה.");
    } finally {
      setLoading(false);
    }
  }

  async function copyVariant(text: string, index: number) {
    await navigator.clipboard.writeText(text);
    setCopied(index);
    window.setTimeout(() => setCopied((current) => current === index ? null : current), 1600);
  }

  const evidenceById = new Map((result?.evidence ?? []).map((item) => [item.campaignId, item]));
  return <div>
    <div className="grid gap-4 border-b border-[#e4e7ec] pb-5 sm:grid-cols-2">
      <label><span className="mb-1.5 block text-xs font-bold text-[#344054]">מטרת השליחה</span><input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="החזרת לקוחות שלא רכשו 60 יום" className="h-10 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#20b9a8]" /></label>
      <label><span className="mb-1.5 block text-xs font-bold text-[#344054]">קהל</span><input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="לקוחות חוזרים שלא רכשו לאחרונה" className="h-10 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#20b9a8]" /></label>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-[#344054]">הצעה ופרטים מאושרים</span><textarea value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="המבצע, הקוד, התוקף והקישור. ה־AI לא ימציא פרטים שלא יופיעו כאן." rows={3} className="w-full resize-y rounded-md border border-[#d0d5dd] px-3 py-2 text-sm leading-6 outline-none focus:border-[#20b9a8]" /></label>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-[#344054]">חובה לכלול <span className="font-normal text-[#98a2b3]">(אופציונלי)</span></span><input value={mustInclude} onChange={(event) => setMustInclude(event.target.value)} placeholder="מילים, הסתייגות או CTA" className="h-10 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#20b9a8]" /></label>
      {error && <p role="alert" className="sm:col-span-2 rounded-md border border-[#fecaca] bg-[#fff7f7] px-3 py-2 text-xs leading-5 text-[#b42318]">{error}</p>}
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-5 text-[#667085]">טיוטות בלבד. אין שליחה אוטומטית ל־Flashy.</p><button type="button" disabled={loading || !objective.trim() || !audience.trim() || !offer.trim()} onClick={generate} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#111318] px-4 text-sm font-bold text-white disabled:opacity-45">{loading ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}{loading ? "לומד וכותב..." : "צור 3 טיוטות"}</button></div>
    </div>
    {result ? <div className="pt-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-black text-[#111318]">טיוטות מוצעות</h3><p className="mt-1 text-[11px] text-[#667085]">{result.model} · נותחו {result.evidence.length} הודעות עבר</p></div><p className="max-w-lg text-xs leading-5 text-[#475467]">{result.patterns.join(" · ")}</p></div><div className="overflow-hidden rounded-lg border border-[#e4e7ec]">{result.variants.map((variant, index) => {
      const length = smsLength(variant.text);
      const sources = variant.basedOnCampaignIds.map((id) => evidenceById.get(id)).filter(Boolean);
      return <article key={`${variant.label}-${index}`} className="border-b border-[#eef0f2] p-4 last:border-b-0"><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-black">{variant.label}</h4><p className="mt-1 text-[11px] text-[#667085]">{length.characters} תווים · {length.segments} מקטעי SMS משוערים</p></div><button type="button" onClick={() => copyVariant(variant.text, index)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d0d5dd] px-2.5 text-xs font-bold"><Copy size={13} />{copied === index ? "הועתק" : "העתקה"}</button></div><p className="mt-3 whitespace-pre-wrap rounded-md bg-[#f4fbfa] p-3 text-sm leading-6">{variant.text}</p><p className="mt-3 text-xs leading-5 text-[#475467]">{variant.rationale}</p>{sources.length > 0 && <p className="mt-2 text-[11px] text-[#667085]">מבוסס על: {sources.map((source) => source?.name).join(" · ")}</p>}</article>;
    })}</div></div> : <div className="grid min-h-44 place-content-center text-center"><MessageSquareText size={28} className="mx-auto text-[#20b9a8]" /><p className="mt-3 text-sm font-bold text-[#344054]">הזן בריף כדי להתחיל</p><p className="mt-1 text-xs text-[#667085]">המודל ישווה לטקסטים היסטוריים ולמסמכי הלקוח.</p></div>}
  </div>;
}

type SubjectEvidence = { campaignId: number; name: string; subject: string; delivered: number; openRate: number; clickRate: number; revenue: number; revenuePerThousand: number };
type SubjectResult = {
  model: string;
  patterns: string[];
  coverage: { totalCampaigns: number; eligibleCampaigns: number; minimumDelivered: number };
  evidence: SubjectEvidence[];
  pairs: Array<{ label: string; hypothesis: string; confidence: "high" | "medium" | "low"; variantA: { subject: string; preheader: string }; variantB: { subject: string; preheader: string }; basedOnCampaignIds: number[] }>;
};

function SubjectLineWorkspace({ account }: { account: FlashyAccount }) {
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [offer, setOffer] = useState("");
  const [mustInclude, setMustInclude] = useState("");
  const [tone, setTone] = useState<"direct" | "curious" | "promotional" | "brand">("direct");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubjectResult | null>(null);
  const [copied, setCopied] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/subject-lines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: account.clientId, accountId: account.id, objective, audience, offer, mustInclude, tone }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "יצירת שורות הנושא נכשלה.");
      setResult(payload as SubjectResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "יצירת שורות הנושא נכשלה.");
    } finally {
      setLoading(false);
    }
  }

  async function copySubject(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied((current) => current === value ? "" : current), 1600);
  }

  const evidenceById = new Map((result?.evidence ?? []).map((item) => [item.campaignId, item]));
  const toneOptions = [{ value: "direct", label: "ישיר" }, { value: "curious", label: "מסקרן" }, { value: "promotional", label: "מבצעי" }, { value: "brand", label: "מותגי" }] as const;
  return <div>
    <div className="grid gap-4 border-b border-[#e4e7ec] pb-5 sm:grid-cols-2">
      <label><span className="mb-1.5 block text-xs font-bold text-[#344054]">מטרת הקמפיין</span><input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="השקה, מכירה, חזרה למלאי או תוכן" className="h-10 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#20b9a8]" /></label>
      <label><span className="mb-1.5 block text-xs font-bold text-[#344054]">קהל</span><input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="לקוחות פעילים, מתעניינים או VIP" className="h-10 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#20b9a8]" /></label>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-[#344054]">הצעה ופרטים מאושרים</span><textarea value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="המוצר, ההטבה, התוקף והמסר. המודל לא ימציא פרטים." rows={3} className="w-full resize-y rounded-md border border-[#d0d5dd] px-3 py-2 text-sm leading-6 outline-none focus:border-[#20b9a8]" /></label>
      <div className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-[#344054]">סגנון</span><div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-md bg-[#f1f4f5] p-1">{toneOptions.map((option) => <button key={option.value} type="button" onClick={() => setTone(option.value)} className={`h-8 shrink-0 rounded px-3 text-xs font-bold ${tone === option.value ? "bg-white text-[#111318] shadow-sm" : "text-[#667085]"}`}>{option.label}</button>)}</div></div>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-[#344054]">חובה לכלול <span className="font-normal text-[#98a2b3]">(אופציונלי)</span></span><input value={mustInclude} onChange={(event) => setMustInclude(event.target.value)} placeholder="מילה, מוצר או מגבלה" className="h-10 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#20b9a8]" /></label>
      {error && <p role="alert" className="sm:col-span-2 rounded-md border border-[#fecaca] bg-[#fff7f7] px-3 py-2 text-xs leading-5 text-[#b42318]">{error}</p>}
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-5 text-[#667085]">כל זוג משנה משתנה אחד. ביצועי העבר הם קורלציה, לא הוכחה סיבתית.</p><button type="button" disabled={loading || !objective.trim() || !audience.trim() || !offer.trim()} onClick={generate} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#111318] px-4 text-sm font-bold text-white disabled:opacity-45">{loading ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}{loading ? "מנתח וכותב..." : "צור 3 ניסויי A/B"}</button></div>
    </div>
    {result ? <div className="pt-5"><div className="mb-4"><h3 className="text-sm font-black">ניסויי A/B מוצעים</h3><p className="mt-1 text-[11px] text-[#667085]">{result.model} · {result.coverage.eligibleCampaigns} מתוך {result.coverage.totalCampaigns} קמפיינים עברו סף של {formatNumber(result.coverage.minimumDelivered)} מסירות</p>{result.patterns.length > 0 && <p className="mt-2 text-xs leading-5 text-[#475467]">{result.patterns.join(" · ")}</p>}</div><div className="overflow-hidden rounded-lg border border-[#e4e7ec]">{result.pairs.map((pair, pairIndex) => {
      const sources = pair.basedOnCampaignIds.map((id) => evidenceById.get(id)).filter(Boolean);
      return <article key={`${pair.label}-${pairIndex}`} className="border-b border-[#eef0f2] p-4 last:border-b-0"><div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="text-sm font-black">{pair.label}</h4><p className="mt-1 text-xs leading-5 text-[#475467]">{pair.hypothesis}</p></div><span className="text-[11px] font-bold text-[#667085]">{confidenceLabels[pair.confidence]}</span></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{([pair.variantA, pair.variantB] as const).map((variant, index) => <div key={`${variant.subject}-${index}`} className="border-r-2 border-[#20b9a8] bg-[#f7faf9] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black text-[#087f72]">וריאציה {index === 0 ? "A" : "B"}</p><p className="mt-1 text-sm font-black leading-6">{variant.subject}</p><p className="mt-1 text-[11px] text-[#667085]">{variant.subject.length} תווים</p></div><button type="button" aria-label="העתקת שורת נושא" onClick={() => copySubject(variant.subject)} className="grid size-8 shrink-0 place-items-center rounded-md border border-[#d0d5dd] bg-white"><Copy size={13} /></button></div>{variant.preheader && <p className="mt-3 border-t border-[#dfe7ee] pt-3 text-xs leading-5 text-[#475467]">Preview: {variant.preheader}</p>}{copied === variant.subject && <p className="mt-1 text-[10px] font-bold text-[#087f72]">הועתק</p>}</div>)}</div>{sources.length > 0 && <div className="mt-3 text-[11px] leading-5 text-[#667085]">מבוסס על: {sources.map((source) => `${source?.name} (${formatPercent(source?.openRate ?? 0)} פתיחה · ${formatCurrency(source?.revenue ?? 0, account.currency)})`).join(" · ")}</div>}</article>;
    })}</div></div> : <div className="grid min-h-44 place-content-center text-center"><Sparkles size={28} className="mx-auto text-[#20b9a8]" /><p className="mt-3 text-sm font-bold text-[#344054]">בנה ניסוי, לא רשימת רעיונות</p><p className="mt-1 max-w-md text-xs leading-5 text-[#667085]">הכלי בוחר קמפיינים בני־השוואה ומחזיר זוגות A/B עם מקורות.</p></div>}
  </div>;
}

export function AiWorkspace({ clientId, account, summary, emails, sms, automations, plans, onNavigate }: AiWorkspaceProps) {
  const [tab, setTab] = useState<AiWorkspaceTab>("ask");
  const [creationTool, setCreationTool] = useState<CreationTool>("sms");
  const [memory, setMemory] = useState<AiAccountMemory>({});
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [memoryState, setMemoryState] = useState("טוען את ידע הלקוח...");
  const [onboardingQuestions, setOnboardingQuestions] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [askState, setAskState] = useState("מוכן");
  const [askError, setAskError] = useState("");
  const [grounding, setGrounding] = useState<AiGroundedResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMemory() {
      try {
        const response = await fetch(`/api/ai/memory?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת ידע הלקוח נכשלה.");
        if (!cancelled) {
          setMemory(payload.data ?? {});
          setMemoryLoaded(true);
          setMemoryState(payload.persisted ? `הידע של ${account.name} נטען.` : `עדיין אין ידע שמור עבור ${account.name}.`);
        }
      } catch (error) {
        if (!cancelled) {
          setMemoryLoaded(true);
          setMemoryState(error instanceof Error ? error.message : "טעינת ידע הלקוח נכשלה.");
        }
      }
    }
    void loadMemory();
    return () => { cancelled = true; };
  }, [account.name, clientId]);

  async function askData(value = question) {
    const prompt = value.trim();
    if (!prompt) return;
    setQuestion(prompt);
    setAskState("בודק את הדוחות והמקורות...");
    setAskError("");
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, mode: "chat", question: prompt, view: "ai", account, summary, emails, sms, automations, plans, memory }) });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.grounding) throw new Error(payload.message || "בקשת AI נכשלה.");
      setGrounding(payload.grounding as AiGroundedResponse);
      setAskState(`${payload.model || "OpenAI"} · התשובה נבדקה מול מקורות`);
    } catch (error) {
      setGrounding(null);
      setAskError(error instanceof Error ? error.message : "בקשת AI נכשלה.");
      setAskState("הבקשה נכשלה");
    }
  }

  async function saveMemory() {
    setMemoryState("שומר את ידע הלקוח...");
    try {
      const response = await fetch("/api/ai/memory", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, ...memory }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "שמירת הידע נכשלה.");
      setMemory(payload.data ?? memory);
      setMemoryState(payload.persisted ? "ידע הלקוח נשמר." : "השינויים נשמרו במסך בלבד.");
    } catch (error) {
      setMemoryState(error instanceof Error ? error.message : "שמירת הידע נכשלה.");
    }
  }

  async function addMemoryDocument(file: File) {
    if (file.size > 5 * 1024 * 1024) return setMemoryState("המסמך גדול מדי. עד 5MB למסמך.");
    if (!file.name.match(/\.(txt|md|csv|json|pdf|docx)$/i)) return setMemoryState("אפשר להעלות TXT / Markdown / CSV / JSON / PDF / DOCX.");
    setMemoryState(`מחלץ טקסט מתוך "${file.name}"...`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/ai/documents/parse", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "חילוץ המסמך נכשל.");
      const document = payload.data as { name: string; content: string; createdAt: string };
      setMemory((current) => ({ ...current, documents: [document, ...(current.documents ?? [])].slice(0, 8) }));
      setMemoryState(`המסמך "${file.name}" נוסף. לחץ שמור.`);
    } catch (error) {
      setMemoryState(error instanceof Error ? error.message : "חילוץ המסמך נכשל.");
    }
  }

  async function scanDocuments() {
    setMemoryState("סורק את מסמכי הלקוח...");
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, mode: "onboarding", question: "", account, summary, emails, sms, automations, plans, memory }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "סריקת המסמכים נכשלה.");
      const profile = payload.onboarding?.profile as { brandVoice?: string; audiences?: string[]; products?: string[]; positioning?: string; constraints?: string[]; contentAngles?: string[]; commercialMoments?: string[]; missingInfo?: string[] } | undefined;
      setMemory((current) => ({
        ...current,
        onboardingSummary: payload.onboarding?.summary ?? current.onboardingSummary,
        onboardingQuestions: payload.onboarding?.questions ?? current.onboardingQuestions,
        brandVoice: profile?.brandVoice || current.brandVoice,
        audiences: profile?.audiences?.length ? profile.audiences.join("\n") : current.audiences,
        products: profile?.products?.length ? profile.products.join("\n") : current.products,
        constraints: profile?.constraints?.length ? profile.constraints.join("\n") : current.constraints,
        learnings: [current.learnings, profile?.positioning ? `מיצוב: ${profile.positioning}` : "", profile?.contentAngles?.length ? `זוויות תוכן: ${profile.contentAngles.join(", ")}` : "", profile?.commercialMoments?.length ? `רגעים מסחריים: ${profile.commercialMoments.join(", ")}` : "", profile?.missingInfo?.length ? `מידע חסר: ${profile.missingInfo.join(", ")}` : ""].filter(Boolean).join("\n\n"),
      }));
      setOnboardingQuestions(payload.onboarding?.questions ?? []);
      setMemoryState("המסמכים נסרקו. בדוק את הפרופיל ולחץ שמור.");
    } catch (error) {
      setMemoryState(error instanceof Error ? error.message : "סריקת המסמכים נכשלה.");
    }
  }

  const quickQuestions = [
    "איך ההכנסות מתחלקות בין קמפיינים לאוטומציות?",
    "איזה קמפיין חזק ביחס לגודל הקהל?",
    "איזו אוטומציה מציגה הכנסה נמוכה ביחס להיקף השליחות?",
    "השווה בין אימייל ל־SMS",
  ];
  const tabs = [{ key: "ask", label: "שאל את הדאטה", detail: "תשובות עם מקורות" }, { key: "create", label: "יצירת תוכן", detail: "SMS ושורות נושא" }, { key: "knowledge", label: "ידע הלקוח", detail: memoryLoaded ? `${memory.documents?.length ?? 0} מסמכים` : "טוען..." }] as const;

  return <section dir="rtl" className="overflow-hidden rounded-xl border border-[#dfe3e7] bg-white text-[#111318]">
    <header className="border-b border-[#e4e7ec] px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold text-[#087f72]">AI לסוכנות</p><h2 className="mt-1 text-2xl font-black">מרחב עבודה מבוסס דאטה</h2><p className="mt-1 text-sm text-[#667085]">{account.name} · הנתונים בטווח הדוחות הנבחר</p></div><p className="text-xs leading-5 text-[#667085]">{formatNumber(emails.length)} קמפייני אימייל · {formatNumber(sms.length)} קמפייני SMS · {formatNumber(automations.length)} רשומות אוטומציה</p></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">{tabs.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`border-b-2 px-3 py-3 text-right transition ${tab === item.key ? "border-[#20b9a8] bg-[#f4fbfa]" : "border-transparent hover:bg-[#f8fafb]"}`}><span className="block text-sm font-black">{item.label}</span><span className="mt-1 block text-xs text-[#667085]">{item.detail}</span></button>)}</div>
    </header>

    <div className="p-4 sm:p-6">
      {tab === "ask" && <div>
        <div className="mx-auto max-w-4xl"><div className="flex items-center gap-2"><Bot size={18} className="text-[#087f72]" /><h3 className="text-lg font-black">מה תרצה להבין?</h3></div><p className="mt-1 text-sm leading-6 text-[#667085]">הסוכן מפריד בין נתון, חישוב והסקה ומקשר כל תשובה לדוחות שעליהם הסתמך.</p><div className="mt-4 flex flex-wrap gap-2">{quickQuestions.map((item) => <button key={item} type="button" onClick={() => void askData(item)} className="rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-xs font-bold text-[#344054] transition hover:border-[#20b9a8] hover:bg-[#f4fbfa]">{item}</button>)}</div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void askData(); }} placeholder="למשל: למה ההכנסות מ־SMS ירדו ומה הנתונים שתומכים בזה?" className="min-h-24 flex-1 resize-y rounded-lg border border-[#d0d5dd] p-3 text-sm leading-6 outline-none focus:border-[#20b9a8]" /><button type="button" onClick={() => void askData()} disabled={!question.trim() || askState.startsWith("בודק")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#111318] px-5 text-sm font-bold text-white disabled:opacity-45"><Send size={15} />שאל</button></div><div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[#667085]"><span>{askState}</span><span>⌘/Ctrl + Enter</span></div>{askError && <p role="alert" className="mt-3 rounded-md border border-[#fecaca] bg-[#fff7f7] px-3 py-2 text-xs text-[#b42318]">{askError}</p>}{grounding ? <GroundedAnswer grounding={grounding} onNavigate={onNavigate} /> : <div className="mt-8 grid min-h-48 place-content-center border-t border-[#e4e7ec] text-center"><Database size={28} className="mx-auto text-[#98a2b3]" /><p className="mt-3 text-sm font-bold text-[#344054]">התשובה תופיע כאן עם הוכחות</p><p className="mt-1 text-xs text-[#667085]">מספרים, נוסחאות והסקנות יוצגו בנפרד.</p></div>}</div>
      </div>}

      {tab === "create" && <div><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-lg font-black">יצירת תוכן מבוסס ביצועים</h3><p className="mt-1 text-sm text-[#667085]">כלים מעשיים שמשתמשים בדוגמאות ובמסמכי הלקוח.</p></div><div className="inline-flex rounded-md bg-[#f1f4f5] p-1"><button type="button" onClick={() => setCreationTool("sms")} className={`h-9 rounded px-4 text-xs font-bold ${creationTool === "sms" ? "bg-white shadow-sm" : "text-[#667085]"}`}>SMS</button><button type="button" onClick={() => setCreationTool("subject")} className={`h-9 rounded px-4 text-xs font-bold ${creationTool === "subject" ? "bg-white shadow-sm" : "text-[#667085]"}`}>שורות נושא</button></div></div>{creationTool === "sms" ? <SmsCopyWorkspace account={account} /> : <SubjectLineWorkspace account={account} />}</div>}

      {tab === "knowledge" && <div><div className="flex flex-col gap-3 border-b border-[#e4e7ec] pb-5 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-lg font-black">ידע הלקוח</h3><p className="mt-1 text-sm leading-6 text-[#667085]">מסמכים ופרופיל שמשפיעים על הצ׳אט ועל שני כלי הכתיבה.</p></div><button type="button" onClick={() => void saveMemory()} className="h-10 rounded-md bg-[#111318] px-4 text-sm font-bold text-white">שמור שינויים</button></div><div className="mt-5 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"><section><div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-black">מסמכי מקור</h4><p className="mt-1 text-xs text-[#667085]">TXT, MD, CSV, JSON, PDF או DOCX עד 5MB.</p></div><label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d0d5dd] px-3 text-xs font-bold"><Upload size={14} />העלה<input type="file" accept=".txt,.md,.csv,.json,.pdf,.docx" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addMemoryDocument(file); event.target.value = ""; }} /></label></div><div className="mt-3 overflow-hidden rounded-lg border border-[#e4e7ec]">{(memory.documents ?? []).length ? (memory.documents ?? []).map((document, index) => <div key={`${document.name}-${index}`} className="flex items-center justify-between gap-3 border-b border-[#eef0f2] p-3 last:border-b-0"><div className="min-w-0"><p className="truncate text-xs font-black"><FileText className="ml-1 inline" size={13} />{document.name}</p><p className="mt-1 text-[11px] text-[#667085]">{formatNumber(document.content.length)} תווים</p></div><button type="button" onClick={() => setMemory((current) => ({ ...current, documents: (current.documents ?? []).filter((_, itemIndex) => itemIndex !== index) }))} className="text-xs font-bold text-[#b42318]">הסר</button></div>) : <p className="p-5 text-center text-xs text-[#667085]">אין מסמכים שמורים.</p>}</div><textarea placeholder="או הדבק כאן תקציר אסטרטגיה קצר..." className="mt-3 min-h-24 w-full rounded-lg border border-[#d0d5dd] p-3 text-sm outline-none focus:border-[#20b9a8]" onBlur={(event) => { const content = event.currentTarget.value.trim(); if (!content) return; setMemory((current) => ({ ...current, documents: [{ name: `תקציר ידני ${new Date().toLocaleDateString("he-IL")}`, content, createdAt: new Date().toISOString() }, ...(current.documents ?? [])].slice(0, 8) })); event.currentTarget.value = ""; setMemoryState("התקציר נוסף. לחץ שמור."); }} /><button type="button" onClick={() => void scanDocuments()} disabled={(memory.documents ?? []).length === 0} className="mt-3 h-10 w-full rounded-md bg-[#dffaf6] text-sm font-black text-[#075e55] disabled:opacity-45">סרוק מסמכים ועדכן פרופיל</button><p className="mt-3 text-xs leading-5 text-[#667085]">{memoryState}</p></section><section><h4 className="text-sm font-black">פרופיל מובנה</h4><div className="mt-3 grid gap-3 sm:grid-cols-2">{([{ key: "brandVoice", label: "טון מותג" }, { key: "audiences", label: "קהלים" }, { key: "products", label: "מוצרים וקטגוריות" }, { key: "constraints", label: "מגבלות ודברים לא לעשות" }] as const).map((field) => <label key={field.key}><span className="mb-1.5 block text-xs font-bold text-[#344054]">{field.label}</span><textarea value={memory[field.key] ?? ""} onChange={(event) => setMemory((current) => ({ ...current, [field.key]: event.target.value }))} rows={4} className="w-full rounded-md border border-[#d0d5dd] p-3 text-sm leading-6 outline-none focus:border-[#20b9a8]" /></label>)}</div><label className="mt-3 block"><span className="mb-1.5 block text-xs font-bold text-[#344054]">מיצוב, למידות וזוויות תוכן</span><textarea value={memory.learnings ?? ""} onChange={(event) => setMemory((current) => ({ ...current, learnings: event.target.value }))} rows={5} className="w-full rounded-md border border-[#d0d5dd] p-3 text-sm leading-6 outline-none focus:border-[#20b9a8]" /></label>{memory.onboardingSummary && <div className="mt-4 border-r-2 border-[#20b9a8] bg-[#f4fbfa] p-3"><p className="text-xs font-black">מה ה־AI הבין</p><p className="mt-2 text-sm leading-6 text-[#475467]">{memory.onboardingSummary}</p></div>}{(onboardingQuestions.length > 0 || (memory.onboardingQuestions ?? []).length > 0) && <div className="mt-4"><h4 className="text-xs font-black">מידע שחסר להשלמה</h4><div className="mt-2 space-y-2">{(onboardingQuestions.length ? onboardingQuestions : memory.onboardingQuestions ?? []).map((item, index) => <label key={`${item}-${index}`} className="block border-b border-[#eef0f2] pb-3 text-xs font-bold text-[#344054]">{item}<textarea placeholder="תשובה שתיכנס לידע הלקוח" className="mt-2 min-h-16 w-full rounded-md border border-[#d0d5dd] p-2 text-sm font-normal outline-none focus:border-[#20b9a8]" onBlur={(event) => { const value = event.currentTarget.value.trim(); if (!value) return; setMemory((current) => ({ ...current, learnings: [current.learnings, `שאלה: ${item}\nתשובה: ${value}`].filter(Boolean).join("\n\n") })); event.currentTarget.value = ""; setMemoryState("התשובה נוספה. לחץ שמור."); }} /></label>)}</div></div>}</section></div></div>}
    </div>
  </section>;
}
