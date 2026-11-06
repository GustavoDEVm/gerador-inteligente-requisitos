import { type Prisma } from "../../generated/prisma/client";

import { conflict } from "@/lib/api/errors";

type DeletionDb = Prisma.TransactionClient;

const ACTIVE_ANALYSIS_STATUSES = ["PENDING", "RUNNING"] as const;

export async function lockProjectForDeletion(db: DeletionDb, projectId: string) {
  await db.$queryRaw`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`;
  await db.$queryRaw`SELECT "id" FROM "elicitation_sessions" WHERE "project_id" = ${projectId} FOR UPDATE`;
}

export async function lockSessionForDeletion(db: DeletionDb, sessionId: string) {
  await db.$queryRaw`SELECT "id" FROM "elicitation_sessions" WHERE "id" = ${sessionId} FOR UPDATE`;
}

export async function ensureProjectHasNoActiveAnalyses(db: DeletionDb, projectId: string) {
  const activeAnalysis = await db.aIAnalysis.findFirst({
    where: { projectId, status: { in: [...ACTIVE_ANALYSIS_STATUSES] } },
    select: { id: true },
  });
  if (activeAnalysis) throw conflict("Não é possível excluir o projeto enquanto há uma operação de IA em andamento.");
}

export async function ensureSessionHasNoActiveAnalyses(db: DeletionDb, sessionId: string) {
  const activeAnalysis = await db.aIAnalysis.findFirst({
    where: {
      status: { in: [...ACTIVE_ANALYSIS_STATUSES] },
      sessions: { some: { sessionId } },
    },
    select: { id: true },
  });
  if (activeAnalysis) throw conflict("Não é possível excluir a sessão enquanto há uma operação de IA em andamento.");
}

export async function deleteProjectDependencies(db: DeletionDb, projectId: string) {
  await db.activityLog.deleteMany({ where: { projectId } });
  await db.requirementUserStory.deleteMany({
    where: {
      OR: [
        { requirement: { projectId } },
        { userStory: { projectId } },
      ],
    },
  });
  await db.acceptanceCriterionRevision.deleteMany({ where: { userStory: { projectId } } });
  await db.acceptanceCriterion.deleteMany({ where: { userStory: { projectId } } });
  await db.userStoryRevision.deleteMany({ where: { userStory: { projectId } } });
  await db.userStory.deleteMany({ where: { projectId } });
  await db.requirementRevision.deleteMany({ where: { requirement: { projectId } } });
  await db.requirementAnswerSource.deleteMany({ where: { requirement: { projectId } } });
  await db.requirementAnalysisSource.deleteMany({ where: { requirement: { projectId } } });
  await db.requirement.deleteMany({ where: { projectId } });
  await db.ambiguity.deleteMany({ where: { projectId } });
  await db.suggestion.deleteMany({ where: { projectId } });
  await db.elicitationAnswer.deleteMany({ where: { question: { session: { projectId } } } });
  await db.elicitationQuestion.deleteMany({ where: { session: { projectId } } });
  await db.aIAnalysisSession.deleteMany({ where: { session: { projectId } } });
  await db.aIAnalysis.deleteMany({ where: { projectId } });
  await db.elicitationSession.deleteMany({ where: { projectId } });
  await db.stakeholder.deleteMany({ where: { projectId } });
}

