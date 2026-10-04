import { clientApi } from "@/lib/client-api";
import { clientOptions } from "@/lib/clients";
export async function GET() {
  return clientApi(() => clientOptions());
}
