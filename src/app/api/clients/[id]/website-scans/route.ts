import { after } from "next/server";
import { clientApi } from "@/lib/client-api";
import { requestScan, scanHistory } from "@/lib/website-intelligence/repository";
import { advanceScan } from "@/lib/website-intelligence/worker";
import { sameOriginMutation } from "@/lib/website-intelligence/api";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return clientApi(async () => scanHistory((await context.params).id));
}
export async function POST(request: Request, context: Context) {
  return clientApi(async actor => {
    sameOriginMutation(request);
    const { id } = await context.params;
    const scan = await requestScan(id, actor);
    after(() => advanceScan(id, scan.id).then(() => {}));
    return scan;
  }, 201);
}
