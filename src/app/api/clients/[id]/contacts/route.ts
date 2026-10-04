import { clientApi, clientBody } from "@/lib/client-api";
import { listClients, saveContact } from "@/lib/clients";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return clientApi(
    async () => (await listClients((await context.params).id))[0].contacts,
  );
}
export async function POST(request: Request, context: Context) {
  return clientApi(
    async (actor) =>
      saveContact((await context.params).id, await clientBody(request), actor),
    201,
  );
}
