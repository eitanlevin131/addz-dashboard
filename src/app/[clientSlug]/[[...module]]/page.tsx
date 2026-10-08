import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { DashboardApp } from "@/components/dashboard-app";
import { canAccessClient, getAccessContext, isAdminRole } from "@/lib/auth/access";
import { isClientId, readDashboardRoute, resolveDashboardRoute, validClientSlug } from "@/lib/client-routing";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/schema";

export default async function ClientModulePage({ params }: { params: Promise<{ clientSlug: string; module?: string[] }> }) {
  const { clientSlug, module: segments = [] } = await params;
  if ((!isClientId(clientSlug) && !validClientSlug(clientSlug)) || segments.length > 1) notFound();
  const route = readDashboardRoute(new URL(`/${clientSlug}/${segments.join("/")}`, "https://routing.invalid"));
  if (!route || route.invalid) notFound();
  const context = await getAccessContext();
  // Anonymous visitors use the existing login flow and return to this path.
  if (!context.ok) return <DashboardApp />;
  const [client] = await getDb().select({ id: clients.id, urlSlug: clients.urlSlug, visibleModules: clients.visibleModules }).from(clients)
    .where(isClientId(clientSlug) ? eq(clients.id, clientSlug) : eq(clients.urlSlug, clientSlug)).limit(1);
  if (!client || !canAccessClient(context.access, client.id) || !resolveDashboardRoute(route, [client], isAdminRole(context.access.role))) notFound();
  return <DashboardApp />;
}
