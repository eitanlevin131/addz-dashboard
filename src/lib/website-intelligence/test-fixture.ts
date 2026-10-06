import type { WebsiteResponse } from "./safe-fetch";

// A local, synthetic E2E adapter, never available in any deployed Vercel runtime.
// It does not relax the real transport's address/redirect checks.
export function fixtureFetch(input: string, rootInput = input, attempt = 0): WebsiteResponse | null {
  if (process.env.VERCEL || process.env.WEBSITE_SCAN_E2E !== "1" || !process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) return null;
  const db = new URL(process.env.DATABASE_URL);
  if (db.hostname !== "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech" || db.pathname !== "/addz_epic2_validation") return null;
  const url = new URL(input);
  if (url.hostname !== "website-fixture.example.com") return null;
  const root = url.origin;
  const scenario = new URL(rootInput).searchParams.get("scenario");
  const text = Array.from({ length: scenario === "sparse" ? 1 : 16 }, (_, index) => `${url.pathname}: Our handmade chocolate collection ${index} uses carefully selected ingredients. Customers can choose a gift bundle or a subscription. Shipping is free above 200 shekels. Contact support@example.com for questions about ingredients and returns. `).join(" ");
  const structured = url.pathname.startsWith("/products/") ? { "@type": "Product", name: "Chocolate gift", offers: { price: "59", priceCurrency: "ILS" } } : { "@type": "Organization", name: "Chocolate gifts" };
  let body = url.pathname === "/robots.txt" ? `User-agent: *\nDisallow: /private\nSitemap: ${root}/sitemap.xml` : url.pathname === "/sitemap.xml" ? `<urlset>${["/", "/about", "/products/chocolate", "/shipping"].map(path => `<url><loc>${root}${path}</loc></url>`).join("")}</urlset>` : `<html lang="en"><head><title>Chocolate ${url.pathname}</title><script type="application/ld+json">${JSON.stringify(structured)}</script></head><body><main>${text}</main></body></html>`;
  if (scenario === "challenge" && !url.pathname.endsWith(".txt") && !url.pathname.endsWith(".xml")) body = "<title>Just a moment</title><main>Verify you are human</main>";
  const status = url.pathname === "/shipping" && scenario === "partial" ? 404 : url.pathname === "/shipping" && scenario === "retry" && attempt === 0 ? 503 : 200;
  return { url: input, status, headers: { "content-type": url.pathname.endsWith(".txt") ? "text/plain" : url.pathname.endsWith(".xml") ? "application/xml" : "text/html" }, body, bytes: Buffer.byteLength(body), redirects: [] };
}
