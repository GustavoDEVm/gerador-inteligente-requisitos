import type {
  Activity,
  ElicitationQuestion,
  Project,
  Requirement,
  UserStory,
} from "@/types/domain";

export const projects: Project[] = [
  {
    id: "delivery-local",
    name: "Delivery Local",
    description: "Plataforma para pedidos e entregas de estabelecimentos locais.",
    objective: "Centralizar pedidos, pagamento e acompanhamento de entregas.",
    context:
      "Pequenos restaurantes precisam receber pedidos digitais sem depender de aplicativos de terceiros.",
    stakeholders: ["Proprietários", "Clientes", "Entregadores", "Atendentes"],
    status: "Em andamento",
    progress: 64,
    requirementsCount: 18,
    elicitationSessions: 3,
    updatedAt: "Atualizado hoje, 10:30",
  },
  {
    id: "biblioteca-campus",
    name: "Biblioteca Campus",
    description: "Sistema de reserva e acompanhamento de empréstimos acadêmicos.",
    objective: "Melhorar o acesso dos alunos ao acervo e às reservas.",
    context:
      "A biblioteca deseja reduzir filas e disponibilizar o histórico de empréstimos aos estudantes.",
    stakeholders: ["Bibliotecários", "Estudantes", "Professores"],
    status: "Em revisão",
    progress: 82,
    requirementsCount: 26,
    elicitationSessions: 5,
    updatedAt: "Atualizado ontem, 16:20",
  },
  {
    id: "clinica-agenda",
    name: "Clínica Agenda",
    description: "Agenda digital para consultas e gestão de horários clínicos.",
    objective: "Organizar a agenda e reduzir ausências em consultas.",
    context:
      "A clínica realiza agendamentos por telefone e precisa de uma visão única da disponibilidade.",
    stakeholders: ["Recepcionistas", "Profissionais", "Pacientes"],
    status: "Concluído",
    progress: 100,
    requirementsCount: 31,
    elicitationSessions: 6,
    updatedAt: "Atualizado em 18 jun. 2026",
  },
];

export const requirements: Requirement[] = [
  {
    id: "RF-001",
    title: "Realizar pedido",
    description: "O cliente deve selecionar produtos, adicioná-los ao carrinho e confirmar um pedido.",
    type: "Funcional",
    priority: "Alta",
    status: "Em revisão",
    origin: "Sessão de elicitação #03",
    date: "31 ago. 2026",
    userStoryId: "US-001",
  },
  {
    id: "RF-002",
    title: "Acompanhar entrega",
    description: "O cliente deve visualizar o status do pedido após a confirmação.",
    type: "Funcional",
    priority: "Alta",
    status: "Pendente",
    origin: "Sessão de elicitação #03",
    date: "31 ago. 2026",
    userStoryId: "US-002",
  },
  {
    id: "RNF-001",
    title: "Disponibilidade do sistema",
    description: "A plataforma deve manter disponibilidade adequada durante o horário comercial.",
    type: "Não funcional",
    priority: "Média",
    status: "Revisado",
    origin: "Sessão de elicitação #02",
    date: "29 ago. 2026",
  },
  {
    id: "RF-003",
    title: "Gerenciar cardápio",
    description: "O estabelecimento deve cadastrar, editar e indisponibilizar produtos do cardápio.",
    type: "Funcional",
    priority: "Média",
    status: "Pendente",
    origin: "Sessão de elicitação #01",
    date: "27 ago. 2026",
  },
];

export const userStories: UserStory[] = [
  {
    id: "US-001",
    title: "Finalizar pedido",
    actor: "cliente",
    objective: "confirmar um pedido com os produtos escolhidos",
    benefit: "receber minha compra com segurança e praticidade",
    description: "Permite concluir a compra a partir do carrinho.",
    acceptanceCriteria: [
      "O carrinho deve exibir produtos e valores antes da confirmação.",
      "O cliente deve receber uma confirmação após concluir o pedido.",
    ],
    priority: "Alta",
    status: "Em revisão",
  },
  {
    id: "US-002",
    title: "Acompanhar pedido",
    actor: "cliente",
    objective: "visualizar o andamento da entrega",
    benefit: "saber quando meu pedido chegará",
    description: "Dá transparência ao cliente depois da confirmação do pedido.",
    acceptanceCriteria: [
      "O status deve ser atualizado conforme o pedido avança.",
      "A tela deve informar uma previsão de entrega quando disponível.",
    ],
    priority: "Alta",
    status: "Pendente",
  },
  {
    id: "US-003",
    title: "Atualizar cardápio",
    actor: "proprietário do estabelecimento",
    objective: "alterar produtos e sua disponibilidade",
    benefit: "manter o cardápio correto para os clientes",
    description: "Permite administrar os produtos visíveis no aplicativo.",
    acceptanceCriteria: [
      "Um produto indisponível não deve ser adicionado ao carrinho.",
      "As alterações devem refletir na visualização do cliente.",
    ],
    priority: "Média",
    status: "Revisado",
  },
];

export const activities: Activity[] = [
  {
    id: "activity-1",
    title: "Sessão de elicitação respondida",
    description: "Delivery Local · 4 respostas registradas",
    timestamp: "Há 35 minutos",
    type: "session",
  },
  {
    id: "activity-2",
    title: "Requisito atualizado",
    description: "RF-001 · Realizar pedido",
    timestamp: "Hoje, 10:30",
    type: "requirement",
  },
  {
    id: "activity-3",
    title: "Projeto criado",
    description: "Biblioteca Campus",
    timestamp: "Ontem, 16:20",
    type: "project",
  },
];

export const elicitationQuestions: ElicitationQuestion[] = [
  {
    id: "question-1",
    question: "Quem são os principais usuários do sistema e qual é a necessidade de cada grupo?",
    help: "Considere clientes, equipe interna, administradores e demais pessoas envolvidas.",
  },
  {
    id: "question-2",
    question: "Como o usuário deve iniciar e concluir um pedido?",
    help: "Descreva as etapas esperadas, incluindo escolhas, confirmação e possíveis exceções.",
  },
  {
    id: "question-3",
    question: "Quais informações devem estar disponíveis após a confirmação do pedido?",
    help: "Pense em status, prazo, pagamento, itens e canais de comunicação.",
  },
  {
    id: "question-4",
    question: "Há regras, restrições ou situações que o sistema deve tratar?",
    help: "Exemplos: horário de funcionamento, disponibilidade de produtos e cancelamentos.",
  },
];

export function getProjectById(id: string) {
  return projects.find((project) => project.id === id);
}
