"use client";
import { useState } from "react";
import { Check, CircleHelp, ExternalLink, MessageCircle, Pencil, Upload, X } from "lucide-react";
import { ANSWER_LABELS, editableQuestionnaireAnswer, safeReferenceUrl, type QuestionItem, type QuestionnaireAnswer } from "@/lib/questionnaire/core";
import { answerIsComplete, questionPresentation, type QuestionPresentation } from "@/lib/questionnaire/presentation";
import { readableSourceBlocks } from "@/lib/questionnaire/readable-source";
import { attachmentFileError, QUESTIONNAIRE_FILE_COUNT, type QuestionnaireAttachment } from "@/lib/questionnaire/attachments";
import { QuestionnaireAttachments } from "./questionnaire-attachments";
import { rankedAnswerError, rankedAnswerText, rankedAnswerValues, RANKED_ENTRY_LIMIT } from "@/lib/questionnaire/ranked-answer";

type DisplaySource = { authority: "website_observed" | "website_inferred" | "website_hypothesis"; url: string; evidence: string; confidence: string; unresolved?: boolean };
export type DisplayQuestion = Omit<QuestionItem, "source"> & { source?: DisplaySource; presentation?: QuestionPresentation };
export function QuestionEvidence({ question }: { question: { source?: DisplaySource; suggestion?: string; presentation?: QuestionPresentation } }) {
  if (!question.source) return null;
  const inferred = question.source.authority !== "website_observed";
  const url = safeReferenceUrl(question.source.url);
  const presentation = question.presentation || ("key" in question.source ? questionPresentation(question as QuestionItem) : undefined);
  const text = presentation ? presentation.text : question.suggestion;
  const blocks = presentation?.blocks || readableSourceBlocks(text || "");
  const readable = <div dir="rtl" className="space-y-3 break-words text-start leading-7">{blocks.map((block, index) => block.kind === "heading"
    ? <p key={index} className="font-semibold text-[#344054]">{block.text}</p>
    : <p key={index}>{block.text}</p>)}</div>;
  return <div className="mt-3">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={`inline-flex rounded px-2 py-1 ${inferred ? "bg-[#f0ebfa] text-[#65519d]" : "bg-[#ecfdf9] text-[#087f72]"}`}>
        {question.source.authority === "website_hypothesis" ? "השערה עסקית — נדרשת התשובה שלכם" : inferred ? "הסקה מהאתר — לא עובדה מאושרת" : "נצפה באתר — ממתין לאישור שלכם"}
      </span>
      {question.source.unresolved && <span className="text-amber-700">דורש בירור</span>}
    </div>
    {Boolean(presentation?.facts.length) && <dl className="mt-4 divide-y divide-[#e4e7ec]">{presentation!.facts.map((fact, index) => <div key={`${fact.label}:${index}`} className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 py-2.5 text-sm"><dt className="text-[#667085]">{fact.label}</dt><dd dir="auto" className="break-words font-medium">{fact.value}</dd></div>)}</dl>}
    {presentation?.help && <p className="mt-3 text-sm leading-6 text-[#667085]">{presentation.help}</p>}
    {text && (text.length > 420 ? <details className="mt-4 rounded-md border border-[#e4e7ec] bg-[#f8fafb] p-3 text-sm"><summary className="cursor-pointer font-medium text-[#344054]">לקריאת הפרטים המלאים מהאתר</summary><div className="mt-3">{readable}</div></details>
      : <div className="mt-4 text-base text-[#344054]">{readable}</div>)}
    <div className="mt-3 flex flex-wrap items-start justify-between gap-3 text-xs text-[#667085]">
      <details className="min-w-0 flex-1"><summary className="cursor-pointer">על מה זה מבוסס?</summary>
        <p className="mt-2">ודאות המקור: {({ high: "גבוהה", medium: "בינונית", low: "נמוכה" } as Record<string, string>)[question.source.confidence] || "לא הוגדרה"}</p>
        <blockquote dir="rtl" className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words border-s-2 border-[#e4e7ec] ps-3 leading-6">{question.source.evidence}</blockquote>
      </details>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[#087f72] underline">למקור באתר<ExternalLink size={12} /></a>}
    </div>
  </div>;
}
export type AnswerDraft = Omit<QuestionnaireAnswer, "updatedAt">;
const inputClass = "w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-3 text-base text-[#101828] outline-none focus:border-[#087f72] focus:ring-2 focus:ring-[#087f72]/15 disabled:opacity-60";
const icons = { confirmed: Check, partial: Pencil, corrected: Pencil, rejected: X, unknown: CircleHelp, kickoff: MessageCircle };
export function QuestionnaireField({ question, answer, onChange, onIncompleteChange, disabled = false, hideLegend = false, uploadsAvailable = false, onUpload, onDownload, onBusyChange }: {
  question: DisplayQuestion; answer?: QuestionnaireAnswer | AnswerDraft; onChange: (answer: AnswerDraft) => void;
  onIncompleteChange?: (id: string, incomplete: boolean) => void; disabled?: boolean; hideLegend?: boolean; uploadsAvailable?: boolean;
  onUpload?: (file: File, progress: (percentage: number) => void) => Promise<QuestionnaireAttachment>;
  onDownload?: (file: QuestionnaireAttachment) => Promise<void>; onBusyChange?: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState<AnswerDraft>(() => editableQuestionnaireAnswer(answer));
  const [chosen, setChosen] = useState(Boolean(answer));
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  function change(next: AnswerDraft) {
    setDraft(next); setChosen(true);
    const incomplete = !answerIsComplete(question, next);
    onIncompleteChange?.(question.id, incomplete);
    if (!incomplete) onChange(next);
  }
  async function attach(file?: File) {
    if (!file || !onUpload || uploading) return;
    const error = attachmentFileError(file);
    if (error) { setUploadError(error); return; }
    if ((draft.attachments?.length || 0) >= QUESTIONNAIRE_FILE_COUNT) { setUploadError("אפשר לצרף עד חמישה קבצים."); return; }
    setUploadError(""); setUploading(true); setUploadProgress(0); onBusyChange?.(true);
    try {
      const attachment = await onUpload(file, setUploadProgress);
      change({ ...draft, state: "answered", attachments: [...(draft.attachments || []), attachment] });
    } catch (cause) { setUploadError(cause instanceof Error ? cause.message : "העלאת הקובץ נכשלה."); }
    finally { setUploading(false); onBusyChange?.(false); }
  }
  const showText = question.action === "ask" || chosen && ["partial", "corrected", "rejected", "kickoff"].includes(draft.state);
  const presentation = question.presentation || questionPresentation(question as QuestionItem);
  const controls = (states: (keyof typeof icons)[], compact = false) => <div className={compact ? "mt-4 flex flex-wrap gap-2" : "mt-5 grid grid-cols-2 gap-2"} role="radiogroup" aria-label={`${compact ? "אפשרויות נוספות" : "מצב"}: ${question.label}`}>
    {states.map(state => { const Icon = icons[state]; const selected = chosen && draft.state === state; return <label key={state} className={`relative flex cursor-pointer items-center justify-center gap-2 rounded-md border px-2 py-2 transition-colors focus-within:ring-2 focus-within:ring-[#087f72] ${compact ? "min-h-9 text-xs" : "min-h-11 text-sm"} ${selected ? "border-[#087f72] bg-[#ecfdf9] font-medium text-[#087f72]" : "border-[#e4e7ec] bg-white text-[#475467] hover:bg-[#f8fafb]"}`}>
      <input type="radio" name={question.id} checked={selected} onChange={() => change({ ...draft, state })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /><Icon size={compact ? 13 : 15} aria-hidden="true" />{ANSWER_LABELS[state]}
    </label>; })}
  </div>;
  return <fieldset disabled={disabled || uploading} className="min-w-0">
    <legend className={hideLegend ? "sr-only" : "w-full text-lg font-semibold leading-7 text-[#101828]"}>{presentation.prompt}{question.required && <span className="ms-2 text-xs font-normal text-[#667085]">נדרש</span>}</legend>
    <QuestionEvidence question={question} />
    {question.action === "confirm" && controls(["confirmed", "corrected", "partial", "rejected"])}
    {!question.source && presentation.help && <p className="mb-3 text-sm leading-6 text-[#667085]">{presentation.help}</p>}
    {showText && question.ranking && <div className="mt-4 space-y-3">
      {rankedAnswerValues(draft.text, question.ranking.limit).map((value, index) => <label key={index} className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#e4e7ec] text-sm font-medium text-[#667085]" aria-hidden="true">{index + 1}</span>
        <span className="sr-only">{question.ranking!.kind === "categories" ? "קטגוריה" : "מוצר"} במקום {index + 1}</span>
        <input dir="auto" value={value} maxLength={RANKED_ENTRY_LIMIT} placeholder={presentation.placeholder} className={`${inputClass} min-w-0`} onChange={event => {
          const values = rankedAnswerValues(draft.text, question.ranking!.limit);
          values[index] = event.target.value;
          change({ ...draft, state: "answered", text: rankedAnswerText(values) });
        }} />
      </label>)}
      {chosen && draft.state === "answered" && rankedAnswerError(draft.text, question.ranking) && <p role="status" className="text-xs text-amber-800">{rankedAnswerError(draft.text, question.ranking)}</p>}
    </div>}
    {showText && !question.ranking && <label className="mt-4 block text-sm font-medium text-[#344054]">
      {question.action === "confirm" ? draft.state === "rejected" ? "מה נכון במקום? (אפשר להשאיר ריק)" : draft.state === "kickoff" ? "מה תרצו לברר בפגישה? (לא חובה)" : "מה צריך לשנות או להשלים?" : "התשובה שלכם"}
      <textarea aria-label={question.label} maxLength={4000} rows={4} value={draft.text} placeholder={question.action === "confirm" ? "כתבו את הפרטים המדויקים במילים שלכם" : presentation.placeholder || "מה חשוב שנדע?"} onChange={event => change({ ...draft, text: event.target.value,
        state: question.action === "ask" ? "answered" : draft.state })} className={`${inputClass} mt-2 min-h-28 resize-y leading-7`} />
      {chosen && !answerIsComplete(question, draft) && <span className="mt-2 block text-xs text-amber-800">השלימו את התשובה כדי לשמור ולהמשיך.</span>}
    </label>}
    {question.links && <label className="mt-4 block text-sm font-medium text-[#344054]">קישורים לחומרים (אחד בכל שורה, עד חמישה)
      <textarea aria-label="קישורים לחומרים" rows={2} dir="ltr" maxLength={10240} value={draft.links.join("\n")} onChange={event => change({ ...draft, state: "answered", links: event.target.value.split("\n").filter(Boolean) })} className={`${inputClass} mt-2 resize-y`} />
    </label>}
    {question.id === "assets" && onUpload && <div className="mt-4">
      <label className="flex items-center gap-2 text-sm font-medium text-[#344054]"><Upload size={16} />קבצים לחומרי המותג
        <input type="file" aria-label="העלאת חומרי מותג" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt,.zip" disabled={!uploadsAvailable || (draft.attachments?.length || 0) >= QUESTIONNAIRE_FILE_COUNT} className="min-w-0 flex-1 text-xs" onChange={event => { void attach(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      <p className="mt-2 text-xs leading-5 text-[#667085]">עד 5 קבצים, עד 20MB לקובץ. תמונות, PDF, Word, TXT או ZIP.</p>
      {!uploadsAvailable && <p className="mt-1 text-xs text-[#667085]">העלאת קבצים אינה זמינה בסביבה הזו. אפשר לצרף קישור לתיקייה.</p>}
      {uploading && <p role="status" className="mt-2 text-xs text-[#087f72]">מעלה קובץ: {uploadProgress}%</p>}
      {uploadError && <p role="alert" className="mt-2 text-xs text-red-700">{uploadError}</p>}
    </div>}
    {!!draft.attachments?.length && <QuestionnaireAttachments files={draft.attachments} onDownload={onDownload} disabled={disabled || uploading} onRemove={pathname => change({ ...draft, attachments: draft.attachments?.filter(file => file.pathname !== pathname) })} />}
    {controls(["unknown", "kickoff"], true)}
    {question.source && chosen && <label className="mt-4 flex items-center gap-2 text-xs text-[#667085]">
      <input type="checkbox" checked={draft.priority === "high"} onChange={event => change({ ...draft, priority: event.target.checked ? "high" : "normal" })} className="accent-[#087f72]" />חשוב לי להתמקד בזה בפגישה
    </label>}
  </fieldset>;
}
