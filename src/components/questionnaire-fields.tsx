"use client";
import { useState } from "react";
import { Check, CircleHelp, ExternalLink, MessageCircle, Pencil, X } from "lucide-react";
import { ANSWER_LABELS, editableQuestionnaireAnswer, safeReferenceUrl, type QuestionItem, type QuestionnaireAnswer } from "@/lib/questionnaire/core";
import { answerNeedsText, type QuestionPresentation } from "@/lib/questionnaire/presentation";

type DisplaySource = { authority: "website_observed" | "website_inferred"; url: string; evidence: string; confidence: string; unresolved?: boolean };
export type DisplayQuestion = Omit<QuestionItem, "source"> & { source?: DisplaySource; presentation?: QuestionPresentation };
export function QuestionEvidence({ question }: { question: { source?: DisplaySource; suggestion?: string; presentation?: QuestionPresentation } }) {
  if (!question.source) return null;
  const inferred = question.source.authority === "website_inferred";
  const url = safeReferenceUrl(question.source.url);
  const text = question.presentation ? question.presentation.text : question.suggestion;
  return <div className="mt-3">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={`inline-flex rounded px-2 py-1 ${inferred ? "bg-[#f0ebfa] text-[#65519d]" : "bg-[#ecfdf9] text-[#087f72]"}`}>
        {inferred ? "השערה מהאתר — לא עובדה מאושרת" : "נצפה באתר — ממתין לאישור שלכם"}
      </span>
      {question.source.unresolved && <span className="text-amber-700">דורש בירור</span>}
    </div>
    {Boolean(question.presentation?.facts.length) && <dl className="mt-4 divide-y divide-[#e4e7ec]">{question.presentation!.facts.map((fact, index) => <div key={`${fact.label}:${index}`} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2.5 text-sm"><dt className="text-[#667085]">{fact.label}</dt><dd dir="auto" className="break-words font-medium">{fact.value}</dd></div>)}</dl>}
    {text && (text.length > 420 ? <details className="mt-4 rounded-md border border-[#e4e7ec] bg-[#f8fafb] p-3 text-sm"><summary className="cursor-pointer font-medium text-[#344054]">לקריאת הפרטים המלאים מהאתר</summary><p dir="auto" className="mt-3 whitespace-pre-wrap break-words leading-7">{text}</p></details>
      : <p dir="auto" className="mt-4 whitespace-pre-wrap break-words text-base leading-7 text-[#344054]">{text}</p>)}
    <div className="mt-3 flex flex-wrap items-start justify-between gap-3 text-xs text-[#667085]">
      <details className="min-w-0 flex-1"><summary className="cursor-pointer">על מה זה מבוסס?</summary>
        <p className="mt-2">ודאות המקור: {({ high: "גבוהה", medium: "בינונית", low: "נמוכה" } as Record<string, string>)[question.source.confidence] || "לא הוגדרה"}</p>
        <blockquote dir="auto" className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words border-s-2 border-[#e4e7ec] ps-3 leading-6">{question.source.evidence}</blockquote>
      </details>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[#087f72] underline">למקור באתר<ExternalLink size={12} /></a>}
    </div>
  </div>;
}
export type AnswerDraft = Omit<QuestionnaireAnswer, "updatedAt">;
const inputClass = "w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-3 text-base text-[#101828] outline-none focus:border-[#087f72] focus:ring-2 focus:ring-[#087f72]/15 disabled:opacity-60";
const icons = { confirmed: Check, partial: Pencil, corrected: Pencil, rejected: X, unknown: CircleHelp, kickoff: MessageCircle };
export function QuestionnaireField({ question, answer, onChange, onIncompleteChange, disabled = false }: {
  question: DisplayQuestion; answer?: QuestionnaireAnswer | AnswerDraft; onChange: (answer: AnswerDraft) => void;
  onIncompleteChange?: (id: string, incomplete: boolean) => void; disabled?: boolean;
}) {
  const [draft, setDraft] = useState<AnswerDraft>(() => editableQuestionnaireAnswer(answer));
  const [chosen, setChosen] = useState(Boolean(answer));
  const states = question.action === "confirm" ? ["confirmed", "corrected", "partial", "rejected", "unknown", "kickoff"] as const : ["unknown", "kickoff"] as const;
  function change(next: AnswerDraft) {
    setDraft(next); setChosen(true);
    const incomplete = answerNeedsText(next.state) && !next.text.trim();
    onIncompleteChange?.(question.id, incomplete);
    if (!incomplete) onChange(next);
  }
  const showText = question.action === "ask" || chosen && ["partial", "corrected", "rejected", "kickoff"].includes(draft.state);
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="w-full text-lg font-semibold leading-7 text-[#101828]">{question.presentation?.prompt || question.label}{question.required && <span className="ms-2 text-xs font-normal text-[#667085]">נדרש</span>}</legend>
    <QuestionEvidence question={question} />
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={`מצב: ${question.label}`}>
      {states.map(state => { const Icon = icons[state]; const selected = chosen && draft.state === state; return <label key={state} className={`relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-[#087f72] ${selected ? "border-[#087f72] bg-[#ecfdf9] font-medium text-[#087f72]" : "border-[#e4e7ec] bg-white text-[#475467] hover:bg-[#f8fafb]"}`}>
        <input type="radio" name={question.id} checked={selected} onChange={() => change({ ...draft, state })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /><Icon size={15} aria-hidden="true" />{ANSWER_LABELS[state]}
      </label>; })}
    </div>
    {showText && <label className="mt-4 block text-sm font-medium text-[#344054]">
      {question.action === "confirm" ? draft.state === "rejected" ? "מה נכון במקום? (אפשר להשאיר ריק)" : draft.state === "kickoff" ? "מה תרצו לברר בפגישה? (לא חובה)" : "מה צריך לשנות או להשלים?" : "התשובה שלכם"}
      <textarea aria-label={question.label} maxLength={4000} rows={4} value={draft.text} placeholder={question.action === "confirm" ? "כתבו את הפרטים המדויקים במילים שלכם" : "מה חשוב שנדע?"} onChange={event => change({ ...draft, text: event.target.value,
        state: question.action === "ask" ? (event.target.value.trim() ? "answered" : "unknown") : draft.state })} className={`${inputClass} mt-2 min-h-28 resize-y leading-7`} />
      {chosen && answerNeedsText(draft.state) && !draft.text.trim() && <span className="mt-2 block text-xs text-amber-800">הוסיפו את התיקון כדי שנוכל לשמור אותו ולהמשיך.</span>}
    </label>}
    {question.links && <label className="mt-4 block text-sm font-medium text-[#344054]">קישורים לחומרים (אחד בכל שורה, עד חמישה)
      <textarea aria-label="קישורים לחומרים" rows={2} dir="ltr" maxLength={10240} value={draft.links.join("\n")} onChange={event => change({ ...draft, links: event.target.value.split("\n").filter(Boolean) })} className={`${inputClass} mt-2 resize-y`} />
    </label>}
    {question.source && chosen && <label className="mt-4 flex items-center gap-2 text-xs text-[#667085]">
      <input type="checkbox" checked={draft.priority === "high"} onChange={event => change({ ...draft, priority: event.target.checked ? "high" : "normal" })} className="accent-[#087f72]" />חשוב לי להתמקד בזה בפגישה
    </label>}
  </fieldset>;
}
