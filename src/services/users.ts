import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api/errors";

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, createdAt: true, updatedAt: true },
    orderBy: { name: "asc" },
  });
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, createdAt: true, updatedAt: true },
  });
  if (!user) throw notFound("Usuário");
  return user;
}

export async function createUser(data: { name: string; email: string }) {
  return prisma.user.create({
    data,
    select: { id: true, name: true, email: true, createdAt: true, updatedAt: true },
  });
}
