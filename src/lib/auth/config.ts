export const authRuntimeConfig = {
  strategy: "Auth.js Magic Link",
  database: "Neon Postgres Free",
  requiredEnv: [
    "DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_URL",
    "EMAIL_SERVER_HOST",
    "EMAIL_SERVER_PORT",
    "EMAIL_SERVER_USER",
    "EMAIL_SERVER_PASSWORD",
    "EMAIL_FROM",
  ],
};

export function missingAuthEnv() {
  return authRuntimeConfig.requiredEnv.filter((key) => !process.env[key]);
}
