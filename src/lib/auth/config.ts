export const authRuntimeConfig = {
  strategy: "Auth.js email one-time code",
  database: "Neon Postgres Free",
  requiredEnv: [
    "DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_URL",
    "NEXTAUTH_URL",
    "RESEND_API_KEY",
    "EMAIL_FROM",
  ],
};

export function missingAuthEnv() {
  const missing = authRuntimeConfig.requiredEnv.filter((key) => !process.env[key]);
  if (!process.env.OWNER_EMAIL && !process.env.ADMIN_EMAILS) missing.push("OWNER_EMAIL");
  return missing;
}
