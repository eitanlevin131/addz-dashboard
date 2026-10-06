"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, CheckCheck, ChevronLeft, ExternalLink, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { ANSWER_LABELS, safeReferenceUrl } from "@/lib/questionnaire/core";
import { CLIENT_SERVICES, packageDefinition, packageDisplayLabel } from "@/lib/client-packages";
import { AGENDA_GROUPS, CHARACTERIZATION_DOMAINS, KICKOFF_OUTCOMES, type Decision, type Domain, type KickoffRecord, type Outcome, type Topic, type characterization, type agenda } from "@/lib/kickoff/core";
import { clientButtonClass, clientFieldClass, clientPrimaryClass } from "./client-profile-form";

type Detail = KickoffRecord & { summary: ReturnType<typeof characterization>; agenda: ReturnType<typeof agenda> };
const AUTHORITY_LABELS = { kickoff_decision: "החלטת פגישה", client_confirmed: "אישור לקוח בשאלון", client_statement: "מידע מהלקוח בשאלון" };
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
    <h3 className="mt-2 text-lg font-bold leading-7 break-words">{topic.label}</h3>
    {topic.group === "conflict" && <p className="mt-2 text-sm text-amber-800">יש פער במקורות. ההחלטה תישמר בנפרד ולא תשנה את המידע המקורי.</p>}
    {topic.answer && <div className="mt-3 border-r-2 border-[#42dfcf] pr-3 text-sm"><span className="text-xs text-[#667085]">הלקוח בשאלון · {ANSWER_LABELS[topic.answer.state]}</span><p className="mt-1 whitespace-pre-wrap break-words">{topic.answer.text || topic.question?.suggestion || "טרם נמסר תוכן"}</p></div>}
    <Provenance topic={topic} />
    <fieldset disabled={disabled || busy} className="mt-5 space-y-3">
      <label className="block text-xs font-bold">תוצאת הדיון
        <select aria-label="תוצאת הדיון" value={outcome} onChange={event => { const next = event.target.value as Outcome; setOutcome(next); onDirty(true);
          if (next === "confirmed" && !value) setValue(topic.knownValue || (topic.answer?.state === "corrected" ? topic.answer.text : "") || topic.question?.suggestion || "");
        }} className={`${clientFieldClass} mt-1`}>{Object.entries(KICKOFF_OUTCOMES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      </label>
      <label className="block text-xs font-bold">המידע או ההחלטה
        <textarea aria-label="המידע או ההחלטה" rows={3} maxLength={4000} value={value} onChange={event => { setValue(event.target.value); onDirty(true); }} className={`${clientFieldClass} mt-1 resize-y leading-6`} />
      </label>
      <label className="block text-xs text-[#667085]">{outcome === "follow_up" ? "מה נדרש להמשך הטיפול (חובה)" : "הערה להחלטה (רשות)"}
        <textarea aria-label="הערה להחלטה" rows={2} maxLength={1000} required={outcome === "follow_up"} value={note} onChange={event => { setNote(event.target.value); onDirty(true); }} className={`${clientFieldClass} mt-1 resize-y`} />
      </label>
      {!disabled && <button type="submit" className={clientPrimaryClass}><Check size={16} />שמור החלטה</button>}
    </fieldset>
    {decision && <p className="mt-3 text-xs text-[#667085]">נשמר {new Date(decision.updatedAt).toLocaleString("he-IL")} · {KICKOFF_OUTCOMES[decision.outcome]}</p>}
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
  return <section dir="rtl" aria-label="פגישת אפיון" className="min-w-0 space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold">פגישת אפיון</h2><p className="mt-1 text-sm text-[#667085]">{completed ? "סיכום פנימי · לא Brand Brain מאושר" : "הכנה, הכרעות ומידע חדש לקראת האפיון"}</p></div>
      <div className="flex flex-wrap gap-2">
        <button aria-label="רענן אפיון" title="רענן אפיון" className={clientButtonClass} disabled={busy} onClick={() => { if (leaveDraft()) void load(); }}><RefreshCw size={16} /></button>
        {!data && <button className={clientPrimaryClass} disabled={busy} onClick={() => void act({ action: "prepare" })}><Plus size={16} />הכן פגישת אפיון</button>}
        {data && <button className={completed ? clientButtonClass : clientPrimaryClass} disabled={busy} onClick={() => {
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
        <span>{summary!.resolved.length} פריטי מידע והחלטות</span><span className="text-amber-800">{summary!.unresolved.length} לא פתורים</span><span>{summary!.followUps.length} להמשך טיפול</span>
        <span className="text-xs text-[#667085]">תמונת שאלון מ־{new Date(data.snapshot.capturedAt).toLocaleDateString("he-IL")} · גרסה {data.snapshot.questionnaireRevision}</span>
      </div>
      {data.snapshot.services.length > 0 && <p className="text-xs text-[#667085]">שירותים: {data.snapshot.services.map(code => CLIENT_SERVICES.find(s => s.code === code)?.label || code).join(" · ")}{packageDefinition(data.snapshot.packageCode) ? ` · ${packageDisplayLabel(packageDefinition(data.snapshot.packageCode)!.code)}` : ""}</p>}
      {data.snapshot.warnings.map(warning => <p key={warning} className="text-xs text-amber-800">{warning}</p>)}
      <nav role="tablist" aria-label="עבודה בפגישה" className="flex gap-5 border-b border-[#e4e7ec]">
        {([{ id: "agenda", label: "סדר יום והחלטות" }, { id: "known", label: "מידע שכבר אושר" }, { id: "summary", label: "אפיון מובנה" }] as const).map(tab => <button key={tab.id} role="tab" aria-selected={view === tab.id} disabled={busy} onClick={() => { if (leaveDraft()) setView(tab.id); }} className={`border-b-2 py-2 text-sm ${view === tab.id ? "border-[#087f72] font-bold" : "border-transparent text-[#667085]"}`}>{tab.label}</button>)}
      </nav>
      {view === "agenda" && <>
        {!completed && <details className="border-b border-[#e4e7ec] pb-3"><summary className="cursor-pointer text-sm font-bold text-[#087f72]">הוסף נושא מהפגישה</summary>
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (leaveDraft()) void act({ action: "add_topic", label: newLabel, domain: newDomain }); }}>
            <label className="min-w-0 flex-1 text-xs text-[#667085]">נושא חדש<input aria-label="נושא חדש" required maxLength={240} value={newLabel} onChange={event => setNewLabel(event.target.value)} className={`${clientFieldClass} mt-1`} disabled={busy} /></label>
            <label className="text-xs text-[#667085]">תחום<select aria-label="תחום נושא חדש" value={newDomain} onChange={event => setNewDomain(event.target.value as Domain)} className={`${clientFieldClass} mt-1`} disabled={busy}>{CHARACTERIZATION_DOMAINS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <button className={clientButtonClass} disabled={busy}><Plus size={15} />הוסף נושא</button>
          </form>
        </details>}
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(230px,0.8fr)_minmax(0,1.8fr)]">
          <aside aria-label="סדר יום" className="min-w-0 border-b border-[#e4e7ec] pb-3 lg:border-b-0 lg:border-l lg:pl-5">
            {Object.entries(AGENDA_GROUPS).map(([group, label]) => {
              const topics = data.agenda.filter(t => (data.decisions[t.id]?.outcome === "follow_up" ? "follow_up" : t.group) === group);
              if (!topics.length) return null;
              return <div key={group} className="mb-4"><h3 className={`mb-2 text-xs font-bold ${group === "conflict" ? "text-amber-800" : "text-[#667085]"}`}>{label} · {topics.length}</h3>
                {topics.map(topic => <button key={topic.id} disabled={busy} onClick={() => { if (leaveDraft()) setActiveId(topic.id); }} className={`mb-1 flex w-full items-start gap-2 rounded-md px-3 py-2 text-right text-sm transition-colors ${selected?.id === topic.id ? "bg-[#ecfdf9] text-[#087f72]" : "hover:bg-[#f5f7f9]"}`}>
                  {data.decisions[topic.id] && !["unresolved", "follow_up"].includes(data.decisions[topic.id].outcome) ? <Check size={14} className="mt-1 shrink-0" /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#98a2b3]" />}
                  <span className="min-w-0 break-words">{topic.label}{topic.priority === "high" && <span className="mr-2 text-xs text-amber-800">עדיפות גבוהה</span>}</span>
                </button>)}
              </div>;
            })}
          </aside>
          <div className="min-w-0 max-w-3xl">{selected ? <DecisionEditor key={`${selected.id}:${data.revision}:${view}`} topic={selected} decision={data.decisions[selected.id]} disabled={completed} busy={busy} onSave={body => void act(body)} onDirty={setDirty} /> : <p className="text-sm text-[#667085]">אין נושאים פתוחים.</p>}</div>
        </div>
      </>}
      {view === "known" && <div>{!data.snapshot.topics.some(t => t.knownValue) && <p className="py-4 text-sm text-[#667085]">טרם נמסר מידע שאושר בשאלון.</p>}{data.snapshot.topics.filter(t => t.knownValue).map(topic => <article key={topic.id} className="border-b border-[#e4e7ec] py-4 text-sm"><h3 className="font-bold">{topic.label}</h3><p className="mt-1 text-xs text-[#087f72]">{AUTHORITY_LABELS[topic.knownAuthority!]} · לפני הפגישה</p><p className="mt-2 whitespace-pre-wrap break-words">{topic.knownValue}</p><Provenance topic={topic} />{!completed && <button className={`${clientButtonClass} mt-3`} disabled={busy} onClick={() => { setActiveId(topic.id); setView("agenda"); }}>לדיון בפגישה<ChevronLeft size={14} /></button>}</article>)}</div>}
      {view === "summary" && <div className="space-y-6">
        <p className="text-sm text-[#667085]">אפיון פנימי לעבודה. אינו Brand Brain מאושר; הנושאים הלא פתורים אינם עובדות מאושרות.</p>
        {summary!.domains.map(domain => <section key={domain.id} className="border-b border-[#e4e7ec] pb-4"><h3 className="text-base font-bold">{domain.label}</h3>
          {domain.entries.map(entry => <article key={entry.topic.id} className="mt-4 text-sm"><p className="font-medium">{entry.topic.label}</p><p className="mt-1 text-xs text-[#087f72]">{AUTHORITY_LABELS[entry.authority]}{entry.decision ? ` · ${KICKOFF_OUTCOMES[entry.decision.outcome]}` : ""}</p>
            <p className="mt-2 whitespace-pre-wrap break-words leading-6">{entry.value}</p>{entry.decision?.note && <p className="mt-1 whitespace-pre-wrap break-words text-[#667085]">{entry.decision.note}</p>}<Provenance topic={entry.topic} />
          </article>)}
        </section>)}
        <section><h3 className="font-bold text-amber-800">לא פתור · {summary!.unresolved.length}</h3>{summary!.unresolved.map(topic => <article key={topic.id} className="mt-3 text-sm"><p>{topic.label}</p>{data.decisions[topic.id]?.note && <p className="mt-1 whitespace-pre-wrap break-words text-[#667085]">{data.decisions[topic.id].note}</p>}<Provenance topic={topic} /></article>)}</section>
        <section><h3 className="font-bold">המשך טיפול · {summary!.followUps.length}</h3>{summary!.followUps.map(({ topic, decision }) => <article key={topic.id} className="mt-3 text-sm"><p className="font-medium">{topic.label}</p><p className="mt-1 whitespace-pre-wrap break-words">{decision.note}</p>{decision.value && <p className="mt-1 whitespace-pre-wrap break-words text-[#667085]">מידע חלקי: {decision.value}</p>}<Provenance topic={topic} /></article>)}</section>
      </div>}
    </>}
  </section>;
}
