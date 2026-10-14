import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { AppError } from "../../src/lib/api/errors";
import { prisma } from "../../src/lib/prisma";
import { appendAnswer, createQuestion, createSession } from "../../src/services/elicitation";
import { createProject } from "../../src/services/projects";
import {
  createRequirement,
  getRequirement,
  listRequirementRevisions,
  updateRequirement,
} from "../../src/services/requirements";
import {
  createCriterion,
  createUserStory,
  deleteCriterion,
  getCriterion,
  getUserStory,
  listCriteria,
  updateCriterion,
  updateUserStory,
} from "../../src/services/user-stories";
import { createUser } from "../../src/services/users";

test("revisões de artefatos preservam snapshots completos, arquivamento e concorrência", async () => {
  const suffix = randomBytes(6).toString("hex");
  let ownerId: string | undefined;
  let otherUserId: string | undefined;
  let projectId: string | undefined;
  let sessionId: string | undefined;
  let questionId: string | undefined;

  try {
    const [owner, otherUser] = await Promise.all([
      createUser({ name: "Pessoa proprietária das revisões", email: `revisions-owner-${suffix}@example.test` }),
      createUser({ name: "Pessoa sem acesso às revisões", email: `revisions-other-${suffix}@example.test` }),
    ]);
    ownerId = owner.id;
    otherUserId = otherUser.id;
    const project = await createProject(owner.id, {
      name: `Projeto de revisões ${suffix}`,
      description: "Projeto temporário para validar histórico imutável de artefatos.",
      objective: "Preservar snapshots completos nas edições manuais.",
      context: "Teste automatizado de revisões persistidas.",
    });
    projectId = project.id;
    const session = await createSession(project.id, owner.id, { context: "Sessão de origem do requisito." });
    sessionId = session.id;
    const question = await createQuestion(session.id, owner.id, { content: "Qual é a necessidade?" });
    questionId = question.id;
    const answer = await appendAnswer(question.id, owner.id, { content: "O sistema deve preservar todas as versões relevantes." });

    const requirement = await createRequirement(project.id, owner.id, {
      code: "RF-901",
      title: "Preservar revisões",
      description: "O sistema deve preservar o estado atual do requisito.",
      type: "FUNCTIONAL",
      answerIds: [answer.id],
    });
    const updatedRequirement = await updateRequirement(requirement.id, owner.id, {
      title: "Preservar revisões completas",
      description: "O sistema deve preservar snapshots completos de cada versão do requisito.",
      type: "NON_FUNCTIONAL",
      priority: "HIGH",
      status: "IN_REVIEW",
    });
    assert.equal(updatedRequirement.version, 2);

    const requirementWithHistory = await getRequirement(requirement.id, owner.id);
    assert.deepEqual(requirementWithHistory.revisions.map((revision) => revision.revisionNumber), [1, 2]);
    assert.deepEqual(requirementWithHistory.revisions.map((revision) => revision.operation), ["CREATED", "UPDATED"]);
    assert.equal(requirementWithHistory.revisions[0]?.description, "O sistema deve preservar o estado atual do requisito.");
    assert.equal(requirementWithHistory.revisions[1]?.description, "O sistema deve preservar snapshots completos de cada versão do requisito.");
    assert.equal(requirementWithHistory.revisions[1]?.type, "NON_FUNCTIONAL");
    assert.ok(requirementWithHistory.answerSources.some((source) => source.answerId === answer.id));

    await Promise.all([
      updateRequirement(requirement.id, owner.id, { title: "Revisão concorrente A" }),
      updateRequirement(requirement.id, owner.id, { title: "Revisão concorrente B" }),
    ]);
    const concurrentRevisions = await listRequirementRevisions(requirement.id, owner.id);
    assert.deepEqual(concurrentRevisions.map((revision) => revision.revisionNumber), [1, 2, 3, 4]);
    assert.equal(new Set(concurrentRevisions.map((revision) => revision.revisionNumber)).size, 4);

    const rollbackRequirement = await createRequirement(project.id, owner.id, {
      code: "RF-902",
      title: "Validar atomicidade",
      description: "O requisito não deve ser atualizado sem a revisão correspondente.",
      type: "FUNCTIONAL",
    });
    await prisma.requirementRevision.create({
      data: {
        requirementId: rollbackRequirement.id,
        revisionNumber: 2,
        operation: "UPDATED",
        changedById: owner.id,
        code: rollbackRequirement.code,
        title: rollbackRequirement.title,
        description: rollbackRequirement.description,
        type: rollbackRequirement.type,
        priority: rollbackRequirement.priority,
        status: rollbackRequirement.status,
      },
    });
    await assert.rejects(
      () => updateRequirement(rollbackRequirement.id, owner.id, { description: "Esta alteração precisa ser revertida." }),
    );
    const rollbackCurrent = await prisma.requirement.findUniqueOrThrow({ where: { id: rollbackRequirement.id } });
    assert.equal(rollbackCurrent.version, 1);
    assert.equal(rollbackCurrent.description, "O requisito não deve ser atualizado sem a revisão correspondente.");

    const story = await createUserStory(project.id, owner.id, {
      code: "US-901",
      title: "Consultar histórico",
      actor: "analista",
      objective: "consultar as versões preservadas",
      benefit: "manter rastreabilidade das decisões",
      description: "A User Story inicial deve permanecer recuperável.",
      requirementIds: [requirement.id],
    });
    const updatedStory = await updateUserStory(story.id, owner.id, {
      title: "Consultar histórico completo",
      actor: "responsável pelo projeto",
      objective: "recuperar qualquer versão preservada",
      benefit: "demonstrar rastreabilidade acadêmica",
      description: "A User Story anterior permanece como uma revisão imutável.",
      priority: "HIGH",
      status: "REVIEWED",
    });
    assert.equal(updatedStory.version, 2);
    const storyWithHistory = await getUserStory(story.id, owner.id);
    assert.deepEqual(storyWithHistory.revisions.map((revision) => revision.revisionNumber), [1, 2]);
    assert.equal(storyWithHistory.revisions[0]?.actor, "analista");
    assert.equal(storyWithHistory.revisions[1]?.actor, "responsável pelo projeto");
    assert.equal(storyWithHistory.revisions[0]?.description, "A User Story inicial deve permanecer recuperável.");

    const criterion = await createCriterion(story.id, owner.id, { description: "O sistema deve mostrar a versão solicitada." });
    const updatedCriterion = await updateCriterion(criterion.id, owner.id, { description: "O sistema deve mostrar a versão solicitada com autoria e data." });
    assert.equal(updatedCriterion.version, 2);
    assert.equal((await listCriteria(story.id, owner.id)).length, 1);
    await deleteCriterion(criterion.id, owner.id);
    assert.equal((await listCriteria(story.id, owner.id)).length, 0);
    const archivedCriterion = await getCriterion(criterion.id, owner.id);
    assert.ok(archivedCriterion.archivedAt);
    assert.deepEqual(archivedCriterion.revisions.map((revision) => revision.revisionNumber), [1, 2, 3]);
    assert.deepEqual(archivedCriterion.revisions.map((revision) => revision.operation), ["CREATED", "UPDATED", "ARCHIVED"]);
    assert.equal(archivedCriterion.revisions[0]?.description, "O sistema deve mostrar a versão solicitada.");
    assert.equal(archivedCriterion.revisions[2]?.archivedAt?.toISOString(), archivedCriterion.archivedAt?.toISOString());
    await assert.rejects(
      () => deleteCriterion(criterion.id, owner.id),
      (error: unknown) => error instanceof AppError && error.status === 409,
    );

    await assert.rejects(
      () => listRequirementRevisions(requirement.id, otherUser.id),
      (error: unknown) => error instanceof AppError && error.status === 403,
    );
    await assert.rejects(
      () => getCriterion(criterion.id, otherUser.id),
      (error: unknown) => error instanceof AppError && error.status === 403,
    );
  } finally {
    if (projectId) {
      await prisma.activityLog.deleteMany({ where: { projectId } });
      await prisma.acceptanceCriterion.deleteMany({ where: { userStory: { projectId } } });
      await prisma.requirementUserStory.deleteMany({ where: { userStory: { projectId } } });
      await prisma.requirementAnswerSource.deleteMany({ where: { requirement: { projectId } } });
      await prisma.requirementAnalysisSource.deleteMany({ where: { requirement: { projectId } } });
      await prisma.requirement.deleteMany({ where: { projectId } });
      await prisma.userStory.deleteMany({ where: { projectId } });
      if (questionId) await prisma.elicitationAnswer.deleteMany({ where: { questionId } });
      if (sessionId) await prisma.elicitationQuestion.deleteMany({ where: { sessionId } });
      if (sessionId) await prisma.elicitationSession.delete({ where: { id: sessionId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } });
  }
});
