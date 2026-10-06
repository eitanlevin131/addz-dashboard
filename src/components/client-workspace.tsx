"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { CLIENT_SERVICES, type ContactInput } from "@/lib/client-foundation";
import type { ClientProfile } from "@/lib/clients";
import { ClientPackageScope } from "@/components/client-package-scope";
import { WebsiteIntelligence } from "@/components/website-intelligence";
import { ClientQuestionnaire } from "@/components/client-questionnaire";
import { ClientKickoff } from "@/components/client-kickoff";
import {
  ClientProfileForm,
  ContactFields,
  clientButtonClass,
  clientFieldClass,
  clientPrimaryClass,
  emptyContact,
} from "@/components/client-profile-form";

const date = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleDateString("he-IL", {
        timeZone: "Asia/Jerusalem",
      })
    : "—";
const money = (value: string | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: "ILS",
        maximumFractionDigits: 2,
      }).format(Number(value));
function commercialFee(client: ClientProfile) {
  if (
    client.monthlyRetainerAmount !== null &&
    (Number(client.monthlyRetainerAmount) > 0 || !Number(client.oneTimeAmount))
  )
    return `${money(client.monthlyRetainerAmount)} / חודש`;
  return client.oneTimeAmount !== null
    ? `${money(client.oneTimeAmount)} חד־פעמי`
    : "";
}
const eventLabels: Record<string, string> = {
  "questionnaire.generated": "טיוטת שאלון נוצרה",
  "questionnaire.ready": "שאלון אושר לשיתוף",
  "questionnaire.link_issued": "קישור שאלון נוצר",
  "questionnaire.link_revoked": "קישור שאלון בוטל",
  "questionnaire.saved": "תשובות שאלון נשמרו",
  "questionnaire.completed": "שאלון לקוח הושלם",
  "questionnaire.reviewed": "שאלון נבדק על ידי הצוות",
  "kickoff.prepared": "פגישת אפיון הוכנה",
  "kickoff.decision_saved": "החלטת אפיון נשמרה",
  "kickoff.topic_added": "נושא נוסף בפגישת אפיון",
  "kickoff.completed": "פגישת אפיון סוכמה",
  "kickoff.reopened": "פגישת אפיון נפתחה מחדש",
  "website_scan.requested": "סריקת אתר התבקשה",
  "website_scan.started": "סריקת אתר התחילה",
  "website_scan.completed": "סריקת אתר הושלמה",
  "website_scan.completed_with_warnings": "סריקת אתר הושלמה עם אזהרות",
  "website_scan.failed": "סריקת אתר נכשלה",
  "website_scan.cancelled": "סריקת אתר נעצרה",
  "website_scan.review_tagged": "ממצא אתר תויג",
  "client.created": "לקוח נוצר",
  "client.updated": "פרטי לקוח עודכנו",
  "contact.created": "איש קשר נוסף",
  "contact.updated": "איש קשר עודכן",
  "contact.primary_changed": "איש קשר ראשי הוחלף",
  "flashy.connected": "חשבון Flashy חובר",
};
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json();
  if (!response.ok || !payload.success)
    throw new Error(payload.message || "טעינת המידע נכשלה.");
  return payload.data;
}
function FlashyConnection({
  client,
  onConnected,
  onCancel,
}: {
  client: ClientProfile;
  onConnected: (message: string) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const body = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    try {
      const response = await fetch("/api/live-client", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          clientId: client.id,
          clientName: client.name,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success)
        throw new Error(payload.message || "החיבור נכשל.");
      onConnected(payload.message || "החשבון חובר וסונכרן.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "החיבור נכשל.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4 border-y border-[#e4e7ec] py-5"
    >
      <h2 className="text-lg font-bold">חיבור Flashy · {client.name}</h2>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          API key
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            required
            dir="ltr"
            className={clientFieldClass}
          />
        </label>
        {[
          {
            name: "smsCreditPriceUsd",
            label: "מחיר קרדיט SMS ($)",
            value: "0.01",
          },
          {
            name: "monthlySubscriptionCostUsd",
            label: "מנוי Flashy ($)",
            value: "0",
          },
          {
            name: "agencyRetainerCostIls",
            label: "ריטיינר לחישוב עלויות הדוח (₪)",
            value: "0",
          },
          { name: "usdIlsRate", label: "שער דולר", value: "3.7" },
        ].map((field) => (
          <label key={field.name} className="text-sm">
            {field.label}
            <input
              name={field.name}
              type="number"
              min="0"
              step="0.0001"
              required
              defaultValue={field.value}
              dir="ltr"
              className={clientFieldClass}
            />
          </label>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <button disabled={busy} className={clientPrimaryClass}>
          <Link2 size={16} />
          {busy ? "מחבר ומסנכרן..." : "חבר חשבון"}
        </button>
        <button
          disabled={busy}
          type="button"
          className={clientButtonClass}
          onClick={onCancel}
        >
          סגור
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
export function ClientFoundation({
  clientId,
  onOpenClient,
  onBack,
  onOpenReports,
}: {
  clientId?: string;
  onOpenClient: (id: string) => void;
  onBack: () => void;
  onOpenReports: (id: string) => void;
}) {
  const [rows, setRows] = useState<ClientProfile[]>([]);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [connectionFilter, setConnectionFilter] = useState("");
  const [tab, setTab] = useState<"overview" | "contacts" | "activity" | "website" | "questionnaire" | "kickoff">(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "kickoff" ? "kickoff" : typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "questionnaire" ? "questionnaire" : typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "website" ? "website" : "overview",
  );
  const [contactForm, setContactForm] = useState<{
    id?: string;
    value: ContactInput;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [activity, setActivity] = useState<{
    items: {
      id: string;
      action: string;
      actorName: string | null;
      actorType: string | null;
      createdAt: string;
    }[];
    hasMore: boolean;
  } | null>(null);
  const [activityError, setActivityError] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      request<ClientProfile[]>("/api/clients", { signal: controller.signal }),
      request<{ id: string; name: string }[]>("/api/clients/options", {
        signal: controller.signal,
      }),
    ])
      .then(([clients, people]) => {
        setRows(clients);
        setOwners(people);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    if (!clientId || tab !== "activity") return;
    const controller = new AbortController();
    void request<NonNullable<typeof activity>>(
      `/api/clients/${clientId}/activity?page=${page}`,
      { signal: controller.signal },
    )
      .then((data) => {
        setActivity(data);
        setActivityError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setActivityError(error.message);
      });
    return () => controller.abort();
  }, [clientId, tab, page, version]);
  const client = rows.find((row) => row.id === clientId);
  function reload() {
    setVersion((current) => current + 1);
  }
  async function saveContact(event: FormEvent) {
    event.preventDefault();
    if (!contactForm || !clientId || saving) return;
    setSaving(true);
    setNotice("");
    try {
      await request(
        `/api/clients/${clientId}/contacts${contactForm.id ? `/${contactForm.id}` : ""}`,
        {
          method: contactForm.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(contactForm.value),
        },
      );
      setContactForm(null);
      setNotice("איש הקשר נשמר.");
      reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "השמירה נכשלה.");
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <div role="status" className="animate-pulse py-12 text-sm text-[#667085]">
        טוען לקוחות...
      </div>
    );
  if (error)
    return (
      <div role="alert" className="space-y-3 py-8">
        <p>{error}</p>
        <button className={clientButtonClass} onClick={reload}>
          <RefreshCw size={16} />
          נסה שוב
        </button>
      </div>
    );
  if (clientId && !client)
    return (
      <div className="py-8">
        <p>הלקוח לא נמצא.</p>
        <button className={clientButtonClass} onClick={onBack}>
          חזרה ללקוחות
        </button>
      </div>
    );
  if (!client) {
    if (editing)
      return (
        <ClientProfileForm
          owners={owners}
          onCancel={() => setEditing(false)}
          onSaved={(created) => {
            setEditing(false);
            onOpenClient(created.id);
          }}
        />
      );
    const visible = rows.filter(
      (row) =>
        (!search ||
          `${row.name} ${row.contacts.map((contact) => `${contact.name} ${contact.email ?? ""}`).join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (!ownerFilter || row.ownerUserId === ownerFilter) &&
        (!connectionFilter ||
          (connectionFilter === "connected"
            ? row.connections.some((account) => account.active)
            : !row.connections.some((account) => account.active))),
    );
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">לקוחות</h1>
          <span className="text-xs text-[#667085]">{rows.length}</span>
          <button
            className={clientPrimaryClass}
            onClick={() => setEditing(true)}
          >
            <Plus size={16} />
            לקוח חדש
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_155px_150px]">
          <label className="relative col-span-2 sm:col-span-1">
            <span className="sr-only">חיפוש לקוחות</span>
            <Search
              className="absolute right-3 top-3 text-[#667085]"
              size={16}
            />
            <input
              className={`${clientFieldClass} !pr-9`}
              placeholder="חיפוש לקוח או איש קשר"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">סינון לפי אחראי</span>
            <select
              aria-label="סינון לפי אחראי"
              className={clientFieldClass}
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
            >
              <option value="">כל האחראים</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">סינון לפי חיבור</span>
            <select
              aria-label="סינון לפי חיבור"
              className={clientFieldClass}
              value={connectionFilter}
              onChange={(event) => setConnectionFilter(event.target.value)}
            >
              <option value="">כל החיבורים</option>
              <option value="connected">חיבור פעיל</option>
              <option value="disconnected">ללא חיבור פעיל</option>
            </select>
          </label>
        </div>
        <div className="divide-y divide-[#eaecf0] border-y border-[#e4e7ec] sm:hidden">
          {visible.map((row) => (
            <button
              key={row.id}
              aria-label={row.name}
              onClick={() => onOpenClient(row.id)}
              className="block w-full space-y-2 py-3 text-right hover:bg-[#f8fafb] focus-visible:outline-2 focus-visible:outline-[#087f72]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words text-sm font-semibold">
                  {row.name}
                </span>
                <span
                  className={
                    row.connections.some((account) => account.active)
                      ? "shrink-0 rounded-md bg-[#ecfdf9] px-2 py-1 text-[11px] text-[#087f72]"
                      : "shrink-0 rounded-md bg-[#eef3f7] px-2 py-1 text-[11px] text-[#667085]"
                  }
                >
                  {row.connections.some((account) => account.active)
                    ? "מחובר"
                    : row.connections.length
                      ? "לא פעיל"
                      : "טרם חובר"}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#667085]">
                {row.industry && <span>{row.industry}</span>}
                {row.contacts.find((contact) => contact.isPrimary)?.name && (
                  <span>
                    {row.contacts.find((contact) => contact.isPrimary)?.name}
                  </span>
                )}
              </div>
              {(row.packageName || commercialFee(row)) && (
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <span>{row.packageName}</span>
                  <span className="text-[#667085]">{commercialFee(row)}</span>
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="hidden overflow-x-auto border-y border-[#e4e7ec] sm:block">
          <table className="w-full min-w-[680px] text-right text-sm">
            <thead className="bg-[#f8fafb] text-xs text-[#667085]">
              <tr>
                {[
                  "לקוח",
                  "איש קשר ראשי",
                  "חבילה",
                  "אחראי",
                  "קליטה",
                  "Flashy",
                ].map((label) => (
                  <th key={label} className="px-3 py-2.5 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eaecf0]">
              {visible.map((row) => (
                <tr key={row.id} className="hover:bg-[#f8fafb]">
                  <td className="px-3 py-3">
                    <button
                      className="max-w-[230px] truncate text-right font-semibold text-[#111318] hover:underline"
                      onClick={() => onOpenClient(row.id)}
                    >
                      {row.name}
                    </button>
                    <p className="mt-0.5 text-xs text-[#667085]">
                      {row.industry || "—"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {row.contacts.find((contact) => contact.isPrimary)?.name ??
                      "—"}
                  </td>
                  <td className="px-3 py-3">
                    <p className="max-w-[200px] truncate">
                      {row.packageName || "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-[#667085]" dir="rtl">
                      {commercialFee(row)}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-xs text-[#475467]">
                    {row.ownerName || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded-md bg-[#eef3f7] px-2 py-1 text-[11px]">
                      {row.onboardingStage === "client_created"
                        ? "נוצר"
                        : "לא הוגדר"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        row.connections.some((account) => account.active)
                          ? "inline-flex items-center gap-1.5 rounded-md bg-[#ecfdf9] px-2 py-1 text-[11px] text-[#087f72]"
                          : "inline-flex rounded-md bg-[#eef3f7] px-2 py-1 text-[11px] text-[#667085]"
                      }
                    >
                      {row.connections.some((account) => account.active)
                        ? "מחובר"
                        : row.connections.length
                          ? "לא פעיל"
                          : "טרם חובר"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <p className="py-10 text-center text-sm text-[#667085]">
            {rows.length ? "לא נמצאו לקוחות לפי הסינון." : "עדיין אין לקוחות."}
          </p>
        )}
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-[1120px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className={clientButtonClass} onClick={onBack}>
          <ArrowRight size={16} />
          כל הלקוחות
        </button>
        <div className="flex gap-2">
          <button
            className={clientButtonClass}
            onClick={() => setEditing(true)}
          >
            <Pencil size={15} />
            עריכת פרטים
          </button>
          {client.connections.some((account) => account.active) && (
            <button
              className={clientPrimaryClass}
              onClick={() => onOpenReports(client.id)}
            >
              פתח דוחות
              <ExternalLink size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="border-b border-[#e4e7ec] pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="max-w-full break-words text-2xl font-bold">
            {client.name}
          </h1>
          <span className="rounded-md bg-[#eef3f7] px-2 py-1 text-[11px] text-[#475467]">
            {client.onboardingStage === "client_created"
              ? "לקוח נוצר"
              : "התקשרות קיימת"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#667085]">
          <span>{client.packageName || "ללא חבילה"}</span>
          <span>ריטיינר: {money(client.monthlyRetainerAmount)}</span>
          {client.oneTimeAmount !== null && (
            <span>חד־פעמי: {money(client.oneTimeAmount)}</span>
          )}
          <span>תחילת עבודה: {date(client.startDate)}</span>
          <span>{client.ownerName || "ללא אחראי"}</span>
          {client.website && (
            <a
              href={client.website}
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="inline-flex max-w-full items-center gap-1 break-all text-[#087f72] underline"
            >
              {client.website}
              <ExternalLink size={13} className="shrink-0" />
            </a>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {client.includedServices.map((item) => (
            <span
              key={item.code}
              className="rounded-md bg-[#eef3f7] px-2 py-1 text-xs text-[#475467]"
            >
              {CLIENT_SERVICES.find((service) => service.code === item.code)
                ?.label ?? item.code}
            </span>
          ))}
        </div>
      </div>
      {editing && (
        <ClientProfileForm
          client={client}
          owners={owners}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
            setNotice("פרטי הלקוח נשמרו.");
          }}
        />
      )}
      <div
        role="tablist"
        aria-label="פרטי לקוח"
        className="flex flex-wrap gap-x-5 border-b border-[#e4e7ec]"
      >
        {(
          [
            { key: "overview", label: "סקירה" },
            { key: "contacts", label: "אנשי קשר" },
            { key: "activity", label: "פעילות" },
            { key: "website", label: "סריקת אתר" },
            { key: "questionnaire", label: "שאלון לקוח" },
            { key: "kickoff", label: "פגישת אפיון" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            className={`border-b-2 py-3 text-sm ${tab === item.key ? "border-[#111318] font-bold" : "border-transparent text-[#667085]"}`}
            onClick={() => {
              setTab(item.key);
              setPage(0);
              setActivity(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {notice && (
        <p role="status" className="text-sm text-[#087f72]">
          {notice}
        </p>
      )}
      {tab === "website" && <WebsiteIntelligence key={client.id} clientId={client.id} />}
      {tab === "questionnaire" && <ClientQuestionnaire key={client.id} clientId={client.id} />}
      {tab === "kickoff" && <ClientKickoff key={client.id} clientId={client.id} />}
      {tab === "overview" && (
        <div className="space-y-6">
          {client.commercialScope && (
            <section className="border-b border-[#e4e7ec] pb-4">
              <h3 className="mb-3 text-sm font-semibold">scope ההתקשרות</h3>
              <ClientPackageScope scope={client.commercialScope} />
            </section>
          )}
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[#667085]">תחום</dt>
              <dd className="mt-1 text-sm">{client.industry || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#667085]">שירותים כלולים</dt>
              <dd className="mt-1 text-sm">
                {client.includedServices
                  .map(
                    (item) =>
                      CLIENT_SERVICES.find(
                        (service) => service.code === item.code,
                      )?.label ?? item.code,
                  )
                  .join(" · ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#667085]">איש קשר ראשי</dt>
              <dd className="mt-1 text-sm">
                {client.contacts.find((contact) => contact.isPrimary)?.name ||
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#667085]">הערה פנימית</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                {client.internalNotes || "—"}
              </dd>
            </div>
          </dl>
          <div className="border-t border-[#e4e7ec] pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">חיבורים</h3>
              <button
                className={clientButtonClass}
                onClick={() => setConnecting(true)}
              >
                <Link2 size={16} />
                חבר Flashy
              </button>
            </div>
            {client.connections.map((account) => (
              <div
                key={account.id}
                className="mt-3 flex flex-wrap justify-between gap-2 border-b border-[#eaecf0] py-3 text-sm"
              >
                <span>
                  {account.name} · {account.active ? "פעיל" : "לא פעיל"}
                </span>
                <span className="text-[#667085]">
                  סנכרון: {date(account.lastSyncAt)}
                </span>
              </div>
            ))}
            {!client.connections.length && (
              <p className="mt-3 text-sm text-[#667085]">טרם חובר חשבון.</p>
            )}
            {connecting && (
              <FlashyConnection
                client={client}
                onConnected={(message) => {
                  setConnecting(false);
                  setNotice(message);
                  reload();
                }}
                onCancel={() => setConnecting(false)}
              />
            )}
          </div>
        </div>
      )}
      {tab === "contacts" && (
        <div className="space-y-4">
          <button
            className={clientButtonClass}
            onClick={() => setContactForm({ value: emptyContact() })}
          >
            <Plus size={16} />
            הוסף איש קשר
          </button>
          {contactForm && (
            <form
              onSubmit={saveContact}
              className="mx-auto max-w-[840px] space-y-3 border-y border-[#e4e7ec] py-4"
            >
              <fieldset disabled={saving}>
                <ContactFields
                  value={contactForm.value}
                  onChange={(value) =>
                    setContactForm({ ...contactForm, value })
                  }
                />
              </fieldset>
              <div className="flex gap-2">
                <button disabled={saving} className={clientPrimaryClass}>
                  {saving ? "שומר..." : "שמור איש קשר"}
                </button>
                <button
                  disabled={saving}
                  type="button"
                  className={clientButtonClass}
                  onClick={() => setContactForm(null)}
                >
                  ביטול
                </button>
              </div>
            </form>
          )}
          <div className="divide-y divide-[#eaecf0]">
            {client.contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <UserRound size={16} />
                    {contact.name}
                    {contact.isPrimary && (
                      <span className="text-xs font-normal text-[#087f72]">
                        ראשי
                      </span>
                    )}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-4 text-sm text-[#667085]">
                    <span>{contact.jobTitle}</span>
                    {contact.email && (
                      <a
                        dir="ltr"
                        className="underline"
                        href={`mailto:${contact.email}`}
                      >
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        dir="ltr"
                        className="underline"
                        href={`tel:${contact.phone}`}
                      >
                        {contact.phone}
                      </a>
                    )}
                  </div>
                </div>
                <button
                  title={`עריכת ${contact.name}`}
                  aria-label={`עריכת ${contact.name}`}
                  className={clientButtonClass}
                  onClick={() =>
                    setContactForm({
                      id: contact.id,
                      value: {
                        name: contact.name,
                        jobTitle: contact.jobTitle,
                        email: contact.email,
                        phone: contact.phone,
                        isPrimary: contact.isPrimary,
                      },
                    })
                  }
                >
                  <Pencil size={15} />
                </button>
              </div>
            ))}
          </div>
          {!client.contacts.length && (
            <p className="text-sm text-[#667085]">לא נוספו אנשי קשר.</p>
          )}
        </div>
      )}
      {tab === "activity" && (
        <div>
          {activityError ? (
            <p role="alert">{activityError}</p>
          ) : !activity ? (
            <p role="status">טוען פעילות...</p>
          ) : (
            <>
              <ol className="divide-y divide-[#eaecf0]">
                {activity.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm"
                  >
                    <div>
                      <p className="font-bold">
                        {eventLabels[item.action] ?? item.action}
                      </p>
                      <p className="mt-1 text-xs text-[#667085]">
                        {item.actorName ||
                          (item.actorType === "system" ? "מערכת" : "משתמש")}
                      </p>
                    </div>
                    <time dir="ltr" className="text-xs text-[#667085]">
                      {new Date(item.createdAt).toLocaleString("he-IL", {
                        timeZone: "Asia/Jerusalem",
                      })}
                    </time>
                  </li>
                ))}
              </ol>
              {!activity.items.length && (
                <p className="py-5 text-sm text-[#667085]">
                  אין פעילות מתועדת.
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  className={clientButtonClass}
                  disabled={page === 0}
                  onClick={() => {
                    setActivity(null);
                    setPage((current) => current - 1);
                  }}
                >
                  הקודם
                </button>
                <button
                  className={clientButtonClass}
                  disabled={!activity.hasMore}
                  onClick={() => {
                    setActivity(null);
                    setPage((current) => current + 1);
                  }}
                >
                  הבא
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
