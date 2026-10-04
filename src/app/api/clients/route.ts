import { clientApi, clientBody } from "@/lib/client-api";
import { createClient, listClients } from "@/lib/clients";
export async function GET() {
  return clientApi(() => listClients());
}
export async function POST(request: Request) {
  return clientApi(
    async (actor) => createClient(await clientBody(request), actor),
    201,
  );
}
