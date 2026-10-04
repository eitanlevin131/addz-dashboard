import { after } from "next/server";
import { clientApi } from "@/lib/client-api";
import { requireScan } from "@/lib/website-intelligence/repository";
import { advanceScan } from "@/lib/website-intelligence/worker";
import { sameOriginMutation } from "@/lib/website-intelligence/api";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string; scanId: string }> }) {
  return clientApi(async () => {
    sameOriginMutation(request);
    const { id, scanId } = await context.params;
    await requireScan(id, scanId);
    after(() => advanceScan(id, scanId).then(() => {}));
    return { accepted: true };
  }, 202);
}
