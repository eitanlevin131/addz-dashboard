import { clientApi } from "@/lib/client-api";
import { cancelScan } from "@/lib/website-intelligence/repository";
import { sameOriginMutation } from "@/lib/website-intelligence/api";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string; scanId: string }> }) {
  return clientApi(async actor => {
    sameOriginMutation(request);
    const { id, scanId } = await context.params;
    return cancelScan(id, scanId, actor);
  });
}
