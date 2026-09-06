export const authRuntimeConfig = {
  strategy: "Auth.js email and password",
  database: "Neon Postgres Free",
  requiredEnv: [
    "DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_URL",
    "NEXTAUTH_URL",
  ],
};

export function missingAuthEnv() {
  const missing = authRuntimeConfig.requiredEnv.filter((key) => !process.env[key]);
  if (!process.env.OWNER_EMAIL && !process.env.ADMIN_EMAILS) missing.push("OWNER_EMAIL");
  return missing;
}
