export type ProjectStatus = "Em andamento" | "Em revisão" | "Concluído";
export type Priority = "Alta" | "Média" | "Baixa";
export type ReviewStatus = "Pendente" | "Em revisão" | "Revisado";

export interface Project {
  id: string;
  name: string;
  description: string;
  objective: string;
  context: string;
  stakeholders: string[];
  status: ProjectStatus;
  progress: number;
  requirementsCount: number;
  elicitationSessions: number;
  updatedAt: string;
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  type: "Funcional" | "Não funcional";
  priority: Priority;
  status: ReviewStatus;
  origin: string;
  date: string;
  userStoryId?: string;
}

export interface UserStory {
  id: string;
  title: string;
  actor: string;
  objective: string;
  benefit: string;
  description: string;
  acceptanceCriteria: string[];
  priority: Priority;
  status: ReviewStatus;
}

export interface ElicitationQuestion {
  id: string;
  question: string;
  help: string;
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: "project" | "session" | "requirement";
}
