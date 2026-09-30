"use client";

import { Clock3, History, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountChangeArea, AccountChangeEvent } from "@/lib/types";

const areaOptions: Array<{ key: AccountChangeArea; label: string; color: string }> = [
  { key: "popup", label: "פופאפ", color: "bg-[#fff8d8] text-[#6b5a00]" },
  { key: "automation", label: "אוטומציה", color: "bg-[#e9f3ff] text-[#175cd3]" },
  { key: "email", label: "אימייל", color: "bg-[#eef4ff] text-[#344f8a]" },
  { key: "sms", label: "SMS", color: "bg-[#e7faf6] text-[#087f72]" },
  { key: "offer", label: "הצעה", color: "bg-[#fff0e8] text-[#9a3412]" },
  { key: "tracking", label: "מדידה", color: "bg-[#f2edff] text-[#6941c6]" },
  { key: "strategy", label: "אסטרטגיה", color: "bg-[#f2f4f7] text-[#344054]" },
  { key: "account", label: "הגדרות חשבון", color: "bg-[#edf7ee] text-[#27733c]" },
  { key: "other", label: "אחר", color: "bg-[#f2f4f7] text-[#475467]" },
];

const emptyDraft = () => ({
  title: "",
  details: "",
  reason: "",
  areas: [] as AccountChangeArea[],
  occurredAt: toLocalInputValue(new Date()),
});

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function areaMeta(area: AccountChangeArea) {
  return areaOptions.find((item) => item.key === area) ?? areaOptions[areaOptions.length - 1];
}

async function readApiPayload(response: Response): Promise<{ success?: boolean; message?: string; data?: AccountChangeEvent[] }> {
  const text = await response.text();
  if (!text) return { success: false, message: "השרת לא החזיר תשובה. נסה שוב בעוד רגע." };
  try {
    return JSON.parse(text) as { success?: boolean; message?: string; data?: AccountChangeEvent[] };
  } catch {
    return { success: false, message: "השרת החזיר תשובה לא תקינה. נסה לרענן את המסך." };
  }
}

