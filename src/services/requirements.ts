import { prisma } from "@/lib/prisma";
import { invalidInput, notFound } from "@/lib/api/errors";
import { logActivity, requireOwnedProject, requireOwnedRequirement, requireUser } from "@/services/shared";

type RequirementInput = {
  code: string;
  title: string;
  description: string;
  type: "FUNCTIONAL" | "NON_FUNCTIONAL";
  priority?: "HIGH" | "MEDIUM" | "LOW";
  status?: "PENDING" | "IN_REVIEW" | "REVIEWED" | "REJECTED" | "OBSOLETE";
  answerIds?: string[];
};

type RequirementUpdate = Partial<Omit<RequirementInput, "code" | "answerIds">>;

export async function listRequirements(projectId: string, userId: string) {
  await requireOwnedProject(prisma, projectId, userId);
  return prisma.requirement.findMany({
    where: { projectId },
    include: {
      createdBy: { select: { id: true, name: true } },
      answerSources: { include: { answer: { include: { question: { include: { session: { select: { id: true, sequence: true, title: true } } } } } } } },
      userStoryLinks: { include: { userStory: { select: { id: true, code: true, title: true } } } },
    },
    orderBy: { code: "asc" },
  });
}

export async function getRequirement(id: string, userId: string) {
  await requireOwnedRequirement(prisma, id, userId);
  const requirement = await prisma.requirement.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      answerSources: { include: { answer: { include: { question: { include: { session: { select: { id: true, projectId: true, sequence: true, title: true } } } } } } } },
      analysisSources: { include: { analysis: { select: { id: true, type: true, status: true, createdAt: true } } } },
      userStoryLinks: { include: { userStory: { include: { acceptanceCriteria: { orderBy: { position: "asc" } } } } } },
    },
  });
  if (!requirement) throw notFound("Requisito");
  return requirement;
}

export async function createRequirement(projectId: string, userId: string, data: RequirementInput) {
  return prisma.$transaction(async (db) => {
    await requireOwnedProject(db, projectId, userId);
    await requireUser(db, userId);

    const uniqueAnswerIds = [...new Set(data.answerIds ?? [])];
    if (uniqueAnswerIds.length > 0) {
      const answers = await db.elicitationAnswer.findMany({
        where: { id: { in: uniqueAnswerIds } },
        select: { id: true, question: { select: { session: { select: { projectId: true } } } } },
      });
      if (answers.length !== uniqueAnswerIds.length || answers.some((answer) => answer.question.session.projectId !== projectId)) {
        throw invalidInput("As respostas de origem devem existir e pertencer ao mesmo projeto do requisito.");
      }
    }

    const requirement = await db.requirement.create({
      data: {
        projectId,
        createdById: userId,
        code: data.code.toUpperCase(),
        title: data.title,
        description: data.description,
        type: data.type,
        priority: data.priority,
        status: data.status,
        answerSources: uniqueAnswerIds.length > 0 ? { create: uniqueAnswerIds.map((answerId) => ({ answerId })) } : undefined,
      },
    });
    await logActivity(db, {
      projectId,
      actorId: userId,
      action: "REQUIREMENT_CREATED",
      entityType: "REQUIREMENT",
      entityId: requirement.id,
      summary: `Requisito ${requirement.code} criado.`,
    });
    return requirement;
  });
}

export async function updateRequirement(id: string, userId: string, data: RequirementUpdate) {
  return prisma.$transaction(async (db) => {
    const before = await requireOwnedRequirement(db, id, userId);
    const requirement = await db.requirement.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
    await logActivity(db, {
      projectId: requirement.projectId,
      actorId: userId,
      action: "REQUIREMENT_UPDATED",
      entityType: "REQUIREMENT",
      entityId: id,
      summary: `Requisito ${requirement.code} atualizado para a versão ${requirement.version}.`,
      metadata: {
        before: { title: before.title, type: before.type, priority: before.priority, status: before.status, version: before.version },
        after: { title: requirement.title, type: requirement.type, priority: requirement.priority, status: requirement.status, version: requirement.version },
      },
    });
    return requirement;
  });
}
