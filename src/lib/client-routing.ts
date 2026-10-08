export type WorkspaceTab = "overview" | "contacts" | "activity" | "website" | "questionnaire";
export type DashboardView = "clients" | "client-workspace" | "portfolio" | "close" | "overview" | "sms" | "automations" | "campaigns" | "monthly" | "planner" | "changes" | "ai" | "settings" | "admin";
export const CLIENT_MODULES = {
  reports: { view: "overview", permission: "reports" },
  gantt: { view: "planner", permission: "planner" },
  sms: { view: "sms", permission: "reports" },
  automations: { view: "automations", permission: "reports" },
  campaigns: { view: "campaigns", permission: "reports" },
  summaries: { view: "monthly", permission: "reports" },
  ai: { view: "ai", permission: "ai" },
  settings: { view: "settings", permission: "team" },
  changes: { view: "changes", permission: "team" },
  workspace: { view: "client-workspace", tab: "overview", permission: "team" },
  contacts: { view: "client-workspace", tab: "contacts", permission: "team" },
  activity: { view: "client-workspace", tab: "activity", permission: "team" },
  website: { view: "client-workspace", tab: "website", permission: "team" },
  questionnaire: { view: "client-workspace", tab: "questionnaire", permission: "team" },
} as const;
export type ClientModule = keyof typeof CLIENT_MODULES;
const reserved = new Set(["api", "_next", "questionnaire", "summaries", "clients", "login", "logout", "portfolio", "close", "admin", "favicon", "robots", "sitemap"]);
export const isClientId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validClientSlug(value: string) {
  return value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !reserved.has(value) && !isClientId(value);
}
export function isClientModule(value: string): value is ClientModule {
  return Object.hasOwn(CLIENT_MODULES, value);
}
type RoutingClient = { id: string; urlSlug?: string | null; visibleModules: readonly string[] };
export type DashboardRoute = { view: DashboardView; clientKey?: string; tab?: WorkspaceTab; module?: ClientModule; invalid?: boolean };
export function readDashboardRoute(url: URL): DashboardRoute | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length) {
    if (url.pathname === "/clients") return { view: "clients" };
    if (parts.length > 2 || (!isClientId(parts[0]) && !validClientSlug(parts[0]))) return { view: "overview", invalid: true };
    const moduleKey = parts[1] ?? "reports";
    if (!isClientModule(moduleKey)) return { view: "overview", invalid: true };
    const definition = CLIENT_MODULES[moduleKey];
    return { view: definition.view, clientKey: parts[0], module: moduleKey, tab: "tab" in definition ? definition.tab : undefined };
  }
  const view = url.searchParams.get("view");
  const validViews: DashboardView[] = ["clients", "client-workspace", "portfolio", "close", "overview", "sms", "automations", "campaigns", "monthly", "planner", "changes", "ai", "settings", "admin"];
  if (!view && !url.searchParams.has("clientId")) return null;
  if (view && !validViews.includes(view as DashboardView)) return { view: "overview", invalid: true };
  const tab = url.searchParams.get("tab") ?? "overview";
  const tabs: WorkspaceTab[] = ["overview", "contacts", "activity", "website", "questionnaire"];
  return { view: (view ?? "overview") as DashboardView, clientKey: url.searchParams.get("clientId") ?? undefined, tab: tabs.includes(tab as WorkspaceTab) ? tab as WorkspaceTab : "overview" };
}
export function resolveDashboardRoute(route: DashboardRoute, clients: readonly RoutingClient[], staff: boolean) {
  if (route.invalid) return null;
  const client = route.clientKey ? clients.find(item => isClientId(route.clientKey!) ? item.id.toLowerCase() === route.clientKey!.toLowerCase() : item.urlSlug === route.clientKey) : undefined;
  if (route.clientKey && !client) return null;
  // Old internal Workspace query links sent to a client retain the own-report fallback.
  // New module paths fail closed; foreign or unknown clients never reach this branch.
  if (!staff && !route.module && route.view === "client-workspace" && client?.visibleModules.includes("reports")) return { view: "overview" as const, clientId: client.id, tab: undefined };
  const moduleKey = route.module ?? moduleForView(route.view, route.tab);
  if (!staff && (["clients", "portfolio", "close", "admin"].includes(route.view) || (moduleKey && CLIENT_MODULES[moduleKey].permission === "team"))) return null;
  if (client && moduleKey) {
    const permission = CLIENT_MODULES[moduleKey].permission;
    if (permission !== "team" && !client.visibleModules.includes(permission)) return null;
  }
  if (route.view === "client-workspace" && !client) return null;
  return { ...route, clientId: client?.id };
}
export function moduleForView(view: DashboardView, tab: WorkspaceTab = "overview"): ClientModule | undefined {
  return (Object.keys(CLIENT_MODULES) as ClientModule[]).find(key => {
    const definition = CLIENT_MODULES[key];
    return definition.view === view && (!("tab" in definition) || definition.tab === tab);
  });
}
export function dashboardPath(view: DashboardView, client?: { id: string; urlSlug?: string | null }, tab: WorkspaceTab = "overview") {
  if (view === "clients") return "/clients";
  const moduleKey = moduleForView(view, tab);
  if (moduleKey && client && (isClientId(client.id) || validClientSlug(client.urlSlug ?? ""))) return `/${client.urlSlug || client.id}/${moduleKey}`;
  const query = new URLSearchParams({ view });
  if (client && moduleKey) query.set("clientId", client.id);
  if (view === "client-workspace") query.set("tab", tab);
  return `/?${query}`;
}
