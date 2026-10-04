import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { lookup } from "node:dns/promises";
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib";
import ipaddr from "ipaddr.js";
import { SCAN_LIMITS } from "./config.ts";

export class WebsiteFetchError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function publicAddress(address: string) {
  try {
    if (address.includes("%")) return false;
    return ipaddr.process(address).range() === "unicast";
  } catch { return false; }
}
export function safeWebsiteUrl(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new WebsiteFetchError("invalid_url"); }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
      (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) ||
      host.endsWith(".") || host === "localhost" || /\.(localhost|local|internal|test|invalid)$/.test(host) ||
      host === "metadata.google.internal" || !host.includes(".") && !net.isIP(host) ||
      net.isIP(host) && !publicAddress(host)) throw new WebsiteFetchError("unsafe_destination");
  url.hash = "";
  return url;
}
export type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
export async function resolveDestination(input: string, resolve: Resolver = host => lookup(host, { all: true, verbatim: true })) {
  const url = safeWebsiteUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let addresses: { address: string; family: number }[];
  try {
    addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await Promise.race([
      resolve(hostname), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new WebsiteFetchError("dns_timeout")), SCAN_LIMITS.requestMs); }),
    ]);
  } catch (error) { throw error instanceof WebsiteFetchError ? error : new WebsiteFetchError("dns_failed"); }
  finally { clearTimeout(timer); }
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new WebsiteFetchError("unsafe_dns");
  return { url, hostname, address: addresses[0].address, family: addresses[0].family };
}
type Destination = Awaited<ReturnType<typeof resolveDestination>>;
export function validateConnectedAddress(destination: Destination, remoteAddress?: string) {
  if (!remoteAddress || !publicAddress(remoteAddress) || ipaddr.process(remoteAddress).toNormalizedString() !== ipaddr.process(destination.address).toNormalizedString())
    throw new WebsiteFetchError("destination_mismatch");
}
// Only hand the socket to HTTP after the pinned TCP/TLS peer has been validated.
// No URL hostname is resolved during dialing, and no HTTP bytes can precede this gate.
export function pinnedAgent(destination: Destination) {
  const secure = destination.url.protocol === "https:";
  const agent = secure ? new https.Agent({ keepAlive: false, maxSockets: 1 }) : new http.Agent({ keepAlive: false, maxSockets: 1 });
  agent.createConnection = (_options, callback) => {
    const options = { host: destination.address, family: destination.family, port: secure ? 443 : 80, autoSelectFamily: false };
    const socket = secure
      ? tls.connect({ ...options, servername: net.isIP(destination.hostname) ? undefined : destination.hostname,
          rejectUnauthorized: true, checkServerIdentity: (_host, cert) => tls.checkServerIdentity(destination.hostname, cert) })
      : net.connect(options);
    let settled = false;
    const fail = (error: Error) => { if (!settled) { settled = true; callback?.(error, socket); } socket.destroy(); };
    socket.setTimeout(SCAN_LIMITS.requestMs, () => fail(new WebsiteFetchError("request_timeout")));
    socket.once("error", () => fail(new WebsiteFetchError("connection_failed")));
    socket.once(secure ? "secureConnect" : "connect", () => {
      try { validateConnectedAddress(destination, socket.remoteAddress); }
      catch (error) { fail(error as Error); return; }
      if (!settled) { settled = true; socket.setTimeout(0); callback?.(null, socket); }
    });
    return undefined as unknown as net.Socket;
  };
  return agent;
}
export type WebsiteResponse = { url: string; status: number; headers: Record<string, string>; body: string; bytes: number; redirects: string[] };
async function pinnedRequest(destination: Destination): Promise<WebsiteResponse> {
  const agent = pinnedAgent(destination);
  return new Promise((resolve, reject) => {
    const transport = destination.url.protocol === "https:" ? https : http;
    let settled = false;
    const finish = (error?: WebsiteFetchError, value?: WebsiteResponse) => {
      if (settled) return; settled = true; clearTimeout(timer); agent.destroy();
      if (error) reject(error); else resolve(value!);
    };
    const request = transport.request(destination.url, { agent,
      headers: { "user-agent": "ADDZWebsiteBot/1.0", accept: "text/html,application/xhtml+xml,application/xml,text/xml,text/plain", "accept-encoding": "gzip,deflate,br" } }, response => {
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value || ""]));
      if ([301,302,303,307,308].includes(response.statusCode || 0)) {
        response.destroy(); finish(undefined, { url: destination.url.href, status: response.statusCode!, headers, body: "", bytes: 0, redirects: [] }); return;
      }
      const type = (headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (!["text/html", "application/xhtml+xml", "application/xml", "text/xml", "text/plain"].includes(type)) {
        response.destroy(); finish(new WebsiteFetchError("unsupported_content_type")); return;
      }
      if (Number(headers["content-length"]) > SCAN_LIMITS.responseBytes) { response.destroy(); finish(new WebsiteFetchError("response_too_large")); return; }
      let compressed = 0, decoded = 0;
      response.on("data", chunk => { compressed += chunk.length; if (compressed > SCAN_LIMITS.responseBytes) { response.destroy(); finish(new WebsiteFetchError("response_too_large")); } });
      const encoding = headers["content-encoding"];
      if (encoding && !["identity", "gzip", "deflate", "br"].includes(encoding)) { response.destroy(); finish(new WebsiteFetchError("unsupported_encoding")); return; }
      const stream = encoding === "gzip" ? response.pipe(createGunzip()) : encoding === "deflate" ? response.pipe(createInflate()) : encoding === "br" ? response.pipe(createBrotliDecompress()) : response;
      const chunks: Buffer[] = [];
      stream.on("data", chunk => { decoded += chunk.length; if (decoded > SCAN_LIMITS.responseBytes) { stream.destroy(); response.destroy(); finish(new WebsiteFetchError("response_too_large")); } else chunks.push(Buffer.from(chunk)); });
      stream.once("error", () => finish(new WebsiteFetchError("invalid_response")));
      response.once("aborted", () => finish(new WebsiteFetchError("connection_failed")));
      stream.once("end", () => finish(undefined, { url: destination.url.href, status: response.statusCode || 0, headers, body: Buffer.concat(chunks).toString("utf8"), bytes: decoded, redirects: [] }));
    });
    const timer = setTimeout(() => { request.destroy(); finish(new WebsiteFetchError("request_timeout")); }, SCAN_LIMITS.requestMs);
    request.once("error", error => finish(error instanceof WebsiteFetchError ? error : new WebsiteFetchError("connection_failed")));
    request.end();
  });
}
export function sameSite(url: URL, root: URL) {
  return url.hostname.replace(/^www\./, "") === root.hostname.replace(/^www\./, "");
}
export function redirectDestination(location: string, current: URL, root: URL) {
  const target = safeWebsiteUrl(new URL(location, current).href);
  if (!sameSite(target, root)) throw new WebsiteFetchError("external_redirect");
  return target;
}
export async function safeWebsiteFetch(input: string, beforeRequest?: (url: URL) => Promise<void>, root = safeWebsiteUrl(input)): Promise<WebsiteResponse> {
  let current = safeWebsiteUrl(input);
  const redirects: string[] = [];
  for (let hop = 0; hop <= SCAN_LIMITS.redirects; hop++) {
    if (!sameSite(current, root)) throw new WebsiteFetchError("external_redirect");
    await beforeRequest?.(current);
    const destination = await resolveDestination(current.href);
    const response = await pinnedRequest(destination);
    if (![301,302,303,307,308].includes(response.status)) return { ...response, redirects };
    if (!response.headers.location || hop === SCAN_LIMITS.redirects) throw new WebsiteFetchError("redirect_limit");
    current = redirectDestination(response.headers.location, current, root);
    redirects.push(current.href);
  }
  throw new WebsiteFetchError("redirect_limit");
}
