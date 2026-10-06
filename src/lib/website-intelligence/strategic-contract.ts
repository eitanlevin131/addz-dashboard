export const STRATEGIC_VERSION = { skillName: "website_strategic_intelligence", skillVersion: "1", promptVersion: "2", schemaVersion: "2" } as const;
export const STRATEGIC_DOMAINS = {
  positioning: { label: "מיצוב ותיאור העסק", category: "brand", keys: ["positioning", "brand_description"] },
  audience: { label: "קהל ומצבי שימוש", category: "audience", keys: ["audience_explicit", "audience_likely", "use_cases"] },
  needs: { label: "צרכים וכאבים", category: "problems", keys: ["stated_problems", "pain_points_likely"] },
  outcomes: { label: "יתרונות ותוצאות רצויות", category: "problems", keys: ["benefits", "desired_outcomes"] },
  differentiation: { label: "סיבות לבחירה וטענות המותג", category: "differentiation", keys: ["differentiators", "claims_language"] },
  voice: { label: "שפה וקול", category: "voice", keys: ["tone", "vocabulary", "cta_patterns"] },
  objections: { label: "שאלות וחסמים לקנייה", category: "problems", keys: ["purchase_objections"] },
} as const;
export type StrategicDomain = keyof typeof STRATEGIC_DOMAINS;
export const STRATEGIC_TASKS = Object.keys(STRATEGIC_DOMAINS) as StrategicDomain[];
export type IntelligenceClassification = "OBSERVED" | "INFERRED" | "HYPOTHESIS";
export function intelligenceClassification(value: unknown, observationStatus: string): IntelligenceClassification {
  if (value && typeof value === "object" && "classification" in value && value.classification === "HYPOTHESIS") return "HYPOTHESIS";
  return observationStatus === "observed" ? "OBSERVED" : "INFERRED";
}
export const INTELLIGENCE_LABELS = { OBSERVED: "נצפה באתר", INFERRED: "הסקה מבוססת ראיות", HYPOTHESIS: "השערה לשאלת הלקוח" };
// Explicit capability routing: Terra/Sol do not accept Mini's minimal effort.
export function websiteReasoning(model: string, strategic = false) {
  return model.startsWith("gpt-5") ? { reasoning: { effort: strategic || /terra|sol/.test(model) ? "medium" : "minimal" } } : {};
}
