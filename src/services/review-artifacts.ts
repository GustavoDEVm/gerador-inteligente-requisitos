import { prisma } from "@/lib/prisma";
import { invalidInput, notFound } from "@/lib/api/errors";
import { requireOwnedProject } from "@/services/shared";

export async function listAmbiguities(projectId: string, userId: string) {
  await requireOwnedProject(prisma, projectId, userId);
  return prisma.ambiguity.findMany({ where: { projectId }, include: { resolvedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } });
}

export async function createAmbiguity(projectId: string, userId: string, data: { description: string; severity?: "LOW" | "MEDIUM" | "HIGH" }) {
  await requireOwnedProject(prisma, projectId, userId);
  return prisma.ambiguity.create({ data: { projectId, ...data } });
}

export async function updateAmbiguity(id: string, userId: string, data: { status?: "OPEN" | "RESOLVED" | "DISMISSED"; resolution?: string | null }) {
  const ambiguity = await prisma.ambiguity.findUnique({ where: { id } });
  if (!ambiguity) throw notFound("Ambiguidade");
  await requireOwnedProject(prisma, ambiguity.projectId, userId);
  if (data.status === "RESOLVED" && !data.resolution) {
    throw invalidInput("Uma ambiguidade resolvida exige resolução e usuário responsável.");
  }
  const isResolved = data.status === "RESOLVED";
  const isDismissed = data.status === "DISMISSED";
  const isOpen = data.status === "OPEN";
  return prisma.ambiguity.update({
    where: { id },
    data: {
      ...data,
      ...(isResolved ? { resolvedAt: new Date(), resolvedById: userId } : isDismissed || isOpen ? { resolution: null, resolvedAt: null, resolvedById: null } : {}),
    },
  });
}

export async function listSuggestions(projectId: string, userId: string) {
  await requireOwnedProject(prisma, projectId, userId);
  return prisma.suggestion.findMany({ where: { projectId }, include: { decidedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } });
}

export async function createSuggestion(projectId: string, userId: string, data: { description: string }) {
  await requireOwnedProject(prisma, projectId, userId);
  return prisma.suggestion.create({ data: { projectId, ...data } });
}

export async function updateSuggestion(id: string, userId: string, data: { status?: "PENDING" | "ACCEPTED" | "DISMISSED" }) {
  const suggestion = await prisma.suggestion.findUnique({ where: { id } });
  if (!suggestion) throw notFound("Sugestão");
  await requireOwnedProject(prisma, suggestion.projectId, userId);
  const isDecided = data.status === "ACCEPTED" || data.status === "DISMISSED";
  return prisma.suggestion.update({
    where: { id },
    data: { ...data, ...(isDecided ? { decidedAt: new Date(), decidedById: userId } : data.status === "PENDING" ? { decidedAt: null, decidedById: null } : {}) },
  });
}
