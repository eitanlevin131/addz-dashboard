import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "next-auth/adapters";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/lib/schema";

async function sendMagicLinkEmail({
  identifier,
  url,
}: {
  identifier: string;
  url: string;
}) {
  const from = process.env.EMAIL_FROM ?? "Flashy Growth Desk <login@example.com>";
  const resendApiKey = process.env.RESEND_API_KEY || process.env.EMAIL_SERVER_PASSWORD;

  if (!resendApiKey) {
    console.log(`Magic link for ${identifier}: ${url}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: identifier,
      subject: "כניסה לדאשבורד Flashy Growth Desk",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6">
          <h2>כניסה לדאשבורד</h2>
          <p>לחצו על הקישור כדי להתחבר לחשבון שלכם:</p>
          <p><a href="${url}" style="background:#0f172a;color:white;padding:10px 16px;border-radius:6px;text-decoration:none">כניסה מאובטחת</a></p>
          <p>אם לא ביקשתם להתחבר, אפשר להתעלם מהמייל.</p>
        </div>
      `,
      text: `כניסה לדאשבורד Flashy Growth Desk:\n${url}`,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send magic link: ${text}`);
  }
}

const emailProvider = {
  id: "email",
  type: "email",
  name: "Email",
  from: process.env.EMAIL_FROM ?? "Flashy Growth Desk <login@example.com>",
  maxAge: 24 * 60 * 60,
  async sendVerificationRequest(params: { identifier: string; url: string }) {
    await sendMagicLinkEmail(params);
  },
};

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

const databaseConfigured = isDatabaseConfigured();

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET || "local-dev-only-secret-change-in-production",
  adapter: databaseConfigured
    ? (DrizzleAdapter(getDb(), {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
      } as never) as Adapter)
    : undefined,
  providers: databaseConfigured ? [emailProvider as never] : [demoProvider],
  session: {
    strategy: databaseConfigured ? "database" : "jwt",
  },
  pages: {
    signIn: "/",
    verifyRequest: "/",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user && user?.id) {
        session.user.name = session.user.name ?? user.name;
      }
      return session;
    },
  },
};
