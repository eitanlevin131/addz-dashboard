export type SourceBlock = { kind: "heading" | "paragraph"; text: string };

// Add layout boundaries only. All source wording, amounts and conditions survive.
export function readableSourceBlocks(text: string): SourceBlock[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const marked = normalized
    .replace(/\s+(?=דמי משלוח עבור|איסוף עצמי[:：]|זמני אספקה[:：]|אספקת הזמנה|ביטולי עסקה והחזרות[:：]|החזרות[:：]|החלפות[:：]|ביטול עסקה[:：])/gu, "\n")
    .replace(/[ \t]+(?=\d{1,2}[.)]\s*[\u0590-\u05ff])/gu, "\n")
    .replace(/([.!?;])\s+(?=[\u0590-\u05ffA-Za-z])/gu, "$1\n")
    .replace(/([\u0590-\u05ff][?])\s*/gu, "$1\n");
  return marked.split(/\n+/).map(part => part.trim()).filter(Boolean).map(part => ({
    kind: part.length < 100 && /[:：?]$/.test(part) ? "heading" as const : "paragraph" as const,
    text: part,
  }));
}

export function catalogProductName(value: string) {
  return value.split(/\b(?:Regular price|Sale price|Unit price)\b/i)[0].trim().replace(/[·|—–-]+$/u, "").trim();
}
