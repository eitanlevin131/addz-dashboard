"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, CheckCheck, ChevronLeft, CircleHelp, ExternalLink, ListChecks, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { ANSWER_LABELS, safeReferenceUrl } from "@/lib/questionnaire/core";
import { CLIENT_SERVICES, packageDefinition, packageDisplayLabel } from "@/lib/client-packages";
import { AGENDA_GROUPS, CHARACTERIZATION_DOMAINS, KICKOFF_OUTCOMES, type Decision, type Domain, type KickoffRecord, type Outcome, type Topic, type characterization, type agenda } from "@/lib/kickoff/core";
import { clientButtonClass, clientFieldClass, clientPrimaryClass } from "./client-profile-form";

type Detail = KickoffRecord & { summary: ReturnType<typeof characterization>; agenda: ReturnType<typeof agenda> };
const AUTHORITY_LABELS = { kickoff_decision: "החלטת פגישה", client_confirmed: "אישור לקוח בשאלון", client_statement: "מידע מהלקוח בשאלון" };
function needsDecision(decision?: Decision) { return !decision || decision.outcome === "unresolved"; }
function TopicState({ decision }: { decision?: Decision }) {
  const state = !decision ? "דורש החלטה" : decision.outcome === "unresolved" ? "לא פתור" : decision.outcome === "follow_up" ? "להמשך טיפול" : "טופל";
  return <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[11px] ${needsDecision(decision) ? "bg-amber-50 text-amber-800" : decision?.outcome === "follow_up" ? "bg-[#eef3f7] text-[#475467]" : "bg-[#ecfdf9] text-[#087f72]"}`}>{state}</span>;
}
function Provenance({ topic }: { topic: Topic }) {
  const source = topic.question?.source;
  return <details className="mt-3 text-xs text-[#667085]">
    <summary className="cursor-pointer text-[#087f72]">מקורות והיסטוריית המידע</summary>
    <div className="mt-3 space-y-3 border-r-2 border-[#e4e7ec] pr-3">
      {source && <div><p className="font-bold">{source.authority === "website_inferred" ? "השערה מהאתר — המקור נשאר השערה" : "תצפית באתר — לא אישור לקוח"}</p>
        <p className="mt-1 whitespace-pre-wrap break-words leading-6">{topic.question?.suggestion}</p>
        <blockquote className="mt-2 whitespace-pre-wrap break-words leading-6">{source.evidence}</blockquote>
        <p className="mt-1">ודאות: {({ high: "גבוהה", medium: "בינונית", low: "נמוכה" } as Record<string, string>)[source.confidence] || source.confidence}{source.reviewDisposition === "needs_review" ? " · דורש בירור" : ""}</p>
        {safeReferenceUrl(source.url) && <a href={safeReferenceUrl(source.url)!} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[#087f72] underline">מקור באתר<ExternalLink size={12} /></a>}
      </div>}
      {topic.answer && <div><p className="font-bold">תשובת השאלון · {ANSWER_LABELS[topic.answer.state]}</p><p className="mt-1 whitespace-pre-wrap break-words leading-6">{topic.answer.text || "אישור / מצב ללא טקסט נוסף"}</p>
        <p className="mt-1">{new Date(topic.answer.updatedAt).toLocaleString("he-IL")}</p>
        {topic.answer.links.filter(link => safeReferenceUrl(link)).map(link => <a key={link} href={safeReferenceUrl(link)!} target="_blank" rel="noopener noreferrer" dir="ltr" className="mt-2 block break-all text-[#087f72] underline">{link}</a>)}
      </div>}
      {!source && !topic.answer && <p>{topic.origin === "kickoff" ? "נושא חדש שהצוות הוסיף בפגישה; אינו ממצא אתר או תשובת שאלון." : "נושא הכנה לפגישה; טרם התקבל מידע מאושר."}</p>}
    </div>
  </details>;
}
function DecisionEditor({ topic, decision, disabled, busy, onSave, onDirty }: {
  topic: Topic; decision?: Decision; disabled: boolean; busy: boolean;
  onSave: (body: Record<string, unknown>) => void; onDirty: (dirty: boolean) => void;
}) {
  const [outcome, setOutcome] = useState<Outcome>(decision?.outcome || "unresolved");
  const [value, setValue] = useState(decision?.value || "");
  const [note, setNote] = useState(decision?.note || "");
  return <form onSubmit={event => { event.preventDefault(); onSave({ action: "decision", topicId: topic.id, outcome, value, note }); }} className="min-w-0">
    <p className="text-xs font-medium text-[#087f72]">{CHARACTERIZATION_DOMAINS.find(d => d.id === topic.domain)?.label}</p>
    <div className="mt-2 flex items-start justify-between gap-3"><h3 className="text-lg font-bold leading-7 break-words">{topic.label}</h3><TopicState decision={decision} /></div>
    <p className="mt-2 text-sm leading-6 text-[#667085]">{topic.group === "conflict" ? "הלקוח והמקור מציגים מידע שונה. נדרשת הכרעה בפגישה." : topic.question?.source?.authority === "website_inferred" ? "זו השערה מהאתר, לא עובדה שהלקוח אישר." : topic.origin === "kickoff" ? "נושא שהתווסף במהלך הפגישה." : topic.knownValue ? "המידע כבר אושר בשאלון ונפתח לדיון נוסף." : "נדרש להשלים או להחליט על המידע בנושא הזה."}</p>
    {(topic.answer || topic.question?.suggestion) && <div className="mt-4 border-r-2 border-[#42dfcf] bg-[#f7faf9] px-3 py-2 text-sm"><span className="text-xs font-medium text-[#667085]">{topic.answer ? `מה הלקוח מסר · ${ANSWER_LABELS[topic.answer.state]}` : "מה מופיע באתר"}</span><p className="mt-1 whitespace-pre-wrap break-words leading-6">{topic.answer?.text || topic.question?.suggestion || "טרם נמסר תוכן"}</p></div>}
    <fieldset disabled={disabled || busy} className="mt-5 space-y-3 border-t border-[#e4e7ec] pt-4">
      <h4 className="text-sm font-bold">{disabled ? "ההחלטה שנשמרה" : "החלטה בנושא"}</h4>
      <label className="block text-xs font-bold">תוצאת הדיון
        <select aria-label="תוצאת הדיון" value={outcome} onChange={event => { const next = event.target.value as Outcome; setOutcome(next); onDirty(true);
          if (next === "confirmed" && !value) setValue(topic.knownValue || (topic.answer?.state === "corrected" ? topic.answer.text : "") || topic.question?.suggestion || "");
        }} className={`${clientFieldClass} mt-1`}>{Object.entries(KICKOFF_OUTCOMES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      </label>
      <label className="block text-xs font-bold">המידע או ההחלטה
        <textarea aria-label="המידע או ההחלטה" rows={3} maxLength={4000} value={value} onChange={event => { setValue(event.target.value); onDirty(true); }} className={`${clientFieldClass} mt-1 resize-y leading-6`} />
      </label>
      <p className="text-xs text-[#667085]">{outcome === "unresolved" ? "אפשר להשאיר פתוח ולציין מה עדיין חסר בהערה." : outcome === "follow_up" ? "פרטו בהערה מה צריך לקבל או לבדוק אחרי הפגישה." : "הנוסח שיישמר בסיכום האפיון."}</p>
      <label className="block text-xs text-[#667085]">{outcome === "follow_up" ? "מה נדרש להמשך הטיפול (חובה)" : "הערה להחלטה (רשות)"}
        <textarea aria-label="הערה להחלטה" rows={2} maxLength={1000} required={outcome === "follow_up"} value={note} onChange={event => { setNote(event.target.value); onDirty(true); }} className={`${clientFieldClass} mt-1 resize-y`} />
      </label>
      {!disabled && <div className="flex flex-wrap items-center gap-3"><button type="submit" className={clientPrimaryClass}><Check size={16} />שמור החלטה</button><span className="text-xs text-[#667085]">המקורות המקוריים נשמרים בנפרד</span></div>}
    </fieldset>
    {decision && <p className="mt-3 text-xs text-[#667085]">נשמר {new Date(decision.updatedAt).toLocaleString("he-IL")} · {KICKOFF_OUTCOMES[decision.outcome]}</p>}
    <div className="mt-5 border-t border-[#e4e7ec] pt-1"><Provenance topic={topic} /></div>
  </form>;
}
export function ClientKickoff({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Detail | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [view, setView] = useState<"agenda" | "known" | "summary">("agenda");
  const [activeId, setActiveId] = useState(""), [dirty, setDirty] = useState(false);
  const [newLabel, setNewLabel] = useState(""), [newDomain, setNewDomain] = useState<Domain>("identity");
  const url = `/api/clients/${clientId}/kickoff`;
  const load = useCallback(async () => {
    try { const response = await fetch(url, { cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message); setData(payload.data); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "טעינת האפיון נכשלה."); }
    finally { setLoading(false); }
  }, [url]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function leaveDraft() { if (dirty && !window.confirm("יש החלטה שלא נשמרה. להמשיך בלי לשמור?")) return false; setDirty(false); return true; }
  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method: body.action === "prepare" ? "POST" : "PATCH", headers: { "content-type": "application/json" },
        ...(body.action === "prepare" ? {} : { body: JSON.stringify({ ...body, revision: data!.revision }) }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message || "הפעולה נכשלה.");
      setData(payload.data); setDirty(false); setNotice(body.action === "decision" ? "ההחלטה נשמרה." : "האפיון עודכן.");
      if (body.action === "add_topic") { setActiveId(payload.data.addedTopics.at(-1).id); setNewLabel(""); }
      if (body.action === "complete") setView("summary");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "הפעולה נכשלה."); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status" className="py-8 text-sm text-[#667085]">טוען אפיון...</p>;
  const selected = [...(data?.snapshot.topics || []), ...(data?.addedTopics || [])].find(t => t.id === activeId) || data?.agenda[0];
  const completed = data?.status === "completed";
  const summary = data?.summary;
  const pending = data?.agenda.filter(t => needsDecision(data.decisions[t.id])) || [];
  const handled = data?.agenda.filter(t => !needsDecision(data.decisions[t.id])) || [];
  const known = data?.snapshot.topics.filter(t => t.knownValue) || [];
  const decisionCount = data ? Object.values(data.decisions).filter(d => !["unresolved", "follow_up"].includes(d.outcome)).length : 0;
  return <section dir="rtl" aria-label="פגישת אפיון" className="min-w-0 space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold">פגישת אפיון</h2><p className="mt-1 text-sm text-[#667085]">{completed ? "הפגישה הסתיימה · סיכום האפיון זמין לעיון" : data ? "דיון בנושאים הפתוחים ותיעוד ההחלטות" : "מתשובות הלקוח לסדר יום ממוקד לפגישה"}</p></div>
      <div className="flex flex-wrap gap-2">
        <button aria-label="רענן אפיון" title="רענן אפיון" className={clientButtonClass} disabled={busy} onClick={() => { if (leaveDraft()) void load(); }}><RefreshCw size={16} /></button>
        {!data && <button className={clientPrimaryClass} disabled={busy} onClick={() => void act({ action: "prepare" })}><Plus size={16} />הכן פגישת אפיון</button>}
        {data && <button className={completed || view === "summary" ? clientPrimaryClass : clientButtonClass} disabled={busy || (!completed && !Object.keys(data.decisions).length)} onClick={() => {
          if (dirty) { setError("יש לשמור את ההחלטה לפני סיכום הפגישה."); return; }
          if (!completed && !window.confirm(`לסכם את הפגישה? ${summary!.unresolved.length} נושאים נשארו לא פתורים ו־${summary!.followUps.length} להמשך טיפול.`)) return;
          void act({ action: completed ? "reopen" : "complete" });
        }}>{completed ? <RotateCcw size={16} /> : <CheckCheck size={16} />}{completed ? "פתח פגישה מחדש" : "סכם פגישה"}</button>}
      </div>
    </header>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-[#087f72]">{notice}</p>}
    {!data ? <div className="border-y border-[#e4e7ec] py-8 text-sm text-[#667085]">לאחר השלמת שאלון הלקוח אפשר להכין את הפגישה מהתשובות ומהמקורות הקיימים.
      <a href={`/?view=client-workspace&clientId=${clientId}&tab=questionnaire`} className="mt-3 flex items-center gap-1 text-[#087f72] underline">לשאלון ולהכנה לפגישה<ChevronLeft size={14} /></a>
    </div> : <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-[#e4e7ec] py-3 text-sm">
        <span className={`rounded-md px-2 py-1 text-xs font-bold ${completed ? "bg-[#ecfdf9] text-[#087f72]" : "bg-[#eef3f7] text-[#475467]"}`}>{completed ? "הפגישה סוכמה" : "פגישה פתוחה"}</span>
        <span>{decisionCount} החלטות סגורות</span><span className="text-amber-800">{summary!.unresolved.length} לא פתורים</span><span>{summary!.followUps.length} להמשך טיפול</span>
        <span className="text-xs text-[#667085]">מבוסס על השאלון שהושלם · {new Date(data.snapshot.capturedAt).toLocaleDateString("he-IL")}</span>
      </div>
      <div className="grid grid-cols-3 gap-0 border-b border-[#e4e7ec] pb-3 text-right">
        <button disabled={busy} onClick={() => { if (leaveDraft()) setView("known"); }} className="border-l border-[#e4e7ec] py-1 pl-3 text-right"><span className="block text-xs text-[#667085]">מידע שכבר ידוע</span><span className="mt-1 block text-xl font-bold">{known.length}</span><span className="text-[11px] text-[#667085]">ללא פעולה נוספת</span></button>
        <button disabled={busy} onClick={() => { if (leaveDraft()) { setActiveId(pending[0]?.id || ""); setView("agenda"); } }} className="border-l border-[#e4e7ec] px-3 py-1 text-right"><span className="block text-xs text-[#667085]">נושאים לדיון</span><span className="mt-1 block text-xl font-bold text-amber-800">{pending.length}</span><span className="text-[11px] text-[#667085]">פערים ושאלות פתוחות</span></button>
        <button disabled={busy} onClick={() => { if (leaveDraft()) setView("summary"); }} className="pr-3 py-1 text-right"><span className="block text-xs text-[#667085]">בסיכום האפיון</span><span className="mt-1 block text-xl font-bold">{summary!.resolved.length}</span><span className="text-[11px] text-[#667085]">מידע והחלטות</span></button>
      </div>
      {data.snapshot.services.length > 0 && <p className="text-xs text-[#667085]">שירותים: {data.snapshot.services.map(code => CLIENT_SERVICES.find(s => s.code === code)?.label || code).join(" · ")}{packageDefinition(data.snapshot.packageCode) ? ` · ${packageDisplayLabel(packageDefinition(data.snapshot.packageCode)!.code)}` : ""}</p>}
      {data.snapshot.warnings.map(warning => <p key={warning} className="text-xs text-amber-800">{warning}</p>)}
      <nav role="tablist" aria-label="עבודה בפגישה" className="flex gap-5 border-b border-[#e4e7ec]">
        {([{ id: "agenda", label: "סדר יום והחלטות" }, { id: "known", label: "מידע שכבר אושר" }, { id: "summary", label: "אפיון מובנה" }] as const).map(tab => <button key={tab.id} role="tab" aria-selected={view === tab.id} disabled={busy} onClick={() => { if (leaveDraft()) setView(tab.id); }} className={`border-b-2 py-2 text-sm ${view === tab.id ? "border-[#087f72] font-bold" : "border-transparent text-[#667085]"}`}>{tab.label}</button>)}
      </nav>
      {view === "agenda" && <>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e7ec] pb-3"><p className="flex items-center gap-2 text-sm font-bold"><ListChecks size={17} />{completed ? "החלטות הפגישה" : pending.length ? "לדיון עכשיו" : "הנושאים לדיון טופלו"}<span className="text-xs font-normal text-[#667085]">{pending.length} פתוחים · {handled.length} טופלו / להמשך</span></p>{!completed && !pending.length && <button className={clientButtonClass} onClick={() => { if (leaveDraft()) setView("summary"); }}>לסיכום האפיון<ChevronLeft size={14} /></button>}</div>
        {!completed && <details className="border-b border-[#e4e7ec] pb-3"><summary className="cursor-pointer text-sm font-bold text-[#087f72]">הוסף נושא מהפגישה</summary>
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (leaveDraft()) void act({ action: "add_topic", label: newLabel, domain: newDomain }); }}>
            <label className="min-w-0 flex-1 text-xs text-[#667085]">נושא חדש<input aria-label="נושא חדש" required maxLength={240} value={newLabel} onChange={event => setNewLabel(event.target.value)} className={`${clientFieldClass} mt-1`} disabled={busy} /></label>
            <label className="text-xs text-[#667085]">תחום<select aria-label="תחום נושא חדש" value={newDomain} onChange={event => setNewDomain(event.target.value as Domain)} className={`${clientFieldClass} mt-1`} disabled={busy}>{CHARACTERIZATION_DOMAINS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <button className={clientButtonClass} disabled={busy}><Plus size={15} />הוסף נושא</button>
          </form>
        </details>}
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(230px,0.8fr)_minmax(0,1.8fr)]">
          <aside aria-label="סדר יום" className="min-w-0 border-b border-[#e4e7ec] pb-3 lg:max-h-[620px] lg:overflow-y-auto lg:border-b-0 lg:border-l lg:pl-5">
            {Object.entries(AGENDA_GROUPS).map(([group, label]) => {
              const topics = pending.filter(t => t.group === group);
              if (!topics.length) return null;
              return <div key={group} className="mb-4"><h3 className={`mb-2 text-xs font-bold ${group === "conflict" ? "text-amber-800" : "text-[#667085]"}`}>{label} · {topics.length}</h3>
                {topics.map(topic => <button key={topic.id} disabled={busy} onClick={() => { if (leaveDraft()) setActiveId(topic.id); }} className={`mb-1 flex w-full items-start gap-2 rounded-md px-3 py-2 text-right text-sm transition-colors ${selected?.id === topic.id ? "bg-[#ecfdf9] text-[#087f72]" : "hover:bg-[#f5f7f9]"}`}>
                  {data.decisions[topic.id] && !["unresolved", "follow_up"].includes(data.decisions[topic.id].outcome) ? <Check size={14} className="mt-1 shrink-0" /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#98a2b3]" />}
                  <span className="min-w-0 break-words"><span className="block">{topic.label}{topic.priority === "high" && <span className="mr-2 text-xs text-amber-800">עדיפות גבוהה</span>}</span>{data.decisions[topic.id]?.outcome === "unresolved" && <span className="mt-1 block text-[11px] text-amber-800">לא פתור</span>}</span>
                </button>)}
              </div>;
            })}
            {!pending.length && <p className="py-3 text-sm text-[#667085]">אין נושאים שממתינים להחלטה.</p>}
            {handled.length > 0 && <details className="border-t border-[#e4e7ec] pt-3" open={completed}><summary className="cursor-pointer text-xs font-bold text-[#667085]">טופלו / להמשך טיפול · {handled.length}</summary><div className="mt-2 space-y-1">{handled.map(topic => <button key={topic.id} disabled={busy} onClick={() => { if (leaveDraft()) setActiveId(topic.id); }} className={`flex w-full items-start justify-between gap-2 rounded-md px-3 py-2 text-right text-sm ${selected?.id === topic.id ? "bg-[#ecfdf9]" : "hover:bg-[#f5f7f9]"}`}><span className="min-w-0 break-words">{topic.label}</span><TopicState decision={data.decisions[topic.id]} /></button>)}</div></details>}
          </aside>
          <div className="min-w-0 max-w-3xl">{selected ? <DecisionEditor key={`${selected.id}:${data.revision}:${view}`} topic={selected} decision={data.decisions[selected.id]} disabled={completed} busy={busy} onSave={body => void act(body)} onDirty={setDirty} /> : <p className="text-sm text-[#667085]">אין נושאים פתוחים.</p>}</div>
        </div>
      </>}
      {view === "known" && <div><p className="flex items-center gap-2 border-b border-[#e4e7ec] pb-3 text-sm text-[#667085]"><Check size={16} className="text-[#087f72]" />מידע מהשאלון שכבר עבר לסיכום. אין צורך לדון בו שוב, אלא אם נדרש עדכון.</p>{!known.length && <p className="py-4 text-sm text-[#667085]">טרם נמסר מידע שאושר בשאלון.</p>}{known.map(topic => <article key={topic.id} className="border-b border-[#e4e7ec] py-4 text-sm"><h3 className="font-bold">{topic.label}</h3><p className="mt-1 text-xs text-[#087f72]">{AUTHORITY_LABELS[topic.knownAuthority!]} · לפני הפגישה{data.decisions[topic.id] ? ` · בפגישה: ${KICKOFF_OUTCOMES[data.decisions[topic.id].outcome]}` : ""}</p><p className="mt-2 whitespace-pre-wrap break-words">{topic.knownValue}</p><Provenance topic={topic} />{!completed && <button className={`${clientButtonClass} mt-3`} disabled={busy} onClick={() => { if (leaveDraft()) { setActiveId(topic.id); setView("agenda"); } }}>לדיון בפגישה<ChevronLeft size={14} /></button>}</article>)}</div>}
      {view === "summary" && <div className="space-y-6">
        <p className="text-sm text-[#667085]">אפיון פנימי לעבודה. אינו Brand Brain מאושר; הנושאים הלא פתורים אינם עובדות מאושרות.</p>
        {summary!.domains.map((domain, index) => <details key={domain.id} data-testid={`kickoff-summary-${domain.id}`} open={index === 0} className="border-b border-[#e4e7ec] pb-4"><summary className="cursor-pointer text-base font-bold">{domain.label}<span className="mr-2 text-xs font-normal text-[#667085]">{domain.entries.length} פריטים</span></summary>
          {domain.entries.map(entry => <article key={entry.topic.id} className="mt-4 text-sm"><p className="font-medium">{entry.topic.label}</p><p className="mt-1 text-xs text-[#087f72]">{AUTHORITY_LABELS[entry.authority]}{entry.decision ? ` · ${KICKOFF_OUTCOMES[entry.decision.outcome]}` : ""}</p>
            <p className="mt-2 whitespace-pre-wrap break-words leading-6">{entry.value}</p>{entry.decision?.note && <p className="mt-1 whitespace-pre-wrap break-words text-[#667085]">{entry.decision.note}</p>}<Provenance topic={entry.topic} />
          </article>)}
        </details>)}
        <details open className="border-t border-amber-200 pt-4"><summary className="cursor-pointer font-bold text-amber-800"><CircleHelp size={16} className="ml-2 inline" />לא פתור · {summary!.unresolved.length}</summary>{summary!.unresolved.map(topic => <article key={topic.id} className="mt-3 text-sm"><p>{topic.label}</p>{data.decisions[topic.id]?.note && <p className="mt-1 whitespace-pre-wrap break-words text-[#667085]">{data.decisions[topic.id].note}</p>}<Provenance topic={topic} /></article>)}</details>
        <details open><summary className="cursor-pointer font-bold">המשך טיפול · {summary!.followUps.length}</summary>{summary!.followUps.map(({ topic, decision }) => <article key={topic.id} className="mt-3 text-sm"><p className="font-medium">{topic.label}</p><p className="mt-1 whitespace-pre-wrap break-words">{decision.note}</p>{decision.value && <p className="mt-1 whitespace-pre-wrap break-words text-[#667085]">מידע חלקי: {decision.value}</p>}<Provenance topic={topic} /></article>)}</details>
      </div>}
    </>}
  </section>;
}