async function fetchAccountChanges(clientId: string, accountId: string): Promise<AccountChangeEvent[]> {
  const response = await fetch(`/api/account-changes?clientId=${encodeURIComponent(clientId)}&accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
  const payload = await readApiPayload(response);
  if (!response.ok || !payload.success) throw new Error(payload.message || "טעינת היומן נכשלה.");
  return payload.data ?? [];
}

export function AccountChangeLog({
  clientId,
  accountId,
  accountName,
  timezone,
}: {
  clientId: string;
  accountId: string;
  accountName: string;
  timezone: string;
}) {
  const [events, setEvents] = useState<AccountChangeEvent[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<AccountChangeArea | "all">("all");
  const [state, setState] = useState("טוען את יומן השינויים...");
  const [busy, setBusy] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const data = await fetchAccountChanges(clientId, accountId);
      setEvents(data);
      setState(data.length ? "" : "עדיין לא תועדו שינויים בחשבון.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "טעינת היומן נכשלה.");
    }
  }, [accountId, clientId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAccountChanges(clientId, accountId)
      .then((data) => {
        if (cancelled) return;
        setEvents(data);
        setState(data.length ? "" : "עדיין לא תועדו שינויים בחשבון.");
      })
      .catch((error) => {
        if (!cancelled) setState(error instanceof Error ? error.message : "טעינת היומן נכשלה.");
      });
    return () => { cancelled = true; };
  }, [accountId, clientId]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      if (areaFilter !== "all" && !event.areas.includes(areaFilter)) return false;
      if (!query) return true;
      return [event.title, event.details, event.reason, event.createdBy.name]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [areaFilter, events, search]);

  function resetDraft() {
    setEditingId(null);
    setDraft(emptyDraft());
  }

  function editEvent(event: AccountChangeEvent) {
    setEditingId(event.id);
    setDraft({
      title: event.title,
      details: event.details,
      reason: event.reason,
      areas: event.areas,
      occurredAt: toLocalInputValue(new Date(event.occurredAt)),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEvent() {
    if (!draft.title.trim() || !draft.details.trim() || !draft.occurredAt) {
      setState("צריך למלא כותרת, פירוט ומועד שינוי.");
      return;
    }
    setBusy(true);
    setState(editingId ? "מעדכן את הרשומה..." : "שומר את השינוי...");
    try {
      const response = await fetch("/api/account-changes", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          clientId,
          accountId,
          ...draft,
          occurredAt: new Date(draft.occurredAt).toISOString(),
        }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok || !payload.success) throw new Error(payload.message || "שמירת השינוי נכשלה.");
      resetDraft();
      await loadEvents();
      setState(editingId ? "הרשומה עודכנה." : "השינוי נוסף לטיימליין ולזיכרון ה־AI.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "שמירת השינוי נכשלה.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent(event: AccountChangeEvent) {
    if (!window.confirm(`למחוק את השינוי “${event.title}”?`)) return;
    setBusy(true);
    setState("מוחק את הרשומה...");
    try {
      const response = await fetch(`/api/account-changes?id=${encodeURIComponent(event.id)}`, { method: "DELETE" });
      const payload = await readApiPayload(response);
      if (!response.ok || !payload.success) throw new Error(payload.message || "מחיקת השינוי נכשלה.");
      if (editingId === event.id) resetDraft();
      await loadEvents();
      setState("הרשומה נמחקה.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "מחיקת השינוי נכשלה.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#eef0f2] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <History size={18} className="text-[#087f72]" />
              <h2 className="text-lg font-black text-[#111318]">{editingId ? "עריכת שינוי" : "תיעוד שינוי בחשבון"}</h2>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#667085]">מה השתנה, מתי ולמה. הרשומה נשמרת ל־{accountName} וזמינה לסוכן ה־AI.</p>
          </div>
          {editingId && <button type="button" onClick={resetDraft} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d0d5dd] px-3 text-xs font-bold text-[#475467]"><X size={14} />ביטול עריכה</button>}
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_240px]">
          <div className="grid gap-4">
            <label>
              <span className="mb-1.5 block text-xs font-bold text-[#344054]">כותרת קצרה</span>
              <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={160} placeholder="למשל: עדכון ההטבה בפופאפ ובאוטומציית Welcome" className="h-11 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#20b9a8]" />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold text-[#344054]">מה השתנה</span>
              <textarea value={draft.details} onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))} maxLength={4_000} rows={4} placeholder="החלפנו את ההטבה מ־10% הנחה ל־20 ₪ הנחה, ועדכנו את נוסח הפופאפ והמייל הראשון באוטומציה." className="w-full resize-y rounded-md border border-[#d0d5dd] p-3 text-sm leading-6 outline-none focus:border-[#20b9a8]" />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold text-[#344054]">למה שינינו / מה נרצה לבדוק <span className="font-normal text-[#98a2b3]">(אופציונלי)</span></span>
              <textarea value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} maxLength={2_000} rows={2} placeholder="לבדוק אם הטבה כספית ברורה מעלה הרשמות ורכישות לעומת אחוז הנחה." className="w-full resize-y rounded-md border border-[#d0d5dd] p-3 text-sm leading-6 outline-none focus:border-[#20b9a8]" />
            </label>
          </div>

          <aside className="space-y-4 border-t border-[#eef0f2] pt-4 lg:border-r lg:border-t-0 lg:pr-5 lg:pt-0">
            <label>
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#344054]"><Clock3 size={13} />מועד ביצוע</span>
              <input type="datetime-local" value={draft.occurredAt} onChange={(event) => setDraft((current) => ({ ...current, occurredAt: event.target.value }))} className="h-10 w-full rounded-md border border-[#d0d5dd] px-2 text-sm outline-none focus:border-[#20b9a8]" dir="ltr" />
            </label>
            <fieldset>
              <legend className="mb-2 text-xs font-bold text-[#344054]">אזורי השינוי</legend>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                {areaOptions.map((area) => {
                  const checked = draft.areas.includes(area.key);
                  return <label key={area.key} className="flex min-h-8 cursor-pointer items-center gap-2 text-xs text-[#475467]"><input type="checkbox" checked={checked} onChange={() => setDraft((current) => ({ ...current, areas: checked ? current.areas.filter((item) => item !== area.key) : [...current.areas, area.key] }))} className="size-4 accent-[#087f72]" /><span>{area.label}</span></label>;
                })}
              </div>
            </fieldset>
            <button type="button" disabled={busy} onClick={() => void saveEvent()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#111318] px-4 text-sm font-bold text-white transition hover:bg-black disabled:opacity-45"><Plus size={16} />{editingId ? "שמור עדכון" : "הוסף לטיימליין"}</button>
          </aside>
        </div>
      </section>

      <section className="rounded-lg border border-[#e4e7ec] bg-white px-5 py-4">
        <div className="flex flex-col gap-3 border-b border-[#eef0f2] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-[#111318]">טיימליין שינויים</h2>
            <p className="mt-1 text-xs text-[#667085]">{events.length.toLocaleString("he-IL")} שינויים מתועדים · החדש ביותר מופיע ראשון</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 sm:w-64">
              <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#98a2b3]" size={15} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש ביומן" className="h-9 w-full rounded-md border border-[#d0d5dd] pr-9 pl-3 text-xs outline-none focus:border-[#20b9a8]" />
            </label>
            <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value as AccountChangeArea | "all")} className="h-9 rounded-md border border-[#d0d5dd] bg-white px-3 text-xs font-bold text-[#475467] outline-none focus:border-[#20b9a8]">
              <option value="all">כל האזורים</option>
              {areaOptions.map((area) => <option key={area.key} value={area.key}>{area.label}</option>)}
            </select>
            {(search || areaFilter !== "all") && <button type="button" onClick={() => { setSearch(""); setAreaFilter("all"); }} title="איפוס סינון" aria-label="איפוס סינון" className="grid size-9 place-items-center rounded-md border border-[#d0d5dd] text-[#667085]"><RotateCcw size={15} /></button>}
          </div>
        </div>

        {state && <p role="status" className="mt-4 text-xs text-[#667085]">{state}</p>}
        {filteredEvents.length > 0 ? <ol className="relative mt-5 border-r border-[#d0d5dd] pr-6">
          {filteredEvents.map((event) => (
            <li key={event.id} className="relative border-b border-[#eef0f2] py-5 first:pt-0 last:border-b-0 last:pb-0">
              <span className="absolute -right-[29px] top-6 size-2.5 rounded-full border-2 border-white bg-[#20b9a8] ring-1 ring-[#20b9a8] first:top-1" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black text-[#111318]">{event.title}</h3>
                    {event.areas.map((area) => { const meta = areaMeta(area); return <span key={area} className={`rounded px-2 py-1 text-[10px] font-bold ${meta.color}`}>{meta.label}</span>; })}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#475467]">{event.details}</p>
                  {event.reason && <p className="mt-2 border-r-2 border-[#FFE045] pr-3 text-xs leading-5 text-[#667085]"><strong className="text-[#344054]">מטרת השינוי:</strong> {event.reason}</p>}
                </div>
                <div className="flex shrink-0 items-start justify-between gap-4 sm:flex-col sm:items-end">
                  <div className="text-left text-[11px] leading-5 text-[#667085]">
                    <time dateTime={event.occurredAt} className="block font-bold text-[#344054]">{new Date(event.occurredAt).toLocaleDateString("he-IL", { timeZone: timezone, day: "numeric", month: "long", year: "numeric" })}</time>
                    <span>{new Date(event.occurredAt).toLocaleTimeString("he-IL", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })} · {event.createdBy.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => editEvent(event)} title="עריכת שינוי" aria-label={`עריכת ${event.title}`} className="grid size-8 place-items-center rounded-md text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#111318]"><Pencil size={14} /></button>
                    <button type="button" disabled={busy} onClick={() => void deleteEvent(event)} title="מחיקת שינוי" aria-label={`מחיקת ${event.title}`} className="grid size-8 place-items-center rounded-md text-[#98a2b3] transition hover:bg-[#fff1f0] hover:text-[#b42318] disabled:opacity-45"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol> : !state && <div className="grid min-h-44 place-content-center text-center"><History size={28} className="mx-auto text-[#98a2b3]" /><p className="mt-3 text-sm font-bold text-[#344054]">אין תוצאות לסינון הנוכחי</p></div>}
      </section>
    </div>
  );
}
