import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não está definida. Crie .env a partir de .env.example antes de executar o seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const ids = {
  userA: "10000000-0000-4000-8000-000000000001",
  userB: "10000000-0000-4000-8000-000000000002",
  projectDelivery: "20000000-0000-4000-8000-000000000001",
  projectLibrary: "20000000-0000-4000-8000-000000000002",
  sessionDelivery: "30000000-0000-4000-8000-000000000001",
  sessionLibrary: "30000000-0000-4000-8000-000000000002",
  questionActors: "40000000-0000-4000-8000-000000000001",
  questionOrder: "40000000-0000-4000-8000-000000000002",
  questionLibrary: "40000000-0000-4000-8000-000000000003",
  answerActorsV1: "50000000-0000-4000-8000-000000000001",
  answerActorsV2: "50000000-0000-4000-8000-000000000002",
  answerOrder: "50000000-0000-4000-8000-000000000003",
  answerLibrary: "50000000-0000-4000-8000-000000000004",
  requirementOrder: "60000000-0000-4000-8000-000000000001",
  requirementTracking: "60000000-0000-4000-8000-000000000002",
  storyOrder: "70000000-0000-4000-8000-000000000001",
  storyTracking: "70000000-0000-4000-8000-000000000002",
  ambiguity: "80000000-0000-4000-8000-000000000001",
  suggestion: "80000000-0000-4000-8000-000000000002",
  activityProject: "90000000-0000-4000-8000-000000000001",
  activitySession: "90000000-0000-4000-8000-000000000002",
  activityRequirement: "90000000-0000-4000-8000-000000000003",
};

