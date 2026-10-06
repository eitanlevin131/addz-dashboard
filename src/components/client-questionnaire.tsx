"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardCopy, FileCheck2, Link2, RefreshCw, ShieldX } from "lucide-react";
import { QUESTIONNAIRE_SECTIONS, QUESTIONNAIRE_STATUS_LABELS, ANSWER_LABELS, questionnaireLinkUrl, type QuestionnaireRecord, type preKickoff } from "@/lib/questionnaire/core";
import { QuestionEvidence } from "./questionnaire-fields";
import { clientButtonClass, clientPrimaryClass } from "./client-profile-form";

type Detail = QuestionnaireRecord & { progress: { percent: number; answered: number; total: number }; preparation: ReturnType<typeof preKickoff> | null };
const PREPARATION_LABELS = { confirmed: "אושר על ידי הלקוח", corrected: "תוקן על ידי הלקוח", new: "מידע חדש מהלקוח", conflicts: "פערים ונקודות לבירור", unknown: "עדיין לא ידוע", kickoff: "לדיון בפגישה" };
export function ClientQuestionnaire({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [view, setView] = useState<"questionnaire" | "preparation">("questionnaire");
  const url = `/api/clients/${clientId}/questionnaire`;
  const load = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: "no-store" }); const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "טעינת השאלון נכשלה.");
      setData(payload.data); setSelection(payload.data?.selectedIds || []); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "טעינת השאלון נכשלה."); }
    finally { setLoading(false); }
  }, [url]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function act(action: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method: action === "generate" ? "POST" : "PATCH", headers: { "content-type": "application/json" },
        ...(action === "generate" ? {} : { body: JSON.stringify({ action, revision: data!.revision, ...(action === "ready" ? { selectedIds: selection } : {}) }) }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message || "הפעולה נכשלה.");
      if (action === "generate") setData(payload.data);
      else setData(payload.data.questionnaire);
      if (payload.data.token) setLink(questionnaireLinkUrl(location.origin, payload.data.token));
      if (action === "revoke") setLink("");
      setSelection((action === "generate" ? payload.data : payload.data.questionnaire).selectedIds);
      setNotice(action === "share" ? "הקישור מוכן. יצירת קישור נוסף תבטל את הקודם." : "השאלון עודכן.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "הפעולה נכשלה."); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setNotice("הקישור הועתק."); }
    catch { setError("לא ניתן להעתיק אוטומטית. אפשר לבחור ולהעתיק את הקישור המוצג."); }
  }
  if (loading) return <p role="status" className="py-8 text-sm text-[#667085]">טוען שאלון...</p>;
  return <section aria-label="שאלון והכנה לפגישה" dir="rtl" className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold">שאלון והכנה לפגישה</h2><p className="mt-1 text-sm text-[#667085]">אישורים, תיקונים והשלמות לקראת האפיון</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={clientButtonClass} onClick={() => void load()} disabled={busy} aria-label="רענן שאלון" title="רענן שאלון"><RefreshCw size={16} /></button>
        {!data && <button className={clientPrimaryClass} disabled={busy} onClick={() => void act("generate")}><FileCheck2 size={16} />צור טיוטת שאלון</button>}
        {data?.status === "draft" && <button className={clientPrimaryClass} disabled={busy} onClick={() => void act("ready")}><Check size={16} />אשר לשיתוף</button>}
        {data && data.status !== "draft" && <button className={clientPrimaryClass} disabled={busy} onClick={() => {
          if (data.status !== "ready" && !window.confirm("קישור חדש יבטל את הקישור הקודם. התשובות יישמרו. להמשיך?")) return;
          void act("share");
        }}><Link2 size={16} />{data.status === "ready" ? "צור קישור ללקוח" : "צור קישור חדש"}</button>}
        {data?.linkExpiresAt && !data.revokedAt && <button className={clientButtonClass} disabled={busy} onClick={() => { if (window.confirm("לבטל את גישת הקישור? התשובות יישמרו.")) void act("revoke"); }}><ShieldX size={16} />בטל קישור</button>}
        {data?.status === "submitted" && <button className={clientButtonClass} disabled={busy} onClick={() => void act("reviewed")}><Check size={16} />סמן נבדק</button>}
      </div>
    </header>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-[#087f72]">{notice}</p>}
    {!data ? <p className="border-y border-[#e4e7ec] py-8 text-sm text-[#667085]">טרם נוצר שאלון ללקוח הזה.</p> : <>
      <div className="flex flex-wrap gap-3 border-y border-[#e4e7ec] py-3 text-sm"><span className="rounded-md bg-[#eef3f7] px-2 py-1">{QUESTIONNAIRE_STATUS_LABELS[data.status]}</span>
        <span>{data.progress.answered} מתוך {data.progress.total} פריטים</span>{data.revokedAt && <span className="text-red-700">הקישור בוטל</span>}
        {data.linkExpiresAt && <span className="text-xs text-[#667085]">תוקף הקישור: {new Date(data.linkExpiresAt).toLocaleDateString("he-IL")}</span>}
      </div>
      {link && <div className="flex flex-wrap items-center gap-2"><input aria-label="קישור שאלון" readOnly value={link} dir="ltr" className="min-w-0 flex-1 rounded-md border border-[#e4e7ec] bg-white px-3 py-2 text-xs" />
        <button className={clientButtonClass} onClick={() => void copy()}><ClipboardCopy size={15} />העתק קישור</button></div>}
      {data.snapshot.warnings.map(warning => <p key={warning} className="text-xs text-[#667085]">{warning}</p>)}
      {data.preparation && <div className="flex gap-3 border-b border-[#e4e7ec]" role="tablist" aria-label="תוצאות שאלון">
        {([{ id: "questionnaire", label: "שאלות ותשובות" }, { id: "preparation", label: "הכנה לפגישה" }] as const).map(tab => <button key={tab.id} role="tab" aria-selected={view === tab.id} onClick={() => setView(tab.id)} className={`border-b-2 py-2 text-sm ${view === tab.id ? "border-[#087f72] font-bold" : "border-transparent text-[#667085]"}`}>{tab.label}</button>)}
      </div>}
      {view === "preparation" && data.preparation ? <div className="space-y-6">
        <p className="text-sm text-[#667085]">חומר הכנה בלבד. פערים לא הוכרעו והמידע אינו Brand Brain מאושר.</p>
        {Object.entries(data.preparation.groups).map(([key, entries]) => <section key={key} className="border-b border-[#e4e7ec] pb-4">
          <h3 className="text-base font-bold">{PREPARATION_LABELS[key as keyof typeof PREPARATION_LABELS]} <span className="text-xs font-normal text-[#667085]">{entries.length}</span></h3>
          {!entries.length && <p className="mt-2 text-xs text-[#667085]">אין פריטים.</p>}
          {entries.map(({ question, answer }) => <article key={question.id} className="mt-4 min-w-0 text-sm"><p className="font-bold">{question.label}</p><QuestionEvidence question={question} />
            <p className="mt-2 whitespace-pre-wrap break-words">{answer ? `${ANSWER_LABELS[answer.state]}${answer.priority === "high" ? " · עדיפות גבוהה" : ""}: ${answer.text || "—"}` : "טרם נענה"}</p>
          </article>)}
        </section>)}
        <section><h3 className="font-bold">נושאים לשיחה</h3><ul className="mt-2 list-inside list-disc space-y-2 text-sm">{data.preparation.topics.map(topic => <li key={topic}>{topic}</li>)}</ul></section>
      </div> : <div>
        {QUESTIONNAIRE_SECTIONS.map(section => {
          const questions = data.snapshot.items.filter(q => q.section === section.id && (data.status === "draft" || data.selectedIds.includes(q.id)));
          if (!questions.length) return null;
          return <section key={section.id} className="border-b border-[#e4e7ec] py-4"><h3 className="text-base font-bold">{section.label}</h3>
            {questions.map(question => <article key={question.id} className="mt-4 min-w-0 text-sm">
              <div className="flex items-start gap-2">{data.status === "draft" && <input aria-label={`כלול: ${question.label}`} type="checkbox" disabled={question.required || busy} checked={selection.includes(question.id)} onChange={event => setSelection(ids => event.target.checked ? [...ids, question.id] : ids.filter(id => id !== question.id))} className="mt-1 accent-[#087f72]" />}
                <p className="font-bold">{question.label}{question.required && <span className="mr-2 text-xs font-normal text-[#667085]">נדרש</span>}</p>
              </div>
              {question.source?.reviewDisposition === "needs_review" && <p className="mt-1 text-xs text-amber-700">ממצא לא פתור — אינו נכלל כברירת מחדל</p>}
              <QuestionEvidence question={question} />
              {data.answers[question.id] && <div className="mt-2 border-r-2 border-[#42dfcf] pr-3"><p className="text-xs text-[#087f72]">תשובת הלקוח · {ANSWER_LABELS[data.answers[question.id].state]}</p><p className="mt-1 whitespace-pre-wrap break-words">{data.answers[question.id].text}</p>
                {data.answers[question.id].links.map(href => <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[#087f72] underline" dir="ltr">{href}</a>)}
              </div>}
            </article>)}
          </section>;
        })}
      </div>}
    </>}
  </section>;
}
