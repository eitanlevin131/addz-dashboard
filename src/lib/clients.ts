import { and, desc, eq, or, sql } from "drizzle-orm";
import { auditInsert } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { initialScanStatements } from "@/lib/website-intelligence/repository";
import {
  auditLogs,
  clientContacts,
  clients,
  flashyAccounts,
  users,
} from "@/lib/schema";
import {
  ClientInputError,
  parseClientProfile,
  parseContact,
  requireUuid,
  shouldStartInitialWebsiteScan,
} from "@/lib/client-foundation";
import {
  resolveEffectiveRole,
  roleCanAccessAllClients,
} from "@/lib/auth/access-policy";
import { isOwnerEmail } from "@/lib/auth/owner";

export async function clientOptions() {
  const rows = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(users);
  return rows
    .filter(
      (row) =>
        row.status === "active" &&
        roleCanAccessAllClients(
          resolveEffectiveRole(row.role, isOwnerEmail(row.email)),
        ),
    )
    .map((row) => ({ id: row.id, name: row.name || row.email }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}
async function checkOwner(id: string | null | undefined) {
  if (id && !(await clientOptions()).some((user) => user.id === id))
    throw new ClientInputError("האחראי חייב להיות משתמש צוות פעיל.");
}
export async function requireClient(id: string) {
  requireUuid(id);
  const [client] = await getDb()
    .select()
    .from(clients)
    .where(eq(clients.id, id));
  if (!client) throw new ClientInputError("הלקוח לא נמצא.", 404);
  return client;
}
export async function listClients(id?: string) {
  const db = getDb();
  const [rows, contacts, connections, owners] = await Promise.all([
    id
      ? db
          .select()
          .from(clients)
          .where(eq(clients.id, requireUuid(id)))
      : db.select().from(clients).orderBy(desc(clients.createdAt)),
    id
      ? db.select().from(clientContacts).where(eq(clientContacts.clientId, id))
      : db.select().from(clientContacts),
    id
      ? db
          .select({
            id: flashyAccounts.id,
            clientId: flashyAccounts.clientId,
            name: flashyAccounts.name,
            active: flashyAccounts.active,
            lastSyncAt: flashyAccounts.lastSyncAt,
          })
          .from(flashyAccounts)
          .where(eq(flashyAccounts.clientId, id))
      : db
          .select({
            id: flashyAccounts.id,
            clientId: flashyAccounts.clientId,
            name: flashyAccounts.name,
            active: flashyAccounts.active,
            lastSyncAt: flashyAccounts.lastSyncAt,
          })
          .from(flashyAccounts),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  if (id && !rows.length) throw new ClientInputError("הלקוח לא נמצא.", 404);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    urlSlug: row.urlSlug,
    industry: row.industry,
    website: row.website,
    packageName: row.packageName,
    packageCode: row.packageCode,
    commercialScope: row.commercialScope,
    oneTimeAmount: row.oneTimeAmount,
    monthlyRetainerAmount: row.monthlyRetainerAmount,
    includedServices: row.includedServices,
    startDate: row.startDate,
    ownerUserId: row.ownerUserId,
    ownerName: owners.find((user) => user.id === row.ownerUserId)?.name ?? null,
    internalNotes: row.internalNotes,
    onboardingStage: row.onboardingStage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    contacts: contacts
      .filter((contact) => contact.clientId === row.id)
      .sort(
        (a, b) =>
          Number(b.isPrimary) - Number(a.isPrimary) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      ),
    connections: connections.filter((account) => account.clientId === row.id),
  }));
}
export type ClientProfile = Awaited<ReturnType<typeof listClients>>[number];
export async function createClient(
  body: Record<string, unknown>,
  actorId: string,
) {
  const profile = parseClientProfile(body);
  const startWebsiteScan = shouldStartInitialWebsiteScan(body.startWebsiteScan);
  const ownerId = !Object.hasOwn(body, "ownerUserId")
    ? actorId === "dev-admin"
      ? null
      : actorId
    : profile.ownerUserId;
  await checkOwner(ownerId);
  const contacts = body.contacts === undefined ? [] : body.contacts;
  if (!Array.isArray(contacts) || contacts.length > 30)
    throw new ClientInputError("אפשר להוסיף עד 30 אנשי קשר ביצירה.");
  const parsed = contacts.map(parseContact);
  if (parsed.filter((contact) => contact.isPrimary).length > 1)
    throw new ClientInputError("אפשר לסמן איש קשר ראשי אחד בלבד.");
  const primary = parsed.findIndex((contact) => contact.isPrimary);
  const id = crypto.randomUUID();
  const db = getDb();
  const contactRows = parsed.map((contact, index) => ({
    ...contact,
    id: crypto.randomUUID(),
    clientId: id,
    isPrimary: index === (primary < 0 ? 0 : primary),
  }));
  const insert = db.insert(clients).values({
    ...profile,
    name: profile.name!,
    id,
    ownerUserId: ownerId,
    onboardingStage: "client_created",
  });
  const event = auditInsert({
    actorUserId: actorId,
    actorType: "user",
    clientId: id,
    action: "client.created",
    entityType: "client",
    entityId: id,
    metadata: {
      onboardingStage: "client_created",
      contactCount: contactRows.length,
    },
  });
  const contactEvents = contactRows.map((contact) =>
    auditInsert({
      actorUserId: actorId,
      actorType: "user",
      clientId: id,
      action: "contact.created",
      entityType: "contact",
      entityId: contact.id,
      metadata: { isPrimary: contact.isPrimary },
    }),
  );
  const scan = startWebsiteScan ? initialScanStatements(id, profile.website, actorId) : null;
  if (contactRows.length)
    await db.batch([
      insert,
      db.insert(clientContacts).values(contactRows),
      event,
      ...contactEvents,
      ...(scan?.statements || []),
    ]);
  else await db.batch([insert, event, ...(scan?.statements || [])]);
  return { ...(await listClients(id))[0], initialWebsiteScanId: scan?.id || null };
}
export async function updateClient(id: string, body: unknown, actorId: string) {
  const existing = await requireClient(id);
  const profile = parseClientProfile(body, true, existing);
  if (profile.ownerUserId !== existing.ownerUserId)
    await checkOwner(profile.ownerUserId);
  await getDb().batch([
    getDb()
      .update(clients)
      .set({ ...profile, ...(profile.urlSlug !== undefined ? { urlSlug: sql`coalesce(${clients.urlSlug}, ${profile.urlSlug})` } : {}), updatedAt: new Date() })
      .where(eq(clients.id, id)),
    auditInsert({
      actorUserId: actorId,
      actorType: "user",
      clientId: id,
      action: "client.updated",
      entityType: "client",
      entityId: id,
      metadata: { changedFields: Object.keys(profile) },
    }),
  ]);
  return (await listClients(id))[0];
}
export async function saveContact(
  clientId: string,
  body: unknown,
  actorId: string,
  contactId?: string,
) {
  await requireClient(clientId);
  if (contactId) requireUuid(contactId);
  const contact = parseContact(body);
  const db = getDb();
  if (contactId) {
    const [existing] = await db
      .select()
      .from(clientContacts)
      .where(
        and(
          eq(clientContacts.id, contactId),
          eq(clientContacts.clientId, clientId),
        ),
      );
    if (!existing) throw new ClientInputError("איש הקשר לא נמצא.", 404);
    if (existing.isPrimary && !contact.isPrimary)
      throw new ClientInputError(
        "כדי להחליף איש קשר ראשי, יש לסמן איש קשר אחר כראשי.",
      );
  }
  const id = contactId ?? crypto.randomUUID();
  // Serialize contact writes per client before demoting/promoting the primary.
  const lock = db.execute(
    sql`select id from clients where id = ${clientId} for update`,
  );
  const primary = contact.isPrimary
    ? sql`true`
    : contactId
      ? sql`${clientContacts.isPrimary} or not exists (select 1 from client_contacts where client_id = ${clientId} and is_primary = true)`
      : sql`not exists (select 1 from client_contacts where client_id = ${clientId} and is_primary = true)`;
  const write = contactId
    ? db
        .update(clientContacts)
        .set({ ...contact, isPrimary: primary, updatedAt: new Date() })
        .where(
          and(eq(clientContacts.id, id), eq(clientContacts.clientId, clientId)),
        )
    : db
        .insert(clientContacts)
        .values({ ...contact, id, clientId, isPrimary: primary });
  const event = auditInsert({
    actorUserId: actorId,
    actorType: "user",
    clientId,
    action: contactId ? "contact.updated" : "contact.created",
    entityType: "contact",
    entityId: id,
    metadata: { changedFields: ["name", "jobTitle", "email", "phone"] },
  });
  if (contact.isPrimary)
    await db.batch([
      lock,
      db
        .update(clientContacts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(clientContacts.clientId, clientId),
            eq(clientContacts.isPrimary, true),
          ),
        ),
      write,
      event,
      auditInsert({
        actorUserId: actorId,
        actorType: "user",
        clientId,
        action: "contact.primary_changed",
        entityType: "contact",
        entityId: id,
      }),
    ]);
  else await db.batch([lock, write, event]);
  return (await listClients(clientId))[0].contacts;
}
export async function clientActivity(id: string, page = 0) {
  await requireClient(id);
  if (!Number.isInteger(page) || page < 0 || page > 10000)
    throw new ClientInputError("מספר העמוד אינו תקין.");
  const rows = await getDb()
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorName: users.name,
      actorType: auditLogs.actorType,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .where(
      or(
        eq(auditLogs.clientId, id),
        and(eq(auditLogs.entityType, "client"), eq(auditLogs.entityId, id)),
      ),
    )
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(31)
    .offset(page * 30);
  return { items: rows.slice(0, 30), hasMore: rows.length > 30, page };
}
