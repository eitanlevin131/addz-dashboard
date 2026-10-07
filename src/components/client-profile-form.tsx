"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Plus,
  Save,
  X,
  RotateCcw,
  Building2,
  Users,
  FileText,
  Layers3,
  Banknote,
  Globe,
  Play,
} from "lucide-react";
import { CLIENT_SERVICES, type ContactInput } from "@/lib/client-foundation";
import {
  CLIENT_PACKAGES,
  ENGAGEMENT_TYPES,
  WHATSAPP_ADDON,
  derivePackageScope,
  packageDefinition,
  packageDisplayLabel,
  packagePrices,
  type PackageCode,
  type PackageScope,
} from "@/lib/client-packages";
import type { ClientProfile } from "@/lib/clients";
import { ClientCommercialSummary } from "@/components/client-commercial-summary";

export const clientFieldClass =
  "mt-1 h-8 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#111318] outline-none transition focus:border-[#087f72] focus:ring-2 focus:ring-[#42dfcf]/20 disabled:opacity-50";
export const clientButtonClass =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#344054] transition hover:bg-[#f8fafb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087f72] disabled:opacity-50";
export const clientPrimaryClass = `${clientButtonClass} !border-[#111318] !bg-[#111318] !text-white`;
export function emptyContact(): ContactInput {
  return { name: "", jobTitle: "", email: "", phone: "", isPrimary: false };
}
export function ContactFields({
  value,
  onChange,
}: {
  value: ContactInput;
  onChange: (value: ContactInput) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(
        [
          { key: "name", label: "שם איש קשר", type: "text" },
          { key: "jobTitle", label: "תפקיד", type: "text" },
          { key: "email", label: "אימייל", type: "email" },
          { key: "phone", label: "טלפון", type: "tel" },
        ] as const
      ).map((field) => (
        <label key={field.key} className="text-xs font-medium text-[#475467]">
          {field.label}
          <input
            required={field.key === "name"}
            maxLength={
              field.key === "phone" ? 40 : field.key === "email" ? 254 : 180
            }
            type={field.type}
            dir={field.type === "email" || field.type === "tel" ? "ltr" : "rtl"}
            className={clientFieldClass}
            value={value[field.key] ?? ""}
            onChange={(event) =>
              onChange({ ...value, [field.key]: event.target.value })
            }
          />
        </label>
      ))}
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={value.isPrimary}
          onChange={(event) =>
            onChange({ ...value, isPrimary: event.target.checked })
          }
        />
        איש קשר ראשי
      </label>
    </div>
  );
}
function FormSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Building2;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[#e4e7ec] py-4 last:border-0">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon size={16} className="text-[#667085]" />
        {title}
      </h3>
      {children}
    </section>
  );
}
export function ClientProfileForm({
  client,
  owners,
  onSaved,
  onCancel,
}: {
  client?: ClientProfile;
  owners: { id: string; name: string }[];
  onSaved: (client: ClientProfile, scanId?: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState<PackageCode | "">(client?.packageCode ?? "");
  const [engagement, setEngagement] = useState<string>(
    client && !client.packageCode
      ? "legacy"
      : (packageDefinition(client?.packageCode)?.type ?? "email_management"),
  );
  const [scope, setScope] = useState<PackageScope | null>(
    client?.commercialScope ?? null,
  );
  const [monthly, setMonthly] = useState(client?.monthlyRetainerAmount ?? "");
  const [oneTime, setOneTime] = useState(client?.oneTimeAmount ?? "");
  const [customMonthly, setCustomMonthly] = useState(
    client?.monthlyRetainerAmount != null,
  );
  const [customOneTime, setCustomOneTime] = useState(
    client?.oneTimeAmount != null,
  );
  const [contacts, setContacts] = useState<ContactInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<ClientProfile | null>(null);
  const scanDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (created && !scanDialog.current?.open) scanDialog.current?.showModal();
  }, [created]);
  const definition = packageDefinition(code);
  const prices = code && scope ? packagePrices(code, scope) : null;
  function choose(nextCode: PackageCode, config: Record<string, unknown> = {}) {
    const nextScope = derivePackageScope(nextCode, config);
    const nextPrices = packagePrices(nextCode, nextScope);
    setCode(nextCode);
    setScope(nextScope);
    if (!customMonthly) setMonthly(nextPrices.monthlyAmount.toFixed(2));
    if (!customOneTime) setOneTime(nextPrices.oneTimeAmount.toFixed(2));
  }
  function changeEngagement(type: string) {
    setEngagement(type);
    if (type === "legacy") {
      setCode("");
      setScope(null);
      setMonthly(client?.monthlyRetainerAmount ?? "");
      setOneTime(client?.oneTimeAmount ?? "");
      return;
    }
    const next = CLIENT_PACKAGES.find((item) => item.type === type);
    if (next) choose(next.code);
  }
  function changePackage(nextCode: PackageCode) {
    const next = packageDefinition(nextCode);
    choose(
      nextCode,
      definition?.type === "email_management" &&
        next?.type === definition.type &&
        scope
        ? {
            initialCommitmentMonths: scope.initialCommitmentMonths,
            automationSetupTier: scope.automationSetupTier,
            whatsappAddon: scope.whatsappAddon,
          }
        : {},
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const body = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    if (body.ownerUserId === "__creator__") delete body.ownerUserId;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        client ? `/api/clients/${client.id}` : "/api/clients",
        {
          method: client ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...body,
            monthlyRetainerAmount: monthly,
            oneTimeAmount: oneTime,
            ...(code ? { packageCode: code, commercialScope: scope } : {}),
            ...(client ? {} : { contacts, startWebsiteScan: false }),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload.success)
        throw new Error(payload.message || "שמירת הלקוח נכשלה.");
      if (!client && payload.data.website) setCreated(payload.data);
      else onSaved(payload.data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "השמירה נכשלה.");
    } finally {
      setBusy(false);
    }
  }
  async function startScan() {
    if (!created || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/clients/${created.id}/website-scans`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "הסריקה לא התחילה. הלקוח כבר נשמר.");
      onSaved(created, payload.data.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "הסריקה לא התחילה. הלקוח כבר נשמר.");
    } finally { setBusy(false); }
  }
  if (created) return <dialog ref={scanDialog} aria-labelledby="initial-scan-title" dir="rtl"
    onCancel={event => { event.preventDefault(); if (!busy) onSaved(created); }}
    className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-lg border border-[#e4e7ec] bg-white p-6 text-[#111318] shadow-xl backdrop:bg-black/30">
    <Globe className="mb-3 text-[#087f72]" size={24} />
    <p className="text-xs font-semibold text-[#087f72]">הלקוח נשמר בהצלחה</p>
    <h2 id="initial-scan-title" className="mt-2 text-lg font-bold">להתחיל סריקת אתר?</h2>
    <p className="mt-2 break-words text-sm text-[#667085]">נאסוף מידע מהאתר של {created.name} כהכנה לשאלון האפיון. אפשר גם להתחיל מאוחר יותר.</p>
    <p dir="ltr" className="mt-3 break-all text-xs text-[#667085]">{created.website}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5 flex flex-wrap gap-2">
      <button type="button" disabled={busy} className={clientPrimaryClass} onClick={() => void startScan()}><Play size={15} />{busy ? "מתחיל סריקה..." : "התחל סריקת אתר"}</button>
      <button type="button" disabled={busy} className={clientButtonClass} onClick={() => onSaved(created)}>לא עכשיו</button>
    </div>
  </dialog>;
  return (
    <form
      onSubmit={submit}
      aria-label={client ? "עריכת לקוח" : "יצירת לקוח"}
      className="mx-auto w-full max-w-[840px] pb-24"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#e4e7ec] pb-4">
        <div className="min-w-0 break-words">
          <p className="mb-1 text-xs text-[#667085]">
            לקוחות / {client ? client.name : "יצירה"}
          </p>
          <h2 className="text-xl font-bold">
            {client ? "עריכת פרטי לקוח" : "לקוח חדש"}
          </h2>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className={clientButtonClass}
          aria-label="סגור עריכת לקוח"
          title="סגור"
        >
          <X size={16} />
        </button>
      </div>
      <fieldset disabled={busy}>
        <FormSection title="פרטי העסק" icon={Building2}>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  name: "name",
                  label: "שם העסק",
                  type: "text",
                  value: client?.name,
                },
                {
                  name: "website",
                  label: "אתר",
                  type: "url",
                  value: client?.website,
                },
                {
                  name: "industry",
                  label: "תחום",
                  type: "text",
                  value: client?.industry,
                },
              ] as const
            ).map((field) => (
              <label
                key={field.name}
                className="text-xs font-medium text-[#475467]"
              >
                {field.label}
                <input
                  name={field.name}
                  defaultValue={field.value ?? ""}
                  required={field.name === "name"}
                  type={field.type}
                  maxLength={field.name === "website" ? 2048 : 180}
                  dir={field.type === "url" ? "ltr" : "rtl"}
                  className={clientFieldClass}
                />
              </label>
            ))}
            <label className="text-xs font-medium text-[#475467]">
              אחראי פנימי
              <select
                name="ownerUserId"
                aria-label="אחראי פנימי"
                defaultValue={
                  client ? (client.ownerUserId ?? "") : "__creator__"
                }
                className={clientFieldClass}
              >
                {!client && (
                  <option value="__creator__">אני (יוצר הלקוח)</option>
                )}
                <option value="">ללא שיוך</option>
                {client?.ownerUserId &&
                  !owners.some((owner) => owner.id === client.ownerUserId) && (
                    <option value={client.ownerUserId}>
                      אחראי קודם (לא פעיל)
                    </option>
                  )}
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </FormSection>
        <FormSection title="מסחר והתקשרות" icon={Banknote}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[#475467]">
              סוג התקשרות
              <select
                aria-label="סוג התקשרות"
                className={clientFieldClass}
                value={engagement}
                onChange={(event) => changeEngagement(event.target.value)}
              >
                {client && !client.packageCode && (
                  <option value="legacy">התקשרות קיימת</option>
                )}
                {ENGAGEMENT_TYPES.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-[#475467]">
              חבילה
              <select
                aria-label="חבילה"
                required={engagement !== "legacy"}
                className={clientFieldClass}
                value={code}
                disabled={engagement === "legacy"}
                onChange={(event) =>
                  changePackage(event.target.value as PackageCode)
                }
              >
                <option value="" disabled>
                  {engagement === "legacy"
                    ? client?.packageName || "ללא חבילה מובנית"
                    : "בחירת חבילה"}
                </option>
                {CLIENT_PACKAGES.filter((item) => item.type === engagement).map(
                  (item) => (
                    <option key={item.code} value={item.code}>
                      {packageDisplayLabel(item.code)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-xs font-medium text-[#475467]">
              תאריך התחלה
              <input
                name="startDate"
                type="date"
                dir="ltr"
                defaultValue={client?.startDate ?? ""}
                className={clientFieldClass}
              />
            </label>
            {definition?.type === "email_management" && scope && (
              <label className="text-xs font-medium text-[#475467]">
                התחייבות ראשונית
                <select
                  aria-label="התחייבות ראשונית"
                  aria-describedby={
                    scope.initialCommitmentMonths === 3
                      ? "commitment-included-setup"
                      : undefined
                  }
                  className={clientFieldClass}
                  value={scope.initialCommitmentMonths ?? 1}
                  onChange={(event) =>
                    choose(definition.code, {
                      initialCommitmentMonths: Number(event.target.value),
                      whatsappAddon: scope.whatsappAddon,
                    })
                  }
                >
                  <option value={1}>ללא התחייבות ראשונית</option>
                  <option value={3}>התחייבות ראשונית ל-3 חודשים</option>
                </select>
                {scope.initialCommitmentMonths === 3 && (
                  <p
                    id="commitment-included-setup"
                    className="mt-1.5 text-xs font-normal leading-5 text-[#087f72]"
                  >
                    כולל הקמת 3 אוטומציות + פופאפ ללא עלות הקמה
                  </p>
                )}
              </label>
            )}
            {definition?.type === "email_management" &&
              scope?.initialCommitmentMonths === 3 && (
                <div className="sm:col-span-2 border-y border-[#eaecf0] py-3">
                  <p className="mb-2 text-xs font-medium text-[#475467]">
                    שדרוג setup (אופציונלי)
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      aria-label="שדרוג ל-6 אוטומציות + פופאפ"
                      checked={scope.automationSetupTier === 6}
                      onChange={(event) =>
                        choose(definition.code, {
                          ...scope,
                          automationSetupTier: event.target.checked ? 6 : 3,
                        })
                      }
                    />
                    <span>6 אוטומציות + פופאפ</span>
                    <bdi
                      dir="ltr"
                      className="mr-auto shrink-0 font-medium text-[#087f72]"
                    >
                      +₪{definition.setupUpgradeAmount.toLocaleString("he-IL")}
                    </bdi>
                  </label>
                </div>
              )}
            {definition && definition.type !== "whatsapp" && scope && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={scope.whatsappAddon}
                  onChange={(event) =>
                    choose(definition.code, {
                      ...scope,
                      whatsappAddon: event.target.checked,
                    })
                  }
                />
                WhatsApp addon{" "}
                <span className="text-xs text-[#667085]">
                  ₪{WHATSAPP_ADDON.oneTimeAmount.toLocaleString("he-IL")}{" "}
                  חד־פעמי
                </span>
              </label>
            )}
          </div>
          <div className="mt-3 grid gap-3 border-t border-[#eaecf0] pt-3 sm:grid-cols-2">
            {prices && (
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium text-[#344054]">
                  <input
                    type="checkbox"
                    checked={customMonthly || customOneTime}
                    onChange={(event) => {
                      const custom = event.target.checked;
                      setCustomMonthly(custom);
                      setCustomOneTime(custom);
                      if (!custom) {
                        setMonthly(prices.monthlyAmount.toFixed(2));
                        setOneTime(prices.oneTimeAmount.toFixed(2));
                      }
                    }}
                  />
                  מחיר מותאם / מחיר היסטורי
                </label>
                <p className="mt-1 text-xs leading-5 text-[#667085]">
                  המחירים שסוכמו עם הלקוח נשמרים בנפרד מהיקף החבילה, גם עבור לקוח חוזר.
                  {customMonthly || customOneTime
                    ? " ביטול ההתאמה יחזיר את שני הסכומים למחירון החבילה."
                    : " מחירון החבילה הוא ברירת המחדל בלבד."}
                </p>
              </div>
            )}
            {[
              {
                label: "ריטיינר חודשי בפועל (₪)",
                value: monthly,
                onChange: setMonthly,
                dirty: setCustomMonthly,
                defaultValue: prices?.monthlyAmount,
              },
              {
                label: "סכום חד פעמי בפועל (₪)",
                value: oneTime,
                onChange: setOneTime,
                dirty: setCustomOneTime,
                defaultValue: prices?.oneTimeAmount,
              },
            ].map((field) => (
              <div key={field.label}>
                <label className="text-xs font-semibold text-[#475467]">
                  {field.label}
                  <input
                    type="number"
                    required={Boolean(code)}
                    min="0"
                    max="9999999999.99"
                    step="0.01"
                    dir="ltr"
                    value={field.value}
                    className={`${clientFieldClass} !h-10 !text-base font-semibold tabular-nums`}
                    onChange={(event) => {
                      field.dirty(true);
                      field.onChange(event.target.value);
                    }}
                  />
                </label>
                {field.defaultValue !== undefined && (
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-[#667085]">
                    <span>
                      מחירון: ₪{field.defaultValue.toLocaleString("he-IL")}
                    </span>
                    <button
                      type="button"
                      title="החזר למחיר ברירת המחדל"
                      aria-label={`איפוס ${field.label} למחירון`}
                      onClick={() => {
                        field.dirty(false);
                        field.onChange(field.defaultValue!.toFixed(2));
                      }}
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </FormSection>
        <FormSection title="סיכום ההתקשרות" icon={Layers3}>
          {scope && code ? (
            <ClientCommercialSummary
              packageCode={code}
              scope={scope}
              monthly={monthly}
              oneTime={oneTime}
            />
          ) : (
            <p className="text-sm text-[#667085]">
              {engagement === "legacy"
                ? `${client?.packageName || "התקשרות קיימת"} · ${client?.includedServices.map((item) => CLIENT_SERVICES.find((service) => service.code === item.code)?.label ?? item.code).join(" · ") || "ללא שירותים מוגדרים"}`
                : "טרם נבחרה חבילה"}
            </p>
          )}
        </FormSection>
        <FormSection title="אנשי קשר" icon={Users}>
          {client ? (
            <div className="flex flex-wrap gap-3 text-sm">
              {client.contacts.map((contact) => (
                <span key={contact.id}>
                  {contact.name}
                  {contact.isPrimary && (
                    <span className="mr-1 text-xs text-[#087f72]">ראשי</span>
                  )}
                </span>
              ))}
              {!client.contacts.length && (
                <span className="text-[#667085]">לא נוספו אנשי קשר</span>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {contacts.map((contact, index) => (
                <div
                  key={index}
                  className="relative border-b border-[#eaecf0] pb-4"
                >
                  <ContactFields
                    value={contact}
                    onChange={(value) =>
                      setContacts((current) =>
                        current.map((item, i) =>
                          i === index
                            ? value
                            : value.isPrimary
                              ? { ...item, isPrimary: false }
                              : item,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    title="הסר מהטיוטה"
                    aria-label={`הסר איש קשר ${index + 1} מהטיוטה`}
                    className="mt-2 text-[#667085]"
                    onClick={() =>
                      setContacts((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                disabled={contacts.length >= 30}
                type="button"
                className={clientButtonClass}
                onClick={() =>
                  setContacts((current) => [
                    ...current,
                    { ...emptyContact(), isPrimary: current.length === 0 },
                  ])
                }
              >
                <Plus size={16} />
                הוסף איש קשר
              </button>
            </div>
          )}
        </FormSection>
        <FormSection title="הערות פנימיות" icon={FileText}>
          <label className="block text-xs text-[#667085]">
            הערה פנימית
            <textarea
              name="internalNotes"
              maxLength={5000}
              defaultValue={client?.internalNotes ?? ""}
              className={`${clientFieldClass} !h-20 py-2`}
            />
          </label>
        </FormSection>
      </fieldset>
      <div className="fixed inset-x-3 bottom-0 z-30 mx-auto flex max-w-[840px] flex-wrap items-center gap-3 border-t border-[#e4e7ec] bg-white px-3 py-3 lg:left-6 lg:right-[220px]">
        <button disabled={busy} className={clientPrimaryClass}>
          <Save size={16} />
          {busy ? "שומר..." : client ? "שמור שינויים" : "צור לקוח"}
        </button>
        <button
          type="button"
          disabled={busy}
          className={clientButtonClass}
          onClick={onCancel}
        >
          ביטול
        </button>
        {error && (
          <p role="alert" className="basis-full text-sm text-[#b42318]">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
