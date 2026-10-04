import { clientApi, clientBody } from "@/lib/client-api";
import { listClients, updateClient } from "@/lib/clients";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return clientApi(
    async () => (await listClients((await context.params).id))[0],
  );
}
export async function PATCH(request: Request, context: Context) {
  return clientApi(async (actor) =>
    updateClient((await context.params).id, await clientBody(request), actor),
  );
}
