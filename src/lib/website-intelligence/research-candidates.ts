import type { ResearchChunk } from "./research-chunks.ts";
import type { ResearchItem } from "./research-map.ts";
import { strategicResearchChunks } from "./research-facts.ts";
import type { AiSource } from "./ai.ts";

export type ResearchCandidateContext = {
  contextType: "unverified_candidate_guidance"; evidenceAuthority: "original_chunks_only";
  items: Pick<ResearchItem, "category" | "classification" | "summary" | "chunkIds" | "uncertainty">[];
};
const categories: Record<string, string[]> = {
  brand_voice: ["brand_business", "positioning", "tone_language", "recurring_messaging"],
  products_commercial: ["products_groups", "use_cases"],
  audience_problems: ["audiences", "customer_pains_needs_desires", "use_cases"],
  differentiation_operations: ["differentiators_claims", "social_proof", "positioning"],
};
export function prepareResearchCandidates(task: string, chunks: ResearchChunk[], items: ResearchItem[], productNames: string[] = []) {
  if (!categories[task]) throw new Error("unknown_research_candidate_task");
  const relevant = items.filter(item => categories[task].includes(item.category));
  const referenced = new Set(relevant.flatMap(item => item.chunkIds));
  const available = strategicResearchChunks(chunks);
  const ordered = [...available.filter(c => referenced.has(c.id)), ...available.filter(c => !referenced.has(c.id))];
  const grouped = new Map<string, AiSource>();
  let characters = 0;
  const used = new Set<string>();
  for (const chunk of ordered) {
    const location = chunk.locations[0];
    if (!location || !grouped.has(location.sourceId) && grouped.size >= 8 || characters + chunk.text.length > 32000) continue;
    const source = grouped.get(location.sourceId) || { id: location.sourceId, url: location.sourceUrl, pageType: location.pageType,
      text: "", contentHash: location.sourceTextHash, evidenceChunks: [], productNames };
    source.evidenceChunks!.push({ id: chunk.id, text: chunk.text });
    source.text = source.evidenceChunks!.map(c => c.text).join("\n\n--- source chunk boundary ---\n\n");
    grouped.set(source.id, source); used.add(chunk.id); characters += chunk.text.length;
  }
  const context: ResearchCandidateContext = { contextType: "unverified_candidate_guidance", evidenceAuthority: "original_chunks_only",
    items: relevant.filter(item => item.chunkIds.some(id => used.has(id))).slice(0, 24).map(({ category, classification, summary, chunkIds, uncertainty }) => ({ category, classification, summary, chunkIds, uncertainty })) };
  const sources = [...grouped.values()];
  return { sources, context, sufficient: sources.length >= 2 && characters >= 500,
    coverage: { characters, usedChunks: used.size, omittedChunks: available.length - used.size } };
}