export async function deleteSessionDependencies(
  db: DeletionDb,
  session: { id: string; projectId: string },
) {
  const [questions, analyses] = await Promise.all([
    db.elicitationQuestion.findMany({
      where: { sessionId: session.id },
      select: { id: true },
    }),
    db.aIAnalysis.findMany({
      where: { sessions: { some: { sessionId: session.id } } },
      select: {
        id: true,
        sessions: { select: { sessionId: true } },
      },
    }),
  ]);
  const questionIds = questions.map((question) => question.id);
  const answers = questionIds.length > 0
    ? await db.elicitationAnswer.findMany({ where: { questionId: { in: questionIds } }, select: { id: true } })
    : [];
  const answerIds = answers.map((answer) => answer.id);
  const analysisIdsToDelete = analyses
    .filter((analysis) => analysis.sessions.every((link) => link.sessionId === session.id))
    .map((analysis) => analysis.id);

  const affectedRequirements = answerIds.length > 0 || analysisIdsToDelete.length > 0
    ? await db.requirement.findMany({
      where: {
        projectId: session.projectId,
        OR: [
          ...(answerIds.length > 0 ? [{ answerSources: { some: { answerId: { in: answerIds } } } }] : []),
          ...(analysisIdsToDelete.length > 0 ? [{ analysisSources: { some: { analysisId: { in: analysisIdsToDelete } } } }] : []),
        ],
      },
      select: {
        id: true,
        answerSources: {
          select: { answer: { select: { question: { select: { sessionId: true } } } } },
        },
        analysisSources: {
          select: { analysis: { select: { sessions: { select: { sessionId: true } } } } },
        },
      },
    })
    : [];
  const requirementIdsToDelete = affectedRequirements
    .filter((requirement) => {
      const hasOtherAnswerSource = requirement.answerSources.some(
        (source) => source.answer.question.sessionId !== session.id,
      );
      const hasOtherAnalysisSource = requirement.analysisSources.some(
        (source) => source.analysis.sessions.some((link) => link.sessionId !== session.id),
      );
      return !hasOtherAnswerSource && !hasOtherAnalysisSource;
    })
    .map((requirement) => requirement.id);

  const userStoriesToDelete = analysisIdsToDelete.length > 0
    ? await db.userStory.findMany({
      where: {
        projectId: session.projectId,
        generatedByAnalysisId: { in: analysisIdsToDelete },
      },
      select: { id: true },
    })
    : [];
  const userStoryIdsToDelete = userStoriesToDelete.map((story) => story.id);
  const acceptanceCriteriaToDelete = userStoryIdsToDelete.length > 0
    ? await db.acceptanceCriterion.findMany({
      where: { userStoryId: { in: userStoryIdsToDelete } },
      select: { id: true },
    })
    : [];
  const acceptanceCriterionIdsToDelete = acceptanceCriteriaToDelete.map((criterion) => criterion.id);
  const ambiguitiesToDelete = analysisIdsToDelete.length > 0
    ? await db.ambiguity.findMany({
      where: { projectId: session.projectId, generatedByAnalysisId: { in: analysisIdsToDelete } },
      select: { id: true },
    })
    : [];
  const suggestionsToDelete = analysisIdsToDelete.length > 0
    ? await db.suggestion.findMany({
      where: { projectId: session.projectId, generatedByAnalysisId: { in: analysisIdsToDelete } },
      select: { id: true },
    })
    : [];

  if (requirementIdsToDelete.length > 0 || userStoryIdsToDelete.length > 0) {
    await db.requirementUserStory.deleteMany({
      where: {
        OR: [
          ...(requirementIdsToDelete.length > 0 ? [{ requirementId: { in: requirementIdsToDelete } }] : []),
          ...(userStoryIdsToDelete.length > 0 ? [{ userStoryId: { in: userStoryIdsToDelete } }] : []),
        ],
      },
    });
  }
  if (acceptanceCriterionIdsToDelete.length > 0) {
    await db.acceptanceCriterionRevision.deleteMany({
      where: { acceptanceCriterionId: { in: acceptanceCriterionIdsToDelete } },
    });
    await db.acceptanceCriterion.deleteMany({ where: { id: { in: acceptanceCriterionIdsToDelete } } });
  }
  if (userStoryIdsToDelete.length > 0) {
    await db.userStoryRevision.deleteMany({ where: { userStoryId: { in: userStoryIdsToDelete } } });
    await db.userStory.deleteMany({ where: { id: { in: userStoryIdsToDelete } } });
  }
  if (requirementIdsToDelete.length > 0) {
    await db.requirementRevision.deleteMany({ where: { requirementId: { in: requirementIdsToDelete } } });
  }
  if (requirementIdsToDelete.length > 0 || answerIds.length > 0) {
    await db.requirementAnswerSource.deleteMany({
      where: {
        OR: [
          ...(requirementIdsToDelete.length > 0 ? [{ requirementId: { in: requirementIdsToDelete } }] : []),
          ...(answerIds.length > 0 ? [{ answerId: { in: answerIds } }] : []),
        ],
      },
    });
  }
  if (requirementIdsToDelete.length > 0 || analysisIdsToDelete.length > 0) {
    await db.requirementAnalysisSource.deleteMany({
      where: {
        OR: [
          ...(requirementIdsToDelete.length > 0 ? [{ requirementId: { in: requirementIdsToDelete } }] : []),
          ...(analysisIdsToDelete.length > 0 ? [{ analysisId: { in: analysisIdsToDelete } }] : []),
        ],
      },
    });
  }
  if (requirementIdsToDelete.length > 0) {
    await db.requirement.deleteMany({ where: { id: { in: requirementIdsToDelete } } });
  }
  if (ambiguitiesToDelete.length > 0) {
    await db.ambiguity.deleteMany({ where: { id: { in: ambiguitiesToDelete.map((ambiguity) => ambiguity.id) } } });
  }
  if (suggestionsToDelete.length > 0) {
    await db.suggestion.deleteMany({ where: { id: { in: suggestionsToDelete.map((suggestion) => suggestion.id) } } });
  }
  await db.aIAnalysisSession.deleteMany({ where: { sessionId: session.id } });
  if (analysisIdsToDelete.length > 0) {
    await db.aIAnalysis.deleteMany({ where: { id: { in: analysisIdsToDelete } } });
  }
  if (answerIds.length > 0) {
    await db.elicitationAnswer.deleteMany({ where: { id: { in: answerIds } } });
  }
  if (questionIds.length > 0) {
    await db.elicitationQuestion.deleteMany({ where: { id: { in: questionIds } } });
  }
  await db.elicitationSession.delete({ where: { id: session.id } });

  const activityEntityIds = [
    session.id,
    ...questionIds,
    ...answerIds,
    ...analysisIdsToDelete,
    ...requirementIdsToDelete,
    ...userStoryIdsToDelete,
    ...acceptanceCriterionIdsToDelete,
    ...ambiguitiesToDelete.map((ambiguity) => ambiguity.id),
    ...suggestionsToDelete.map((suggestion) => suggestion.id),
  ];
  await db.activityLog.deleteMany({
    where: {
      projectId: session.projectId,
      entityId: { in: activityEntityIds },
    },
  });

  return {
    deletedRequirementIds: requirementIdsToDelete,
    deletedUserStoryIds: userStoryIdsToDelete,
  };
}
