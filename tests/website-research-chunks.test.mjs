import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assembleResearchChunks, assembleResearchBatches, RESEARCH_CHUNK_LIMITS } from "../src/lib/website-intelligence/research-chunks.ts";

const source = (text, extra = {}) => ({ id: "s1", url: "https://example.test/policy", pageType: "shipping", text, status: "completed", ...extra });
const verifyLocations = (result, sources) => {
  for (const chunk of result.chunks) for (const location of chunk.locations) {
    const original = sources.find(row => row.id === location.sourceId);
    assert.ok(original);
    assert.equal(location.sourceUrl, original.canonicalUrl || original.url);
    assert.match(location.sourceTextHash, /^[a-f0-9]{64}$/);
    if (chunk.kind === "text") assert.equal(original.text.slice(location.start, location.end).normalize("NFKC").replace(/\s+/g, " ").trim(), chunk.text.normalize("NFKC").replace(/\s+/g, " ").trim());
    else assert.ok(location.jsonPaths.length);
  }
};
test("long policy tail is available ahead of ordinary introductory content", () => {
  const body = "Information about our store and its public website. ".repeat(180);
  const policy = "Return policy\n\nCustomers can return unopened products within 14 days. Refunds exclude delivery fees.";
  const rows = [source(body + "\n\n" + policy)];
  const result = assembleResearchChunks(rows, { chunks: 2, payloadCharacters: 5000 });
  assert.ok(result.chunks.some(chunk => chunk.text.includes("Refunds exclude delivery fees.")));
  assert.ok(result.chunks.some(chunk => chunk.locations[0].start > 2400));
  assert.equal(result.coverage.budgetLimited, true);
  verifyLocations(result, rows);
});
test("headings and coherent lists retain their original text and offsets", () => {
  const text = "  Shipping options\n\n- Pickup: ₪25.\n- Home delivery: ₪40.\n\nReturns\n\nUnused items only.  ";
  const rows = [source(text)];
  const result = assembleResearchChunks(rows);
  assert.equal(result.chunks[0].text, "Shipping options\n\n- Pickup: ₪25.\n- Home delivery: ₪40.");
  assert.ok(result.chunks.some(chunk => chunk.text === "Returns\n\nUnused items only."));
  verifyLocations(result, rows);
});
test("oversized paragraphs split at full sentences, not decimals or character limits", () => {
  const sentence = "המוצר עולה ₪19.90 בלבד. ";
  const rows = [source(sentence.repeat(50))];
  const result = assembleResearchChunks(rows, { chunkCharacters: 100 });
  for (const chunk of result.chunks) {
    assert.ok(chunk.text.endsWith("בלבד."));
    assert.ok(chunk.text.startsWith("המוצר"));
    assert.ok(chunk.text.length <= 100);
    assert.ok(chunk.text.includes("19.90"));
  }
  verifyLocations(result, rows);
});
test("identical chunks merge across sources without losing either evidence location", () => {
  const rows = [source("Returns are accepted within 14 days."), source("Returns  are accepted within 14 days.", { id: "s2" })];
  const result = assembleResearchChunks(rows);
  assert.equal(result.chunks.length, 1);
  assert.equal(result.coverage.duplicateChunks, 1);
  assert.equal(result.coverage.includedSources, 2);
  assert.equal(result.chunks[0].locations.length, 2);
  verifyLocations(result, rows);
});
test("different prices and material qualifiers are not deduplicated", () => {
  const rows = [source("Delivery costs ₪25."), source("Delivery costs ₪40.", { id: "s2" }), source("Pickup costs ₪25.", { id: "s3" })];
  assert.equal(assembleResearchChunks(rows).chunks.length, 3);
});
test("Hebrew policies near the end remain complete and retain exclusions", () => {
  const text = "הסיפור שלנו התחיל לפני שנים רבות. ".repeat(120) + "\n\nמדיניות החזרות\n\nניתן להחזיר מוצר סגור תוך 14 ימים. דמי המשלוח לא יוחזרו.";
  const rows = [source(text)];
  const result = assembleResearchChunks(rows);
  assert.ok(result.chunks.some(chunk => chunk.text.includes("דמי המשלוח לא יוחזרו.") && chunk.topics.includes("returns")));
  verifyLocations(result, rows);
});
test("stored product/price JSON-LD and HTML extraction are included without AI claims", () => {
  const rows = [source("Product page.", { pageType: "product", extracted: {
    structured: [{ "@type": "Product", name: "מארז", offers: { "@type": "Offer", price: "239", priceCurrency: "ILS", availability: "https://schema.org/InStock" } }],
    htmlProduct: { name: "תערובת", price: "₪20", variants: [], priceLocator: "primary heading" },
  } })];
  const result = assembleResearchChunks(rows);
  const structured = result.chunks.filter(chunk => chunk.kind === "structured");
  assert.equal(structured.length, 2);
  const product = JSON.parse(structured.find(chunk => chunk.text.includes("239")).text);
  assert.equal(product.offers.price, "239");
  assert.ok(structured.some(chunk => chunk.locations[0].jsonPaths.includes("extracted.structured[0].offers")));
  assert.ok(structured.some(chunk => chunk.text.includes("₪20")));
  assert.ok(result.chunks.every(chunk => !("observationStatus" in chunk)));
  verifyLocations(result, rows);
});
test("payload budget includes serialized provenance; fair source coverage and determinism", () => {
  const rows = Array.from({ length: 20 }, (_, n) => source((`Unique source ${n} contains information. `).repeat(50), { id: "s" + n }));
  const result = assembleResearchChunks(rows);
  assert.equal(result.coverage.includedSources, 20);
  assert.equal(result.coverage.payloadCharacters, JSON.stringify(result.chunks).length);
  assert.ok(result.coverage.payloadCharacters <= RESEARCH_CHUNK_LIMITS.payloadCharacters);
  assert.deepEqual(result, assembleResearchChunks(rows));
  const small = assembleResearchChunks(rows, { payloadCharacters: 1000 });
  assert.ok(JSON.stringify(small.chunks).length <= 1000);
  assert.equal(small.coverage.budgetLimited, true);
});
test("oversized sentences use traceable continuation fragments rather than disappearing", () => {
  const rows = [source("x".repeat(2100) + "\n\nComplete policy paragraph.")];
  const result = assembleResearchChunks(rows);
  assert.ok(result.warnings.some(item => item.code === "oversized_sentence_split" && item.start === 0 && item.end === 2100));
  const fragments = result.chunks.filter(chunk => chunk.boundary === "fragment");
  assert.equal(fragments.map(chunk => chunk.text).join(""), "x".repeat(2100));
  assert.ok(fragments.every(chunk => chunk.locations[0].continuation.parts === 2));
  verifyLocations(result, rows);
});
test("research batches retain all late chunks beyond the single-input budget", () => {
  const rows = Array.from({ length: 20 }, (_, n) => source((`Source ${n} full policy and brand content. `).repeat(400), { id: "s" + n }));
  const result = assembleResearchBatches(rows);
  assert.ok(result.batches.length > 1);
  assert.equal(result.coverage.omittedChunks, 0);
  assert.equal(result.batches.flat().length, result.chunks.length);
  for (const batch of result.batches) {
    assert.ok(batch.length <= RESEARCH_CHUNK_LIMITS.chunks);
    assert.ok(JSON.stringify(batch).length <= RESEARCH_CHUNK_LIMITS.payloadCharacters);
  }
});
test("oversized Hebrew sections use word boundaries and retain original qualifiers", () => {
  const text = "משלוח לנקודת איסוף בלבד מעל 150 שקלים ".repeat(100);
  const rows = [source(text)];
  const result = assembleResearchBatches(rows);
  const fragments = result.chunks.filter(chunk => chunk.boundary === "fragment");
  assert.ok(fragments.length > 1);
  assert.equal(fragments.map(chunk => chunk.text).join(" "), text.trim());
  verifyLocations(result, rows);
});
test("failed sources excluded, storage truncation exposed, limits cannot be expanded", () => {
  const result = assembleResearchChunks([source("Failed source.", { status: "failed" }), source("Saved part.", { id: "s2", extracted: { textTruncated: true } })]);
  assert.equal(result.coverage.eligibleSources, 1);
  assert.ok(result.warnings.some(item => item.code === "stored_text_truncated"));
  for (const options of [{ chunks: 33 }, { chunkCharacters: 0 }, { payloadCharacters: NaN }]) assert.throws(() => assembleResearchChunks([], options), /invalid_research_budget/);
});
test("oversized structured descriptions keep traceable fragments without losing the price", () => {
  const result = assembleResearchChunks([source("Saved product.", { extracted: { structured: [{ "@type": "Product", name: "Product", description: "d".repeat(3000), offers: { price: 20, priceCurrency: "ILS" } }] } })]);
  const product = JSON.parse(result.chunks.find(chunk => chunk.boundary === "structured").text);
  assert.equal(product.description, undefined);
  assert.equal(product.offers.price, 20);
  assert.ok(result.warnings.some(item => item.code === "oversized_structured_string_split"));
  const fragments=result.chunks.filter(chunk=>chunk.kind==="structured" && chunk.boundary==="fragment");
  assert.equal(fragments.map(chunk=>chunk.text).join(""),"d".repeat(3000));
  assert.ok(fragments.every(chunk=>chunk.locations[0].jsonPaths[0]==="extracted.structured[0].description"));
});
test("long structured item lists are batched rather than losing later collection members", () => {
  const items=Array.from({length:30},(_,n)=>({"@type":"ListItem",position:n+1,name:"מוצר "+n,url:"https://example.test/products/"+n}));
  const result=assembleResearchBatches([source("Collection page.",{extracted:{structured:[{"@type":"ItemList",itemListElement:items}]}})]);
  const entries=result.chunks.filter(c=>c.kind==="structured").flatMap(c=>JSON.parse(c.text).entries||[]);
  assert.deepEqual(entries,items);
  assert.ok(result.chunks.some(c=>c.locations[0].jsonPaths?.includes("extracted.structured[0].itemListElement[29]")));
});
test("known stored truncation never exposes an incomplete trailing sentence", () => {
  const text = "A complete policy sentence. An incomplete condit";
  const result = assembleResearchChunks([source(text, { extracted: { textTruncated: true } })]);
  assert.deepEqual(result.chunks.map(chunk => chunk.text), ["A complete policy sentence."]);
  assert.ok(result.warnings.some(item => item.code === "incomplete_stored_tail_omitted" && item.start === 28));
});
test("legacy text at the storage ceiling exposes suspected truncation and drops its broken tail", () => {
  const prefix = "Policy conditions remain unchanged. ".repeat(555);
  const text = (prefix + "An incomplete sentence " + "x".repeat(1000)).slice(0, 20000);
  const result = assembleResearchChunks([source(text)]);
  assert.ok(result.warnings.some(item => item.code === "stored_text_may_be_truncated"));
  assert.ok(result.chunks.every(chunk => !chunk.text.includes("incomplete")));
});

for (const [name, path, suffix] of [
  ["Ayelet", ".tmp/epic2-quality-ai5/manual-review.json", "/terms-and-conditions"],
  ["Spicehaus", ".tmp/epic2-shopify-validation/manual-review.json", "/pages/shipping-and-return-policy"],
]) test(`persisted ${name} source assembles later evidence without network calls`, { skip: !fs.existsSync(path) }, () => {
  const saved = JSON.parse(fs.readFileSync(path, "utf8")).sources.find(item => item.canonical_url.endsWith(suffix));
  const rows = [source(saved.text, { id: saved.id, url: saved.url, canonicalUrl: saved.canonical_url, pageType: saved.page_type, extracted: saved.extracted })];
  const result = assembleResearchChunks(rows);
  assert.ok(result.chunks.some(chunk => chunk.kind === "text" && chunk.locations[0].start >= 2400));
  assert.ok(result.chunks.some(chunk => chunk.topics.includes("returns")));
  verifyLocations(result, rows);
});
