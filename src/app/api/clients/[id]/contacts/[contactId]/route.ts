import { clientApi, clientBody } from "@/lib/client-api";
import { saveContact } from "@/lib/clients";
type Context = { params: Promise<{ id: string; contactId: string }> };
export async function PATCH(request: Request, context: Context) {
  return clientApi(async (actor) => {
    const { id, contactId } = await context.params;
    return saveContact(id, await clientBody(request), actor, contactId);
  });
}
