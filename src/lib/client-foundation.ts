import { validClientSlug } from "./client-routing.ts";
import {
  CLIENT_SERVICES,
  derivePackageScope,
  packageDefinition,
  packagePrices,
  servicesFromPackage,
  type ServiceCode,
  type IncludedService,
  type PackageCode,
  type PackageScope,
} from "./client-packages.ts";
export {
  CLIENT_SERVICES,
  type ServiceCode,
  type IncludedService,
} from "./client-packages.ts";
export type ContactInput = {
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};
export type ClientProfileInput = {
  name: string;
  urlSlug: string | null;
  website: string | null;
  industry: string | null;
  packageName: string | null;
  monthlyRetainerAmount: string | null;
  oneTimeAmount: string | null;
  packageCode: PackageCode | null;
  commercialScope: PackageScope | null;
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
  existing?: Partial<ClientProfileInput>,
): Partial<ClientProfileInput> {
  const body = object(value);
  const result: Partial<ClientProfileInput> = {};
  const fields = [
    "name",
    "urlSlug",
    "website",
    "industry",
    "packageName",
    "monthlyRetainerAmount",
    "oneTimeAmount",
    "packageCode",
    "commercialScope",
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
    } else if (field === "urlSlug") {
      const slug = text(value, 80, "שם הקישור")?.toLowerCase() ?? null;
      if (slug && !validClientSlug(slug)) throw new ClientInputError("שם הקישור צריך להכיל אותיות באנגלית, מספרים ומקפים, ולא להיות שם שמור.");
      if (existing?.urlSlug && slug !== existing.urlSlug) throw new ClientInputError("לא ניתן לשנות שם קישור שכבר הוגדר.");
      result.urlSlug = slug;
    } else if (field === "includedServices")
      result.includedServices = parseIncludedServices(value ?? []);
    else if (field === "packageCode" || field === "commercialScope") continue;
    else if (field === "monthlyRetainerAmount" || field === "oneTimeAmount") {
      if (value == null || value === "") result[field] = null;
      else {
        if (
          (typeof value !== "number" && typeof value !== "string") ||
          !/^\d+(\.\d{1,2})?$/.test(String(value)) ||
          !Number.isFinite(Number(value)) ||
          Number(value) > 9999999999.99
        )
          throw new ClientInputError(
            "המחיר צריך להיות סכום לא שלילי בשקלים, עד שתי ספרות אחרי הנקודה.",
          );
        result[field] = Number(value).toFixed(2);
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
  const code = Object.hasOwn(body, "packageCode")
    ? body.packageCode
    : existing?.packageCode;
  if (!code) {
    if (existing?.packageCode)
      throw new ClientInputError(
        "אי אפשר להסיר חבילה מובנית. יש לבחור חבילה אחרת.",
      );
    if (body.commercialScope != null)
      throw new ClientInputError("יש לבחור חבילה לפני הגדרת scope.");
    return result;
  }
  const definition = packageDefinition(code);
  if (!definition) throw new ClientInputError("יש לבחור חבילה מהרשימה.");
  const samePackage = existing?.packageCode === code;
  const previous = existing?.commercialScope;
  const input: Record<string, unknown> =
    body.commercialScope === undefined
      ? samePackage
        ? (previous ?? {})
        : {}
      : {
          ...(samePackage ? (previous ?? {}) : {}),
          ...object(body.commercialScope),
        };
  if (input.version !== undefined && input.version !== 1)
    throw new ClientInputError("גרסת החבילה אינה נתמכת.");
  const unchanged =
    samePackage &&
    previous &&
    ["initialCommitmentMonths", "automationSetupTier", "whatsappAddon"].every(
      (key) =>
        !Object.hasOwn(input, key) ||
        input[key] === previous[key as keyof PackageScope],
    );
  let scope: PackageScope;
  try {
    scope = unchanged ? previous : derivePackageScope(code, input);
  } catch (error) {
    throw new ClientInputError(
      error instanceof Error ? error.message : "פרטי החבילה אינם תקינים.",
    );
  }
  if (
    unchanged &&
    Object.hasOwn(input, "campaignLimit") &&
    input.campaignLimit !== previous.campaignLimit
  )
    throw new ClientInputError("מכסת הקמפיינים נגזרת מהחבילה.");
  const services = unchanged
    ? (existing.includedServices ?? servicesFromPackage(definition.code, scope))
    : servicesFromPackage(definition.code, scope);
  if (
    Object.hasOwn(body, "includedServices") &&
    JSON.stringify(result.includedServices) !== JSON.stringify(services)
  )
    throw new ClientInputError("השירותים נגזרים מהחבילה, ולא נבחרים בנפרד.");
  result.packageCode = definition.code;
  result.commercialScope = scope;
  result.packageName = unchanged
    ? (existing.packageName ?? definition.label)
    : definition.label;
  result.includedServices = services;
  const defaults = packagePrices(definition.code, scope);
  if (!partial && !Object.hasOwn(body, "monthlyRetainerAmount"))
    result.monthlyRetainerAmount = defaults.monthlyAmount.toFixed(2);
  if (!partial && !Object.hasOwn(body, "oneTimeAmount"))
    result.oneTimeAmount = defaults.oneTimeAmount.toFixed(2);
  const effectiveMonthly = Object.hasOwn(result, "monthlyRetainerAmount")
    ? result.monthlyRetainerAmount
    : existing?.monthlyRetainerAmount;
  const effectiveOneTime = Object.hasOwn(result, "oneTimeAmount")
    ? result.oneTimeAmount
    : existing?.oneTimeAmount;
  if (effectiveMonthly == null || effectiveOneTime == null)
    throw new ClientInputError(
      "יש להזין את המחירים שסוכמו בפועל; עבור רכיב ללא עלות אפשר להזין 0.",
    );
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
