import { createHash } from "node:crypto";
import { SCAN_LIMITS, COVERAGE_LIMITS } from "./config.ts";

export const RESEARCH_CHUNK_VERSION = "2";
export const RESEARCH_CHUNK_LIMITS = {
  sources: SCAN_LIMITS.pages, sourceCharacters: 20000, chunkCharacters: 2000,
  chunks: 32, payloadCharacters: 48000, structuredItemsPerSource: 8,
} as const;
type Limits = { [K in keyof typeof RESEARCH_CHUNK_LIMITS]: number };
export type StoredResearchSource = {
  id: string; url: string; canonicalUrl?: string; pageType: string;
  text: string | null; status?: string; extracted?: Record<string, unknown>;
};
export type ChunkLocation = {
  sourceId: string; sourceUrl: string; pageType: string; sourceTextHash: string;
  spanHash: string; start?: number; end?: number; paragraphIndex?: number;
  jsonPaths?: string[];
  fieldStart?: number; fieldEnd?: number;
  continuation?: { start: number; end: number; part: number; parts: number };
};
export type ResearchChunk = {
  id: string; kind: "text" | "structured"; text: string;
  boundary: "paragraph" | "sentence" | "fragment" | "structured";
  topics: string[]; locations: ChunkLocation[];
};
type Span = { start: number; end: number; paragraphIndex: number };
const appendSpan = (previous: Span | null, unit: Span): Span => ({ ...unit, start: previous?.start ?? unit.start });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const comparable = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
const segmenter = new Intl.Segmenter("he", { granularity: "sentence" });
const policyTopics: [string, RegExp][] = [
  ["returns", /return|refund|cancell?ation|החזר|ביטול|החלפ[הת]/i],
  ["shipping", /shipping|delivery|משלוח|אספקה|איסוף/i],
  ["commercial", /discount|minimum|offer|הנחה|מינימום|מבצע|₪|ש[״"]ח/i],
];
const topicsFor = (text: string) => policyTopics.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
function trimmedSpan(text: string, start: number, end: number, paragraphIndex: number): Span {
  const raw = text.slice(start, end);
  return { start: start + raw.length - raw.trimStart().length, end: end - (raw.length - raw.trimEnd().length), paragraphIndex };
}
function paragraphs(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  for (const delimiter of text.matchAll(/\r?\n[\t ]*\r?\n/g)) {
    spans.push(trimmedSpan(text, start, delimiter.index!, spans.length));
    start = delimiter.index! + delimiter[0].length;
  }
  spans.push(trimmedSpan(text, start, text.length, spans.length));
  return spans.filter(span => span.end > span.start);
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
function fallbackSpans(text: string, span: Span, limit: number) {
  const result: Span[] = [];
  let start = span.start;
  while (start < span.end) {
    let end = Math.min(start + limit, span.end);
    if (end < span.end) {
      const slice = text.slice(start, end);
      const boundaries = [...slice.matchAll(/[,;:][\t ]+|\s+/g)].filter(match => match.index! >= limit / 2);
      const last = boundaries.at(-1);
      if (last) end = start + last.index! + last[0].length;
      else {
        const graphemes = new Intl.Segmenter("he", { granularity: "grapheme" }).segment(text.slice(start, span.end));
        end = start;
        for (const item of graphemes) { if (item.index + item.segment.length > limit) break; end = start + item.index + item.segment.length; }
        // A single unusually large grapheme is retained intact, then reported as over budget.
        if (end === start) end = start + [...graphemes][0].segment.length;
      }
    }
    result.push(trimmedSpan(text, start, end, span.paragraphIndex)); start = end;
  }
  return result.filter(item => item.end > item.start);
}

// Pure assembly over persisted rows: no fetching, AI, DB writes or publication.
function assemble(sources: StoredResearchSource[], options: Partial<Limits>, exhaustive: boolean) {
  const limits = { ...RESEARCH_CHUNK_LIMITS, ...options };
  for (const key of Object.keys(limits) as (keyof Limits)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > RESEARCH_CHUNK_LIMITS[key]) throw new Error("invalid_research_budget");
  }
  if (limits.payloadCharacters < 2) throw new Error("invalid_research_budget");
  const warnings: { sourceId: string; code: string; start?: number; end?: number }[] = [];
  const candidates: ResearchChunk[] = [];
  const eligible = sources.filter(source => !source.status || source.status === "completed");
  const unique = [...new Map(eligible.map(source => [source.id, source])).values()];
  const rows = unique.slice(0, limits.sources);
  for (const source of unique.slice(limits.sources)) warnings.push({ sourceId: source.id, code: "source_budget" });
  const push = (source: StoredResearchSource, text: string, boundary: ResearchChunk["boundary"], location: Partial<ChunkLocation>, kind: ResearchChunk["kind"] = boundary === "structured" ? "structured" : "text") => {
    candidates.push({ id: hash(kind + ":" + (kind === "structured" ? text : comparable(text))),
      kind, text, boundary, topics: topicsFor(text),
      locations: [{ sourceId: source.id, sourceUrl: source.canonicalUrl || source.url, pageType: source.pageType,
        sourceTextHash: hash(source.text || ""), spanHash: hash(text), ...location }] });
  };
  for (const source of rows) {
    const extracted = source.extracted || {};
    let text = source.text || "";
    const truncated = extracted.textTruncated === true;
    const possiblyTruncated = text.length === RESEARCH_CHUNK_LIMITS.sourceCharacters && !/[.!?;]["”״')]*\s*$/.test(text);
    if (truncated || possiblyTruncated) {
      warnings.push({ sourceId: source.id, code: truncated ? "stored_text_truncated" : "stored_text_may_be_truncated" });
      if (!/[.!?;]["”״')]*\s*$/.test(text)) {
        const last = [...segmenter.segment(text)].at(-1);
        if (last) {
          warnings.push({ sourceId: source.id, code: "incomplete_stored_tail_omitted", start: last.index, end: text.length });
          text = text.slice(0, last.index);
        }
      }
    }
    if (text.length > limits.sourceCharacters) warnings.push({ sourceId: source.id, code: "source_text_over_budget" });
    else {
      const spans = paragraphs(text);
      for (let index = 0; index < spans.length; index++) {
        let span = spans[index];
        const paragraph = text.slice(span.start, span.end);
        // Preserve a standalone heading with its next paragraph/list when it fits.
        if (paragraph.length < 100 && !/[.!?;]$/.test(paragraph) && spans[index + 1]
          && spans[index + 1].end - span.start <= limits.chunkCharacters) span = { ...span, end: spans[++index].end };
        if (span.end - span.start <= limits.chunkCharacters) {
          push(source, text.slice(span.start, span.end), "paragraph", span); continue;
        }
        const section = text.slice(span.start, span.end);
        let pending: Span | null = null;
        const flush = () => { if (pending) push(source, text.slice(pending.start, pending.end), "sentence", pending); pending = null; };
        for (const sentence of segmenter.segment(section)) {
          const unit = trimmedSpan(text, span.start + sentence.index, span.start + sentence.index + sentence.segment.length, span.paragraphIndex);
          if (unit.end <= unit.start) continue;
          if (unit.end - unit.start > limits.chunkCharacters) {
            flush(); warnings.push({ sourceId: source.id, code: "oversized_sentence_split", start: unit.start, end: unit.end });
            const fragments = fallbackSpans(text, unit, limits.chunkCharacters);
            fragments.forEach((fragment, part) => push(source, text.slice(fragment.start, fragment.end), "fragment", {
              ...fragment, continuation: { start: unit.start, end: unit.end, part, parts: fragments.length },
            })); continue;
          }
          if (pending && unit.end - pending.start > limits.chunkCharacters) flush();
          pending = appendSpan(pending, unit);
        }
        flush();
      }
    }
    const structured = Array.isArray(extracted.structured) ? extracted.structured : [];
    let count = 0;
    for (const [index, item] of structured.entries()) {
      if (!item || typeof item !== "object") continue;
      const object = item as Record<string, unknown>;
      const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
      if (!types.some(type => ["Product", "Offer", "AggregateOffer", "CollectionPage", "ItemList"].includes(String(type)))) continue;
      if (count >= limits.structuredItemsPerSource) { warnings.push({ sourceId: source.id, code: "structured_budget" }); continue; }
      const projection: Record<string, unknown> = {};
      const jsonPaths: string[] = [];
      for (const key of ["@type", "name", "description", "sku", "offers", "price", "priceCurrency", "lowPrice", "highPrice", "availability", "hasVariant", "itemListElement"]) {
        if (object[key] === undefined) continue;
        if (stableJson(object[key]).length > limits.chunkCharacters / 2) {
          const field = object[key];
          if (Array.isArray(field)) {
            let group: unknown[] = [], paths: string[] = [];
            const flush = () => { if (group.length) push(source, stableJson({ parentType: object["@type"], field: key, entries: group }), "structured", { jsonPaths: paths }); group = []; paths = []; };
            for (const [entryIndex, entry] of field.entries()) {
              if (stableJson(entry).length + 150 > limits.chunkCharacters) { warnings.push({ sourceId: source.id, code: "oversized_structured_field_omitted" }); continue; }
              if (stableJson({ parentType: object["@type"], field: key, entries: [...group, entry] }).length > limits.chunkCharacters) flush();
              group.push(entry); paths.push(`extracted.structured[${index}].${key}[${entryIndex}]`);
            }
            flush(); warnings.push({ sourceId: source.id, code: "oversized_structured_array_split" });
          } else if (typeof field === "string") {
            const fragments = fallbackSpans(field, { start: 0, end: field.length, paragraphIndex: 0 }, limits.chunkCharacters);
            fragments.forEach((fragment, part) => push(source, field.slice(fragment.start, fragment.end), "fragment", {
              jsonPaths: [`extracted.structured[${index}].${key}`], fieldStart: fragment.start, fieldEnd: fragment.end,
              continuation: { start: 0, end: field.length, part, parts: fragments.length },
            }, "structured"));
            warnings.push({ sourceId: source.id, code: "oversized_structured_string_split" });
          } else warnings.push({ sourceId: source.id, code: "oversized_structured_field_omitted" });
          continue;
        }
        projection[key] = object[key]; jsonPaths.push(`extracted.structured[${index}].${key}`);
      }
      const serialized = stableJson(projection);
      if (count >= limits.structuredItemsPerSource || serialized.length > limits.chunkCharacters) {
        warnings.push({ sourceId: source.id, code: "structured_budget" }); continue;
      }
      push(source, serialized, "structured", { jsonPaths }); count++;
    }
    if (extracted.inventory && typeof extracted.inventory === "object") {
      const serialized = stableJson(extracted.inventory);
      if (serialized.length <= limits.chunkCharacters)
        push(source, serialized, "structured", { jsonPaths: ["extracted.inventory"] });
      else warnings.push({ sourceId: source.id, code: "inventory_signal_budget" });
    }
    if (Array.isArray(extracted.catalog)) {
      let entries: unknown[] = [], paths: string[] = [];
      const flush = () => { if (entries.length) push(source, stableJson({ catalogProducts: entries }), "structured", { jsonPaths: paths }); entries = []; paths = []; };
      extracted.catalog.slice(0, COVERAGE_LIMITS.catalogPerSource).forEach((entry, index) => {
        const { name, url, price, currency, category } = entry;
        const projected = { name, url, price, currency, category };
        if (stableJson({ catalogProducts: [projected] }).length > limits.chunkCharacters) { warnings.push({ sourceId: source.id, code: "catalog_entry_over_budget" }); return; }
        if (stableJson({ catalogProducts: [...entries, projected] }).length > limits.chunkCharacters) flush();
        entries.push(projected); paths.push(`extracted.catalog[${index}]`);
      });
      flush();
    }
    if (extracted.htmlProduct && typeof extracted.htmlProduct === "object") {
      const serialized = stableJson(extracted.htmlProduct);
      if (serialized.length <= limits.chunkCharacters && count < limits.structuredItemsPerSource)
        push(source, serialized, "structured", { jsonPaths: ["extracted.htmlProduct"] });
      else warnings.push({ sourceId: source.id, code: "structured_budget" });
    }
  }
  const deduplicated = new Map<string, ResearchChunk>();
  for (const chunk of candidates) {
    const existing = deduplicated.get(chunk.id);
    if (existing) existing.locations.push(...chunk.locations); else deduplicated.set(chunk.id, chunk);
  }
  // Round-robin source coverage, prioritizing policy passages anywhere in a page,
  // structured products and the tail before filling with remaining body chunks.
  const buckets = rows.map(source => {
    const list = [...deduplicated.values()].filter(chunk => chunk.locations[0].sourceId === source.id);
    const text = list.filter(chunk => chunk.kind === "text");
    const tail = text.at(-1);
    const priority = (chunk: ResearchChunk) => chunk.topics.includes("returns") || chunk.topics.includes("shipping") ? 0
      : chunk.kind === "structured" ? 1 : chunk === text[0] || chunk === tail ? 2 : 3;
    return list.sort((a, b) => priority(a) - priority(b));
  });
  const selected: ResearchChunk[] = [];
  let payloadCharacters = 2;
  for (let round = 0; buckets.some(bucket => round < bucket.length); round++) {
    for (const bucket of buckets) {
      const chunk = bucket[round];
      if (!chunk) continue;
      const size = JSON.stringify(chunk).length + (selected.length ? 1 : 0);
      if (!exhaustive && (selected.length >= limits.chunks || payloadCharacters + size > limits.payloadCharacters)) continue;
      selected.push(chunk); payloadCharacters += size;
    }
  }
  const omittedChunks = deduplicated.size - selected.length;
  const includedSources = new Set(selected.flatMap(chunk => chunk.locations.map(location => location.sourceId)));
  return { version: RESEARCH_CHUNK_VERSION, limits, chunks: selected, warnings,
    coverage: { inputSources: sources.length, eligibleSources: unique.length, includedSources: includedSources.size,
      candidateChunks: candidates.length, duplicateChunks: candidates.length - deduplicated.size, omittedChunks, payloadCharacters,
      budgetLimited: omittedChunks > 0 || unique.length > rows.length } };
}
export function assembleResearchChunks(sources: StoredResearchSource[], options: Partial<Limits> = {}) {
  return assemble(sources, options, false);
}
export function assembleResearchBatches(sources: StoredResearchSource[], options: Partial<Limits> = {}) {
  const corpus = assemble(sources, options, true);
  const batches: ResearchChunk[][] = [];
  let batch: ResearchChunk[] = [], characters = 2;
  for (const chunk of corpus.chunks) {
    const size = JSON.stringify(chunk).length;
    if (size + 2 > corpus.limits.payloadCharacters) throw new Error("research_chunk_exceeds_batch_budget");
    if (batch.length >= corpus.limits.chunks || characters + size + (batch.length ? 1 : 0) > corpus.limits.payloadCharacters) {
      batches.push(batch); batch = []; characters = 2;
    }
    batch.push(chunk); characters += size + (batch.length > 1 ? 1 : 0);
  }
  if (batch.length) batches.push(batch);
  if (batches.length > 24) throw new Error("research_batch_budget_exceeded");
  return { ...corpus, batches };
}
