import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { isOwnerEmail } from "@/lib/auth/owner";
import { getDatabaseUrl } from "@/lib/db";
import { handleDatabaseIdentityDiagnostic } from "@/lib/database-identity-diagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: Request) {
  return handleDatabaseIdentityDiagnostic({
    environment: process.env.VERCEL_ENV,
    requestHostname: new URL(request.url).hostname,
    deploymentUrl: process.env.VERCEL_URL,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    getSession: () => getServerSession(authOptions),
    isOwnerEmail,
    getDatabaseUrl,
  });
}
