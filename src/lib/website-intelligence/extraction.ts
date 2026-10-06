import { createHash } from "node:crypto";
import { load } from "cheerio";
import { XMLParser } from "fast-xml-parser";
import robotsParser from "robots-parser";
import { COVERAGE_LIMITS, SCAN_LIMITS, type FindingInput } from "./config.ts";
import { productIdentity, collectionIdentity, representativeProducts, discoveryPages, type CatalogProduct } from "./catalog.ts";
import { safeWebsiteUrl, sameSite } from "./safe-fetch.ts";
import { crawlDelayPolicy } from "./state.ts";

export const checksum = (value: string) => createHash("sha256").update(value).digest("hex");
export const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
export function completeTextPrefix(value: string, limit: number) {
  const text = normalizeText(value);
  if (text.length <= limit) return text;
  let end = 0;
  for (let i = 0; i < limit; i++) {
    if (/[.!?;]/.test(text[i]) && !(text[i] === "." && /\d/.test(text[i - 1] || "") && /\d/.test(text[i + 1] || ""))) end = i + 1;
  }
  return text.slice(0, end).trim();
}
export function collectionPageType(url: string, label: string, platform: string, structured: Record<string, unknown>[]) {
  const guessed = pageType(url, label);
  const types = structured.flatMap(row => Array.isArray(row["@type"]) ? row["@type"] : [row["@type"]]);
  if (["product", "home", "shipping", "returns", "contact", "about", "blog"].includes(guessed)) return null;
  if (platform === "shopify" && ["category", "best_sellers"].includes(guessed) || types.includes("CollectionPage")) return guessed === "best_sellers" ? guessed : "category";
  return null;
}
export type InventorySignal = { value: "in_stock" | "out_of_stock"; source: "json_ld" | "visible_html"; evidence: string; locator: string };
export function inventoryAssessment(structured: Record<string, unknown>[], visible: InventorySignal[] = []) {
  const signals: InventorySignal[] = [...visible];
  structured.forEach((row, index) => {
    if (!(Array.isArray(row["@type"]) ? row["@type"] : [row["@type"]]).includes("Product")) return;
    // A multi-variant offer list is not one definitive product-level stock state.
    const offer = row.offers as Record<string, unknown> | undefined;
    if (!offer || Array.isArray(offer)) return;
    const raw = String(offer.availability || "");
    if (/\/(?:InStock|OutOfStock|SoldOut)$/.test(raw)) signals.push({ value: /\/InStock$/.test(raw) ? "in_stock" : "out_of_stock", source: "json_ld", evidence: raw, locator: `json_ld[${index}].offers.availability` });
  });
  const conflict = signals.some(a => signals.some(b => a.source !== b.source && a.value !== b.value));
  return { signals, conflict };
}
export function returnsEvidence(text: string) {
  const source = normalizeText(text);
  const heading = /מדיניות (?:ביטול עסקאות|ביטולים והחזרות|החזרות|ביטולים)|(?:return(?:s)? (?:and refund )?policy|refund policy|cancellation and returns)/i.exec(source);
  if (!heading) return null;
  const section = source.slice(heading.index);
  if (!/ביטול|להחזיר|החזרת|החזר|\b(?:return|refund|cancel)/i.test(section)) return null;
  // Never drop later eligibility conditions to squeeze a policy into a snippet.
  return section.length <= 8000 ? section : null;
}
function generalPolicyCandidate(url: string, label = "") {
  return /\/(?:terms(?:-of-use|-and-conditions)?|conditions)\/?$/i.test(new URL(url).pathname) || /תקנון|תנאי שימוש/.test(label);
}
export function primaryProductPrice(name: string, text: string) {
  const content = normalizeText(text), heading = normalizeText(name);
  if (!heading || !content.startsWith(heading)) return "";
  const following = content.slice(heading.length).trimStart();
  // Only the price immediately adjacent to the primary product heading, not
  // recommendations, unit prices, shipping thresholds or arbitrary later numbers.
  return following.match(/^(?:(?:החל מ[- ]?|From\s+)\s*)?(?:₪|US\$|\$|€|£|ILS\s*)\s*\d[\d,.]*(?:\s*[-–]\s*(?:₪|US\$|\$|€|£|ILS\s*)?\s*\d[\d,.]*)?/i)?.[0] || "";
}
export function canonicalUrl(input: string, root: string) {
  const url = safeWebsiteUrl(new URL(input, root).href);
  if (!sameSite(url, new URL(root))) return null;
  // Normalize escapes per segment without decoding an encoded path separator.
  url.pathname = url.pathname.split("/").map(segment => {
    try { return encodeURIComponent(decodeURIComponent(segment)).replace(/%[0-9a-f]{2}/gi, escape => escape.toUpperCase()); }
    catch { return segment; }
  }).join("/").replace(/\/+$/, "") || "/";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
export function crawlUrl(input: string, root: string) {
  const identity = canonicalUrl(input, root);
  if (!identity) return null;
  const result = new URL(identity);
  if (new URL(input, root).pathname.endsWith("/") && result.pathname !== "/") result.pathname += "/";
  return result.href;
}
export function pageType(url: string, label = "") {
  const path = new URL(url).pathname;
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* Invalid escapes must not stop discovery. */ }
  const value = decoded.toLowerCase() + " " + label.toLowerCase();
  if (/\/blogs?\/|\/articles?\//.test(decoded.toLowerCase())) return "blog";
  if (/questionnaire|question-form|שאלון/.test(value)) return "other";
  if (/\/products?\//.test(decoded.toLowerCase())) return "product";
  if (/\/collections\/|product-category|\/categor|קטגור/.test(decoded.toLowerCase())) return /best.seller|bestseller|הנמכרים/.test(value) ? "best_sellers" : "category";
  if (/shipping|delivery|משלוח/.test(value)) return "shipping";
  if (/refund|return|החזר|ביטול[- ]?(?:עסק(?:ה|אות)|העסקה)/.test(value)) return "returns";
  if (generalPolicyCandidate(url, label)) return "returns";
  if (/contact|support|customer.service|יצירת קשר|צור קשר/.test(value)) return "contact";
  if (/faq|frequently|שאלות/.test(value)) return "faq";
  if (/about|our.story|אודות|הסיפור/.test(value)) return "about";
  if (/best.seller|bestseller|הנמכרים/.test(value)) return "best_sellers";
  if (/subscription|subscribe|מנוי/.test(value)) return "subscription";
  if (/bundle|offer|sale|מארז|מבצע/.test(value)) return "offers";
  if (/review|testimonial|ביקורות|המלצות/.test(value)) return "reviews";
  if (/^\/shop\/[^/]+/.test(decoded.toLowerCase())) return "product";
  if (/collection|categor|^\/shop\/?\s|קטגור/.test(value)) return "category";
  if (/blog|article|journal|בלוג|מאמר/.test(value)) return "blog";
  if (/ingredients|specification|how.to.use|רכיבים|מפרט|הוראות שימוש/.test(value)) return "usage";
  return new URL(url).pathname === "/" ? "home" : "other";
}
export function sitemapLinks(body: string, root: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(body)) throw new Error("unsafe_xml");
  // DTD/entity declarations are rejected above; decode standard XML URL escapes.
  const parsed = new XMLParser({ processEntities: true, ignoreAttributes: true }).parse(body);
  const index = Boolean(parsed.sitemapindex);
  const entries = index ? parsed.sitemapindex.sitemap : parsed.urlset?.url;
  const rows = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return { index, urls: rows.slice(0, SCAN_LIMITS.candidates).flatMap(item => {
    try { const url = typeof item.loc === "string" ? crawlUrl(item.loc, root) : null; return url ? [url] : []; } catch { return []; }
  }) };
}
export function robotsRules(body: string, root: string) {
  const parsed = robotsParser(new URL("/robots.txt", root).href, body);
  const policy = crawlDelayPolicy(parsed.getCrawlDelay("ADDZWebsiteBot"));
  return { allowed: (input: string) => {
      const url = new URL(input); const origin = new URL(root);
      if (!sameSite(url, origin)) return false;
      url.hostname = origin.hostname; url.protocol = origin.protocol; url.port = origin.port;
      return parsed.isAllowed(url.href, "ADDZWebsiteBot") !== false;
    },
    delay: policy.effective, originalDelay: policy.original, delayWarning: policy.warning,
    sitemaps: parsed.getSitemaps().flatMap(value => { try { const url = crawlUrl(value, root); return url ? [url] : []; } catch { return []; } }) };
}
export function selectPages(candidates: { url: string; type: string; depth: number }[]) {
  const discovery = discoveryPages(candidates, []);
  return [...discovery, ...representativeProducts(candidates, [], SCAN_LIMITS.pages - discovery.length)];
}
export function coveragePages(candidates: { url: string; type: string; depth: number }[], existing: { url: string; type: string; depth: number }[]) {
  const current = new Set(existing.map(item => canonicalUrl(item.url, item.url)));
  // Fetched roles override provisional URL guesses for the same source identity.
  const selected = selectPages([...existing, ...candidates.filter(item => !current.has(canonicalUrl(item.url, item.url)))]);
  const present = new Set(existing.map(item => item.type));
  const essential = ["about", "shipping", "returns", "contact", "faq", "product", "category"];
  const additions: typeof candidates = [];
  for (const item of selected) {
    if (current.has(canonicalUrl(item.url, item.url))) continue;
    const missing = essential.filter(type => !present.has(type) && type !== item.type).length;
    if (existing.length + additions.length >= SCAN_LIMITS.pages - missing) continue;
    additions.push(item); present.add(item.type);
  }
  return additions;
}
export function extractWebsitePage(body: string, url: string, headers: Record<string, string> = {}) {
  const $ = load(body);
  const title = normalizeText($("title").first().text()).slice(0, 300);
  const heading = normalizeText($("h1").first().text()).slice(0, 300);
  const ogType = $("meta[property='og:type']").attr("content") || "";
  let canonical = canonicalUrl(url, url)!;
  try { const declared = $("link[rel='canonical']").first().attr("href"); if (declared) canonical = canonicalUrl(declared, url) || canonical; } catch { /* Unsafe canonical URLs never become fetch targets. */ }
  const noindex = /noindex/i.test(headers["x-robots-tag"] || "") || $("meta[name='robots']").toArray().some(el => /noindex/i.test($(el).attr("content") || ""));
  const structured: Record<string, unknown>[] = [];
  let structuredBytes = 0;
  const walk = (value: unknown, depth = 0) => {
    if (!value || depth > 8 || structured.length >= 100) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach(item => walk(item, depth + 1)); return; }
    if (typeof value === "object") {
      const row = value as Record<string, unknown>;
      const bytes = JSON.stringify(row).length;
      if (row["@type"] && bytes <= 20000 && structuredBytes + bytes <= 80000) { structured.push(row); structuredBytes += bytes; }
      if (row["@graph"]) walk(row["@graph"], depth + 1);
      if (row.itemListElement) walk(row.itemListElement, depth + 1);
      if (row.item) walk(row.item, depth + 1);
    }
  };
  $("script[type='application/ld+json']").each((_index, el) => { try { const raw = $(el).text(); if (raw.length <= 100000) walk(JSON.parse(raw)); } catch { /* Malformed JSON-LD does not invalidate readable HTML. */ } });
  const links: { url: string; type: string; depth: number }[] = [];
  $("a[href]").each((_index, el) => { if (links.length >= SCAN_LIMITS.candidates) return;
    try { const href = crawlUrl($(el).attr("href")!, url); if (href && !/\/account|\/cart|\/checkout|\/search|logout/i.test(new URL(href).pathname) && ![...new URL(href).searchParams.keys()].some(key => /^(add-to-cart|action|s)$/.test(key))) links.push({ url: href, type: pageType(href, $(el).text()), depth: 1 }); } catch { /* Non-HTTP and external links are not crawl targets. */ }
  });
  const scriptCount = $("script").length;
  const types = structured.flatMap(row => Array.isArray(row["@type"]) ? row["@type"] : [row["@type"]]);
  const mainProduct = $(".single-product .product_title,h1.product_title,[itemtype$='/Product'] h1").length > 0;
  const productForm = $("form.cart,form[action*='/cart/add']").length > 0;
  const productPrice = $(".summary .price,[itemprop='price'],meta[property='product:price:amount']").length > 0;
  const platform = /woocommerce/i.test($("body").attr("class") || "") || $("link[href*='woocommerce'],script[src*='woocommerce']").length ? "woocommerce"
    : $("script[src*='cdn.shopify.com'],link[href*='cdn.shopify.com'],script[src*='/cdn/shop/']").length || /Shopify\.(?:shop|theme)/.test(body) ? "shopify"
    : $("meta[name='generator']").attr("content")?.includes("Wix") ? "wix" : "unknown";
  const documentLabel = [title, heading].join(" ");
  const isQuestionnaire = /questionnaire|שאלון/.test(documentLabel.toLowerCase());
  let type = pageType(canonical, documentLabel);
  const collection = collectionPageType(canonical, documentLabel, platform, structured);
  if (new URL(canonical).pathname === "/") type = "home";
  else if (isQuestionnaire) type = "other";
  else if (collection) type = collection;
  else if (!["shipping", "returns", "contact", "faq", "about", "blog"].includes(type) && (types.filter(type => type === "Product").length === 1 && !types.includes("ItemList") || mainProduct && productForm || ogType === "product" && productPrice && productForm)) type = "product";
  else if (types.includes("FAQPage")) type = "faq";
  else if (types.includes("Article") || types.includes("BlogPosting") || /(?:^|\s)category(?:\s|$)/.test($("body").attr("class") || "") && !/post-type-archive-product|tax-product_cat/.test($("body").attr("class") || "")) type = "blog";
  else if (!["shipping", "returns", "contact", "faq", "about", "blog"].includes(type) && (types.includes("CollectionPage") || types.includes("ItemList") || /archive.*post-type-archive-product|tax-product_cat/.test($("body").attr("class") || ""))) type = "category";
  const declaredCanonicalUrl = canonical;
  const fetchedUrl = new URL(url);
  const pageNumber = fetchedUrl.pathname.match(/\/page\/(\d+)\/?$/)?.[1];
  const pagination = ["page", "paged"].some(key => /^[1-9]\d*$/.test(fetchedUrl.searchParams.get(key) || "") && Number(fetchedUrl.searchParams.get(key)) > 1) || Number(pageNumber) > 1;
  if (["category", "best_sellers"].includes(type) && pagination && collectionIdentity(url) === collectionIdentity(canonical)) canonical = canonicalUrl(url, url)!;
  const primaryContainer = $("h1.product_title,h1").first().closest("[itemtype$='/Product'],.product[id^='product-'],.product[data-product_id]");
  const primaryForms = primaryContainer.find("form.cart,form[action*='/cart/add']").filter((_index, el) => $(el).closest("[itemtype$='/Product'],.product")[0] === primaryContainer[0]);
  const htmlProduct = type === "product" && !types.includes("Product") ? {
    name: normalizeText($("h1.product_title,h1").first().text()).slice(0, 300),
    price: normalizeText(primaryContainer.find(".summary .price,[itemprop='price']").filter((_index, el) => $(el).closest("[itemtype$='/Product'],.product")[0] === primaryContainer[0]).first().text()).slice(0, 100),
    priceLocator: "h1 + .summary .price / itemprop=price",
    variants: primaryForms.find("select option").toArray().filter(el => $(el).attr("value") !== "").map(el => normalizeText($(el).text())).filter(Boolean).slice(0, 20),
  } : null;
  const inventorySignals: InventorySignal[] = [];
  if (type === "product") {
    const scope = primaryContainer.length ? primaryContainer : $("main,[role='main']").first();
    scope.find("form[action*='/cart/add'] button[name='add'],.product-form__submit,button[data-add-to-cart]").each((_index, el) => {
      if ($(el).closest("[hidden],[aria-hidden='true'],template,noscript").length) return;
      const label = normalizeText($(el).text());
      if (/sold out|out of stock|אזל(?:ה)? (?:מה)?מלאי/i.test(label)) inventorySignals.push({ value: "out_of_stock", source: "visible_html", evidence: label.slice(0, 300), locator: "primary product purchase button" });
      else if (/\bin stock\b|(?:^|\s)במלאי(?:\s|$)/i.test(label)) inventorySignals.push({ value: "in_stock", source: "visible_html", evidence: label.slice(0, 300), locator: "primary product purchase button" });
    });
  }
  const inventory = inventoryAssessment(structured, inventorySignals);
  const catalog: CatalogProduct[] = [];
  const addCatalog = (item: CatalogProduct) => {
    if (!item.name || catalog.length >= COVERAGE_LIMITS.catalogPerSource) return;
    const identity = productIdentity(item.url);
    if (!catalog.some(row => productIdentity(row.url) === identity)) catalog.push({ ...item, url: identity });
  };
  structured.forEach((row, index) => {
    if (!(Array.isArray(row["@type"]) ? row["@type"] : [row["@type"]]).includes("Product") || typeof row.name !== "string") return;
    const offers = row.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    try {
      const target = canonicalUrl(String(row.url || offer?.url || (type === "product" ? canonical : "")), canonical);
      if (!target || pageType(target) !== "product") return;
      const rawPrice = offer?.price ?? offer?.lowPrice;
      const price = typeof rawPrice === "number" || typeof rawPrice === "string" ? String(rawPrice).slice(0, 40) : null;
      const highPrice = typeof offer?.highPrice === "number" || typeof offer?.highPrice === "string" ? String(offer.highPrice).slice(0, 40) : null;
      const evidence = JSON.stringify({ name: row.name, url: row.url, offers: { price: offer?.price, lowPrice: offer?.lowPrice, highPrice: offer?.highPrice, priceCurrency: offer?.priceCurrency } });
      addCatalog({ name: row.name.slice(0, 300), url: target,
        price: price != null && highPrice != null && highPrice !== price ? `${price} - ${highPrice}` : price,
        currency: typeof offer?.priceCurrency === "string" ? offer.priceCurrency : null,
        category: ["category", "best_sellers"].includes(type) ? heading || title : typeof row.category === "string" ? row.category : null,
        featured: type === "best_sellers", evidence, locator: `json_ld[${index}]`, sourceType: "json_ld" });
    } catch { /* Unsafe product links are never catalog entries. */ }
  });
  $(".card-wrapper,.product-card,li.product,.product-item,.grid-product,.product-grid .grid__item,.collection .grid__item").each((index, el) => {
    const card = $(el), anchor = card.find("a[href]").toArray().find(a => { try { return pageType(new URL($(a).attr("href")!, canonical).href) === "product"; } catch { return false; } });
    if (!anchor) return;
    try {
      const target = canonicalUrl($(anchor).attr("href")!, canonical);
      if (!target) return;
      const name = normalizeText(card.find(".card__heading,.product-card__title,.woocommerce-loop-product__title,.product-item__title,.grid-product__title,h2,h3").first().text() || $(anchor).attr("aria-label") || $(anchor).text()).slice(0, 300);
      const price = normalizeText(card.find(".price,.money,[itemprop='price']").first().text()).slice(0, 160) || null;
      if (!name || /^(?:view|shop now|ראה|הוסף לסל)$/i.test(name)) return;
      addCatalog({ name, url: target, price, currency: null, category: ["category", "best_sellers"].includes(type) ? heading || title : null,
        featured: type === "best_sellers", evidence: normalizeText(card.text()).slice(0, 2000), locator: `product_card[${index}]`, sourceType: "html" });
    } catch { /* Unsafe listing links cannot become products. */ }
  });
  $("script,style,noscript,nav,footer,header,form,svg,[aria-hidden='true']").remove();
  const main = $("main,[role='main']").first();
  const fullText = normalizeText(main.length ? main.text() : $("body").text());
  const text = completeTextPrefix(fullText, SCAN_LIMITS.textCharacters);
  if (type === "returns" && generalPolicyCandidate(canonical, documentLabel) && !/refund|returns? policy|return(?:ing)? (?:a |the |your )?(?:product|item)|החזרת מוצר|החזר כספי|ביטול עסקה|ביטול העסקה/.test(text.toLowerCase())) type = "other";
  if (htmlProduct?.name) {
    const adjacentPrice = primaryProductPrice(htmlProduct.name, text);
    if (adjacentPrice || !htmlProduct.price) { htmlProduct.price = adjacentPrice; htmlProduct.priceLocator = "main: primary heading-adjacent price"; }
  }
  const challenge = /just a moment|access denied|verify you are human|attention required|captcha/i.test(title) || /verify you are human|checking your browser/i.test(text.slice(0, 600));
  const shell = !challenge && text.length < 200 && scriptCount > 3;
  const blocked = noindex ? "noindex" : challenge ? "challenge" : shell ? "javascript_required" : text.length < 200 ? "insufficient_content" : null;
  return { title, text: blocked ? "" : text, language: $("html").attr("lang")?.slice(0, 20) || null,
    structured: blocked ? [] : structured, links, blocked, canonicalUrl: canonical, declaredCanonicalUrl, pageType: type, platform, htmlProduct,
    inventory, catalog: blocked ? [] : catalog, warnings: inventory.conflict ? ["inventory_conflict"] : [],
    contentHash: checksum(text), truncated: fullText.length > SCAN_LIMITS.textCharacters };
}
export function deterministicFindings(sourceId: string, url: string, type: string, page: ReturnType<typeof extractWebsitePage>): FindingInput[] {
  if (page.blocked) return [];
  const findings: FindingInput[] = [];
  const add = (category: string, key: string, value: unknown, evidence: string, locator: string, sourceType: "html" | "json_ld" = "html") => {
    findings.push({ category, key, value, sourceId, evidence, locator, sourceType, observationStatus: "observed", confidence: "high" });
  };
  add("brand", "page_title", page.title, page.title, "title");
  if (["shipping", "returns", "contact", "faq"].includes(type)) {
    const excerpt = completeTextPrefix(page.text, 4000);
    if (excerpt) add("operations", type + "_text", { text: excerpt, url }, excerpt, "main");
  }
  const returns = returnsEvidence(page.text);
  if (returns && !(type === "returns" && returns === page.text)) add("operations", "returns_text", { text: returns, url }, returns, "main: returns/cancellation section");
  for (const email of [...new Set(page.text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].slice(0, 5)) add("operations", "contact_email", email, email, "main");
  page.structured.forEach((item, index) => {
    const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
    if (types.includes("Product")) {
      const offers = item.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const scalar = (value: unknown, limit: number) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" ? value.slice(0, limit) : null;
      const value = { name: String(item.name || "").slice(0, 300), description: completeTextPrefix(String(item.description || ""), 1000),
        price: scalar(offer?.price ?? offer?.lowPrice, 40), currency: scalar(offer?.priceCurrency, 12), availability: page.inventory?.conflict ? null : scalar(offer?.availability, 200),
        ...(page.inventory?.conflict ? { availabilityStatus: "needs_review" } : {}),
        variants: (Array.isArray(offers) ? offers : []).slice(0, 20).map(row => ({ name: scalar(row.name, 200), sku: scalar(row.sku, 100), price: scalar(row.price, 40), currency: scalar(row.priceCurrency, 12) })) };
      if (value.name) add("products", "product", value, JSON.stringify(value), `json_ld[${index}]`, "json_ld");
    }
    if (types.includes("Organization") && item.name) add("brand", "brand_name", String(item.name), JSON.stringify(item).slice(0, 1000), `json_ld[${index}].name`, "json_ld");
  });
  if (page.htmlProduct?.name && page.htmlProduct.price) {
    const { priceLocator, ...value } = page.htmlProduct;
    add("products", "product", { ...value, priceFormat: "display_text" }, `${value.name} | ${value.price}`, priceLocator);
  }
  if (["category", "best_sellers", "home", "offers"].includes(type) && page.catalog.length) {
    const value = { name: page.title, products: page.catalog.map(({ name, url, price, currency }) => ({ name, url, price, currency })), productCount: page.catalog.length, partial: true };
    // One source-backed listing, not hundreds of invented product-page findings.
    add("products", "catalog_listing", value, JSON.stringify(page.catalog.map(p => ({ name: p.name, url: p.url, evidence: p.evidence, locator: p.locator }))), "extracted.catalog");
  }
  return findings.sort((a, b) => Number(b.key === "catalog_listing") - Number(a.key === "catalog_listing")).slice(0, 15);
}
export function evidenceThreshold(sources: { text: string; type: string; contentHash: string }[]) {
  const unique = [...new Map(sources.filter(source => source.text.length >= 200).map(source => [source.contentHash, source])).values()];
  const characters = unique.reduce((sum, source) => sum + source.text.length, 0);
  const sufficient = unique.length >= 2 && characters >= SCAN_LIMITS.evidenceCharacters && unique.some(source => ["home", "about", "product", "category"].includes(source.type));
  return { sufficient, pages: unique.length, characters, reason: sufficient ? null : "insufficient_evidence" };
}
