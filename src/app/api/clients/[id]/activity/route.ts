import { clientApi } from "@/lib/client-api";
import { clientActivity } from "@/lib/clients";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return clientApi(async () =>
    clientActivity(
      (await context.params).id,
      Number(new URL(request.url).searchParams.get("page") ?? 0),
    ),
  );
}
