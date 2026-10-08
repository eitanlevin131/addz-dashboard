import { allTopics, type Domain, type KickoffRecord, type Topic } from "./core.ts";

export const DOCUMENT_SECTIONS: { id: string; title: string; domains: Domain[] }[] = [
  { id: "business", title: "רקע על העסק וסיפור המותג", domains: ["identity"] },
  { id: "purchase", title: "כאבים, צרכים ורצונות", domains: ["pains", "desires"] },
  { id: "customers", title: "קהל היעד והלקוחות", domains: ["audience", "customer_context"] },
  { id: "positioning", title: "מיצוב, הבטחה ובידול", domains: ["positioning", "differentiation"] },
  { id: "buying", title: "מניעים לרכישה והתנגדויות", domains: ["motivations", "objections"] },
  { id: "products", title: "מוצרים וקטגוריות בעדיפות", domains: ["products"] },
  { id: "language", title: "שפת המותג ומסרים", domains: ["voice", "rules"] },
  { id: "commercial", title: "מדיניות מסחרית ושיווק", domains: ["commercial", "services"] },
  { id: "operations", title: "תפעול, שירות וחומרי עבודה", domains: ["operations"] },
  { id: "priorities", title: "מטרות העבודה ונושאים להמשך", domains: ["cross_domain"] },
];

const FIELD_LABELS: Record<string, string> = {
  brand_name: "שם המותג", short_description: "תיאור העסק", brand_description: "תיאור העסק",
  brand_story: "סיפור המותג", positioning: "מיצוב", differentiators: "בידול",
  brand_positioning: "המיצוב הרצוי", brand_promise: "ההבטחה ללקוח", brand_differentiators: "הבידול וההוכחות",
  customer_pains: "בעיות ותסכולים של הלקוחות", customer_needs: "צרכים שחשוב לתת להם מענה", customer_desires: "רצונות ותוצאות רצויות",
  purchase_motivations: "מניעים לרכישה", purchase_objections: "התנגדויות וחסמים לקנייה",
  category_priorities: "4 הקטגוריות המובילות לפי סדר", product_bestsellers: "8 המוצרים הנמכרים ביותר לפי סדר",
  products: "מוצרים", product_catalog_overview: "מגוון המוצרים", categories: "קטגוריות מוצרים",
  catalog_listing: "מגוון המוצרים באתר", product: "מוצר ומחיר", description: "תיאור העסק",
  shipping_text: "משלוחים ואספקה", returns_text: "החלפות, החזרות וביטולים",
  faq_text: "מידע שימושי ושאלות נפוצות", support: "שירות לקוחות", support_contact: "שירות לקוחות",
  audience_explicit: "קהלים שהעסק פונה אליהם", audience_likely: "קהלים אפשריים לבדיקה",
  priority_audiences: "קהל היעד בעדיפות", customer_reality: "הלקוחות וסיבות הרכישה",
  audience_priority: "קהל היעד בעדיפות", changes: "שינויים והשקות קרובות",
  brand_correction: "דיוק שפת המותג", brand_voice: "דיוק שפת המותג", approved_claims: "ניסוחים מאושרים ומגבלות",
  vip: "מועדון לקוחות ולקוחות VIP", calendar: "לוח שיווק ותדירות הקשר",
  priority_products: "מוצרים בעדיפות לקידום", product_priorities: "מוצרים בעדיפות לקידום",
  priorities: "סדרי עדיפויות", red_lines: "ניסוחים והבטחות שלא נשתמש בהם",
  discount_rules: "הנחות וקופונים", assets: "חומרי מותג ותמונות", access: "איש קשר לגישות למערכות",
  tone: "סגנון ושפת המותג", vocabulary: "מילים וביטויים חוזרים", cta_patterns: "הנעה לפעולה",
};

export function documentFieldLabel(topic: Topic) {
  return FIELD_LABELS[topic.question?.source?.key || ""] || FIELD_LABELS[topic.id] || topic.label;
}

function documentDomain(topic: Topic): Domain {
  // Existing snapshots remain immutable, including older broad domain assignments.
  if (topic.question?.source?.key === "catalog_listing") return "products";
  if (["brand_voice", "brand_correction"].includes(topic.id)) return "voice";
  return topic.domain;
}

// Presentation only: a proposal or correction never becomes an approved value here.
export function characterizationDocument(record: Pick<KickoffRecord, "snapshot" | "addedTopics" | "decisions">) {
  const topics = allTopics(record);
  return DOCUMENT_SECTIONS.map(section => ({ ...section, fields: topics.filter(topic => section.domains.includes(documentDomain(topic))).map(topic => {
    const decision = record.decisions[topic.id];
    const state = decision?.outcome === "follow_up" ? "follow_up" : decision?.outcome === "unresolved" ? "unresolved" : decision ? "resolved" : topic.knownValue ? "resolved" : "unresolved";
    const value = state === "resolved" ? decision?.value || topic.knownValue || "" : "";
    const draft = topic.answer?.text || topic.question?.suggestion || "";
    return { topic, label: documentFieldLabel(topic), decision, state, value,
      draft: state !== "resolved" ? decision?.value || draft : "",
      authority: decision ? "kickoff_decision" as const : topic.knownAuthority,
      draftAuthority: decision?.value ? "meeting_draft" : topic.answer?.text ? "client_answer" : topic.question?.source ? "website_proposal" : "none",
    };
  }) }));
}