async function main() {
  const researcher = await prisma.user.upsert({
    where: { email: "pesquisadora@example.test" },
    update: { name: "Usuária Pesquisadora" },
    create: {
      id: ids.userA,
      name: "Usuária Pesquisadora",
      email: "pesquisadora@example.test",
    },
  });

  const analyst = await prisma.user.upsert({
    where: { email: "analista@example.test" },
    update: { name: "Usuário Analista" },
    create: {
      id: ids.userB,
      name: "Usuário Analista",
      email: "analista@example.test",
    },
  });

  const deliveryProject = await prisma.project.upsert({
    where: { id: ids.projectDelivery },
    update: {
      ownerId: researcher.id,
      name: "Delivery Local",
      description: "Plataforma para pedidos e entregas de estabelecimentos locais.",
      objective: "Centralizar pedidos, pagamento e acompanhamento de entregas.",
      context: "Pequenos restaurantes precisam receber pedidos digitais sem depender de aplicativos de terceiros.",
      status: "ACTIVE",
      archivedAt: null,
    },
    create: {
      id: ids.projectDelivery,
      ownerId: researcher.id,
      name: "Delivery Local",
      description: "Plataforma para pedidos e entregas de estabelecimentos locais.",
      objective: "Centralizar pedidos, pagamento e acompanhamento de entregas.",
      context: "Pequenos restaurantes precisam receber pedidos digitais sem depender de aplicativos de terceiros.",
      status: "ACTIVE",
    },
  });

  const libraryProject = await prisma.project.upsert({
    where: { id: ids.projectLibrary },
    update: {
      ownerId: analyst.id,
      name: "Biblioteca Campus",
      description: "Sistema de reserva e acompanhamento de empréstimos acadêmicos.",
      objective: "Melhorar o acesso dos estudantes ao acervo e às reservas.",
      context: "A biblioteca deseja reduzir filas e disponibilizar o histórico de empréstimos aos estudantes.",
      status: "IN_REVIEW",
      archivedAt: null,
    },
    create: {
      id: ids.projectLibrary,
      ownerId: analyst.id,
      name: "Biblioteca Campus",
      description: "Sistema de reserva e acompanhamento de empréstimos acadêmicos.",
      objective: "Melhorar o acesso dos estudantes ao acervo e às reservas.",
      context: "A biblioteca deseja reduzir filas e disponibilizar o histórico de empréstimos aos estudantes.",
      status: "IN_REVIEW",
    },
  });

  await Promise.all([
    prisma.stakeholder.upsert({
      where: { projectId_name: { projectId: deliveryProject.id, name: "Clientes" } },
      update: { role: "Realizam pedidos" },
      create: { projectId: deliveryProject.id, name: "Clientes", role: "Realizam pedidos" },
    }),
    prisma.stakeholder.upsert({
      where: { projectId_name: { projectId: deliveryProject.id, name: "Proprietários" } },
      update: { role: "Administram estabelecimentos" },
      create: { projectId: deliveryProject.id, name: "Proprietários", role: "Administram estabelecimentos" },
    }),
    prisma.stakeholder.upsert({
      where: { projectId_name: { projectId: deliveryProject.id, name: "Entregadores" } },
      update: { role: "Realizam entregas" },
      create: { projectId: deliveryProject.id, name: "Entregadores", role: "Realizam entregas" },
    }),
    prisma.stakeholder.upsert({
      where: { projectId_name: { projectId: libraryProject.id, name: "Estudantes" } },
      update: { role: "Consultam o acervo e fazem reservas" },
      create: { projectId: libraryProject.id, name: "Estudantes", role: "Consultam o acervo e fazem reservas" },
    }),
    prisma.stakeholder.upsert({
      where: { projectId_name: { projectId: libraryProject.id, name: "Bibliotecários" } },
      update: { role: "Gerenciam o acervo e os empréstimos" },
      create: { projectId: libraryProject.id, name: "Bibliotecários", role: "Gerenciam o acervo e os empréstimos" },
    }),
  ]);

  const deliverySession = await prisma.elicitationSession.upsert({
    where: { projectId_sequence: { projectId: deliveryProject.id, sequence: 1 } },
    update: {
      title: "Fluxo de pedidos",
      context: "Compreender atores, confirmação de pedidos e acompanhamento de entrega.",
      status: "COMPLETED",
      startedAt: new Date("2026-09-01T13:00:00.000Z"),
      completedAt: new Date("2026-09-01T14:00:00.000Z"),
    },
    create: {
      id: ids.sessionDelivery,
      projectId: deliveryProject.id,
      createdById: researcher.id,
      sequence: 1,
      title: "Fluxo de pedidos",
      context: "Compreender atores, confirmação de pedidos e acompanhamento de entrega.",
      status: "COMPLETED",
      startedAt: new Date("2026-09-01T13:00:00.000Z"),
      completedAt: new Date("2026-09-01T14:00:00.000Z"),
    },
  });

  const librarySession = await prisma.elicitationSession.upsert({
    where: { projectId_sequence: { projectId: libraryProject.id, sequence: 1 } },
    update: {
      title: "Reservas do acervo",
      context: "Mapear necessidades de reserva e acompanhamento de empréstimos.",
      status: "ACTIVE",
      startedAt: new Date("2026-09-02T13:00:00.000Z"),
      completedAt: null,
    },
    create: {
      id: ids.sessionLibrary,
      projectId: libraryProject.id,
      createdById: analyst.id,
      sequence: 1,
      title: "Reservas do acervo",
      context: "Mapear necessidades de reserva e acompanhamento de empréstimos.",
      status: "ACTIVE",
      startedAt: new Date("2026-09-02T13:00:00.000Z"),
    },
  });

  const actorsQuestion = await prisma.elicitationQuestion.upsert({
    where: { sessionId_position: { sessionId: deliverySession.id, position: 1 } },
    update: {
      content: "Quem são os principais usuários do sistema e qual é a necessidade de cada grupo?",
      guidance: "Considere clientes, equipe interna, administradores e demais pessoas envolvidas.",
      source: "TEMPLATE",
      askedAt: new Date("2026-09-01T13:05:00.000Z"),
    },
    create: {
      id: ids.questionActors,
      sessionId: deliverySession.id,
      position: 1,
      content: "Quem são os principais usuários do sistema e qual é a necessidade de cada grupo?",
      guidance: "Considere clientes, equipe interna, administradores e demais pessoas envolvidas.",
      source: "TEMPLATE",
      askedAt: new Date("2026-09-01T13:05:00.000Z"),
    },
  });

  const orderQuestion = await prisma.elicitationQuestion.upsert({
    where: { sessionId_position: { sessionId: deliverySession.id, position: 2 } },
    update: {
      content: "Como o usuário deve iniciar e concluir um pedido?",
      guidance: "Descreva as etapas esperadas, incluindo escolhas, confirmação e possíveis exceções.",
      source: "TEMPLATE",
      askedAt: new Date("2026-09-01T13:15:00.000Z"),
    },
    create: {
      id: ids.questionOrder,
      sessionId: deliverySession.id,
      position: 2,
      content: "Como o usuário deve iniciar e concluir um pedido?",
      guidance: "Descreva as etapas esperadas, incluindo escolhas, confirmação e possíveis exceções.",
      source: "TEMPLATE",
      askedAt: new Date("2026-09-01T13:15:00.000Z"),
    },
  });

  const libraryQuestion = await prisma.elicitationQuestion.upsert({
    where: { sessionId_position: { sessionId: librarySession.id, position: 1 } },
    update: {
      content: "Como o estudante deve reservar um item do acervo?",
      guidance: "Inclua as regras de disponibilidade e o período de reserva.",
      source: "MANUAL",
      askedAt: new Date("2026-09-02T13:05:00.000Z"),
    },
    create: {
      id: ids.questionLibrary,
      sessionId: librarySession.id,
      position: 1,
      content: "Como o estudante deve reservar um item do acervo?",
      guidance: "Inclua as regras de disponibilidade e o período de reserva.",
      source: "MANUAL",
      askedAt: new Date("2026-09-02T13:05:00.000Z"),
    },
  });

  const actorsAnswerV1 = await prisma.elicitationAnswer.upsert({
    where: { questionId_version: { questionId: actorsQuestion.id, version: 1 } },
    update: { content: "Clientes fazem pedidos; proprietários administram o cardápio e entregadores realizam as entregas." },
    create: {
      id: ids.answerActorsV1,
      questionId: actorsQuestion.id,
      authorId: researcher.id,
      version: 1,
      content: "Clientes fazem pedidos; proprietários administram o cardápio e entregadores realizam as entregas.",
    },
  });

  const actorsAnswerV2 = await prisma.elicitationAnswer.upsert({
    where: { questionId_version: { questionId: actorsQuestion.id, version: 2 } },
    update: { content: "Clientes fazem pedidos e acompanham o status; proprietários administram o cardápio; entregadores atualizam o andamento da entrega." },
    create: {
      id: ids.answerActorsV2,
      questionId: actorsQuestion.id,
      authorId: researcher.id,
      version: 2,
      content: "Clientes fazem pedidos e acompanham o status; proprietários administram o cardápio; entregadores atualizam o andamento da entrega.",
    },
  });

  const orderAnswer = await prisma.elicitationAnswer.upsert({
    where: { questionId_version: { questionId: orderQuestion.id, version: 1 } },
    update: { content: "O cliente seleciona produtos, adiciona-os ao carrinho, confirma endereço e pagamento e recebe a confirmação do pedido." },
    create: {
      id: ids.answerOrder,
      questionId: orderQuestion.id,
      authorId: researcher.id,
      version: 1,
      content: "O cliente seleciona produtos, adiciona-os ao carrinho, confirma endereço e pagamento e recebe a confirmação do pedido.",
    },
  });

  await prisma.elicitationAnswer.upsert({
    where: { questionId_version: { questionId: libraryQuestion.id, version: 1 } },
    update: { content: "O estudante consulta a disponibilidade, solicita a reserva e recebe uma confirmação com prazo para retirada." },
    create: {
      id: ids.answerLibrary,
      questionId: libraryQuestion.id,
      authorId: analyst.id,
      version: 1,
      content: "O estudante consulta a disponibilidade, solicita a reserva e recebe uma confirmação com prazo para retirada.",
    },
  });

  const orderRequirement = await prisma.requirement.upsert({
    where: { projectId_code: { projectId: deliveryProject.id, code: "RF-001" } },
    update: {
      title: "Realizar pedido",
      description: "O cliente deve selecionar produtos, adicioná-los ao carrinho e confirmar um pedido.",
      type: "FUNCTIONAL",
      priority: "HIGH",
      status: "IN_REVIEW",
      version: 1,
      archivedAt: null,
    },
    create: {
      id: ids.requirementOrder,
      projectId: deliveryProject.id,
      createdById: researcher.id,
      code: "RF-001",
      title: "Realizar pedido",
      description: "O cliente deve selecionar produtos, adicioná-los ao carrinho e confirmar um pedido.",
      type: "FUNCTIONAL",
      priority: "HIGH",
      status: "IN_REVIEW",
    },
  });

  const trackingRequirement = await prisma.requirement.upsert({
    where: { projectId_code: { projectId: deliveryProject.id, code: "RF-002" } },
    update: {
      title: "Acompanhar entrega",
      description: "O cliente deve visualizar o status do pedido após a confirmação.",
      type: "FUNCTIONAL",
      priority: "HIGH",
      status: "PENDING",
      version: 1,
      archivedAt: null,
    },
    create: {
      id: ids.requirementTracking,
      projectId: deliveryProject.id,
      createdById: researcher.id,
      code: "RF-002",
      title: "Acompanhar entrega",
      description: "O cliente deve visualizar o status do pedido após a confirmação.",
      type: "FUNCTIONAL",
      priority: "HIGH",
      status: "PENDING",
    },
  });

  await Promise.all([
    prisma.requirementAnswerSource.upsert({
      where: { requirementId_answerId: { requirementId: orderRequirement.id, answerId: orderAnswer.id } },
      update: {},
      create: { requirementId: orderRequirement.id, answerId: orderAnswer.id },
    }),
    prisma.requirementAnswerSource.upsert({
      where: { requirementId_answerId: { requirementId: trackingRequirement.id, answerId: actorsAnswerV2.id } },
      update: {},
      create: { requirementId: trackingRequirement.id, answerId: actorsAnswerV2.id },
    }),
  ]);

  const orderStory = await prisma.userStory.upsert({
    where: { projectId_code: { projectId: deliveryProject.id, code: "US-001" } },
    update: {
      title: "Finalizar pedido",
      actor: "cliente",
      objective: "confirmar um pedido com os produtos escolhidos",
      benefit: "receber minha compra com segurança e praticidade",
      description: "Permite concluir a compra a partir do carrinho.",
      priority: "HIGH",
      status: "IN_REVIEW",
      version: 1,
      archivedAt: null,
    },
    create: {
      id: ids.storyOrder,
      projectId: deliveryProject.id,
      createdById: researcher.id,
      code: "US-001",
      title: "Finalizar pedido",
      actor: "cliente",
      objective: "confirmar um pedido com os produtos escolhidos",
      benefit: "receber minha compra com segurança e praticidade",
      description: "Permite concluir a compra a partir do carrinho.",
      priority: "HIGH",
      status: "IN_REVIEW",
    },
  });

  const trackingStory = await prisma.userStory.upsert({
    where: { projectId_code: { projectId: deliveryProject.id, code: "US-002" } },
    update: {
      title: "Acompanhar pedido",
      actor: "cliente",
      objective: "visualizar o andamento da entrega",
      benefit: "saber quando meu pedido chegará",
      description: "Dá transparência ao cliente depois da confirmação do pedido.",
      priority: "HIGH",
      status: "PENDING",
      version: 1,
      archivedAt: null,
    },
    create: {
      id: ids.storyTracking,
      projectId: deliveryProject.id,
      createdById: researcher.id,
      code: "US-002",
      title: "Acompanhar pedido",
      actor: "cliente",
      objective: "visualizar o andamento da entrega",
      benefit: "saber quando meu pedido chegará",
      description: "Dá transparência ao cliente depois da confirmação do pedido.",
      priority: "HIGH",
      status: "PENDING",
    },
  });

  await Promise.all([
    prisma.requirementUserStory.upsert({
      where: { requirementId_userStoryId: { requirementId: orderRequirement.id, userStoryId: orderStory.id } },
      update: {},
      create: { requirementId: orderRequirement.id, userStoryId: orderStory.id },
    }),
    prisma.requirementUserStory.upsert({
      where: { requirementId_userStoryId: { requirementId: trackingRequirement.id, userStoryId: trackingStory.id } },
      update: {},
      create: { requirementId: trackingRequirement.id, userStoryId: trackingStory.id },
    }),
  ]);

  await Promise.all([
    prisma.acceptanceCriterion.upsert({
      where: { userStoryId_position: { userStoryId: orderStory.id, position: 1 } },
      update: { description: "O carrinho deve exibir produtos e valores antes da confirmação." },
      create: { userStoryId: orderStory.id, position: 1, description: "O carrinho deve exibir produtos e valores antes da confirmação." },
    }),
    prisma.acceptanceCriterion.upsert({
      where: { userStoryId_position: { userStoryId: orderStory.id, position: 2 } },
      update: { description: "O cliente deve receber uma confirmação após concluir o pedido." },
      create: { userStoryId: orderStory.id, position: 2, description: "O cliente deve receber uma confirmação após concluir o pedido." },
    }),
    prisma.acceptanceCriterion.upsert({
      where: { userStoryId_position: { userStoryId: trackingStory.id, position: 1 } },
      update: { description: "O status deve ser atualizado conforme o pedido avança." },
      create: { userStoryId: trackingStory.id, position: 1, description: "O status deve ser atualizado conforme o pedido avança." },
    }),
  ]);

  await Promise.all([
    prisma.ambiguity.upsert({
      where: { id: ids.ambiguity },
      update: {
        description: "O prazo de atualização do status da entrega ainda não foi definido.",
        severity: "MEDIUM",
        status: "OPEN",
        resolution: null,
        resolvedAt: null,
        resolvedById: null,
      },
      create: {
        id: ids.ambiguity,
        projectId: deliveryProject.id,
        description: "O prazo de atualização do status da entrega ainda não foi definido.",
        severity: "MEDIUM",
        status: "OPEN",
      },
    }),
    prisma.suggestion.upsert({
      where: { id: ids.suggestion },
      update: {
        description: "Definir estados e responsáveis pela atualização do ciclo de entrega.",
        status: "PENDING",
        decidedAt: null,
        decidedById: null,
      },
      create: {
        id: ids.suggestion,
        projectId: deliveryProject.id,
        description: "Definir estados e responsáveis pela atualização do ciclo de entrega.",
        status: "PENDING",
      },
    }),
  ]);

  await Promise.all([
    prisma.activityLog.upsert({
      where: { id: ids.activityProject },
      update: { summary: "Projeto Delivery Local criado para elicitação." },
      create: {
        id: ids.activityProject,
        projectId: deliveryProject.id,
        actorId: researcher.id,
        action: "PROJECT_CREATED",
        entityType: "PROJECT",
        entityId: deliveryProject.id,
        summary: "Projeto Delivery Local criado para elicitação.",
      },
    }),
    prisma.activityLog.upsert({
      where: { id: ids.activitySession },
      update: { summary: "Sessão de elicitação sobre fluxo de pedidos concluída." },
      create: {
        id: ids.activitySession,
        projectId: deliveryProject.id,
        actorId: researcher.id,
        action: "SESSION_COMPLETED",
        entityType: "SESSION",
        entityId: deliverySession.id,
        summary: "Sessão de elicitação sobre fluxo de pedidos concluída.",
      },
    }),
    prisma.activityLog.upsert({
      where: { id: ids.activityRequirement },
      update: { summary: "Requisito RF-001 registrado a partir das respostas da sessão." },
      create: {
        id: ids.activityRequirement,
        projectId: deliveryProject.id,
        actorId: researcher.id,
        action: "REQUIREMENT_CREATED",
        entityType: "REQUIREMENT",
        entityId: orderRequirement.id,
        summary: "Requisito RF-001 registrado a partir das respostas da sessão.",
      },
    }),
  ]);

  console.log("Seed de desenvolvimento concluído.");
  console.log(`Projetos disponíveis: ${deliveryProject.name} e ${libraryProject.name}.`);
  console.log(`Histórico de resposta preservado: ${actorsAnswerV1.version} e ${actorsAnswerV2.version}.`);
}

main()
  .catch((error: unknown) => {
    console.error("Falha ao executar o seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
