import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getSecretKey() {
  const secret = process.env.FLASHY_API_KEY_ENCRYPTION_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing FLASHY_API_KEY_ENCRYPTION_SECRET or AUTH_SECRET");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted secret");

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getSecretKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
