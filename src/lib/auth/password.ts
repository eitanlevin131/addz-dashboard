import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const keyLength = 64;

export function validatePassword(password: string) {
  if (password.length < 10) return "הסיסמה חייבת להכיל לפחות 10 תווים.";
  if (password.length > 128) return "הסיסמה ארוכה מדי.";
  return null;
}

export async function hashPassword(password: string) {
  const validationError = validatePassword(password);
  if (validationError) throw new Error(validationError);

  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, keyLength)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  if (!password || password.length > 128) return false;
  const [algorithm, salt, hash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;

  const expected = Buffer.from(hash, "hex");
  if (expected.length !== keyLength) return false;

  const actual = (await scryptAsync(password, salt, keyLength)) as Buffer;
  return timingSafeEqual(actual, expected);
}

export function secretsMatch(submitted: string, expected: string) {
  const submittedBuffer = Buffer.from(submitted);
  const expectedBuffer = Buffer.from(expected);
  return (
    submittedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(submittedBuffer, expectedBuffer)
  );
}
