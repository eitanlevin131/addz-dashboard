export type QuestionRanking = { kind: "categories" | "products"; limit: 4 | 8 };
export const RANKED_ENTRY_LIMIT = 240;

export function rankedAnswerText(values: string[]) {
  return values.map((value, index) => value.trim() ? `${index + 1}. ${value}` : "").filter(Boolean).join("\n");
}

export function rankedAnswerValues(text: string, limit: number) {
  const values = Array<string>(limit).fill("");
  for (const line of text.split("\n")) {
    const match = /^(\d+)\. (.*)$/.exec(line);
    if (match && Number(match[1]) >= 1 && Number(match[1]) <= limit) values[Number(match[1]) - 1] = match[2];
  }
  return values;
}

// Numbered plain text keeps ordering in existing answers and immutable kickoff snapshots.
export function rankedAnswerError(text: string, ranking: QuestionRanking): string | null {
  const lines = text.trim().split("\n");
  if (!text.trim()) return "הוסיפו לפחות פריט אחד, או בחרו שנשלים את הרשימה בפגישה.";
  if (lines.length > ranking.limit) return `אפשר לציין עד ${ranking.limit} פריטים.`;
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const match = /^(\d+)\. (.+)$/.exec(line);
    if (!match || Number(match[1]) !== index + 1 || !match[2].trim()) return "מלאו את הרשימה ברצף, החל מהמקום הראשון.";
    const value = match[2].trim();
    if (value.length > RANKED_ENTRY_LIMIT || /[\r\u2028\u2029]/.test(value)) return "ציינו שם קצר בשורה אחת לכל פריט.";
    const identity = value.normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase();
    if (seen.has(identity)) return "כל פריט צריך להופיע ברשימה פעם אחת בלבד.";
    seen.add(identity);
  }
  return null;
}
