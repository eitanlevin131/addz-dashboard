import type { QuestionItem } from "./core.ts";
import { readableSourceBlocks, catalogProductName, type SourceBlock } from "./readable-source.ts";
import { rankedAnswerError } from "./ranked-answer.ts";

export type QuestionPresentation = { prompt: string; facts: { label: string; value: string }[]; text: string; blocks?: SourceBlock[]; help?: string; placeholder?: string };
export const ASK_CONTENT: Record<string, { label: string; help: string; placeholder: string }> = {
  brand_story: { label: "ספרו לנו על העסק: מה אתם עושים, איך התחלתם ולמה הקמתם את המותג?", help: "מה הרקע שלכם, מתי העסק הוקם, מה הוביל להקמה ואילו תחנות משמעותיות עיצבו אותו? כתבו גם מה חשוב לכם שהלקוחות יכירו בסיפור שלכם.", placeholder: "איך הכול התחיל, מה השתנה בדרך ומה העסק מציע היום?" },
  brand_positioning: { label: "איך תרצו שהלקוחות יתפסו את המותג ביחס לחלופות?", help: "באיזה תחום אתם רוצים להיות הבחירה של הלקוח, עבור מי, ומה צריך להיות ברור לו עליכם? אפשר לתאר במילים פשוטות, לא צריך סלוגן.", placeholder: "למי אנחנו מתאימים, באיזו בחירה אנחנו רוצים להצטיין ואיך נרצה שיתארו אותנו?" },
  brand_promise: { label: "מה ההבטחה המרכזית שלכם ללקוח, ומה אתם באמת יכולים לקיים?", help: "איזו תוצאה או חוויה הלקוח יכול לצפות לקבל? ציינו גם תנאים או מגבלות שחשוב לא להשמיט. אם אין הבטחה מוגדרת, אפשר לכתוב זאת.", placeholder: "מה אפשר להבטיח, ובאילו תנאים?" },
  brand_differentiators: { label: "למה לקוח יבחר דווקא בכם ולא בחלופות?", help: "ציינו הבדלים אמיתיים במוצר, בשירות או בדרך העבודה. הוסיפו דוגמה או הוכחה לכל יתרון שאפשר להציג, ולא רק תיאור כללי כמו איכות או שירות טוב.", placeholder: "מה שונה אצלנו, לעומת מי, ואיך הלקוח מרגיש או רואה את ההבדל?" },
  customer_pains: { label: "אילו בעיות או תסכולים גורמים ללקוחות לחפש את המוצרים שלכם?", help: "מה קשה או לא עובד להם לפני הקנייה? לכל בעיה, תארו איך המוצר או השירות שלכם עוזרים. התבססו על מה שלקוחות מספרים לכם; אם זו השערה, ציינו זאת.", placeholder: "הבעיה של הלקוח → איך אנחנו עוזרים לפתור אותה" },
  customer_needs: { label: "מה הלקוחות צריכים לקבל מהמוצר או מהשירות כדי שיתאים להם?", help: "מה חיוני עבורם בבחירה, ומה התפקיד של כל צורך בהחלטה? אפשר לציין צרכים מעשיים או רגשיים, לפי מה שאתם באמת שומעים מהלקוחות.", placeholder: "מה הלקוח חייב לקבל, ואיך אנחנו נותנים לזה מענה?" },
  customer_desires: { label: "מה הלקוחות רוצים להשיג או להרגיש אחרי הקנייה?", help: "תארו את התוצאה הרצויה במילים של הלקוחות. הפרידו בין דברים שאתם יודעים משיחות או משוב לבין השערות שעוד צריך לבדוק.", placeholder: "אחרי הקנייה, הלקוח רוצה..." },
  purchase_motivations: { label: "מה גורם ללקוחות להחליט לקנות דווקא עכשיו?", help: "באילו מצבים הם מגיעים אליכם ומה בדרך כלל דוחף את ההחלטה? ספרו על מקרה אמיתי, אם יש לכם, ועל מה ששכנע את הלקוח לבחור בכם.", placeholder: "מה קרה לפני הקנייה, ומה הכריע את ההחלטה?" },
  purchase_objections: { label: "מה גורם ללקוחות להסס או לוותר לפני הקנייה?", help: "ציינו שאלות, חששות וחסמים שחוזרים בשיחות עם לקוחות. איך אתם עונים להם כיום, ומה עדיין לא מצליח להסיר את החשש?", placeholder: "החשש או ההתנגדות → המענה שלנו, או מה שעדיין חסר" },
  category_priorities: { label: "דרגו את 4 הקטגוריות המובילות בעסק לפי סדר החשיבות", help: "במקום הראשון שימו את הקטגוריה החשובה ביותר לפעילות העסק, ואחריה את הבאות לפי הסדר. כתבו שמות של קבוצות מוצרים, לא מוצרים בודדים. אם יש פחות מ־4 קטגוריות, מלאו רק את הקיימות ברצף.", placeholder: "שם הקטגוריה" },
  product_bestsellers: { label: "דרגו את 8 המוצרים הנמכרים ביותר, מהמוכר ביותר והלאה", help: "התבססו על נתוני המכירות שלכם, לא רק על מה שתרצו לקדם. ציינו שם מוצר מדויק; אם יש פחות מ־8 מוצרים או שאין דירוג ידוע, אין צורך להמציא רשימה.", placeholder: "שם המוצר" },
  audience_priority: { label: "מי הלקוחות העיקריים שלכם, ואילו קהלים תרצו להגיע אליהם?", help: "למשל: לקוחות פרטיים או עסקים, קנייה לעצמם או למתנה, לקוחות חדשים או חוזרים. ציינו מה רלוונטי לעסק שלכם.", placeholder: "מי קונה אצלכם היום, ומי הייתם רוצים שיקנה יותר?" },
  discount_rules: { label: "מה ההנחה המקסימלית שמותר לנו להציע, ובאילו תנאים?", help: "ציינו אחוז הנחה או סכום, מינימום הזמנה, החרגות למוצרים או לקוחות והאם מותר לשלב קופונים.", placeholder: "למשל: עד 10%, בהזמנה מעל 300 ₪, ללא כפל מבצעים. זו דוגמה בלבד." },
  assets: { label: "אילו חומרי מותג ותמונות תוכלו לשתף איתנו?", help: "צרפו לוגו, הנחיות מותג וקישורים לתיקיות תמונות מימי צילום, אחרי שסיננתם ובחרתם את החומרים הרלוונטיים. אפשר לצרף גם קבצים.", placeholder: "מה נמצא בכל תיקייה, ואילו חומרים חשוב לנו להשתמש בהם?" },
  access: { label: "מול מי נתנהל כדי לקבל גישה למערכות העבודה הרלוונטיות?", help: "ציינו שם, תפקיד ודרך ליצירת קשר. אין להזין כאן סיסמאות או מפתחות API.", placeholder: "למשל: שם איש הקשר שמטפל באתר ובמערכת הדיוור, ואיך ליצור איתו קשר." },
};
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
  if (!question.source) {
    const copy = ASK_CONTENT[question.id];
    return { prompt: copy?.label || question.label, facts: [], text: "", ...(copy ? { help: copy.help, placeholder: copy.placeholder } : {}) };
  }
  const { source } = question;
  const raw = source.value;
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const facts: QuestionPresentation["facts"] = [];
  if (source.key === "catalog_listing") {
    if (Array.isArray(row.products)) for (const product of row.products.slice(0, 5)) {
      if (product && typeof product.name === "string") {
        const name = catalogProductName(product.name);
        if (name) facts.push({ label: "דוגמה מהמוצרים שלכם", value: name });
      }
    }
    return { prompt: "האם המוצרים האלה משקפים את המגוון שלכם? האם חסרה קטגוריה חשובה?", facts, text: "", help: "אלה כמה דוגמאות שמצאנו באתר. אין צורך לאשר כל מוצר בנפרד; חשוב לנו להבין אם חסר תחום פעילות או סוג מוצרים שכדאי להכיר." };
  }
  if (source.key === "product") {
    if (typeof row.name === "string") facts.push({ label: "מוצר לדוגמה", value: row.name });
    if ((typeof row.price === "string" || typeof row.price === "number") && row.price !== "") {
      const currency = typeof row.currency === "string" ? row.currency : "";
      facts.push({ label: "מחיר שהופיע באתר", value: `${row.price}${currency ? ` ${currency === "ILS" ? "₪" : currency}` : ""}` });
    }
  }
  const prompt = source.authority === "website_hypothesis" ? `זו השערה לא מאומתת: האם היא רלוונטית לכם? (${question.label})` : PROMPTS[source.key] || (source.category === "audience"
    ? source.authority === "website_inferred" ? "האם הקהל הזה באמת רלוונטי לעסק שלכם?" : "האם זה קהל שאתם פונים אליו כיום?"
    : source.authority === "website_inferred" ? `האם הכיוון הזה מתאים לכם? (${question.label})` : `האם המידע הזה מדויק? (${question.label})`);
  const content = facts.length ? "" : question.suggestion || "";
  return { prompt, facts, text: content, ...(content ? { blocks: readableSourceBlocks(content) } : {}) };
}
export function answerNeedsText(state: string) { return ["partial", "corrected", "answered"].includes(state); }

export function answerIsComplete(question: Pick<QuestionItem, "action" | "links" | "ranking">, answer?: { state: string; text: string; links?: string[]; attachments?: unknown[] }) {
  if (!answer) return false;
  if (!answerNeedsText(answer.state)) return true;
  if (question.ranking && answer.state === "answered") return !rankedAnswerError(answer.text, question.ranking);
  return Boolean(answer.text.trim() || question.action === "ask" && question.links && (answer.links?.length || answer.attachments?.length));
}

export function firstUnanswered<T extends Pick<QuestionItem, "id" | "action" | "links" | "ranking">>(items: T[], answers: Record<string, { state: string; text: string; links?: string[]; attachments?: unknown[] }>) {
  return items.find(item => !answerIsComplete(item, answers[item.id]));
}
