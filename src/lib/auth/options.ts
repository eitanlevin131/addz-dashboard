import { and, eq, sql } from "drizzle-orm";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { hashPassword, secretsMatch, verifyPassword } from "@/lib/auth/password";
import { isOwnerEmail } from "@/lib/auth/owner";
import { users } from "@/lib/schema";

const demoProvider = CredentialsProvider({
  id: "demo",
  name: "Demo",
  credentials: {
    email: { label: "Email", type: "email", placeholder: "admin@example.com" },
  },
  async authorize(credentials) {
    const email = credentials?.email || "admin@example.com";
    return {
      id: "demo-admin",
      name: "Demo Admin",
      email,
    };
  },
});

const passwordProvider = CredentialsProvider({
  id: "password",
  name: "Email and password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials) {
    const email = credentials?.email?.trim().toLowerCase();
    const password = credentials?.password ?? "";
    if (!databaseConfigured || !email || email.length > 254 || !password || password.length > 128) return null;
    const db = getDb();
    const bootstrapPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_LOGIN_CODE;
    const isOwner = isOwnerEmail(email);
    if (isOwner && bootstrapPassword) {
      await db.insert(users).values({ id: crypto.randomUUID(), email, name: "Agency Admin" }).onConflictDoNothing();
    }

    // Reserve attempts atomically in Postgres so the limit holds across serverless instances.
    const windowExpired = sql`(${users.loginWindowStart} IS NULL OR ${users.loginWindowStart} < now() - interval '15 minutes')`;
    const [user] = await db.update(users).set({
      loginAttempts: sql`CASE WHEN ${windowExpired} THEN 1 ELSE ${users.loginAttempts} + 1 END`,
      loginWindowStart: sql`CASE WHEN ${windowExpired} THEN now() ELSE ${users.loginWindowStart} END`,
    }).where(and(eq(users.email, email), sql`(${windowExpired} OR ${users.loginAttempts} < 10)`)).returning();

    if (!user) return null;
    const usingBootstrap = !user.passwordHash && isOwner && Boolean(bootstrapPassword);
    const valid = user.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : usingBootstrap && secretsMatch(password, bootstrapPassword!);
    if (!valid) return null;

    if (usingBootstrap) {
      const passwordHash = await hashPassword(password);
      const [initialized] = await db.update(users).set({ passwordHash, role: "admin" })
        .where(and(eq(users.id, user.id), sql`${users.passwordHash} IS NULL`)).returning({ id: users.id });
      if (!initialized) return null;
    }
    await db.update(users).set({ loginAttempts: 0, loginWindowStart: null }).where(eq(users.id, user.id));

    return {
      id: user.id,
      name: user.name || user.email,
      email: user.email,
      sessionVersion: user.sessionVersion,
    };
  },
});

const databaseConfigured = isDatabaseConfigured();
const providers = databaseConfigured ? [passwordProvider] : process.env.NODE_ENV !== "production" ? [demoProvider] : [];

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? "local-dev-only-secret-change-in-production" : undefined),
  providers,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sessionVersion = user.sessionVersion;
      return token;
    },
    async session({ session, token }) {
      session.userId = token.sub;
      session.sessionVersion = token.sessionVersion;
      if (session.user) {
        session.user.name = session.user.name ?? token.name;
        session.user.email = session.user.email ?? token.email;
      }
      return session;
    },
  },
};
