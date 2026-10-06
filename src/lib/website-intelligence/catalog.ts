import { COVERAGE_LIMITS, SCAN_LIMITS } from "./config.ts";

export type CrawlCandidate = { url: string; type: string; depth: number };
export type CatalogProduct = {
  name: string; url: string; price: string | number | null; currency: string | null;
  category: string | null; featured: boolean; evidence: string; locator: string;
  sourceType: "html" | "json_ld";
};
export type CoverageSource = {
  id?: string; url: string; canonicalUrl?: string; pageType: string; depth?: number; status?: string;
  extracted?: unknown;
};
// Product identity is separate from fetch identity: pagination stays intact.
export function productIdentity(input: string): string {
  const url = new URL(input);
  url.hash = "";
  url.pathname = url.pathname.split("/").map(part => { try { return encodeURIComponent(decodeURIComponent(part)); } catch { return part; } }).join("/")
    .replace(/^\/collections\/[^/]+\/products\//, "/products/").replace(/\/+$/, "") || "/";
  for (const key of [...url.searchParams.keys()]) if (/^(variant|attribute_|utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
export function collectionIdentity(input: string): string {
  const url = new URL(productIdentity(input));
  for (const key of ["page", "paged", "sort_by", "sort", "orderby"]) url.searchParams.delete(key);
  url.pathname = url.pathname.replace(/\/page\/\d+$/, "");
  return url.href;
}
export function catalogRows(sources: CoverageSource[]) {
  return sources.filter(source => !source.status || source.status === "completed").flatMap(source => {
    const extracted = source.extracted as { catalog?: CatalogProduct[] } | null;
    return (Array.isArray(extracted?.catalog) ? extracted.catalog : []).slice(0, COVERAGE_LIMITS.catalogPerSource).map(product => ({ ...product, sourceId: source.id, sourceUrl: source.canonicalUrl || source.url, sourcePageType: source.pageType }));
  }).slice(0, COVERAGE_LIMITS.catalogProducts * 3);
}
export function uniqueCatalog(sources: CoverageSource[]) {
  const unique = new Map<string, ReturnType<typeof catalogRows>[number]>();
  for (const row of catalogRows(sources)) {
    const key = productIdentity(row.url), previous = unique.get(key);
    // Do not merge prices/availability from different sources into a new fact.
    if (!previous || previous.price == null && row.price != null) unique.set(key, row);
    if (unique.size >= COVERAGE_LIMITS.catalogProducts) break;
  }
  return [...unique.values()];
}
export function deepProductBudget(products: number, categories: number) {
  return Math.min(products, COVERAGE_LIMITS.maxDeepProducts,
    Math.max(COVERAGE_LIMITS.minDeepProducts, Math.ceil(Math.sqrt(products) * 2), Math.min(categories * 2, COVERAGE_LIMITS.maxDeepProducts)));
}
export function representativeProducts(candidates: CrawlCandidate[], sources: CoverageSource[], slots: number = SCAN_LIMITS.pages) {
  const catalog = catalogRows(sources);
  const metadata = new Map<string, { groups: Set<string>; featured: boolean; price: number | null }>();
  for (const item of catalog) {
    const key = productIdentity(item.url), prior = metadata.get(key) || { groups: new Set<string>(), featured: false, price: null };
    if (item.category) prior.groups.add(item.category);
    prior.featured ||= item.featured;
    if (item.price != null) { const price = Number(String(item.price).match(/\d[\d,.]*/)?.[0]?.replace(/,/g, "")); if (price > 0 && Number.isFinite(price)) prior.price = price; }
    metadata.set(key, prior);
  }
  const pool = [...new Map(candidates.filter(c => c.type === "product" && c.depth <= SCAN_LIMITS.depth).map(c => [productIdentity(c.url), c])).entries()]
    .sort(([a], [b]) => a.localeCompare(b));
  const groups = new Set([...metadata.values()].flatMap(item => [...item.groups]));
  const budget = Math.min(slots, deepProductBudget(pool.length, groups.size));
  const prices = [...metadata.values()].flatMap(item => item.price == null ? [] : [item.price]).sort((a, b) => a - b);
  const bucket = (price: number | null) => price == null ? "unknown" : String([.25, .5, .75].filter(p => price > prices[Math.floor((prices.length - 1) * p)]).length);
  const selected: CrawlCandidate[] = [], counts = new Map<string, number>(), priceCounts = new Map<string, number>();
  while (pool.length && selected.length < budget) {
    const score = ([key]: typeof pool[number]) => {
      const meta = metadata.get(key), categories = [...(meta?.groups || [])];
      const coverage = categories.length ? Math.max(...categories.map(group => 20 / (1 + (counts.get(group) || 0)))) : 0;
      return coverage + (meta?.featured ? 5 : 0) + (meta?.price != null ? 4 / (1 + (priceCounts.get(bucket(meta.price)) || 0)) : 0)
        + (/bundle|subscription|מארז|מנוי/i.test(decodeURI(key)) ? 3 : 0);
    };
    pool.sort((a, b) => score(b) - score(a) || a[0].localeCompare(b[0]));
    const [key, item] = pool.shift()!;
    selected.push({ ...item, url: key });
    const meta = metadata.get(key);
    for (const group of meta?.groups || []) counts.set(group, (counts.get(group) || 0) + 1);
    const priceBucket = bucket(meta?.price ?? null); priceCounts.set(priceBucket, (priceCounts.get(priceBucket) || 0) + 1);
  }
  return selected;
}
export function discoveryPages(candidates: CrawlCandidate[], existing: CoverageSource[]) {
  const priority = ["home", "about", "shipping", "returns", "contact", "faq", "best_sellers", "category", "subscription", "offers", "reviews", "blog", "usage"];
  const caps: Record<string, number> = { home: 1, about: 2, shipping: 2, returns: 2, contact: 2, faq: 2, best_sellers: 2, category: COVERAGE_LIMITS.listingPages, subscription: 2, offers: 2, reviews: 1, blog: 2, usage: 2 };
  const counts: Record<string, number> = {}, collections = new Map<string, number>(), seen = new Set(existing.map(s => productIdentity(s.url)));
  for (const source of existing) {
    counts[source.pageType] = (counts[source.pageType] || 0) + 1;
    if (["category", "best_sellers"].includes(source.pageType)) collections.set(collectionIdentity(source.url), (collections.get(collectionIdentity(source.url)) || 0) + 1);
  }
  const result: CrawlCandidate[] = [];
  for (const item of [...candidates].sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type) || a.depth - b.depth
    || Number(collectionIdentity(a.url) !== productIdentity(a.url)) - Number(collectionIdentity(b.url) !== productIdentity(b.url)) || a.url.localeCompare(b.url))) {
    const identity = productIdentity(item.url);
    if (!caps[item.type] || seen.has(identity) || item.depth > SCAN_LIMITS.depth || (counts[item.type] || 0) >= caps[item.type]) continue;
    if (["category", "best_sellers"].includes(item.type)) {
      const collection = collectionIdentity(item.url);
      if ((!collections.has(collection) && collections.size >= COVERAGE_LIMITS.categories) || (collections.get(collection) || 0) >= COVERAGE_LIMITS.pagesPerCollection) continue;
    }
    const reserved = ["about", "shipping", "returns", "contact", "faq"].filter(type => type !== item.type && !counts[type]).length;
    if (existing.length + result.length >= COVERAGE_LIMITS.discoveryPages - reserved) continue;
    if (["category", "best_sellers"].includes(item.type)) {
      const collection = collectionIdentity(item.url);
      collections.set(collection, (collections.get(collection) || 0) + 1);
    }
    result.push(item); seen.add(identity); counts[item.type] = (counts[item.type] || 0) + 1;
  }
  return result;
}
export function crawlCoverage(candidates: CrawlCandidate[], sources: CoverageSource[]) {
  const discovered = new Set(candidates.filter(c => c.type === "product").map(c => productIdentity(c.url)));
  const catalog = uniqueCatalog(sources), allRows = catalogRows(sources);
  const deep = new Set(sources.filter(s => s.pageType === "product" && s.status === "completed").map(s => productIdentity(s.canonicalUrl || s.url)));
  const listingRows = allRows.filter(p => ["category", "best_sellers"].includes(p.sourcePageType));
  const categories = new Set(listingRows.map(p => p.category).filter((c): c is string => Boolean(c)));
  const represented = [...categories].filter(category => allRows.some(p => p.category === category && deep.has(productIdentity(p.url))));
  return { urlsDiscovered: new Set(candidates.map(c => productIdentity(c.url))).size, productsDiscovered: discovered.size,
    productsCatalogued: catalog.length, pricedProducts: catalog.filter(p => p.price != null).length,
    productsDeep: deep.size, categories: categories.size, categoriesRepresented: represented.length,
    productBudget: deepProductBudget(discovered.size, categories.size),
    duplicateProductUrls: candidates.filter(c => c.type === "product").length - discovered.size,
    policyCoverage: ["home", "about", "faq", "shipping", "returns", "contact"].map(type => ({ type, covered: sources.some(s => s.pageType === type && s.status === "completed") })) };
}
export function questionnaireCatalogContext(candidates: CrawlCandidate[], sources: CoverageSource[]) {
  const coverage = crawlCoverage(candidates, sources);
  const groups = new Map<string, { name: string; sourceId: string; url: string }>();
  for (const row of catalogRows(sources)) if (["category", "best_sellers"].includes(row.sourcePageType) && row.category && row.sourceId && !groups.has(row.category))
    groups.set(row.category, { name: row.category, sourceId: row.sourceId, url: row.sourceUrl });
  return { discovered: coverage.productsDiscovered, catalogued: coverage.productsCatalogued, deeplyRead: coverage.productsDeep,
    partial: true as const, groups: [...groups.values()].slice(0, COVERAGE_LIMITS.categories) };
}
