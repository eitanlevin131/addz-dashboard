export const authRuntimeConfig = {
  strategy: "Auth.js Magic Link",
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
  return authRuntimeConfig.requiredEnv.filter((key) => !process.env[key]);
}
