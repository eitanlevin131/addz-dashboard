"use client";
import { useState, type FormEvent } from "react";
import { Plus, Save, X } from "lucide-react";
import { CLIENT_SERVICES, type ContactInput } from "@/lib/client-foundation";
import type { ClientProfile } from "@/lib/clients";

export const clientFieldClass =
  "mt-1.5 h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#111318] outline-none focus:border-[#087f72] focus:ring-2 focus:ring-[#42dfcf]/20";
export const clientButtonClass =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#344054] disabled:opacity-50";
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
        <label key={field.key} className="text-sm text-[#475467]">
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
      <label className="flex items-center gap-2 text-sm">
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
export function ClientProfileForm({
  client,
  owners,
  onSaved,
  onCancel,
}: {
  client?: ClientProfile;
  owners: { id: string; name: string }[];
  onSaved: (client: ClientProfile) => void;
  onCancel: () => void;
}) {
  const [services, setServices] = useState(client?.includedServices ?? []);
  const [contacts, setContacts] = useState<ContactInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
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
            includedServices: services,
            ...(client ? {} : { contacts }),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload.success)
        throw new Error(payload.message || "שמירת הלקוח נכשלה.");
      onSaved(payload.data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "השמירה נכשלה.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-5 border-y border-[#e4e7ec] py-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">
          {client ? "עריכת פרטי לקוח" : "לקוח חדש"}
        </h2>
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
      <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
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
            {
              name: "packageName",
              label: "חבילה",
              type: "text",
              value: client?.packageName,
            },
            {
              name: "monthlyRetainerAmount",
              label: "ריטיינר חודשי (₪)",
              type: "number",
              value: client?.monthlyRetainerAmount,
            },
            {
              name: "startDate",
              label: "תאריך התחלה",
              type: "date",
              value: client?.startDate,
            },
          ] as const
        ).map((field) => (
          <label key={field.name} className="text-sm text-[#475467]">
            {field.label}
            <input
              name={field.name}
              defaultValue={field.value ?? ""}
              required={field.name === "name"}
              type={field.type}
              min={field.type === "number" ? "0" : undefined}
              max={field.type === "number" ? "9999999999.99" : undefined}
              step={field.type === "number" ? "0.01" : undefined}
              maxLength={field.name === "website" ? 2048 : 180}
              dir={
                field.type === "url" ||
                field.type === "number" ||
                field.type === "date"
                  ? "ltr"
                  : "rtl"
              }
              className={clientFieldClass}
            />
          </label>
        ))}
        <label className="text-sm text-[#475467]">
          אחראי פנימי
          <select
            name="ownerUserId"
            defaultValue={client ? (client.ownerUserId ?? "") : "__creator__"}
            className={clientFieldClass}
          >
            {!client && <option value="__creator__">אני (יוצר הלקוח)</option>}
            <option value="">ללא שיוך</option>
            {client?.ownerUserId &&
              !owners.some((owner) => owner.id === client.ownerUserId) && (
                <option value={client.ownerUserId}>אחראי קודם (לא פעיל)</option>
              )}
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="mb-2 text-sm text-[#475467]">
            שירותים כלולים
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {CLIENT_SERVICES.map((service) => (
              <label
                key={service.code}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={services.some((item) => item.code === service.code)}
                  onChange={(event) =>
                    setServices((current) =>
                      event.target.checked
                        ? [...current, { code: service.code }]
                        : current.filter((item) => item.code !== service.code),
                    )
                  }
                />
                {service.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-sm text-[#475467] md:col-span-2">
          הערה פנימית
          <textarea
            name="internalNotes"
            maxLength={5000}
            defaultValue={client?.internalNotes ?? ""}
            className={`${clientFieldClass} !h-24 py-2`}
          />
        </label>
      </fieldset>
      {!client && (
        <fieldset disabled={busy} className="space-y-4">
          <legend className="mb-3 text-sm font-bold">אנשי קשר</legend>
          {contacts.map((contact, index) => (
            <div key={index} className="border-b border-[#e4e7ec] pb-4">
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
                className="mt-2 text-sm text-[#667085]"
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
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm text-[#b42318]">
          {error}
        </p>
      )}
      <button disabled={busy} className={clientPrimaryClass}>
        <Save size={16} />
        {busy ? "שומר..." : client ? "שמור שינויים" : "צור לקוח"}
      </button>
    </form>
  );
}
