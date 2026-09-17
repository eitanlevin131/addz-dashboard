"use client";

import { CheckCircle2, FileEdit, RefreshCw, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";

export type AiDraftSaveInput = {
  kind: "sms" | "subject";
  title: string;
  content: string;
  preheader?: string;
  metadata?: Record<string, unknown>;
};

type AiContentDraft = AiDraftSaveInput & {
  id: string;
  clientId: string;
  flashyAccountId: string;
  status: "draft" | "approved";
  approvedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

function DraftRow({ draft, onUpdated }: { draft: AiContentDraft; onUpdated: (draft: AiContentDraft) => void }) {
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [preheader, setPreheader] = useState(draft.preheader ?? "");
  const [state, setState] = useState("");
  const [saving, setSaving] = useState(false);

  async function update(status = draft.status) {
    setSaving(true);
    setState("");
    try {
      const response = await fetch("/api/ai/drafts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id, title, content, preheader, status }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "עדכון הטיוטה נכשל.");
      onUpdated(payload.data as AiContentDraft);
      setState(status === "approved" ? "הטיוטה אושרה." : "השינויים נשמרו.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "עדכון הטיוטה נכשל.");
    } finally {
      setSaving(false);
    }
  }

  return <details className="group border-b border-[#eef0f2] last:border-b-0">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden hover:bg-[#f8fafb]">
      <span className="min-w-0"><span className="flex items-center gap-2"><span className={`size-2 shrink-0 rounded-full ${draft.status === "approved" ? "bg-[#20b9a8]" : "bg-[#98a2b3]"}`} /><span className="truncate text-sm font-black">{draft.title}</span></span><span className="mt-1 block text-[11px] text-[#667085]">{draft.kind === "sms" ? "SMS" : "שורת נושא"} · {draft.status === "approved" ? "מאושר" : "טיוטה"} · עודכן {new Date(draft.updatedAt).toLocaleDateString("he-IL")}</span></span>
      <FileEdit size={16} className="shrink-0 text-[#667085]" />
    </summary>
    <div className="border-t border-[#eef0f2] bg-[#fbfcfd] p-4">
      <label><span className="mb-1.5 block text-xs font-bold text-[#344054]">שם הטיוטה</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm outline-none focus:border-[#20b9a8]" /></label>
      <label className="mt-3 block"><span className="mb-1.5 block text-xs font-bold text-[#344054]">תוכן</span><textarea value={content} onChange={(event) => setContent(event.target.value)} rows={draft.kind === "sms" ? 5 : 2} className="w-full resize-y rounded-md border border-[#d0d5dd] bg-white p-3 text-sm leading-6 outline-none focus:border-[#20b9a8]" /></label>
      {draft.kind === "subject" && <label className="mt-3 block"><span className="mb-1.5 block text-xs font-bold text-[#344054]">Preheader</span><textarea value={preheader} onChange={(event) => setPreheader(event.target.value)} rows={2} className="w-full resize-y rounded-md border border-[#d0d5dd] bg-white p-3 text-sm leading-6 outline-none focus:border-[#20b9a8]" /></label>}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className={`text-xs ${state.includes("נכשל") || state.includes("צריך") || state.includes("ריקה") ? "text-[#b42318]" : "text-[#087f72]"}`}>{state}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={saving || !title.trim() || !content.trim()} onClick={() => void update(draft.status)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 text-xs font-bold disabled:opacity-45"><Save size={14} />שמור שינויים</button><button type="button" disabled={saving || !title.trim() || !content.trim()} onClick={() => void update(draft.status === "approved" ? "draft" : "approved")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-bold disabled:opacity-45 ${draft.status === "approved" ? "border border-[#d0d5dd] bg-white" : "bg-[#111318] text-white"}`}>{draft.status === "approved" ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}{draft.status === "approved" ? "החזר לטיוטה" : "אשר טיוטה"}</button></div></div>
    </div>
  </details>;
}

export function AiDraftLibrary({ clientId, accountId, refreshKey }: { clientId: string; accountId: string; refreshKey: number }) {
  const [drafts, setDrafts] = useState<AiContentDraft[]>([]);
  const [filter, setFilter] = useState<"all" | "draft" | "approved">("all");
  const [state, setState] = useState("טוען טיוטות...");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState("טוען טיוטות...");
      try {
        const response = await fetch(`/api/ai/drafts?clientId=${encodeURIComponent(clientId)}&accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת הטיוטות נכשלה.");
        if (!cancelled) {
          setDrafts(payload.data ?? []);
          setState("");
        }
      } catch (error) {
        if (!cancelled) setState(error instanceof Error ? error.message : "טעינת הטיוטות נכשלה.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [accountId, clientId, refreshKey]);

  const visibleDrafts = filter === "all" ? drafts : drafts.filter((draft) => draft.status === filter);
  function updateDraft(updated: AiContentDraft) {
    setDrafts((current) => current.map((draft) => draft.id === updated.id ? updated : draft).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  return <section className="mt-8 border-t border-[#dfe3e7] pt-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-lg font-black">טיוטות שמורות</h3><p className="mt-1 text-xs text-[#667085]">עריכה ואישור פנימי. אין שליחה אוטומטית ל־Flashy.</p></div><div className="inline-flex rounded-md bg-[#f1f4f5] p-1">{([['all', 'הכול'], ['draft', 'טיוטות'], ['approved', 'מאושרות']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`h-8 rounded px-3 text-xs font-bold ${filter === value ? "bg-white shadow-sm" : "text-[#667085]"}`}>{label}</button>)}</div></div>
    <div className="mt-4 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">{state ? <p className="flex items-center justify-center gap-2 p-6 text-xs text-[#667085]"><RefreshCw size={14} className={state.startsWith("טוען") ? "animate-spin" : ""} />{state}</p> : visibleDrafts.length ? visibleDrafts.map((draft) => <DraftRow key={draft.id} draft={draft} onUpdated={updateDraft} />) : <p className="p-6 text-center text-xs text-[#667085]">{drafts.length ? "אין טיוטות בסטטוס הזה." : "עדיין לא נשמרו טיוטות לחשבון הזה."}</p>}</div>
  </section>;
}
