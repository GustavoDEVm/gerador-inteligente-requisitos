import { prisma } from "@/lib/prisma";
import { unauthenticated } from "@/lib/api/errors";
import { decryptSession, sessionCookieName } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export const authenticatedUserSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AuthenticatedUser = { id: string; name: string; email: string; createdAt: Date; updatedAt: Date };

function getCookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie");
  if (!cookies) return undefined;

  return cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function registerUser(data: { name: string; email: string; password: string }) {
  const passwordHash = await hashPassword(data.password);
  return prisma.user.create({
    data: { name: data.name, email: data.email, passwordHash },
    select: authenticatedUserSelect,
  });
}

export async function authenticateUser(data: { email: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: { ...authenticatedUserSelect, passwordHash: true },
  });

  if (!user?.passwordHash || !(await verifyPassword(data.password, user.passwordHash))) {
    throw unauthenticated();
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function getCurrentUser(request: Request): Promise<AuthenticatedUser | null> {
  const token = getCookieValue(request, sessionCookieName);
  if (!token) return null;

  const session = await decryptSession(token);
  if (!session) return null;

  return prisma.user.findUnique({ where: { id: session.userId }, select: authenticatedUserSelect });
}

export async function requireCurrentUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) throw unauthenticated();
  return user;
}
