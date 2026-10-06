import assert from "node:assert/strict";
import test from "node:test";
import { productIdentity, collectionIdentity, deepProductBudget, representativeProducts, discoveryPages, crawlCoverage, questionnaireCatalogContext } from "../src/lib/website-intelligence/catalog.ts";
import { extractWebsitePage, deterministicFindings, sitemapLinks, pageType } from "../src/lib/website-intelligence/extraction.ts";
import { assembleResearchBatches } from "../src/lib/website-intelligence/research-chunks.ts";
import { generateQuestionnaire, publicProjection } from "../src/lib/questionnaire/core.ts";
import { questionPresentation } from "../src/lib/questionnaire/presentation.ts";
import { SCAN_LIMITS, COVERAGE_LIMITS } from "../src/lib/website-intelligence/config.ts";
const root = "https://store.example.com/";
const candidates = n => Array.from({ length: n }, (_, i) => ({ url: root + "products/p" + i, type: "product", depth: 1 }));
const content = "Our furniture is designed for the living room and bedroom with natural materials. ".repeat(8);
test("small catalog is read in full; large catalogs grow adaptively but remain bounded", () => {
  assert.equal(deepProductBudget(4, 1), 4);
  assert.equal(representativeProducts(candidates(4), []).length, 4);
  assert.equal(representativeProducts(candidates(174), []).length, 27);
  assert.equal(representativeProducts(candidates(1500), []).length, COVERAGE_LIMITS.maxDeepProducts);
  assert.equal(representativeProducts(candidates(174), [], 3).length, 3);
});
test("category coverage and price diversity take precedence over arbitrary URL order", () => {
  const pool = candidates(120);
  const catalog = pool.map((p, i) => ({ name: "Product " + i, url: p.url, price: i * 10 + 10, currency: "ILS", category: "Group " + i % 6, featured: i === 119 }));
  const sources = [0, 1].map(i => ({ url: root + "collections/all?page=" + (i + 1), pageType: "category", status: "completed", extracted: { catalog: catalog.slice(i * 100, (i + 1) * 100) } }));
  const selected = representativeProducts(pool, sources);
  const rows = selected.map(p => catalog.find(c => c.url === p.url));
  assert.equal(new Set(rows.map(p => p.category)).size, 6);
  assert.ok(rows.some(p => p.featured));
  assert.ok(rows.some(p => p.price < 300)); assert.ok(rows.some(p => p.price > 900));
  assert.deepEqual(selected, representativeProducts([...pool].reverse(), sources));
});
test("variants, collection product aliases and Hebrew escape variants do not consume product slots", () => {
  const urls = [root + "products/כיסא?variant=1", root + "products/%D7%9B%D7%99%D7%A1%D7%90?variant=2", root + "collections/chairs/products/כיסא"];
  assert.equal(new Set(urls.map(productIdentity)).size, 1);
  assert.equal(representativeProducts(urls.map(url => ({ url, type: "product", depth: 1 })), []).length, 1);
  assert.notEqual(productIdentity(root + "collections/all?page=2"), productIdentity(root + "collections/all?page=3"));
  assert.equal(collectionIdentity(root + "collections/all?page=2"), root + "collections/all");
});
test("discovery preserves policy/story slots and caps category pagination independently of products", () => {
  const policies = ["home", "about", "shipping", "returns", "faq", "contact"].map(type => ({ url: type === "home" ? root : root + type, type, depth: 1 }));
  const listings = Array.from({ length: 100 }, (_, i) => ({ url: root + "collections/all?page=" + (i + 1), type: "category", depth: 2 }));
  const selected = discoveryPages([...candidates(174), ...listings, ...policies], []);
  for (const p of policies) assert.ok(selected.some(s => s.url === p.url));
  assert.equal(selected.filter(s => s.type === "category").length, COVERAGE_LIMITS.pagesPerCollection);
  assert.ok(selected.length <= COVERAGE_LIMITS.discoveryPages);
  assert.ok(!selected.some(s => s.type === "product"));
  assert.equal(discoveryPages([...listings, ...policies], selected.map(s => ({ ...s, pageType: s.type }))).length, 0);
});
test("sitemap inventory finds 100+ products without deep-fetching them", () => {
  const xml = `<urlset>${candidates(174).map(p => `<url><loc>${p.url}</loc></url>`).join("")}</urlset>`;
  const urls = sitemapLinks(xml, root).urls;
  assert.equal(urls.length, 174); assert.ok(urls.every(url => pageType(url) === "product"));
  assert.equal(crawlCoverage(urls.map(url => ({ url, type: "product", depth: 1 })), []).productsCatalogued, 0);
});
test("Shopify and WooCommerce listing records retain product-linked prices and source evidence", () => {
  for (const platform of ["shopify", "woocommerce"]) {
    const html = `<title>כיסאות</title><body class="${platform}"><main><h1>כיסאות</h1>${content}<div class="${platform === "shopify" ? "card-wrapper" : "product-item"}"><h3><a href="/products/chair">כיסא עץ</a></h3><span class="price">₪120 - ₪150</span></div><a href="?page=2">Next</a></main></body>`;
    const page = extractWebsitePage(html, root + "collections/chairs");
    assert.equal(page.catalog.length, 1); assert.equal(page.catalog[0].name, "כיסא עץ");
    assert.equal(page.catalog[0].price, "₪120 - ₪150"); assert.equal(page.catalog[0].category, "כיסאות");
    assert.ok(page.catalog[0].evidence.includes("כיסא עץ")); assert.ok(page.catalog[0].locator);
    assert.ok(page.links.some(l => l.url.includes("page=2") && l.type === "category"));
    const listing = deterministicFindings("source1", root, page.pageType, page).find(f => f.key === "catalog_listing");
    assert.equal(listing.observationStatus, "observed"); assert.equal(listing.sourceId, "source1");
    const sources = [{ id: "source1", url: root + "collections/chairs", pageType: "category", status: "completed", text: page.text, extracted: { catalog: page.catalog } }];
    const assembled = assembleResearchBatches(sources);
    assert.ok(assembled.chunks.some(c => c.locations.some(l => l.jsonPaths?.includes("extracted.catalog[0]"))));
    assert.equal(crawlCoverage(candidates(174), sources).productsCatalogued, 1);
  }
});
test("catalog coverage distinguishes candidate inventory, unique metadata and deep sources", () => {
  const catalog = { name: "Chair", url: root + "products/chair", price: 120, category: "Chairs" };
  const sources = [{ id: "category", url: root + "collections/chairs", pageType: "category", status: "completed", extracted: { catalog: [catalog] } },
    { id: "deep", url: catalog.url, pageType: "product", status: "completed", extracted: { catalog: [catalog] } }];
  const coverage = crawlCoverage([{ url: catalog.url, type: "product", depth: 1 }], sources);
  assert.equal(coverage.productsCatalogued, 1); assert.equal(coverage.productsDeep, 1);
  assert.equal(coverage.categoriesRepresented, 1);
});
test("pagination retains a fetch/evidence identity even when canonical points to the collection root", () => {
  const base = root + "collections/chairs";
  for (const paginated of [base + "?page=2", base + "/page/10"]) {
    const page = extractWebsitePage(`<link rel="canonical" href="${base}"><main>${content}</main>`, paginated);
    assert.equal(page.canonicalUrl, paginated); assert.equal(page.declaredCanonicalUrl, base);
  }
});
test("questionnaire receives broad observed catalog context without asking to confirm every product", () => {
  const sources = [{ id: "source1", url: root + "collections/chairs", pageType: "category", status: "completed", extracted: { catalog: candidates(100).map(p => ({ ...p, name: p.url, price: 120, category: "Chairs" })) } }];
  const context = questionnaireCatalogContext(candidates(174), sources);
  const finding = { authority: "website_observed", scanId: "scan1", findingId: "listing1", sourceId: "source1", url: sources[0].url, pageType: "category", evidence: "Chairs: Chair ₪120", locator: "extracted.catalog", confidence: "high", reviewDisposition: "normal", category: "products", key: "catalog_listing", observationStatus: "observed", value: { name: "Chairs", productCount: 100, products: [{ name: "Chair", price: 120 }] } };
  const snapshot = generateQuestionnaire({ name: "Brand", website: root, includedServices: [], commercialScope: null }, "scan1", [finding], context);
  assert.equal(snapshot.catalogContext.catalogued, 100); assert.equal(snapshot.catalogContext.discovered, 174);
  assert.equal(snapshot.items.filter(q => q.source?.key === "catalog_listing").length, 1);
  assert.ok(questionPresentation(snapshot.items[0]).facts.some(f => f.value === "100"));
  assert.equal(publicProjection({ snapshot, selectedIds: snapshot.items.map(q => q.id), answers: {}, status: "draft", revision: 0 }).catalogContext.groups[0].sourceId, "source1");
});
test("Hebrew cancellation policy is classified and extracted as returns, not ignored", () => {
  const page = extractWebsitePage(`<title>מדיניות ביטול עסקאות</title><main>מדיניות ביטול עסקאות. ניתן לבטל עסקה תוך 14 ימים. ${content}</main>`, root + "pages/מדיניות-ביטול-עסקאות");
  assert.equal(page.pageType, "returns"); assert.ok(deterministicFindings("s", root, page.pageType, page).some(f => f.key === "returns_text"));
  assert.ok(SCAN_LIMITS.requests >= SCAN_LIMITS.pages + SCAN_LIMITS.sitemaps);
});
