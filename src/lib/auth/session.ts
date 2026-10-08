import { EncryptJWT, jwtDecrypt } from "jose";

import { sessionCookieName } from "@/lib/auth/constants";

export { sessionCookieName };
const sessionDurationSeconds = 60 * 60 * 24 * 7;

export type SessionPayload = { userId: string };

function getSessionKey() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) throw new Error("AUTH_SESSION_SECRET não está definida no ambiente do servidor.");

  const key = Buffer.from(secret, "base64url");
  if (key.length !== 32) {
    throw new Error("AUTH_SESSION_SECRET deve ser uma chave base64url de 32 bytes.");
  }

  return key;
}

export function assertSessionConfiguration() {
  getSessionKey();
}

export async function encryptSession(payload: SessionPayload) {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${sessionDurationSeconds}s`)
    .encrypt(getSessionKey());
}

export async function decryptSession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtDecrypt(token, getSessionKey());
    return typeof payload.userId === "string" ? { userId: payload.userId } : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  maxAge: sessionDurationSeconds,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  priority: "high" as const,
};
