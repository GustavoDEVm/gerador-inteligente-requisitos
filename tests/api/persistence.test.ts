import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../../src/lib/prisma";
import { appendAnswer, createQuestion, createSession, updateSession } from "../../src/services/elicitation";
import { createProject, createStakeholder, updateStakeholder } from "../../src/services/projects";
import { createRequirement, updateRequirement } from "../../src/services/requirements";
import { createAmbiguity, createSuggestion, updateAmbiguity, updateSuggestion } from "../../src/services/review-artifacts";
import { createCriterion, createUserStory, linkRequirement, updateCriterion, updateUserStory } from "../../src/services/user-stories";
import { createUser } from "../../src/services/users";

test("os serviços persistem o fluxo principal e removem somente seus dados temporários", async () => {
  const suffix = `${Date.now()}`.slice(-8);
  const email = `api-test-${suffix}@example.test`;
  let userId: string | undefined;
  let projectId: string | undefined;
  let sessionId: string | undefined;
  let questionId: string | undefined;

  try {
    const user = await createUser({ name: "Usuário de teste temporário", email });
    userId = user.id;
    assert.equal(user.email, email);

    const project = await createProject(user.id, {
      name: `Projeto de teste ${suffix}`,
      description: "Projeto isolado para validação da camada de persistência.",
      objective: "Validar serviços da API.",
      context: "Dados temporários gerados pelo teste automatizado.",
    });
    projectId = project.id;
    assert.equal(project.ownerId, user.id);

    const stakeholder = await createStakeholder(project.id, user.id, { name: `Stakeholder ${suffix}`, role: "Validação" });
    const updatedStakeholder = await updateStakeholder(stakeholder.id, user.id, { role: "Validação atualizada" });
    assert.equal(updatedStakeholder.role, "Validação atualizada");

    const session = await createSession(project.id, user.id, { context: "Sessão temporária", status: "ACTIVE" });
    sessionId = session.id;
    assert.equal(session.sequence, 1);

    const question = await createQuestion(session.id, user.id, { content: "Qual é o comportamento esperado?", source: "MANUAL" });
    questionId = question.id;
    const firstAnswer = await appendAnswer(question.id, user.id, { content: "O sistema deve registrar a informação." });
    const secondAnswer = await appendAnswer(question.id, user.id, { content: "O sistema deve registrar a informação com rastreabilidade." });
    assert.deepEqual([firstAnswer.version, secondAnswer.version], [1, 2]);

    const requirement = await createRequirement(project.id, user.id, {
      code: `RF-${suffix}`,
      title: "Registrar informação",
      description: "O sistema deve registrar informações relevantes.",
      type: "FUNCTIONAL",
      answerIds: [secondAnswer.id],
    });
    const updatedRequirement = await updateRequirement(requirement.id, user.id, { priority: "HIGH", status: "IN_REVIEW" });
    assert.equal(updatedRequirement.version, 2);

    const story = await createUserStory(project.id, user.id, {
      code: `US-${suffix}`,
      title: "Registrar contexto",
      actor: "analista",
      objective: "registrar o contexto coletado",
      benefit: "preservar a rastreabilidade",
      requirementIds: [requirement.id],
    });
    const updatedStory = await updateUserStory(story.id, user.id, { priority: "HIGH" });
    assert.equal(updatedStory.version, 2);
    const criterion = await createCriterion(story.id, user.id, { description: "O registro deve conter autoria e data." });
    assert.equal((await updateCriterion(criterion.id, user.id, { description: "O registro deve conter autoria, data e versão." })).description, "O registro deve conter autoria, data e versão.");

    const secondRequirement = await createRequirement(project.id, user.id, {
      code: `RNF-${suffix}`,
      title: "Manter rastreabilidade",
      description: "O histórico deve ser preservado.",
      type: "NON_FUNCTIONAL",
    });
    await linkRequirement(story.id, secondRequirement.id, user.id);

    const ambiguity = await createAmbiguity(project.id, user.id, { description: "O período de retenção ainda não foi definido." });
    assert.equal((await updateAmbiguity(ambiguity.id, user.id, { status: "RESOLVED", resolution: "Reter por cinco anos." })).status, "RESOLVED");
    const suggestion = await createSuggestion(project.id, user.id, { description: "Documentar a política de retenção." });
    assert.equal((await updateSuggestion(suggestion.id, user.id, { status: "ACCEPTED" })).status, "ACCEPTED");
    assert.equal((await updateSession(session.id, user.id, { status: "COMPLETED" })).status, "COMPLETED");
  } finally {
    if (projectId) {
      await prisma.activityLog.deleteMany({ where: { projectId } });
      await prisma.acceptanceCriterion.deleteMany({ where: { userStory: { projectId } } });
      await prisma.requirementUserStory.deleteMany({ where: { userStory: { projectId } } });
      await prisma.requirementAnswerSource.deleteMany({ where: { requirement: { projectId } } });
      await prisma.requirementAnalysisSource.deleteMany({ where: { requirement: { projectId } } });
      await prisma.requirement.deleteMany({ where: { projectId } });
      await prisma.userStory.deleteMany({ where: { projectId } });
      await prisma.ambiguity.deleteMany({ where: { projectId } });
      await prisma.suggestion.deleteMany({ where: { projectId } });
      if (questionId) await prisma.elicitationAnswer.deleteMany({ where: { questionId } });
      if (sessionId) await prisma.elicitationQuestion.deleteMany({ where: { sessionId } });
      if (sessionId) await prisma.elicitationSession.delete({ where: { id: sessionId } });
      await prisma.stakeholder.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
  }
});
