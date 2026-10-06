"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, ExternalLink, FileCheck2, Loader2, AlertTriangle } from "lucide-react";
import { websiteProgress } from "@/lib/website-intelligence/overview";
import type { scanDetails } from "@/lib/website-intelligence/repository";
import { clientPrimaryClass } from "./client-profile-form";
type Details = Awaited<ReturnType<typeof scanDetails>>;
const coverageLabels = { faq: "שאלות נפוצות", shipping: "משלוחים", returns: "החזרות", contact: "שירות וקשר" };
export function WebsiteScanOverview({ details, running, questionnaireBusy, questionnaireAllowed, onQuestionnaire }: {
  details: Details; running: boolean; questionnaireBusy: boolean; questionnaireAllowed: boolean; onQuestionnaire: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const { scan, overview } = details;
  const progress = websiteProgress(scan, details.sources, now);
  const ready = ["completed", "completed_with_warnings"].includes(scan.status);
  useEffect(() => {
    if (progress.finished) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress.finished]);
  const sources = new Map(details.sources.map(source => [source.id, source]));
  const minutes = Math.floor(progress.elapsedSeconds / 60);
  return <div className="space-y-4">
    <div className={`border-s-4 px-4 py-4 ${ready ? "border-[#087f72] bg-[#f0faf8]" : progress.finished ? "border-amber-500 bg-amber-50" : "border-[#42dfcf] bg-[#f8fafb]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 aria-live="polite" className="flex items-center gap-2 text-base font-bold">
          {ready ? <CheckCircle2 size={19} className="text-[#087f72]" /> : progress.finished ? <AlertTriangle size={19} /> : <Loader2 size={19} className={running ? "animate-spin motion-reduce:animate-none" : ""} />}
          {ready ? scan.status === "completed_with_warnings" ? "הסריקה הסתיימה עם מגבלות כיסוי" : "הסריקה הסתיימה בהצלחה" : scan.status === "failed" ? "הסריקה נכשלה" : scan.status === "cancelled" ? "הסריקה נעצרה" : progress.steps[progress.stage]}
        </h3>
        <span className="flex items-center gap-1 text-xs text-[#667085]"><Clock3 size={13} />{progress.finished ? "משך כולל" : "מאז תחילת הסריקה"}: {minutes ? `${minutes} דקות ו־` : ""}{progress.elapsedSeconds % 60} שניות</span>
      </div>
      {!progress.finished && <>
        <ol aria-label="שלבי הסריקה" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{progress.steps.map((step, index) => <li key={step} aria-current={index === progress.stage ? "step" : undefined} className={`border-t-2 pt-2 text-xs ${index <= progress.stage ? "border-[#087f72] font-semibold text-[#087f72]" : "border-[#d0d5dd] text-[#667085]"}`}>{index + 1}. {step}</li>)}</ol>
        <p className="mt-3 text-sm text-[#344054]">{progress.stage < 1 ? "בודקים את האתר ומגלים עמודים רלוונטיים." : progress.stage === 1 ? `${progress.processed} מתוך ${progress.selected} עמודים עובדו · ${overview.pages} נאספו בהצלחה` : progress.stage === 2 ? `${progress.analysisCompleted} מתוך ${progress.analysisTotal} תחומי ניתוח הושלמו` : "מסיימים את בדיקת הממצאים ושמירת התוצאות."}</p>
        {progress.stage === 1 && progress.selected > 0 && <progress aria-label="עמודים שעובדו" value={progress.processed} max={progress.selected} className="mt-2 h-2 w-full accent-[#087f72]" />}
        <p className="mt-2 text-xs text-[#667085]">הערכה ראשונית: כ־5–20 דקות בסריקה רציפה. אתר איטי או ניסיונות חוזרים עשויים להאריך את הזמן; זו אינה ספירה לאחור.</p>
        {!running && <p className="mt-2 text-sm text-amber-800">ההתקדמות נשמרה. המשך סריקה יפעיל את המקטעים הבאים.</p>}
        {running && <p className="mt-2 text-xs text-[#667085]">המשך העיבוד פעיל בחלון הזה. לאחר יציאה אפשר לחזור ולהמשיך מהמצב השמור.</p>}
        {scan.nextRetryAt && new Date(scan.nextRetryAt).getTime() > now && <p className="mt-2 text-sm text-amber-800">ממתינים לניסיון חוזר עד {new Date(scan.nextRetryAt).toLocaleTimeString("he-IL")}.</p>}
      </>}
      {ready && <p className="mt-2 text-sm text-[#344054]">נאספו {overview.pages} עמודים. המידע מהאתר הוא בסיס לאפיון, לא מידע שאושר על ידי הלקוח.</p>}
    </div>
    {ready && <section aria-label="תמצית המידע שנאסף" className="border-y border-[#e4e7ec] py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-bold">תמצית המידע שנאסף</h3><p className="mt-1 text-xs text-[#667085]">{overview.needsReview ? `${overview.needsReview} ממצאים דורשים בדיקה · ` : ""}{overview.ignored ? `${overview.ignored} ממצאים שסומנו לא לשימוש הוחרגו` : "ממצאים עם מקורות תומכים"}</p></div>
        <button className={clientPrimaryClass} disabled={questionnaireBusy || !questionnaireAllowed} onClick={onQuestionnaire}><FileCheck2 size={16} />{questionnaireBusy ? "מכין טיוטה..." : "להכנת שאלון אפיון"}</button>
      </div>
      <dl className="my-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">{[
        ["עמודים שנאספו", overview.pages], ["מוצרים / עם מחיר", `${overview.products} / ${overview.pricedProducts}`],
        ["ממצאים שנצפו באתר", overview.observed], ["הסקות לאימות", overview.inferred],
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-[#667085]">{label}</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd></div>)}</dl>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-[#eef0f3] py-3 text-xs">{overview.coverage.map(item => <span key={item.type} className={item.finding ? "text-[#087f72]" : "text-[#667085]"}>{coverageLabels[item.type]}: {item.finding ? "מידע חולץ" : item.source ? "עמוד עובד; ללא ממצא שמור" : "לא כוסה כמקור ייעודי"}</span>)}</div>
      <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">{overview.sections.map(section => <section key={section.category}>
        <h4 className="text-sm font-bold">{section.label} <span className="font-normal text-[#667085]">· {section.count}</span></h4>
        <ul className="mt-2 space-y-3">{section.items.map(item => <li key={item.id}>
          <p dir="auto" className="line-clamp-3 whitespace-pre-line break-words text-sm text-[#344054]">{item.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><span className={item.observationStatus === "inferred" ? "text-[#6651a6]" : "text-[#087f72]"}>{item.observationStatus === "inferred" ? "הסקה לאימות" : "נצפה באתר"}</span>{item.reviewDisposition === "needs_review" && <span className="text-amber-800">דורש בדיקה</span>}
            {sources.get(item.sourceId) && <a href={sources.get(item.sourceId)!.canonicalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#667085] underline"><ExternalLink size={11} />מקור</a>}
          </div>
        </li>)}</ul>
      </section>)}</div>
      {!overview.sections.length && <p className="mt-4 text-sm text-[#667085]">לא חולצו מספיק ממצאים לתמצית. יש לבדוק את אזהרות הסריקה לפני הכנת השאלון.</p>}
      <p className="mt-4 text-xs text-[#667085]">הטיוטה תיפתח לבדיקת הצוות. אין אישור, יצירת קישור או שליחה אוטומטית.</p>
      {!questionnaireAllowed && <p className="mt-2 text-xs text-amber-800">להכנת שאלון יש לבחור את הסריקה האחרונה שהושלמה עבור כתובת האתר הנוכחית.</p>}
    </section>}
  </div>;
}
