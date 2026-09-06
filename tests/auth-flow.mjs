import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { neon } from "@neondatabase/serverless";

// Explicit integration runner: uses only uniquely named test rows and removes them in finally.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = neon(process.env.DATABASE_URL);
const suffix = randomUUID();
const ownerEmail = `auth-owner-${suffix}@example.test`;
const clientEmail = `auth-client-${suffix}@example.test`;
const agencyEmail = `auth-agency-${suffix}@example.test`;
const password = randomBytes(24).toString("base64url");
const newPassword = randomBytes(24).toString("base64url");
const clientId = randomUUID();
const otherClientId = randomUUID();
const port = Number(process.env.AUTH_TEST_PORT || 3047);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "-p", String(port)], {
  env: { ...process.env, NODE_ENV: "production", AUTH_DEV_BYPASS: "true", OWNER_EMAIL: ownerEmail, ADMIN_PASSWORD: password, AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_URL: base, NEXTAUTH_URL: base },
  stdio: "ignore",
});

function browser() {
  const cookies = new Map();
  return {
    async request(path, init = {}) {
      const response = await fetch(base + path, { ...init, redirect: "manual", headers: { cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; "), ...init.headers } });
      for (const raw of response.headers.getSetCookie()) {
        const part = raw.split(";")[0];
        const index = part.indexOf("=");
        cookies.set(part.slice(0,index), part.slice(index+1));
      }
      return response;
    },
    async json(path, method, body) {
      return this.request(path, { method, headers: { "content-type": "application/json", origin: base }, body: JSON.stringify(body) });
    },
    async login(email, pass) {
      const { csrfToken } = await (await this.request("/api/auth/csrf")).json();
      const response = await this.request("/api/auth/callback/password", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password: pass, callbackUrl: base, json: "true" }) });
      return (await response.json()).url;
    },
  };
}

try {
  let ready = false;
  for (let i=0;i<50;i++) {
    if (server.exitCode !== null) throw new Error("Test server failed to start");
    try { if ((await fetch(base)).ok) { ready=true; break; } } catch {}
    await delay(200);
  }
  assert.ok(ready, "Server becomes ready");
  await db`insert into clients (id,name) values (${clientId},${"QA auth " + suffix}),(${otherClientId},${"QA isolated " + suffix})`;
  const anonymous = browser();
  assert.equal((await anonymous.request("/api/dashboard-data")).status,401,"Production must ignore AUTH_DEV_BYPASS");
  assert.equal((await anonymous.request("/api/admin/users")).status,401);
  const owner = browser();
  assert.equal(await owner.login(ownerEmail,password),base);
  assert.equal((await owner.request("/api/admin/users")).status,200);
  assert.equal((await owner.json("/api/admin/users","POST",{email:clientEmail,password:"short",clientId})).status,400);
  const created = await owner.json("/api/admin/users","POST",{email:clientEmail,name:"QA client",password,role:"client",clientId});
  assert.equal(created.status,201);
  const { data: { userId } } = await created.json();
  const listed = await (await owner.request("/api/admin/users")).json();
  assert.ok(listed.data.find(u=>u.id===userId).hasPassword);
  assert.ok(!JSON.stringify(listed).includes("scrypt$"),"API must never return password hashes");
  const client = browser();
  assert.equal(await client.login(clientEmail.toUpperCase(),password),base);
  for (const method of ["GET","POST","PATCH","DELETE"]) {
    assert.equal((await client.json("/api/admin/users",method,method==="GET" ? undefined : {userId,password:newPassword})).status,403);
  }
  const dashboard = await (await client.request("/api/dashboard-data")).json();
  assert.deepEqual(dashboard.data.clients.map(c=>c.id),[clientId]);
  assert.equal(dashboard.data.viewer.canManageUsers,false);
  assert.equal((await owner.json("/api/admin/users","POST",{email:agencyEmail,password,role:"admin"})).status,201);
  const agency=browser();
  assert.equal(await agency.login(agencyEmail,password),base);
  assert.equal((await agency.request("/api/admin/users")).status,403,"Agency admin is not the owner");
  assert.equal((await owner.json("/api/admin/users","PATCH",{userId,password:newPassword})).status,200);
  assert.equal((await client.request("/api/dashboard-data")).status,401,"Reset revokes existing sessions");
  assert.match(await browser().login(clientEmail,password),/error=/);
  const fresh = browser();
  assert.equal(await fresh.login(clientEmail,newPassword),base);
  for (let i=0;i<10;i++) assert.match(await browser().login(clientEmail,"incorrect password"),/error=/);
  assert.match(await browser().login(clientEmail,newPassword),/error=/,"Rate limit applies to valid credentials too");
  await db`update users set login_window_start=now()-interval '16 minutes' where id=${userId}`;
  assert.equal(await browser().login(clientEmail,newPassword),base,"Expired lock allows login");
  const {csrfToken}=await (await fresh.request("/api/auth/csrf")).json();
  await fresh.request("/api/auth/signout",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({csrfToken,callbackUrl:base,json:"true"})});
  assert.equal((await fresh.request("/api/dashboard-data")).status,401);
  console.log("PASS: owner bootstrap, client creation, password validation, owner-only management, client isolation, reset/session revocation, rate limiting, logout, production bypass protection.");
} finally {
  server.kill("SIGTERM");
  if (server.exitCode === null) await new Promise(resolve=>server.once("exit",resolve));
  await db`delete from users where email in (${ownerEmail},${clientEmail},${agencyEmail})`;
  await db`delete from clients where id in (${clientId},${otherClientId})`;
  console.log("Temporary authentication test users and clients removed.");
}
