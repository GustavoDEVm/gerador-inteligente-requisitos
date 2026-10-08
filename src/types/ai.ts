export type InitialAnalysisUserStory = {
  actor: string;
  action: string;
  benefit: string;
};

export type InitialRequirementAnalysis = {
  summary: string;
  userStory: InitialAnalysisUserStory;
  observations: string[];
  ambiguities: string[];
  suggestions: string[];
};

export type InitialRequirementAnalysisResponse = {
  analysisId: string;
  result: InitialRequirementAnalysis;
};

export type GeneratedFunctionalRequirement = {
  code: string;
  title: string;
  description: string;
};

export type GeneratedNonFunctionalRequirement = {
  code: string;
  category: string;
  description: string;
};

export type GeneratedAcceptanceCriterion = {
  description: string;
};

/**
 * Contract returned by the provider for the generate-requirements operation.
 * It deliberately contains only primitive values so that it can be sent as a
 * small Structured Output schema to every provider.
 */
export type RequirementsGenerationAIResult = {
  userStory: string;
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  acceptanceCriteria: string[];
};

/**
 * Contract returned by the application after the provider result is validated,
 * normalized and persisted with project-scoped codes.
 */
export type RequirementsGenerationResult = {
  userStory: InitialAnalysisUserStory;
  functionalRequirements: GeneratedFunctionalRequirement[];
  nonFunctionalRequirements: GeneratedNonFunctionalRequirement[];
  acceptanceCriteria: GeneratedAcceptanceCriterion[];
};

export type RequirementsGenerationResponse = {
  analysisId: string;
  result: RequirementsGenerationResult;
};

export type DetectedAmbiguitySeverity = "low" | "medium" | "high";

export type DetectedAmbiguity = {
  description: string;
  severity: DetectedAmbiguitySeverity;
  context: string;
};

export type AmbiguityDetectionResult = {
  ambiguities: DetectedAmbiguity[];
};

export type AmbiguityDetectionResponse = {
  analysisId: string;
  result: AmbiguityDetectionResult;
};

/** Contract returned by a provider for clarification-question generation. */
export type RefinementQuestionAIResult = {
  questions: {
    ambiguityId: string;
    question: string;
    reason: string;
  }[];
};

export type RefinementQuestionAmbiguity = {
  description: string;
  severity: DetectedAmbiguitySeverity;
  context: string | null;
};

/**
 * Server response after a provider result has been validated and persisted.
 * `questionId` is the persisted elicitation question and `ambiguityId` keeps
 * the source relationship recorded in the historical AIAnalysis output.
 */
export type PersistedRefinementQuestion = {
  questionId: string;
  ambiguityId: string;
  question: string;
  reason: string;
  ambiguity: RefinementQuestionAmbiguity;
};

export type RefinementQuestionsResult = {
  questions: PersistedRefinementQuestion[];
};

export type RefinementQuestionsResponse = {
  analysisId: string;
  result: RefinementQuestionsResult;
};
