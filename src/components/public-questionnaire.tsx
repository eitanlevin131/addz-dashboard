"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, ChevronDown, LockKeyhole, RefreshCw } from "lucide-react";
import { ANSWER_LABELS, QUESTIONNAIRE_SECTIONS, type publicProjection } from "@/lib/questionnaire/core";
import { QuestionnaireField, QuestionEvidence, type AnswerDraft } from "./questionnaire-fields";
import { clientButtonClass, clientPrimaryClass } from "./client-profile-form";
import { answerIsComplete, firstUnanswered } from "@/lib/questionnaire/presentation";
import type { QuestionnaireAttachment } from "@/lib/questionnaire/attachments";
import { QuestionnaireAttachments } from "./questionnaire-attachments";

type PublicData = ReturnType<typeof publicProjection>;
export function PublicQuestionnaire() {
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(-1);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [uploading, setUploading] = useState(false);
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
  function requireAnswers(items: PublicData["items"]) {
    const missing = firstUnanswered(items, current.current?.answers || {});
    if (!missing) return true;
    setError("לפני שממשיכים, ענו על השאלה הפתוחה. אם אין לכם תשובה כרגע, אפשר לבחור 'עדיין לא ידוע' או 'נדבר בפגישה'.");
    setStep(sections.findIndex(section => section.id === missing.section));
    setOpenQuestion(missing.id);
    return false;
  }
  async function move(target: number) {
    if (navigating || submitting || uploading) return;
    if (incomplete.current.size) { setError("השלימו את התיקון הפתוח או בחרו מצב אחר לפני המעבר."); return; }
    if (target > step && !requireAnswers((current.current?.items || []).filter(question => sections.findIndex(section => section.id === question.section) < target))) return;
    setNavigating(true);
    try { if (await flush()) { setError(""); setOpenQuestion(null); setStep(target); window.scrollTo({ top: 0, behavior: "smooth" }); } }
    finally { setNavigating(false); }
  }
  async function submit() {
    if (submitting || navigating || uploading || closed) return;
    if (incomplete.current.size) { setError("השלימו את התיקון הפתוח לפני השליחה."); return; }
    if (!requireAnswers(current.current?.items || [])) return;
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
    if (navigating || submitting || uploading) return;
    if (incomplete.current.size) { setError("השלימו את התיקון הפתוח או בחרו מצב אחר לפני המעבר."); return; }
    const target = questions.findIndex(question => question.id === id);
    const active = questions.findIndex(question => question.id === (openQuestion || questions[0]?.id));
    if (target > active && !requireAnswers(questions.slice(0, target))) return;
    setNavigating(true);
    try { if (await flush()) { setError(""); setOpenQuestion(id); } } finally { setNavigating(false); }
  }
  async function uploadAttachment(file: File, progress: (percentage: number) => void): Promise<QuestionnaireAttachment> {
    const headers = { Authorization: `Bearer ${token.current}`, "content-type": "application/json" };
    const request = async (method: string, body: unknown) => {
      const response = await fetch("/api/public/questionnaire/attachments", { method, headers, body: JSON.stringify(body), cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "העלאת הקובץ נכשלה.");
      return payload.data;
    };
    const permission = await request("POST", { name: file.name, size: file.size });
    const { upload } = await import("@vercel/blob/client");
    const blob = await upload(permission.pathname, file, { access: "private", contentType: permission.contentType,
      handleUploadUrl: "/api/public/questionnaire/upload", headers: { Authorization: headers.Authorization },
      onUploadProgress: ({ percentage }) => progress(Math.round(percentage)) });
    return request("PATCH", { pathname: blob.pathname, name: file.name, size: file.size });
  }
  async function downloadAttachment(file: QuestionnaireAttachment) {
    const response = await fetch(`/api/public/questionnaire/attachments?pathname=${encodeURIComponent(file.pathname)}`, { headers: { Authorization: `Bearer ${token.current}` }, cache: "no-store" });
    if (!response.ok) throw new Error("download_failed");
    const href = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = file.name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  }
  return <div className="min-h-screen bg-[#f5f7f8]" dir="rtl">
    <header className="bg-[#080e2d] px-5 py-5"><div className="mx-auto flex max-w-[880px] items-center justify-between gap-4">
      <Image src="/addz-logo.svg" alt="addz" width={112} height={43} priority />
      <span className="text-xs text-white/75">לקראת פגישת האפיון</span>
    </div></header>
    <main className="mx-auto max-w-[880px] px-5 py-7 pb-32 sm:py-10 sm:pb-32">
      {loading ? <p role="status">טוען שאלון...</p> : !data ? <div role="alert" className="py-10"><h1 className="text-xl font-bold">הקישור אינו זמין</h1><p className="mt-3 text-sm text-[#667085]">{error || "אפשר לבקש מצוות ADDZ קישור מעודכן."}</p></div> : <>
        <div className="mb-6"><h1 className="text-2xl font-bold">{closed ? "תודה, המידע התקבל" : step < 0 ? "לקראת פגישת האפיון עם איתן" : section?.label}</h1>
          {closed ? <p className="mt-3 text-sm leading-6 text-[#667085]">צוות ADDZ ייעזר באישורים ובהשלמות שלכם כדי להתכונן לפגישה. התשובות נשמרו והשאלון סגור לעריכה.</p> : <>
            {step >= 0 && <><div className="mt-4 flex justify-between gap-3 text-xs text-[#667085]"><span>{data.progress.answered} מתוך {data.progress.total} שאלות נשמרו</span><span role="status">{({ saved: "כל השינויים נשמרו", pending: "ממתין לשמירה", saving: "שומר...", error: "השמירה לא הושלמה" })[saveState]}</span></div>
            <progress aria-label="התקדמות השאלון" value={data.progress.percent} max={100} className="mt-2 h-1.5 w-full accent-[#087f72]" /></>}
            {step >= 0 && <label className="mt-4 block text-xs text-[#667085] sm:hidden">תחום בשאלון
              <select aria-label="תחום בשאלון" value={step} disabled={submitting || navigating || uploading} onChange={event => void move(Number(event.target.value))} className="mt-1 h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#101828]">{sections.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.label}</option>)}</select>
            </label>}
            {step >= 0 && <nav aria-label="תחומי האפיון" className="mt-5 hidden flex-wrap gap-2 sm:flex">{sections.map((item, index) => {
              const items = data.items.filter(q => q.section === item.id);
              const complete = items.every(q => answerIsComplete(q, data.answers[q.id]));
              return <button key={item.id} aria-label={`עבור אל ${item.label}`} aria-current={index === step ? "step" : undefined} disabled={submitting || navigating || uploading} onClick={() => void move(index)} className={`inline-flex items-center gap-1.5 border-b-2 px-2 py-2 text-xs ${index === step ? "border-[#087f72] font-semibold text-[#087f72]" : "border-transparent text-[#667085] hover:text-[#101828]"}`}>{complete ? <Check size={13} /> : <span>{index + 1}.</span>}{item.label}</button>;
            })}</nav>}
          </>}
        </div>
        {error && <div role="alert" className="mb-4 text-sm text-red-700"><p>{error}</p>{saveState === "error" && <button className={`${clientButtonClass} mt-2`} onClick={() => void flush()}><RefreshCw size={14} />נסה לשמור שוב</button>}</div>}
        {closed ? <div className="space-y-4">{data.items.map(question => <section key={question.id} className="border-b border-[#e4e7ec] pb-4"><h2 className="text-sm font-bold">{question.label}</h2><QuestionEvidence question={question} />
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{data.answers[question.id] ? `${ANSWER_LABELS[data.answers[question.id].state]}: ${data.answers[question.id].text || "—"}` : "לא נענה"}</p>
          {!!data.answers[question.id]?.attachments?.length && <QuestionnaireAttachments files={data.answers[question.id].attachments!} onDownload={downloadAttachment} />}
        </section>)}</div> : step < 0 ? <div className="text-base leading-7 text-[#344054]">
          <p className="max-w-2xl">כבר עברנו על האתר שלכם והתחלנו להכיר את העסק. השאלון יעזור לכם לאשר או לתקן את המידע שמצאנו, ולהוסיף את מה שלא ניתן ללמוד מהאתר — כדי שנגיע מוכנים לפגישת האפיון עם איתן.</p>
          <p className="mt-5 flex items-center gap-2 text-sm text-[#667085]"><LockKeyhole size={15} />התשובות נשמרות אוטומטית. אפשר לחזור באותו קישור.</p>
        </div> : <div className="space-y-3">
          <p className="mb-4 text-sm text-[#667085]">{section?.id === "known" ? "אשרו את המידע שמצאנו באתר, או כתבו מה צריך לתקן." : "התשובות שלכם יעזרו לנו להתכונן לפגישה."}</p>
          {questions.map((question, index) => {
            const active = question.id === (openQuestion || questions[0]?.id);
            const answer = data.answers[question.id];
            return <section key={question.id} className={`overflow-hidden rounded-lg border bg-white ${active ? "border-[#b4dcd6]" : "border-[#e4e7ec]"}`}>
              <button type="button" aria-label={`פתח שאלה: ${question.label}`} aria-expanded={active} aria-controls={`question-${question.id}`} disabled={submitting || navigating || uploading} onClick={() => void selectQuestion(question.id)} className="flex w-full items-center gap-3 px-4 py-4 text-start sm:px-6">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${answer ? "bg-[#ecfdf9] text-[#087f72]" : "bg-[#f2f4f7] text-[#667085]"}`}>{answer ? <Check size={14} /> : index + 1}</span>
                <span className="min-w-0 flex-1 break-words text-base font-semibold leading-7">{question.presentation?.prompt || question.label}{question.required && <span className="ms-2 text-xs font-normal text-[#667085]">נדרש</span>}</span>
                {answer && <span className="shrink-0 text-xs text-[#087f72]">{ANSWER_LABELS[answer.state]}</span>}<ChevronDown size={16} className={`shrink-0 text-[#667085] ${active ? "rotate-180" : ""}`} />
              </button>
              {active && <div id={`question-${question.id}`} className="border-t border-[#eef0f3] px-4 py-5 sm:px-6">
                <QuestionnaireField key={question.id} question={question} answer={answer} hideLegend disabled={submitting || navigating || uploading}
                  uploadsAvailable={data.uploadsAvailable} onUpload={uploadAttachment} onDownload={downloadAttachment} onBusyChange={setUploading}
                  onIncompleteChange={(id, invalid) => { if (invalid) { incomplete.current.add(id); setSaveState("pending"); } else { incomplete.current.delete(id); setError(""); } }} onChange={value => update(question.id, value)} />
                {index < questions.length - 1 && <button className={`${clientButtonClass} mt-5`} disabled={submitting || navigating || uploading} onClick={() => void selectQuestion(questions[index + 1].id)}>לשאלה הבאה<ArrowLeft size={15} /></button>}
              </div>}
            </section>;
          })}
        </div>}
      </>}
    </main>
    {data && !closed && <footer className="fixed inset-x-0 bottom-0 border-t border-[#e4e7ec] bg-white px-5 py-4"><div className="mx-auto flex max-w-[880px] items-center justify-between gap-3">
      {step >= 0 ? <button className={clientButtonClass} disabled={submitting || navigating || uploading} onClick={() => void move(step - 1)}><ArrowRight size={16} />הקודם</button> : <span className="text-xs text-[#667085]">כ־{Math.max(4, Math.ceil(data.items.length / 3))} דקות</span>}
      {step < sections.length - 1 ? <button className={clientPrimaryClass} disabled={submitting || navigating || uploading} onClick={() => void move(step + 1)}>{step < 0 ? "נתחיל" : "המשך"}<ArrowLeft size={16} /></button>
        : <button className={clientPrimaryClass} disabled={submitting || navigating || uploading} onClick={() => void submit()}><Check size={16} />{submitting ? "שולח..." : "שלח ל־ADDZ"}</button>}
    </div></footer>}
  </div>;
}
