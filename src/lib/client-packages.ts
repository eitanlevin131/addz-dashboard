export const CLIENT_SERVICES = [
  { code: "newsletter", label: "דיוורי אימייל" },
  { code: "automations", label: "אוטומציות" },
  { code: "sms", label: "SMS" },
  { code: "whatsapp", label: "WhatsApp" },
] as const;
export type ServiceCode = (typeof CLIENT_SERVICES)[number]["code"];
export type IncludedService = { code: ServiceCode };
export const EMAIL_DELIVERABLES = [
  { code: "strategy_calendar", label: "אסטרטגיה וגאנט" },
  { code: "copy", label: "קופי" },
  { code: "design", label: "עיצוב" },
  { code: "implementation", label: "הקמה" },
  { code: "qa", label: "QA" },
  { code: "scheduling_delivery", label: "תזמון ושליחה" },
  { code: "measurement_optimization", label: "מדידה ואופטימיזציה" },
] as const;
export const AUTOMATION_DEFINITIONS = [
  { code: "welcome", label: "Welcome" },
  { code: "checkout_abandonment", label: "Checkout Abandonment" },
  { code: "post_purchase_reviews", label: "Post Purchase + Reviews" },
  { code: "browse_abandonment", label: "Browse Abandonment" },
  { code: "winback", label: "Winback" },
  { code: "birthday", label: "Birthday" },
] as const;
export const DELIVERABLE_DEFINITIONS = [
  ...EMAIL_DELIVERABLES,
  { code: "whatsapp_setup", label: "הקמת WhatsApp" },
] as const;
export const ENGAGEMENT_TYPES = [
  { code: "email_management", label: "ניהול Email Marketing חודשי" },
  { code: "automation_setup", label: "פרויקט הקמת אוטומציות" },
  { code: "whatsapp", label: "אוטומציות WhatsApp בלבד" },
] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number]["code"];
export const CLIENT_PACKAGES = [
  {
    code: "email_5",
    type: "email_management",
    label: "Email Marketing · 5 קמפיינים",
    campaignLimit: 5,
    monthlyAmount: 3500,
    oneTimeAmount: 0,
    setupTier: 0,
    setupUpgradeAmount: 3000,
  },
  {
    code: "email_8",
    type: "email_management",
    label: "Email Marketing · 8 קמפיינים",
    campaignLimit: 8,
    monthlyAmount: 5000,
    oneTimeAmount: 0,
    setupTier: 0,
    setupUpgradeAmount: 2000,
  },
  {
    code: "automation_setup_3",
    type: "automation_setup",
    label: "3 אוטומציות + Popup",
    campaignLimit: null,
    monthlyAmount: 0,
    oneTimeAmount: 5000,
    setupTier: 3,
    setupUpgradeAmount: 0,
  },
  {
    code: "automation_setup_6",
    type: "automation_setup",
    label: "6 אוטומציות + Popup",
    campaignLimit: null,
    monthlyAmount: 0,
    oneTimeAmount: 9000,
    setupTier: 6,
    setupUpgradeAmount: 0,
  },
  {
    code: "whatsapp_standalone",
    type: "whatsapp",
    label: "WhatsApp · הקמה עצמאית",
    campaignLimit: null,
    monthlyAmount: 0,
    oneTimeAmount: 2000,
    setupTier: 0,
    setupUpgradeAmount: 0,
  },
] as const;
export const WHATSAPP_ADDON = {
  code: "whatsapp",
  label: "הקמת WhatsApp",
  oneTimeAmount: 1000,
} as const;
export type PackageCode = (typeof CLIENT_PACKAGES)[number]["code"];
export type PackageScope = {
  version: 1;
  campaignLimit: number | null;
  initialCommitmentMonths: number | null;
  automationSetupTier: 0 | 3 | 6;
  whatsappAddon: boolean;
  includesPopup: boolean;
  deliverables: string[];
  automationCodes: string[];
};
export function packageDefinition(code: unknown) {
  return CLIENT_PACKAGES.find((item) => item.code === code);
}
export function packageDisplayLabel(code: PackageCode) {
  const definition = packageDefinition(code)!;
  if (definition.type === "email_management")
    return `${definition.campaignLimit} קמפיינים בחודש`;
  if (definition.type === "automation_setup")
    return `${definition.setupTier} אוטומציות + פופאפ`;
  return "אוטומציות WhatsApp בלבד";
}
export function derivePackageScope(
  code: unknown,
  config: Record<string, unknown> = {},
): PackageScope {
  const definition = packageDefinition(code);
  if (!definition) throw new Error("יש לבחור חבילה מהרשימה.");
  if (config.version !== undefined && config.version !== 1)
    throw new Error("גרסת החבילה אינה נתמכת.");
  const email = definition.type === "email_management";
  const commitment =
    config.initialCommitmentMonths === undefined
      ? email
        ? 1
        : null
      : config.initialCommitmentMonths;
  if (
    (email && commitment !== 1 && commitment !== 3) ||
    (!email && commitment !== null)
  )
    throw new Error("תנאי ההתחייבות אינם מתאימים לחבילה.");
  const tier =
    config.automationSetupTier === undefined
      ? email && commitment === 3
        ? 3
        : definition.setupTier
      : config.automationSetupTier;
  if (
    email
      ? commitment === 3
        ? tier !== 3 && tier !== 6
        : tier !== 0
      : tier !== definition.setupTier
  )
    throw new Error("מסלול האוטומציות אינו מתאים לחבילה ולהתחייבות.");
  const whatsapp =
    config.whatsappAddon === undefined ? false : config.whatsappAddon;
  if (
    typeof whatsapp !== "boolean" ||
    (definition.type === "whatsapp" && whatsapp)
  )
    throw new Error("תוספת WhatsApp אינה מתאימה לחבילה.");
  if (
    config.campaignLimit !== undefined &&
    config.campaignLimit !== definition.campaignLimit
  )
    throw new Error("מכסת הקמפיינים נגזרת מהחבילה.");
  return {
    version: 1,
    campaignLimit: definition.campaignLimit,
    initialCommitmentMonths: commitment as number | null,
    automationSetupTier: tier as 0 | 3 | 6,
    whatsappAddon: whatsapp,
    includesPopup: Number(tier) > 0,
    deliverables: [
      ...(email ? EMAIL_DELIVERABLES.map((item) => item.code) : []),
      ...(definition.type === "whatsapp" || whatsapp ? ["whatsapp_setup"] : []),
    ],
    automationCodes: AUTOMATION_DEFINITIONS.slice(0, Number(tier)).map(
      (item) => item.code,
    ),
  };
}
export function servicesFromPackage(
  code: PackageCode,
  scope: PackageScope,
): IncludedService[] {
  const definition = packageDefinition(code)!;
  return [
    ...(definition.type === "email_management"
      ? [{ code: "newsletter" as const }]
      : []),
    ...(scope.automationSetupTier ? [{ code: "automations" as const }] : []),
    ...(definition.type === "whatsapp" || scope.whatsappAddon
      ? [{ code: "whatsapp" as const }]
      : []),
  ];
}
export function packagePrices(code: PackageCode, scope: PackageScope) {
  const definition = packageDefinition(code)!;
  return {
    monthlyAmount: definition.monthlyAmount,
    oneTimeAmount:
      definition.oneTimeAmount +
      (definition.type === "email_management" && scope.automationSetupTier === 6
        ? definition.setupUpgradeAmount
        : 0) +
      (scope.whatsappAddon ? WHATSAPP_ADDON.oneTimeAmount : 0),
  };
}
