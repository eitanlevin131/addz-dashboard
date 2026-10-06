import type { QuestionItem } from "./core.ts";

export type QuestionPresentation = { prompt: string; facts: { label: string; value: string }[]; text: string };
const PROMPTS: Record<string, string> = {
  shipping_text: "האם מדיניות המשלוחים באתר עדיין עדכנית?", shipping: "האם פרטי המשלוחים האלה נכונים?",
  returns_text: "האם מדיניות ההחזרות והביטולים עדיין עדכנית?", returns: "האם תנאי ההחזרה האלה נכונים?",
  contact_text: "האם אלה פרטי שירות הלקוחות שלכם?", contact_email: "האם זו כתובת שירות הלקוחות הנכונה?", support: "האם פרטי שירות הלקוחות האלה נכונים?",
  product: "האם פרטי המוצר לדוגמה עדיין נכונים?", categories: "האם קבוצת המוצרים הזו מייצגת את הפעילות שלכם?",
  brand_name: "האם זה שם המותג שבו נשתמש?", brand_description: "האם כך נכון לתאר את העסק שלכם?", description: "האם כך נכון לתאר את העסק שלכם?",
  brand_story: "האם זה משקף את סיפור המותג שלכם?", tone: "האם השפה הזו מרגישה כמו המותג שלכם?",
  positioning: "האם הכיוון הזה משקף את המיצוב שלכם?", differentiators: "האם זו סיבה אמיתית לבחור בכם?",
  benefits: "האם היתרון הזה מדויק עבור המוצר?", faq_text: "האם התשובות באתר עדיין עדכניות?",
};
// Formatting only: no summarization, inferred facts, or changes to the immutable source.
export function questionPresentation(question: QuestionItem): QuestionPresentation {
  if (!question.source) return { prompt: question.label, facts: [], text: "" };
  const { source } = question;
  const raw = source.value;
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const facts: QuestionPresentation["facts"] = [];
  if (source.key === "product") {
    if (typeof row.name === "string") facts.push({ label: "מוצר לדוגמה", value: row.name });
    if ((typeof row.price === "string" || typeof row.price === "number") && row.price !== "") {
      const currency = typeof row.currency === "string" ? row.currency : "";
      facts.push({ label: "מחיר שהופיע באתר", value: `${row.price}${currency ? ` ${currency === "ILS" ? "₪" : currency}` : ""}` });
    }
  }
  const prompt = PROMPTS[source.key] || (source.category === "audience"
    ? source.authority === "website_inferred" ? "האם הקהל הזה באמת רלוונטי לעסק שלכם?" : "האם זה קהל שאתם פונים אליו כיום?"
    : source.authority === "website_inferred" ? `האם הכיוון הזה מתאים לכם? (${question.label})` : `האם המידע הזה מדויק? (${question.label})`);
  return { prompt, facts, text: facts.length ? "" : question.suggestion || "" };
}
export function answerNeedsText(state: string) { return ["partial", "corrected", "answered"].includes(state); }
