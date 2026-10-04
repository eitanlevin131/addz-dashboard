import { clientApi, clientBody } from "@/lib/client-api";
import { ClientInputError } from "@/lib/client-foundation";
import { reviewFinding } from "@/lib/website-intelligence/repository";
import { sameOriginMutation } from "@/lib/website-intelligence/api";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string; findingId: string }> }) {
  return clientApi(async actor => {
    sameOriginMutation(request);
    const { id, findingId } = await context.params;
    const body = await clientBody(request);
    if (Object.keys(body).some(key => key !== "reviewDisposition")) throw new ClientInputError("ניתן לשנות רק את תיוג הבדיקה.");
    return reviewFinding(id, findingId, body.reviewDisposition, actor);
  });
}
