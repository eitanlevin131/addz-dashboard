import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

// Fixed deadline: never extend the lifetime by restarting or redeploying.
export const DIAGNOSTIC_EXPIRES_AT = Date.parse("2026-10-04T21:30:00.000Z");

type DiagnosticSession = {
  user?: { email?: string | null };
  userId?: string;
  sessionVersion?: number;
  expires?: string;
} | null;

type DiagnosticUser = {
  id: string;
  role: string;
  status: string;
  session_version: number;
};

type Inspection = { user: DiagnosticUser | null; databaseName: string };
type DiagnosticDependencies = {
  now?: () => number;
  environment: string | undefined;
  requestHostname: string;
  deploymentUrl: string | undefined;
  commitSha: string | undefined;
  getSession: () => Promise<DiagnosticSession>;
  isOwnerEmail: (email: string) => boolean;
  getDatabaseUrl: () => string;
  inspect?: typeof inspectDatabase;
};

export function normalizeNeonIdentity(connectionString: string) {
  const url = new URL(connectionString);
  const hostname = url.hostname.toLowerCase();
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/.test(hostname)) {
    throw new Error("Unsupported database identity");
  }
  const [label, ...suffix] = hostname.split(".");
  const endpointId = label.replace(/-pooler$/, "");
  if (!/^ep-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(endpointId)) {
    throw new Error("Unsupported database identity");
  }
  return { hostname: [endpointId, ...suffix].join("."), endpointId };
}

export async function inspectDatabase(connectionString: string, email: string): Promise<Inspection> {
  const sql = neon(connectionString);
  const [, userRows, identityRows] = await sql.transaction([
    sql`SELECT set_config('statement_timeout', '2000', true)`,
    sql`SELECT id, role, status, session_version FROM users WHERE email = ${email} LIMIT 1`,
    sql`SELECT current_database() AS database_name`,
  ], {
    readOnly: true,
    isolationLevel: "RepeatableRead",
    fetchOptions: { signal: AbortSignal.timeout(5000), cache: "no-store" },
  });
  return {
    user: (userRows[0] as DiagnosticUser | undefined) ?? null,
    databaseName: identityRows[0]?.database_name as string,
  };
}

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function handleDatabaseIdentityDiagnostic(dependencies: DiagnosticDependencies) {
  const now = dependencies.now?.() ?? Date.now();
  if (now >= DIAGNOSTIC_EXPIRES_AT) return response({ error: "Diagnostic expired" }, 410);
  if (dependencies.environment !== "production" || dependencies.requestHostname !== "addz-dashboard.vercel.app") {
    return response({ error: "Not found" }, 404);
  }

  try {
    const session = await dependencies.getSession();
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email || !session?.userId || !Number.isInteger(session.sessionVersion)
      || !session.expires || !(Date.parse(session.expires) > now)) {
      return response({ error: "Unauthorized" }, 401);
    }
    if (!dependencies.isOwnerEmail(email)) return response({ error: "Forbidden" }, 403);

    const connectionString = dependencies.getDatabaseUrl();
    const identity = normalizeNeonIdentity(connectionString);
    const inspection = await (dependencies.inspect ?? inspectDatabase)(connectionString, email);
    const user = inspection.user;
    if (!user || user.id !== session.userId || user.session_version !== session.sessionVersion) {
      return response({ error: "Unauthorized" }, 401);
    }
    if (user.status !== "active" || user.role !== "owner") return response({ error: "Forbidden" }, 403);
    if ((dependencies.now?.() ?? Date.now()) >= DIAGNOSTIC_EXPIRES_AT) {
      return response({ error: "Diagnostic expired" }, 410);
    }
    if (typeof inspection.databaseName !== "string" || !/^[a-zA-Z0-9_-]{1,63}$/.test(inspection.databaseName)) {
      return response({ error: "Diagnostic unavailable" }, 503);
    }

    return response({
      ...identity,
      databaseName: inspection.databaseName,
      environment: "production",
      deploymentUrl: /^[a-z0-9-]+\.vercel\.app$/.test(dependencies.deploymentUrl ?? "")
        ? dependencies.deploymentUrl : null,
      commitSha: /^[a-f0-9]{40}$/.test(dependencies.commitSha ?? "") ? dependencies.commitSha : null,
      fingerprint: createHash("sha256").update(`${identity.hostname}\n${inspection.databaseName}`).digest("hex"),
    });
  } catch {
    return response({ error: "Diagnostic unavailable" }, 503);
  }
}
