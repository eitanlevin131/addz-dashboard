import assert from "node:assert/strict";
import test from "node:test";
import tls from "node:tls";
import { Duplex } from "node:stream";
import { publicAddress, safeWebsiteUrl, resolveDestination, validateConnectedAddress, sameSite, pinnedAgent, redirectDestination, safeWebsiteFetch } from "../src/lib/website-intelligence/safe-fetch.ts";

test("SSRF rejects private, internal, metadata, loopback and IPv4/IPv6 variants", () => {
  for (const value of ["127.0.0.1", "10.0.0.1", "172.16.1.1", "192.168.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "::", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "224.0.0.1", "203.0.113.1"])
    assert.equal(publicAddress(value), false, value);
  assert.equal(publicAddress("1.1.1.1"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  for (const value of ["http://127.1", "http://2130706433", "http://0x7f000001", "http://[::1]", "http://[::ffff:127.0.0.1]", "http://metadata.google.internal", "file:///etc/passwd", "http://user:pass@example.com", "https://example.com:8080", "http://example.local"])
    assert.throws(() => safeWebsiteUrl(value), undefined, value);
});
test("DNS answers are checked as addresses, including mixed public/private results", async () => {
  await assert.rejects(resolveDestination("https://example.com", async () => [{ address: "1.1.1.1", family: 4 }, { address: "127.0.0.1", family: 4 }]), /unsafe_dns/);
});
test("DNS rebinding cannot replace the resolved peer at connect time", async () => {
  let lookups = 0;
  const destination = await resolveDestination("https://example.com", async () => { lookups++; return [{ address: "1.1.1.1", family: 4 }]; });
  validateConnectedAddress(destination, "::ffff:1.1.1.1");
  for (const peer of ["127.0.0.1", "169.254.169.254", "8.8.8.8", undefined]) assert.throws(() => validateConnectedAddress(destination, peer), /destination_mismatch/);
  assert.equal(lookups, 1);
});
test("redirect scope permits www aliases but not unrelated subdomains", () => {
  const root = safeWebsiteUrl("https://example.com");
  assert.equal(sameSite(new URL("https://www.example.com/path"), root), true);
  assert.equal(sameSite(new URL("https://attacker.example.com"), root), false);
});
test("redirect hops reject internal addresses, credential URLs and external hosts before dialing", () => {
  const root = new URL("https://example.com/");
  for (const value of ["http://127.1/", "http://[::ffff:127.0.0.1]/", "http://169.254.169.254/", "https://user:secret@example.com/", "https://attacker.example.com/", "file:///etc/passwd"]) assert.throws(() => redirectDestination(value, root, root));
  assert.equal(redirectDestination("/new", root, root).href, "https://example.com/new");
});
test("redirect continuation respects hop limits and revalidates scope before any request", async () => {
  let called = false;
  const gate = async () => { called = true; throw Error("checkpoint"); };
  const onRedirect = async () => {};
  for (const currentUrl of ["http://127.0.0.1/", "https://attacker.example.com/"]) {
    await assert.rejects(safeWebsiteFetch("https://example.com/faq", gate, new URL("https://example.com/"), { cursor: { currentUrl, redirects: [currentUrl] }, onRedirect }));
    assert.equal(called, false);
  }
  await assert.rejects(safeWebsiteFetch("https://example.com/faq", gate, new URL("https://example.com/"), { cursor: { currentUrl: "https://example.com/faq/", redirects: Array(6).fill("https://example.com/faq/") }, onRedirect }), /redirect_limit/);
  await assert.rejects(safeWebsiteFetch("https://example.com/faq", gate, new URL("https://example.com/"), { cursor: { currentUrl: "https://example.com/faq/", redirects: ["https://example.com/faq/"] }, onRedirect }), /checkpoint/);
  assert.equal(called, true);
});
test("actual agent dials pinned IP with TLS identity intact and refuses a rebound peer before HTTP receives the socket", async t => {
  const destination = await resolveDestination("https://example.com", async () => [{ address: "1.1.1.1", family: 4 }]);
  for (const peer of ["1.1.1.1", "127.0.0.1", "8.8.8.8"]) {
    const socket = new Duplex({ read() {}, write(_chunk, _encoding, done) { done(); } });
    socket.remoteAddress = peer;
    socket.setTimeout = () => socket;
    let options;
    const mock = t.mock.method(tls, "connect", value => { options = value; return socket; });
    const agent = pinnedAgent(destination);
    let handedToHttp = false;
    const result = new Promise(resolve => {
      const returned = agent.createConnection({}, (error, connection) => { handedToHttp = !error; resolve({ error, connection }); });
      assert.equal(returned, undefined);
    });
    assert.equal(handedToHttp, false);
    socket.emit("secureConnect");
    const { error } = await result;
    assert.equal(options.host, "1.1.1.1");
    assert.equal(options.servername, "example.com");
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.autoSelectFamily, false);
    assert.equal(typeof options.checkServerIdentity, "function");
    assert.equal(handedToHttp, peer === "1.1.1.1");
    if (peer !== "1.1.1.1") assert.equal(error.code, "destination_mismatch");
    agent.destroy(); socket.destroy(); mock.mock.restore();
  }
});
