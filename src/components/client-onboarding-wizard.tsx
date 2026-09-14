"use client";

import { Check, FileText, KeyRound, Loader2, Upload, X } from "lucide-react";
import { useState } from "react";

type ClientDocument = { name: string; content: string; createdAt: string };
type OnboardingProfile = {
  summary: string;
  profile: {
    brandVoice: string;
    audiences: string[];
    products: string[];
    positioning: string;
    constraints: string[];
    contentAngles: string[];
    commercialMoments: string[];
    missingInfo: string[];
  };
  questions: string[];
};

const steps = ["פרטי לקוח", "חיבור Flashy", "הגדרות", "מסמכים ו-AI", "משתמש לקוח", "אישור"];
const fieldClass = "mt-2 h-11 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm outline-none transition focus:border-[#42dfcf] focus:ring-2 focus:ring-[#42dfcf]/20";

export function ClientOnboardingWizard() {
  const [step, setStep] = useState(0);
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [flashyAccount, setFlashyAccount] = useState<{ id: number; name?: string; account?: string } | null>(null);
  const [smsCreditPriceUsd, setSmsCreditPriceUsd] = useState("0.01");
  const [monthlySubscriptionCostUsd, setMonthlySubscriptionCostUsd] = useState("0");
  const [agencyRetainerCostIls, setAgencyRetainerCostIls] = useState("0");
  const [usdIlsRate, setUsdIlsRate] = useState("3.7");
  const [visibleModules, setVisibleModules] = useState(["reports", "planner", "ai"]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [manualContext, setManualContext] = useState("");
  const [onboarding, setOnboarding] = useState<OnboardingProfile | null>(null);
  const [onboardingAnswers, setOnboardingAnswers] = useState("");
  const [clientUserName, setClientUserName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [busy, setBusy] = useState<"" | "flashy" | "file" | "ai" | "create">("");
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState<{ clientId: string; warning?: string } | null>(null);

  function toggleModule(module: string) {
    setVisibleModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module]);
  }

  async function validateFlashy() {
    if (!apiKey.trim()) return setMessage("צריך להדביק API key של Flashy.");
    setBusy("flashy");
    setMessage("מאמת את החשבון מול Flashy...");
    try {
      const response = await fetch("/api/flashy/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: "onboarding-check", apiKey }) });
      const payload = await response.json();
      if (!response.ok || !payload.success || payload.hasWarnings) throw new Error(payload.message || "בדיקת Flashy לא הושלמה בהצלחה.");
      setFlashyAccount(payload.account);
      setClientName((current) => current || payload.account.name || payload.account.account || "");
      setMessage(`החיבור תקין. חשבון ${payload.account.name || payload.account.account || payload.account.id}.`);
    } catch (error) {
      setFlashyAccount(null);
      setMessage(error instanceof Error ? error.message : "אימות Flashy נכשל.");
    } finally {
      setBusy("");
    }
  }

  async function uploadDocument(file: File) {
    setBusy("file");
    setMessage(`קורא את ${file.name}...`);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/ai/documents/parse", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "קריאת המסמך נכשלה.");
      setDocuments((current) => [...current.filter((item) => item.name !== payload.data.name), payload.data].slice(0, 8));
      setOnboarding(null);
      setMessage("המסמך נקרא ונוסף לפרופיל הלקוח.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "קריאת המסמך נכשלה.");
    } finally {
      setBusy("");
    }
  }

  async function analyzeDocuments() {
    const material = [...documents];
    if (manualContext.trim()) material.push({ name: "מידע שהוזן באונבורדינג", content: manualContext.trim(), createdAt: new Date().toISOString() });
    if (onboardingAnswers.trim()) material.push({ name: "תשובות לשאלות ההעמקה", content: onboardingAnswers.trim(), createdAt: new Date().toISOString() });
    if (!material.length) return setMessage("צריך להעלות מסמך או להוסיף מידע קצר על הלקוח.");
    setBusy("ai");
    setMessage("ה-AI בונה פרופיל לקוח ושאלות השלמה...");
    try {
      const response = await fetch("/api/ai/onboarding-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documents: material }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "סריקת המסמכים נכשלה.");
      setOnboarding(payload.onboarding);
      setMessage("נבנה פרופיל ראשוני. אפשר לעבור על השאלות לפני יצירת הלקוח.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "סריקת המסמכים נכשלה.");
    } finally {
      setBusy("");
    }
  }

  function next() {
    if (step === 0 && !clientName.trim()) return setMessage("צריך להזין שם לקוח.");
    if (step === 1 && !flashyAccount) return setMessage("צריך לאמת את חיבור Flashy.");
    if (step === 2 && !visibleModules.length) return setMessage("צריך להשאיר לפחות מודול אחד פעיל.");
    if (step === 4 && clientEmail && temporaryPassword.length < 10) return setMessage("סיסמה זמנית חייבת להכיל לפחות 10 תווים.");
    setMessage("");
    setStep((current) => Math.min(steps.length - 1, current + 1));
  }

  async function createClient() {
    if (!flashyAccount || busy) return;
    const material = [...documents];
    if (manualContext.trim()) material.push({ name: "מידע שהוזן באונבורדינג", content: manualContext.trim(), createdAt: new Date().toISOString() });
    if (onboardingAnswers.trim()) material.push({ name: "תשובות לשאלות ההעמקה", content: onboardingAnswers.trim(), createdAt: new Date().toISOString() });
    setBusy("create");
    setMessage("יוצר לקוח ומסנכרן עד שנה של פעילות...");
    try {
      const response = await fetch("/api/live-client", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey, clientName, industry, smsCreditPriceUsd, monthlySubscriptionCostUsd, agencyRetainerCostIls, usdIlsRate, visibleModules, documents: material, onboarding, clientUserName, clientEmail, temporaryPassword }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "יצירת הלקוח נכשלה.");
      setCreated({ clientId: payload.data.clientId, warning: payload.warning ? payload.message : undefined });
      setMessage(payload.warning ? payload.message : "הלקוח נוצר, המסמכים נשמרו והסנכרון הראשוני הושלם.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "יצירת הלקוח נכשלה.");
    } finally {
      setBusy("");
    }
  }

  if (created) {
    return (
      <section className="rounded-xl border border-[#c8eee8] bg-white p-6">
        <div className="grid size-11 place-items-center rounded-full bg-[#d9faf4] text-[#087f72]"><Check size={22} /></div>
        <h2 className="mt-4 text-2xl font-black text-[#111318]">הלקוח הוקם</h2>
        <p className="mt-2 text-sm leading-6 text-[#667085]">{message}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 h-10 rounded-lg bg-[#111318] px-4 text-sm font-bold text-white">טען את הלקוח בדאשבורד</button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[#e4e7ec] bg-white p-5 shadow-[0_8px_24px_rgba(16,24,40,0.04)]">
      <div className="flex flex-col gap-4 border-b border-[#eaecf0] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-bold text-[#087f72]">OWNER</p><h2 className="mt-1 text-2xl font-black text-[#111318]">הקמת לקוח חדש</h2></div>
        <ol className="flex max-w-full gap-1 overflow-x-auto" aria-label="שלבי הקמת לקוח">
          {steps.map((label, index) => <li key={label} className={`whitespace-nowrap border-b-2 px-2 py-2 text-xs font-bold ${index === step ? "border-[#42dfcf] text-[#111318]" : index < step ? "border-[#98a2b3] text-[#667085]" : "border-transparent text-[#98a2b3]"}`}>{index + 1}. {label}</li>)}
        </ol>
      </div>

      <div className="mx-auto mt-6 min-h-[300px] max-w-3xl">
        {step === 0 && <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-bold text-[#344054]">שם לקוח<input className={fieldClass} value={clientName} onChange={(event) => setClientName(event.target.value)} /></label><label className="text-sm font-bold text-[#344054]">תחום פעילות<input className={fieldClass} value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="איקומרס, בריאות, אופנה..." /></label></div>}
        {step === 1 && <div><label className="text-sm font-bold text-[#344054]">Flashy API key<input type="password" dir="ltr" className={`${fieldClass} text-left`} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setFlashyAccount(null); }} /></label><button type="button" onClick={validateFlashy} disabled={busy === "flashy"} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[#111318] px-4 text-sm font-bold text-white disabled:opacity-50">{busy === "flashy" ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}בדוק חיבור</button>{flashyAccount && <div className="mt-4 rounded-lg border border-[#c8eee8] bg-[#f3fffc] p-4 text-sm font-bold text-[#087f72]">חשבון מאומת · {flashyAccount.name || flashyAccount.account} · ID {flashyAccount.id}</div>}</div>}
        {step === 2 && <div className="grid gap-5"><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-bold text-[#344054]">מחיר SMS בדולר<input type="number" step="0.0001" className={fieldClass} value={smsCreditPriceUsd} onChange={(event) => setSmsCreditPriceUsd(event.target.value)} /></label><label className="text-sm font-bold text-[#344054]">שער דולר<input type="number" step="0.01" className={fieldClass} value={usdIlsRate} onChange={(event) => setUsdIlsRate(event.target.value)} /></label><label className="text-sm font-bold text-[#344054]">מנוי Flashy חודשי בדולר<input type="number" className={fieldClass} value={monthlySubscriptionCostUsd} onChange={(event) => setMonthlySubscriptionCostUsd(event.target.value)} /></label><label className="text-sm font-bold text-[#344054]">ריטיינר חודשי בשקל<input type="number" className={fieldClass} value={agencyRetainerCostIls} onChange={(event) => setAgencyRetainerCostIls(event.target.value)} /></label></div><div><p className="text-sm font-bold text-[#344054]">מודולים ללקוח</p><div className="mt-2 flex flex-wrap gap-2">{[["reports","דוחות"],["planner","גאנט"],["ai","AI"]].map(([key,label]) => <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold ${visibleModules.includes(key) ? "border-[#42dfcf] bg-[#f3fffc]" : "border-[#d0d5dd]"}`}><input type="checkbox" checked={visibleModules.includes(key)} onChange={() => toggleModule(key)} />{label}</label>)}</div></div></div>}
        {step === 3 && <div><div className="rounded-lg border border-dashed border-[#98a2b3] p-5 text-center"><Upload className="mx-auto text-[#667085]" size={22} /><p className="mt-2 text-sm font-bold">מסמכי אפיון, אסטרטגיה ומידע עסקי</p><p className="mt-1 text-xs text-[#667085]">PDF, DOCX, TXT, MD, CSV או JSON · עד 5MB לקובץ</p><label className="mt-4 inline-flex cursor-pointer rounded-lg bg-[#111318] px-4 py-2 text-sm font-bold text-white"><input type="file" accept=".pdf,.docx,.txt,.md,.csv,.json" className="sr-only" disabled={busy === "file"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file); event.target.value = ""; }} />בחר מסמך</label></div><div className="mt-3 flex flex-wrap gap-2">{documents.map((document) => <span key={document.name} className="inline-flex items-center gap-2 rounded-lg bg-[#f2f4f7] px-3 py-2 text-xs"><FileText size={14} />{document.name}<button type="button" aria-label={`הסר ${document.name}`} onClick={() => { setDocuments((current) => current.filter((item) => item.name !== document.name)); setOnboarding(null); }}><X size={13} /></button></span>)}</div><textarea className="mt-4 min-h-24 w-full rounded-lg border border-[#d0d5dd] p-3 text-sm" placeholder="אפשר להוסיף כאן מידע שלא נמצא במסמכים" value={manualContext} onChange={(event) => { setManualContext(event.target.value); setOnboarding(null); }} /><button type="button" onClick={analyzeDocuments} disabled={busy === "ai"} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-[#111318] px-4 text-sm font-bold text-white disabled:opacity-50">{busy === "ai" && <Loader2 className="animate-spin" size={16} />}סרוק ובנה פרופיל AI</button>{onboarding && <div className="mt-4 rounded-lg border border-[#c8eee8] bg-[#f8fffd] p-4"><p className="font-bold text-[#111318]">מה ה-AI הבין</p><p className="mt-2 text-sm leading-6 text-[#475467]">{onboarding.summary}</p>{onboarding.questions.length > 0 && <><p className="mt-4 text-sm font-bold">שאלות להעמקה</p><ul className="mt-2 space-y-1 text-sm text-[#475467]">{onboarding.questions.map((question) => <li key={question}>• {question}</li>)}</ul><textarea className="mt-3 min-h-28 w-full rounded-lg border border-[#b9ded8] bg-white p-3 text-sm" value={onboardingAnswers} onChange={(event) => setOnboardingAnswers(event.target.value)} placeholder="כתוב כאן תשובות לפי הסדר. הן יישמרו כחלק מזיכרון הלקוח." /></>}</div>}</div>}
        {step === 4 && <div><div className="rounded-lg bg-[#f8fafc] p-4 text-sm text-[#667085]">אפשר לדלג וליצור משתמש מאוחר יותר. אם יוצרים עכשיו, הסיסמה זמנית ותוחלף בכניסה הראשונה.</div><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold text-[#344054]">שם משתמש<input className={fieldClass} value={clientUserName} onChange={(event) => setClientUserName(event.target.value)} /></label><label className="text-sm font-bold text-[#344054]">אימייל<input type="email" dir="ltr" className={`${fieldClass} text-left`} value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} /></label><label className="text-sm font-bold text-[#344054] md:col-span-2">סיסמה זמנית<input type="password" dir="ltr" className={`${fieldClass} text-left`} value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} /></label></div></div>}
        {step === 5 && <div className="divide-y divide-[#eaecf0] rounded-xl border border-[#e4e7ec]">{[["לקוח",clientName],["Flashy",`${flashyAccount?.name || flashyAccount?.account} · ${flashyAccount?.id}`],["מודולים",visibleModules.join(" · ")],["מסמכים",`${documents.length + (manualContext.trim() ? 1 : 0) + (onboardingAnswers.trim() ? 1 : 0)} מסמכים/מקורות`],["פרופיל AI",onboarding ? "נסרק ומוכן" : "לא נסרק"],["משתמש",clientEmail || "ייווצר בהמשך"]].map(([label,value]) => <div key={label} className="grid grid-cols-[120px_1fr] gap-4 p-4 text-sm"><span className="font-bold text-[#667085]">{label}</span><span className="font-bold text-[#111318]">{value}</span></div>)}</div>}
      </div>

      {message && <p role="status" className="mt-4 rounded-lg bg-[#f2f4f7] px-4 py-3 text-sm text-[#475467]">{message}</p>}
      <div className="mt-5 flex items-center justify-between border-t border-[#eaecf0] pt-4"><button type="button" disabled={step === 0 || Boolean(busy)} onClick={() => { setStep((current) => Math.max(0, current - 1)); setMessage(""); }} className="h-10 rounded-lg border border-[#d0d5dd] px-4 text-sm font-bold disabled:opacity-40">חזרה</button>{step < steps.length - 1 ? <button type="button" disabled={Boolean(busy)} onClick={next} className="h-10 rounded-lg bg-[#111318] px-5 text-sm font-bold text-white disabled:opacity-40">המשך</button> : <button type="button" disabled={busy === "create"} onClick={createClient} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#087f72] px-5 text-sm font-bold text-white disabled:opacity-50">{busy === "create" && <Loader2 className="animate-spin" size={16} />}צור לקוח וסנכרן</button>}</div>
    </section>
  );
}
