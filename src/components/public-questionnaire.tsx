"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, CheckCheck, RefreshCw } from "lucide-react";
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
      setSaveState("saved"); return true;
    };
    flight.current = run();
    try { return await flight.current; } finally { flight.current = null; }
  }, [send]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (Object.keys(pending.current).length || flight.current) { event.preventDefault(); event.returnValue = ""; } };
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
    setNavigating(true);
    try { if (await flush()) { setStep(target); window.scrollTo({ top: 0, behavior: "smooth" }); } }
    finally { setNavigating(false); }
  }
  async function submit() {
    if (submitting || navigating || closed) return;
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
  function confirmGroup() {
    for (const question of questions.filter(q => q.action === "confirm" && q.source?.authority === "website_observed" && !q.source.unresolved && q.source.confidence !== "low")) {
      if (!current.current?.answers[question.id]) update(question.id, { state: "confirmed", text: "", priority: "normal", links: [] });
    }
  }
  return <div className="min-h-screen bg-[#f5f7f8]" dir="rtl">
    <header className="border-b border-[#e4e7ec] bg-white px-5 py-4"><div className="mx-auto flex max-w-[780px] items-center justify-between gap-4">
      <div className="rounded-md bg-[#0b0623] px-3 py-2"><Image src="/addz-logo.svg" alt="addz" width={80} height={30} priority /></div>
      <span className="text-xs text-[#667085]">לקראת פגישת האפיון</span>
    </div></header>
    <main className="mx-auto max-w-[780px] px-5 py-7 pb-32 sm:py-10 sm:pb-32">
      {loading ? <p role="status">טוען שאלון...</p> : !data ? <div role="alert" className="py-10"><h1 className="text-xl font-bold">הקישור אינו זמין</h1><p className="mt-3 text-sm text-[#667085]">{error || "אפשר לבקש מצוות ADDZ קישור מעודכן."}</p></div> : <>
        <div className="mb-6"><p className="text-xs font-bold text-[#087f72]">{data.clientName}</p><h1 className="mt-2 text-2xl font-bold">{closed ? "תודה, המידע התקבל" : step < 0 ? "מתחילים ממה שכבר למדנו" : section?.label}</h1>
          {closed ? <p className="mt-3 text-sm leading-6 text-[#667085]">צוות ADDZ ייעזר באישורים ובהשלמות שלכם כדי להתכונן לפגישה. התשובות נשמרו והשאלון סגור לעריכה.</p> : <>
            <div className="mt-4 flex justify-between gap-3 text-xs text-[#667085]"><span>{data.progress.answered} מתוך {data.progress.total} פריטים נשמרו</span><span role="status">{({ saved: "כל השינויים נשמרו", pending: "ממתין לשמירה", saving: "שומר...", error: "השמירה לא הושלמה" })[saveState]}</span></div>
            <progress aria-label="התקדמות השאלון" value={data.progress.percent} max={100} className="mt-2 h-1.5 w-full accent-[#087f72]" />
            {step >= 0 && <p className="mt-2 text-xs text-[#667085]">שלב {step + 1} מתוך {sections.length}</p>}
          </>}
        </div>
        {error && <div role="alert" className="mb-4 text-sm text-red-700"><p>{error}</p>{saveState === "error" && <button className={`${clientButtonClass} mt-2`} onClick={() => void flush()}><RefreshCw size={14} />נסה לשמור שוב</button>}</div>}
        {closed ? <div className="space-y-4">{data.items.map(question => <section key={question.id} className="border-b border-[#e4e7ec] pb-4"><h2 className="text-sm font-bold">{question.label}</h2><QuestionEvidence question={question} />
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{data.answers[question.id] ? `${ANSWER_LABELS[data.answers[question.id].state]}: ${data.answers[question.id].text || "—"}` : "לא נענה"}</p>
        </section>)}</div> : step < 0 ? <div className="space-y-5 text-sm leading-7">
          <p>כבר עברנו על האתר והעסק שלכם. כאן תוכלו לאשר מה שהבנו, לתקן מה שהשתנה ולהשלים את מה שרק אתם יודעים.</p>
          <p>לא צריך לבנות אסטרטגיה או לנסח מסרים מקצועיים. אם משהו עדיין לא ברור, אפשר לסמן ״נדבר בפגישה״.</p>
          <p className="text-[#667085]">התשובות נשמרות אוטומטית. אפשר לצאת ולחזור באותו קישור.</p>
        </div> : <div>
          {section?.id === "known" && questions.some(q => q.source?.authority === "website_observed") && <button className={clientButtonClass} onClick={confirmGroup}><CheckCheck size={16} />אשר את המידע הישיר שטרם נענה</button>}
          {questions.map(question => <QuestionnaireField key={question.id} question={question} answer={data.answers[question.id]} disabled={submitting || navigating} onChange={answer => update(question.id, answer)} />)}
        </div>}
      </>}
    </main>
    {data && !closed && <footer className="fixed inset-x-0 bottom-0 border-t border-[#e4e7ec] bg-white px-5 py-4"><div className="mx-auto flex max-w-[780px] items-center justify-between gap-3">
      {step >= 0 ? <button className={clientButtonClass} disabled={submitting || navigating} onClick={() => void move(step - 1)}><ArrowRight size={16} />הקודם</button> : <span className="text-xs text-[#667085]">כ־{Math.max(4, Math.ceil(data.items.length / 3))} דקות</span>}
      {step < sections.length - 1 ? <button className={clientPrimaryClass} disabled={submitting || navigating} onClick={() => void move(step + 1)}>{step < 0 ? "נתחיל" : "המשך"}<ArrowLeft size={16} /></button>
        : <button className={clientPrimaryClass} disabled={submitting || navigating} onClick={() => void submit()}><Check size={16} />{submitting ? "שולח..." : "שלח ל־ADDZ"}</button>}
    </div></footer>}
  </div>;
}
