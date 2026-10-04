import { ClientInputError } from "@/lib/client-foundation";
export function sameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ClientInputError("מקור הבקשה אינו מורשה.", 403);
}
