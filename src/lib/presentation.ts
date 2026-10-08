import type { ApiPriority, ApiProjectStatus, ApiRequirementType, ApiReviewStatus } from "@/types/api";

export type DisplayStatus = "Em andamento" | "Em revisão" | "Concluído" | "Arquivado" | "Pendente" | "Revisado" | "Rejeitado" | "Obsoleto";

const projectStatusLabels = { ACTIVE: "Em andamento", IN_REVIEW: "Em revisão", COMPLETED: "Concluído", ARCHIVED: "Arquivado" } as const;
const reviewStatusLabels = { PENDING: "Pendente", IN_REVIEW: "Em revisão", REVIEWED: "Revisado", REJECTED: "Rejeitado", OBSOLETE: "Obsoleto" } as const;

export function presentProjectStatus(status: ApiProjectStatus): "Em andamento" | "Em revisão" | "Concluído" | "Arquivado" {
  return projectStatusLabels[status];
}

export function presentReviewStatus(status: ApiReviewStatus): "Pendente" | "Em revisão" | "Revisado" | "Rejeitado" | "Obsoleto" {
  return reviewStatusLabels[status];
}

export function presentPriority(priority: ApiPriority) {
  return { HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa" }[priority];
}

export function presentRequirementType(type: ApiRequirementType) {
  return type === "FUNCTIONAL" ? "Funcional" : "Não funcional";
}

export function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
