export type AccessRole = "owner" | "admin" | "client";
export type ManagedRole = Exclude<AccessRole, "owner">;

export function parseManagedRole(value: unknown): ManagedRole | null {
  return value === "admin" || value === "client" ? value : null;
}

export function resolveEffectiveRole(storedRole: string, ownerEmailMatches: boolean): AccessRole {
  if (ownerEmailMatches) return "owner";
  if (storedRole === "admin" || storedRole === "agency" || storedRole === "owner") return "admin";
  return "client";
}

export function roleCanAccessAllClients(role: AccessRole) {
  return role === "owner" || role === "admin";
}

export function roleCanManageUsers(role: AccessRole) {
  return role === "owner";
}
