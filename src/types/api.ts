export type ApiEnvelope<T> = { data: T };
export type ApiErrorEnvelope = { error: { code: string; message: string; details?: unknown } };

export type ApiProjectStatus = "ACTIVE" | "IN_REVIEW" | "COMPLETED" | "ARCHIVED";
export type ApiReviewStatus = "PENDING" | "IN_REVIEW" | "REVIEWED" | "REJECTED" | "OBSOLETE";
export type ApiPriority = "HIGH" | "MEDIUM" | "LOW";
export type ApiRequirementType = "FUNCTIONAL" | "NON_FUNCTIONAL";

export type ProjectListItem = {
  id: string;
  name: string;
  description: string;
  objective: string;
  context: string;
  status: ApiProjectStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { stakeholders: number; sessions: number; requirements: number; userStories: number };
};
