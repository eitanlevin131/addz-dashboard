// This registry is shared by validation, types and all service selectors.
export const CLIENT_SERVICES = [
  { code: "newsletter", label: "דיוורי אימייל" },
  { code: "automations", label: "אוטומציות" },
  { code: "sms", label: "SMS" },
  { code: "whatsapp", label: "WhatsApp" },
] as const;

export type ServiceCode = (typeof CLIENT_SERVICES)[number]["code"];
export type IncludedService = { code: ServiceCode };
export type ContactInput = {
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};
export type ClientProfileInput = {
  name: string;
  website: string | null;
  industry: string | null;
  packageName: string | null;
  monthlyRetainerAmount: string | null;
  includedServices: IncludedService[];
  startDate: string | null;
  ownerUserId: string | null;
  internalNotes: string | null;
};
export class ClientInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function requireUuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ClientInputError("מזהה הלקוח אינו תקין.");
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ClientInputError("פרטי הבקשה אינם תקינים.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, label: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max)
    throw new ClientInputError(`${label} אינו תקין.`);
  return value.trim() || null;
}
export function parseIncludedServices(value: unknown): IncludedService[] {
  if (!Array.isArray(value) || value.length > CLIENT_SERVICES.length)
    throw new ClientInputError("יש לבחור שירותים מהרשימה.");
  const codes = value.map((item) => object(item).code);
  if (
    codes.some(
      (code) => !CLIENT_SERVICES.some((service) => service.code === code),
    ) ||
    new Set(codes).size !== codes.length
  )
    throw new ClientInputError("רשימת השירותים אינה תקינה.");
  return codes.map((code) => ({ code: code as ServiceCode }));
}
export function parseClientProfile(
  value: unknown,
  partial = false,
): Partial<ClientProfileInput> {
  const body = object(value);
  const result: Partial<ClientProfileInput> = {};
  const fields = [
    "name",
    "website",
    "industry",
    "packageName",
    "monthlyRetainerAmount",
    "includedServices",
    "startDate",
    "ownerUserId",
    "internalNotes",
  ] as const;
  if (partial && !fields.some((field) => Object.hasOwn(body, field)))
    throw new ClientInputError("לא נבחרו פרטים לעדכון.");
  for (const field of fields) {
    if (partial && !Object.hasOwn(body, field)) continue;
    const value = body[field];
    if (field === "name") {
      const name = text(value, 180, "שם העסק");
      if (!name) throw new ClientInputError("יש להזין שם עסק.");
      result.name = name;
    } else if (field === "includedServices")
      result.includedServices = parseIncludedServices(value ?? []);
    else if (field === "monthlyRetainerAmount") {
      if (value == null || value === "") result.monthlyRetainerAmount = null;
      else {
        if (
          (typeof value !== "number" && typeof value !== "string") ||
          !/^\d+(\.\d{1,2})?$/.test(String(value)) ||
          !Number.isFinite(Number(value)) ||
          Number(value) > 9999999999.99
        )
          throw new ClientInputError(
            "הריטיינר צריך להיות סכום לא שלילי בשקלים, עד שתי ספרות אחרי הנקודה.",
          );
        result.monthlyRetainerAmount = Number(value).toFixed(2);
      }
    } else if (field === "ownerUserId")
      result.ownerUserId =
        value == null || value === "" ? null : text(value, 180, "אחראי פנימי");
    else if (field === "startDate") {
      const date = text(value, 10, "תאריך התחלה");
      if (
        date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date)
      )
        throw new ClientInputError("תאריך ההתחלה אינו תקין.");
      result.startDate = date;
    } else if (field === "website") {
      const website = text(value, 2048, "אתר");
      if (website) {
        try {
          const url = new URL(website);
          if (
            !["https:", "http:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw new Error();
        } catch {
          throw new ClientInputError(
            "יש להזין כתובת אתר מלאה המתחילה ב־https:// או http://.",
          );
        }
      }
      result.website = website;
    } else
      result[field] = text(
        value,
        field === "internalNotes" ? 5000 : 180,
        "הפרטים",
      );
  }
  return result;
}
export function parseContact(value: unknown): ContactInput {
  const body = object(value);
  const name = text(body.name, 180, "שם איש הקשר");
  if (!name) throw new ClientInputError("יש להזין שם איש קשר.");
  const email = text(body.email, 254, "אימייל")?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ClientInputError("אימייל איש הקשר אינו תקין.");
  if (body.isPrimary !== undefined && typeof body.isPrimary !== "boolean")
    throw new ClientInputError("בחירת איש קשר ראשי אינה תקינה.");
  return {
    name,
    jobTitle: text(body.jobTitle, 180, "תפקיד"),
    email,
    phone: text(body.phone, 40, "טלפון"),
    isPrimary: body.isPrimary === true,
  };
}
