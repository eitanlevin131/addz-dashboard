import { createHash } from "node:crypto";
import { load } from "cheerio";
import { XMLParser } from "fast-xml-parser";
import robotsParser from "robots-parser";
import { SCAN_LIMITS, type FindingInput } from "./config.ts";
import { safeWebsiteUrl, sameSite } from "./safe-fetch.ts";

export const checksum = (value: string) => createHash("sha256").update(value).digest("hex");
export const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
export function canonicalUrl(input: string, root: string) {
  const url = safeWebsiteUrl(new URL(input, root).href);
  if (!sameSite(url, new URL(root))) return null;
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
export function pageType(url: string, label = "") {
  const path = new URL(url).pathname;
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* Invalid escapes must not stop discovery. */ }
  const value = decoded.toLowerCase() + " " + label.toLowerCase();
  if (/\/blogs?\/|\/articles?\//.test(decoded.toLowerCase())) return "blog";
  if (/shipping|delivery|משלוח/.test(value)) return "shipping";
  if (/refund|return|החזר|החזרות/.test(value)) return "returns";
  if (/contact|support|customer.service|יצירת קשר|צור קשר/.test(value)) return "contact";
  if (/faq|frequently|שאלות/.test(value)) return "faq";
  if (/about|our.story|אודות|הסיפור/.test(value)) return "about";
  if (/best.seller|bestseller|הנמכרים/.test(value)) return "best_sellers";
  if (/subscription|subscribe|מנוי/.test(value)) return "subscription";
  if (/bundle|offer|sale|מארז|מבצע/.test(value)) return "offers";
  if (/review|testimonial|ביקורות|המלצות/.test(value)) return "reviews";
  if (/\/products?\/|מוצר/.test(value)) return "product";
  if (/collection|categor|shop|קטגור/.test(value)) return "category";
  if (/blog|article|journal|בלוג|מאמר/.test(value)) return "blog";
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
    try { const url = typeof item.loc === "string" ? canonicalUrl(item.loc, root) : null; return url ? [url] : []; } catch { return []; }
  }) };
}
export function robotsRules(body: string, root: string) {
  const parsed = robotsParser(new URL("/robots.txt", root).href, body);
  return { allowed: (input: string) => {
      const url = new URL(input); const origin = new URL(root);
      if (!sameSite(url, origin)) return false;
      url.hostname = origin.hostname; url.protocol = origin.protocol; url.port = origin.port;
      return parsed.isAllowed(url.href, "ADDZWebsiteBot") !== false;
    },
    delay: Math.max(1, parsed.getCrawlDelay("ADDZWebsiteBot") || 1),
    sitemaps: parsed.getSitemaps().flatMap(value => { try { const url = canonicalUrl(value, root); return url ? [url] : []; } catch { return []; } }) };
}
export function selectPages(candidates: { url: string; type: string; depth: number }[]) {
  const limits: Record<string, number> = { home: 1, about: 1, category: 3, product: 5, faq: 1, shipping: 1, returns: 1, contact: 1, reviews: 1, subscription: 1, offers: 2, blog: 2, best_sellers: 1, other: 0 };
  const priority = ["home", "about", "shipping", "returns", "contact", "faq", "best_sellers", "category", "product", "offers", "subscription", "reviews", "blog"];
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  return [...candidates].sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type) || a.depth - b.depth).filter(item => {
    if (seen.has(item.url) || item.depth > SCAN_LIMITS.depth || (counts[item.type] || 0) >= (limits[item.type] || 0) || seen.size >= SCAN_LIMITS.pages) return false;
    seen.add(item.url); counts[item.type] = (counts[item.type] || 0) + 1; return true;
  });
}
export function extractWebsitePage(body: string, url: string, headers: Record<string, string> = {}) {
  const $ = load(body);
  const title = normalizeText($("title").first().text()).slice(0, 300);
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
    }
  };
  $("script[type='application/ld+json']").each((_index, el) => { try { const raw = $(el).text(); if (raw.length <= 100000) walk(JSON.parse(raw)); } catch { /* Malformed JSON-LD does not invalidate readable HTML. */ } });
  const links: { url: string; type: string; depth: number }[] = [];
  $("a[href]").each((_index, el) => { if (links.length >= SCAN_LIMITS.candidates) return;
    try { const href = canonicalUrl($(el).attr("href")!, url); if (href && !/\/account|\/cart|\/checkout|\/search|logout/i.test(new URL(href).pathname)) links.push({ url: href, type: pageType(href, $(el).text()), depth: 1 }); } catch { /* Non-HTTP and external links are not crawl targets. */ }
  });
  const scriptCount = $("script").length;
  $("script,style,noscript,nav,footer,header,form,svg,[aria-hidden='true']").remove();
  const main = $("main,[role='main']").first();
  const text = normalizeText(main.length ? main.text() : $("body").text()).slice(0, SCAN_LIMITS.textCharacters);
  const challenge = /just a moment|access denied|verify you are human|attention required|captcha/i.test(title) || /verify you are human|checking your browser/i.test(text.slice(0, 600));
  const shell = !challenge && text.length < 200 && scriptCount > 3;
  const blocked = noindex ? "noindex" : challenge ? "challenge" : shell ? "javascript_required" : text.length < 200 ? "insufficient_content" : null;
  return { title, text: blocked ? "" : text, language: $("html").attr("lang")?.slice(0, 20) || null,
    structured: blocked ? [] : structured, links, blocked,
    contentHash: checksum(text), truncated: text.length >= SCAN_LIMITS.textCharacters };
}
export function deterministicFindings(sourceId: string, url: string, type: string, page: ReturnType<typeof extractWebsitePage>): FindingInput[] {
  if (page.blocked) return [];
  const findings: FindingInput[] = [];
  const add = (category: string, key: string, value: unknown, evidence: string, locator: string, sourceType: "html" | "json_ld" = "html") => {
    findings.push({ category, key, value, sourceId, evidence: evidence.slice(0, 1800), locator, sourceType, observationStatus: "observed", confidence: "high" });
  };
  add("brand", "page_title", page.title, page.title, "title");
  if (["shipping", "returns", "contact", "faq"].includes(type)) add("operations", type + "_text", { text: page.text.slice(0, 4000), url }, page.text.slice(0, 1000), "main");
  for (const email of [...new Set(page.text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].slice(0, 5)) add("operations", "contact_email", email, email, "main");
  page.structured.forEach((item, index) => {
    const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
    if (types.includes("Product")) {
      const offers = item.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const scalar = (value: unknown, limit: number) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" ? value.slice(0, limit) : null;
      const value = { name: String(item.name || "").slice(0, 300), description: String(item.description || "").slice(0, 1000),
        price: scalar(offer?.price ?? offer?.lowPrice, 40), currency: scalar(offer?.priceCurrency, 12), availability: scalar(offer?.availability, 200) };
      if (value.name) add("products", "product", value, JSON.stringify(item).slice(0, 1800), `json_ld[${index}]`, "json_ld");
    }
    if (types.includes("Organization") && item.name) add("brand", "brand_name", String(item.name), JSON.stringify(item).slice(0, 1000), `json_ld[${index}].name`, "json_ld");
  });
  return findings.slice(0, 15);
}
export function evidenceThreshold(sources: { text: string; type: string; contentHash: string }[]) {
  const unique = [...new Map(sources.filter(source => source.text.length >= 200).map(source => [source.contentHash, source])).values()];
  const characters = unique.reduce((sum, source) => sum + source.text.length, 0);
  const sufficient = unique.length >= 2 && characters >= SCAN_LIMITS.evidenceCharacters && unique.some(source => ["home", "about", "product", "category"].includes(source.type));
  return { sufficient, pages: unique.length, characters, reason: sufficient ? null : "insufficient_evidence" };
}
