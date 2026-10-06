"use client";
import { ExternalLink } from "lucide-react";
import { ANSWER_LABELS, editableQuestionnaireAnswer, safeReferenceUrl, type QuestionItem, type QuestionnaireAnswer } from "@/lib/questionnaire/core";
import { clientFieldClass } from "@/components/client-profile-form";

type DisplaySource = { authority: "website_observed" | "website_inferred"; url: string; evidence: string; confidence: string; unresolved?: boolean };
export type DisplayQuestion = Omit<QuestionItem, "source"> & { source?: DisplaySource };
export function QuestionEvidence({ question }: { question: { source?: DisplaySource; suggestion?: string } }) {
  if (!question.source) return null;
  const inferred = question.source.authority === "website_inferred";
  const url = safeReferenceUrl(question.source.url);
  return <div className="mt-2">
    <span className={`inline-flex rounded-md px-2 py-1 text-xs ${inferred ? "bg-[#fff9d8] text-[#475467]" : "bg-[#ecfdf9] text-[#087f72]"}`}>
      {inferred ? "השערה מהאתר — לא עובדה מאושרת" : "נצפה באתר — ממתין לאישור שלכם"}
    </span>
    {question.source.unresolved && <p className="mt-1 text-xs text-amber-700">מידע שעדיין דורש בירור</p>}
    {(question.suggestion?.length || 0) > 600 ? <details className="mt-2 text-sm"><summary className="cursor-pointer text-[#087f72]">הצג את הפרטים שנמצאו באתר</summary><p className="mt-2 whitespace-pre-wrap break-words leading-6">{question.suggestion}</p></details>
      : <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{question.suggestion}</p>}
    <details className="mt-2 text-xs text-[#667085]">
      <summary className="cursor-pointer">מקור וראיה</summary>
      <p className="mt-2">ודאות המקור: {({ high: "גבוהה", medium: "בינונית", low: "נמוכה" } as Record<string, string>)[question.source.confidence] || "לא הוגדרה"}</p>
      <blockquote className="mt-2 whitespace-pre-wrap break-words border-r-2 border-[#e4e7ec] pr-3 leading-5">{question.source.evidence}</blockquote>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-[#087f72] underline" dir="ltr">למקור באתר<ExternalLink size={12} /></a>}
    </details>
  </div>;
}
export type AnswerDraft = Omit<QuestionnaireAnswer, "updatedAt">;
export function QuestionnaireField({ question, answer, onChange, disabled = false }: {
  question: DisplayQuestion; answer?: QuestionnaireAnswer | AnswerDraft; onChange: (answer: AnswerDraft) => void; disabled?: boolean;
}) {
  const value: AnswerDraft = editableQuestionnaireAnswer(answer);
  const states = question.action === "confirm" ? ["confirmed", "partial", "corrected", "rejected", "unknown", "kickoff"] as const : ["answered", "unknown", "kickoff"] as const;
  return <fieldset disabled={disabled} className="min-w-0 border-b border-[#e4e7ec] py-5">
    <legend className="float-right w-full text-sm font-bold">{question.label}{question.required && <span className="mr-2 text-xs font-normal text-[#667085]">נדרש</span>}</legend>
    <div className="clear-both pt-1">
      <QuestionEvidence question={question} />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2" role="radiogroup" aria-label={`מצב: ${question.label}`}>
        {states.filter(state => state !== "answered").map(state => <label key={state} className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
          <input type="radio" name={question.id} checked={answer?.state === state} onChange={() => onChange({ ...value, state })} className="accent-[#087f72]" />{ANSWER_LABELS[state]}
        </label>)}
      </div>
      <label className="mt-3 block text-xs text-[#667085]">
        {question.action === "confirm" ? "התיקון או התוספת שלכם" : "התשובה שלכם"}
        <textarea aria-label={question.label} maxLength={4000} rows={3} value={value.text} onChange={event => onChange({ ...value, text: event.target.value,
          state: question.action === "ask" ? (event.target.value.trim() ? "answered" : "unknown") : (value.state === "confirmed" || value.state === "unknown" ? "corrected" : value.state) })}
          className={`${clientFieldClass} mt-1 resize-y leading-6`} />
      </label>
      {question.links && <label className="mt-2 block text-xs text-[#667085]">קישורים לחומרים (אחד בכל שורה, עד חמישה)
        <textarea aria-label="קישורים לחומרים" rows={2} dir="ltr" maxLength={10240} value={value.links.join("\n")} onChange={event => onChange({ ...value, links: event.target.value.split("\n").filter(Boolean) })} className={`${clientFieldClass} mt-1`} />
      </label>}
      {question.source && <label className="mt-2 flex items-center gap-2 text-xs text-[#667085]">עדיפות עכשיו
        <select aria-label={`עדיפות: ${question.label}`} value={value.priority} onChange={event => onChange({ ...value, priority: event.target.value as "normal" | "high" })} className="rounded-md border border-[#e4e7ec] bg-white px-2 py-1 text-xs">
          <option value="normal">רגילה</option><option value="high">גבוהה</option>
        </select>
      </label>}
    </div>
  </fieldset>;
}
