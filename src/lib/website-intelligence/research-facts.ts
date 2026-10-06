import { createHash } from "node:crypto";
import type { ResearchChunk } from "./research-chunks.ts";

const legal = /privacy|terms(?:[-_ ]|$)|legal|regulations|cancel-order|מדיניות[ -]פרטיות|תקנון/i;
const legalText = /חוק הגנת הצרכן|תנאי שימוש|זכויות יוצרים|מדיניות פרטיות|דיני מדינת ישראל|privacy policy|terms of use|copyright/i;
const sensitive = /₪|ש[״"]ח|\d\s*%|shipping|delivery|refund|cancell?ation|guarantee|משלוח|אספקה|ביטול|החזר|החלפ[הת]|קופון|מבצע|איסוף|מבטיח|מתחייב|@/i;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export function policyOnlyChunk(chunk: ResearchChunk) {
  const path = (url: string) => { try { return decodeURI(url); } catch { return url; } };
  return chunk.locations.every(location => ["shipping", "returns"].includes(location.pageType)
    || legal.test(path(location.sourceUrl)) || legalText.test(chunk.text));
}

// These are immutable source observations, not paraphrased or normalized rules.
// Qualifier binding is intentionally unresolved until an exact parser can prove it.
export function assembleAtomicResearchFacts(chunks: ResearchChunk[]) {
  return chunks.flatMap(chunk => {
    const policy = policyOnlyChunk(chunk);
    if (chunk.kind !== "structured" && !policy && !sensitive.test(chunk.text)
      && !chunk.locations.some(location => location.pageType === "contact")) return [];
    const parts = chunk.kind === "structured" ? [{ segment: chunk.text, index: 0 }]
      : [...new Intl.Segmenter("he", { granularity: "sentence" }).segment(chunk.text)];
    return parts.filter(part => part.segment.trim()).map(part => ({
      id: hash(chunk.id + ":" + part.index + ":" + part.segment),
      kind: chunk.kind === "structured" ? "structured_source_signal" : policy ? "policy_clause" : "source_clause",
      authority: "website_observed" as const,
      rawValue: part.segment.trim(),
      chunkId: chunk.id,
      location: { start: part.index, end: part.index + part.segment.length },
      sourceLocations: chunk.locations,
      contextChunkIds: chunks.filter(other => other.locations.some(a => chunk.locations.some(b => a.sourceId === b.sourceId))).map(other => other.id),
      qualifierResolution: "unresolved" as const,
      interpretation: "source_statement_not_verified_truth" as const,
    }));
  });
}

export function strategicResearchChunks(chunks: ResearchChunk[]) {
  // Operational clauses remain accessible in the deterministic companion. They
  // cannot seed brand voice, audience or positioning from legal boilerplate.
  return chunks.filter(chunk => chunk.kind === "text" && !policyOnlyChunk(chunk));
}

export function sensitiveResearchRewrite(category: string, summary: string) {
  if (["commercial_model_offers", "shipping_returns_service", "commercial", "operations"].includes(category)) return true;
  const numbers = /\d/;
  const units = /₪|ש[״"]ח|%|מ[״"]ל|גרם|קילו|נקודות|שעות|ימים|יום|ml\b|grams?\b|hours?\b|days?\b|points?\b/i;
  const instructions = /(?:ניתן|אפשר|יש|מחייב|מומלץ|אפשרות).{0,50}(?:איסוף|תזמן|זיכוי|משלוח)|(?:איסוף|משלוח).{0,50}(?:בתיאום|מראש|כתובת)|(?:shipping|pickup|delivery).{0,50}(?:schedule|address|must|requires)/i;
  return numbers.test(summary) && units.test(summary) || instructions.test(summary)
    || /מתחייב|מבטיח|מובטח|guarantee|guaranteed/i.test(summary);
}
