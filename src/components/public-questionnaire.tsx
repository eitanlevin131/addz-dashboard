"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, ChevronDown, LockKeyhole, RefreshCw } from "lucide-react";
import { ANSWER_LABELS, QUESTIONNAIRE_SECTIONS, type publicProjection } from "@/lib/questionnaire/core";
import { QuestionnaireField, QuestionEvidence, type AnswerDraft } from "./questionnaire-fields";
import { clientButtonClass, clientPrimaryClass } from "./client-profile-form";

type PublicData = ReturnType<typeof publicProjection>;
export function PublicQuestionnaire() {
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(-1);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const incomplete = useRef(new Set<string>());
  const token = useRef("");
  const current = useRef<PublicData | null>(null);
  const pending = useRef<Record<string, AnswerDraft>>({});
  const flight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closed = Boolean(data && ["submitted", "reviewed"].includes(data.status));
  const send = useCallback(async (method: "GET" | "PATCH", body?: unknown) => {
    const response = await fetch("/api/public/questionnaire", { method, cache: "no-store", headers: { Authorization: `Bearer ${token.current}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "לא ניתן לטעון את השאלון.");
    return payload.data as PublicData;
  }, []);
  useEffect(() => {
    token.current = location.hash.slice(1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token.current)) { setError("הקישור אינו זמין."); setLoading(false); return; }
    void send("GET").then(result => { current.current = result; setData(result); }).catch(cause => setError(cause.message)).finally(() => setLoading(false));
  }, [send]);
  const flush = useCallback(async (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (!current.current || !Object.keys(pending.current).length) return true;
    const run = async () => {
      while (Object.keys(pending.current).length) {
        const changes = pending.current; pending.current = {};
        setSaveState("saving");
        try {
          const result = await send("PATCH", { revision: current.current!.revision, answers: changes });
          const unsaved = pending.current;
          const merged = { ...result, answers: { ...result.answers } };
          for (const [id, answer] of Object.entries(unsaved)) merged.answers[id] = { ...answer, updatedAt: new Date().toISOString() };
          current.current = merged; setData(merged); setError("");
        } catch (cause) {
          pending.current = { ...changes, ...pending.current };
          setError(cause instanceof Error ? cause.message : "השמירה נכשלה."); setSaveState("error"); return false;
        }
      }
      setSaveState(incomplete.current.size ? "pending" : "saved"); return true;
    };
    flight.current = run();
    try { return await flight.current; } finally { flight.current = null; }
  }, [send]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (Object.keys(pending.current).length || flight.current || incomplete.current.size) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => { window.removeEventListener("beforeunload", guard); if (timer.current) clearTimeout(timer.current); };
  }, []);
  function update(id: string, answer: AnswerDraft) {
    if (!current.current || closed) return;
    pending.current[id] = answer;
    const next = { ...current.current, answers: { ...current.current.answers, [id]: { ...answer, updatedAt: new Date().toISOString() } } };
    current.current = next; setData(next); setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 900);
  }
  async function move(target: number) {
    if (navigating || submitting) return;
    if (incomplete.current.size) { setError("השלימו את התיקון הפתוח או בחרו מצב אחר לפני המעבר."); return; }
    setNavigating(true);
    try { if (await flush()) { setOpenQuestion(null); setStep(target); window.scrollTo({ top: 0, behavior: "smooth" }); } }
    finally { setNavigating(false); }
  }
  async function submit() {
    if (submitting || navigating || closed) return;
    if (incomplete.current.size) { setError("השלימו את התיקון הפתוח לפני השליחה."); return; }
    setSubmitting(true);
    try {
      if (!await flush()) return;
      const result = await send("PATCH", { revision: current.current!.revision, answers: {}, submit: true });
      current.current = result; setData(result); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "שליחת השאלון נכשלה."); }
    finally { setSubmitting(false); }
  }
  const sections = QUESTIONNAIRE_SECTIONS.filter(section => data?.items.some(q => q.section === section.id));
  const section = sections[step];
  const questions = data?.items.filter(q => q.section === section?.id) || [];
  async function selectQuestion(id: string) {
    if (navigating || submitting) return;
    if (incomplete.current.size) { setError("השלימו את התיקון הפתוח או בחרו מצב אחר לפני המעבר."); return; }
    setNavigating(true);
    try { if (await flush()) setOpenQuestion(id); } finally { setNavigating(false); }
  }
  return <div className="min-h-screen bg-[#f5f7f8]" dir="rtl">
    <header className="bg-[#080e2d] px-5 py-5"><div className="mx-auto flex max-w-[880px] items-center justify-between gap-4">
      <Image src="/addz-logo.svg" alt="addz" width={112} height={43} priority />
      <span className="text-xs text-white/75">לקראת פגישת האפיון</span>
    </div></header>
    <main className="mx-auto max-w-[880px] px-5 py-7 pb-32 sm:py-10 sm:pb-32">
      {loading ? <p role="status">טוען שאלון...</p> : !data ? <div role="alert" className="py-10"><h1 className="text-xl font-bold">הקישור אינו זמין</h1><p className="mt-3 text-sm text-[#667085]">{error || "אפשר לבקש מצוות ADDZ קישור מעודכן."}</p></div> : <>
        <div className="mb-6"><p className="text-xs font-bold text-[#087f72]">{data.clientName}</p><h1 className="mt-2 text-2xl font-bold">{closed ? "תודה, המידע התקבל" : step < 0 ? "מתחילים ממה שכבר למדנו" : section?.label}</h1>
          {step < 0 && data.catalogContext && data.catalogContext.catalogued > 0 && <p className="mt-3 text-sm leading-6 text-[#475467]">קראנו מידע על {data.catalogContext.catalogued} מוצרים מהקטלוג, ובדקנו לעומק {data.catalogContext.deeplyRead} עמודי מוצרים. נבקש להתייחס רק לדוגמאות ולסדרי העדיפויות, לא לאשר כל מוצר בנפרד.</p>}
          {closed ? <p className="mt-3 text-sm leading-6 text-[#667085]">צוות ADDZ ייעזר באישורים ובהשלמות שלכם כדי להתכונן לפגישה. התשובות נשמרו והשאלון סגור לעריכה.</p> : <>
            <div className="mt-4 flex justify-between gap-3 text-xs text-[#667085]"><span>{data.progress.answered} מתוך {data.progress.total} פריטים נשמרו</span><span role="status">{({ saved: "כל השינויים נשמרו", pending: "ממתין לשמירה", saving: "שומר...", error: "השמירה לא הושלמה" })[saveState]}</span></div>
            <progress aria-label="התקדמות השאלון" value={data.progress.percent} max={100} className="mt-2 h-1.5 w-full accent-[#087f72]" />
            {step >= 0 && <label className="mt-4 block text-xs text-[#667085] sm:hidden">תחום בשאלון
              <select aria-label="תחום בשאלון" value={step} disabled={submitting || navigating} onChange={event => void move(Number(event.target.value))} className="mt-1 h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#101828]">{sections.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.label}</option>)}</select>
            </label>}
            {step >= 0 && <nav aria-label="תחומי האפיון" className="mt-5 hidden flex-wrap gap-2 sm:flex">{sections.map((item, index) => {
              const items = data.items.filter(q => q.section === item.id);
              const complete = items.every(q => data.answers[q.id]);
              return <button key={item.id} aria-label={`עבור אל ${item.label}`} aria-current={index === step ? "step" : undefined} disabled={submitting || navigating} onClick={() => void move(index)} className={`inline-flex items-center gap-1.5 border-b-2 px-2 py-2 text-xs ${index === step ? "border-[#087f72] font-semibold text-[#087f72]" : "border-transparent text-[#667085] hover:text-[#101828]"}`}>{complete ? <Check size={13} /> : <span>{index + 1}.</span>}{item.label}</button>;
            })}</nav>}
          </>}
        </div>
        {error && <div role="alert" className="mb-4 text-sm text-red-700"><p>{error}</p>{saveState === "error" && <button className={`${clientButtonClass} mt-2`} onClick={() => void flush()}><RefreshCw size={14} />נסה לשמור שוב</button>}</div>}
        {closed ? <div className="space-y-4">{data.items.map(question => <section key={question.id} className="border-b border-[#e4e7ec] pb-4"><h2 className="text-sm font-bold">{question.label}</h2><QuestionEvidence question={question} />
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{data.answers[question.id] ? `${ANSWER_LABELS[data.answers[question.id].state]}: ${data.answers[question.id].text || "—"}` : "לא נענה"}</p>
        </section>)}</div> : step < 0 ? <div className="text-base leading-7 text-[#344054]">
          <p className="max-w-xl">רוצים להכיר את העסק שלכם מעבר לאתר. נתחיל במה שמצאנו, ונשלים יחד את הקהל, סדרי העדיפויות והפרטים שחשובים לכם.</p>
          <ol className="mt-7 divide-y divide-[#e4e7ec] border-y border-[#e4e7ec]">{[
            ["מדייקים את מה שמצאנו", "פרטים מהאתר והשערות לבדיקה, עם אפשרות לתקן כל דבר."],
            ["מכירים את העסק מבפנים", "מה כדאי לקדם, מי הלקוחות ומה מייחד אתכם."],
            ["מגיעים מוכנים לפגישה", "כל מה שעוד פתוח יכול להישאר לשיחה עם צוות ADDZ."],
          ].map(([title, description], index) => <li key={title} className="flex gap-4 py-5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#080e2d] text-sm text-white">{index + 1}</span><div><h2 className="text-base font-semibold text-[#101828]">{title}</h2><p className="mt-1 text-sm text-[#667085]">{description}</p></div></li>)}</ol>
          <p className="mt-5 flex items-center gap-2 text-sm text-[#667085]"><LockKeyhole size={15} />התשובות נשמרות אוטומטית. אפשר לחזור באותו קישור.</p>
        </div> : <div className="space-y-3">
          <p className="mb-4 text-sm text-[#667085]">{section?.id === "known" ? "בדקו את הפרטים שמצאנו. המוצרים הם דוגמאות מהאתר, לא רשימת הקטלוג המלאה." : "מעניין אותנו לשמוע את נקודת המבט שלכם. אפשר להשאיר נושא פתוח לפגישה."}</p>
          {questions.map((question, index) => {
            const active = question.id === (openQuestion || questions[0]?.id);
            const answer = data.answers[question.id];
            return <section key={question.id} className={`overflow-hidden rounded-lg border bg-white ${active ? "border-[#b4dcd6]" : "border-[#e4e7ec]"}`}>
              <button type="button" aria-label={`פתח שאלה: ${question.label}`} aria-expanded={active} aria-controls={`question-${question.id}`} disabled={submitting || navigating} onClick={() => void selectQuestion(question.id)} className="flex w-full items-center gap-3 px-4 py-4 text-start sm:px-6">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${answer ? "bg-[#ecfdf9] text-[#087f72]" : "bg-[#f2f4f7] text-[#667085]"}`}>{answer ? <Check size={14} /> : index + 1}</span>
                <span className="min-w-0 flex-1 break-words text-sm font-medium">{question.label}</span>
                {answer && <span className="shrink-0 text-xs text-[#087f72]">{ANSWER_LABELS[answer.state]}</span>}<ChevronDown size={16} className={`shrink-0 text-[#667085] ${active ? "rotate-180" : ""}`} />
              </button>
              {active && <div id={`question-${question.id}`} className="border-t border-[#eef0f3] px-4 py-5 sm:px-6">
                <QuestionnaireField key={question.id} question={question} answer={answer} disabled={submitting || navigating} onIncompleteChange={(id, invalid) => { if (invalid) { incomplete.current.add(id); setSaveState("pending"); } else { incomplete.current.delete(id); setError(""); } }} onChange={value => update(question.id, value)} />
                {index < questions.length - 1 && <button className={`${clientButtonClass} mt-5`} disabled={submitting || navigating} onClick={() => void selectQuestion(questions[index + 1].id)}>לשאלה הבאה<ArrowLeft size={15} /></button>}
              </div>}
            </section>;
          })}
        </div>}
      </>}
    </main>
    {data && !closed && <footer className="fixed inset-x-0 bottom-0 border-t border-[#e4e7ec] bg-white px-5 py-4"><div className="mx-auto flex max-w-[880px] items-center justify-between gap-3">
      {step >= 0 ? <button className={clientButtonClass} disabled={submitting || navigating} onClick={() => void move(step - 1)}><ArrowRight size={16} />הקודם</button> : <span className="text-xs text-[#667085]">כ־{Math.max(4, Math.ceil(data.items.length / 3))} דקות</span>}
      {step < sections.length - 1 ? <button className={clientPrimaryClass} disabled={submitting || navigating} onClick={() => void move(step + 1)}>{step < 0 ? "נתחיל" : "המשך"}<ArrowLeft size={16} /></button>
        : <button className={clientPrimaryClass} disabled={submitting || navigating} onClick={() => void submit()}><Check size={16} />{submitting ? "שולח..." : "שלח ל־ADDZ"}</button>}
    </div></footer>}
  </div>;
}
