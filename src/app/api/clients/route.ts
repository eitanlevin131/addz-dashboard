import { clientApi, clientBody } from "@/lib/client-api";
import { createClient, listClients } from "@/lib/clients";
import { after } from "next/server";
import { advanceScan } from "@/lib/website-intelligence/worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  return clientApi(() => listClients());
}
export async function POST(request: Request) {
  return clientApi(
    async (actor) => {
      const client = await createClient(await clientBody(request), actor);
      if (client.initialWebsiteScanId) after(() => advanceScan(client.id, client.initialWebsiteScanId!).then(() => {}));
      return client;
    },
    201,
  );
}
