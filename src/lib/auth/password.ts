import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const keyLength = 64;
const parameters = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

function deriveKey(password: string, salt: string, options: { N: number; r: number; p: number; maxmem: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await deriveKey(password, salt, parameters);
  return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, n, r, p, salt, storedKey] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !storedKey) return false;

  const numericParameters = { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 };
  if (!Number.isSafeInteger(numericParameters.N) || !Number.isSafeInteger(numericParameters.r) || !Number.isSafeInteger(numericParameters.p)) return false;

  try {
    const derivedKey = await deriveKey(password, salt, numericParameters);
    const storedBuffer = Buffer.from(storedKey, "base64url");
    return storedBuffer.length === derivedKey.length && timingSafeEqual(storedBuffer, derivedKey);
  } catch {
    return false;
  }
}
