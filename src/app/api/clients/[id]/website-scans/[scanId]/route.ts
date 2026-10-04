import { clientApi } from "@/lib/client-api";
import { scanDetails } from "@/lib/website-intelligence/repository";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; scanId: string }> }) {
  return clientApi(async () => {
    const { id, scanId } = await context.params;
    const query = new URL(request.url).searchParams;
    return scanDetails(id, scanId, query.get("category") || undefined, query.get("disposition") || undefined);
  });
}
