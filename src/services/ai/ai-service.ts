import { Prisma, type PrismaClient } from "../../../generated/prisma/client";

import { invalidInput } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { getAIConfiguration, type AIConfiguration } from "@/services/ai/config";
import { AIProviderError, aiInvalidResponseError } from "@/services/ai/errors";
import { logAIEvent, measureAIStage } from "@/services/ai/observability";
import { getAIProvider } from "@/services/ai/provider";
import { ANALYZE_SYSTEM_PROMPT, ANALYZE_SYSTEM_PROMPT_VERSION } from "@/services/ai/prompts/analyze-system";
import { DETECT_AMBIGUITIES_PROMPT, DETECT_AMBIGUITIES_PROMPT_VERSION } from "@/services/ai/prompts/detect-ambiguities";
import { GENERATE_REFINEMENT_QUESTIONS_PROMPT, GENERATE_REFINEMENT_QUESTIONS_PROMPT_VERSION } from "@/services/ai/prompts/generate-refinement-questions";
import { GENERATE_REQUIREMENTS_PROMPT, GENERATE_REQUIREMENTS_PROMPT_VERSION } from "@/services/ai/prompts/generate-requirements";
import { REFINE_REQUIREMENTS_PROMPT, REFINE_REQUIREMENTS_PROMPT_VERSION } from "@/services/ai/prompts/refine-requirements";
import { ambiguityDetectionSchema, initialRequirementAnalysisSchema, refinementQuestionsSchema, requirementsGenerationSchema, toProviderJsonSchema } from "@/services/ai/schemas";
import type { AIProviderFactory } from "@/services/ai/types";
import { logActivity, nextPosition, requireOwnedProject, requireOwnedSession } from "@/services/shared";
import type { AmbiguityDetectionResponse, AmbiguityDetectionResult, DetectedAmbiguity, DetectedAmbiguitySeverity, InitialAnalysisUserStory, InitialRequirementAnalysisResponse, PersistedRefinementQuestion, RefinementQuestionAIResult, RefinementQuestionAmbiguity, RefinementQuestionsResponse, RefinementQuestionsResult, RequirementsGenerationAIResult, RequirementsGenerationResponse, RequirementsGenerationResult } from "@/types/ai";

type AIRequestContext = {
  projectId: string;
  sessionId: string;
  userId: string;
};

export type AnalyzeSystemDescriptionInput = AIRequestContext & {
  input: string;
};

export type AnalyzeSystemDescriptionUseCase = {
  analyzeSystemDescription(input: AnalyzeSystemDescriptionInput): Promise<InitialRequirementAnalysisResponse>;
};

export type GenerateRequirementsUseCase = {
  generateRequirements(input: GenerateRequirementsInput): Promise<RequirementsGenerationResponse>;
};

export type GenerateRequirementsInput = AIRequestContext;

export type RefineRequirementsInput = AIRequestContext;

export type RefineRequirementsUseCase = {
  refineRequirements(input: RefineRequirementsInput): Promise<RequirementsGenerationResponse>;
};

export type DetectAmbiguitiesInput = AIRequestContext;

export type DetectAmbiguitiesUseCase = {
  detectAmbiguities(input: DetectAmbiguitiesInput): Promise<AmbiguityDetectionResponse>;
};

export type GenerateRefinementQuestionsInput = AIRequestContext;

export type GenerateRefinementQuestionsUseCase = {
  generateRefinementQuestions(input: GenerateRefinementQuestionsInput): Promise<RefinementQuestionsResponse>;
};

type AIServiceOptions = {
  db?: PrismaClient;
  providerFactory?: AIProviderFactory;
};

type PromptDefinition = {
  analysisType: "REQUIREMENT_EXTRACTION" | "AMBIGUITY_DETECTION" | "QUESTION_GENERATION" | "REFINEMENT";
  inputResolutionStage: "elicitation-answer-fetch" | "input-resolution" | "refinement-input-resolution" | "requirements-refinement-input-resolution";
  operation: string;
  text: string;
  version: string;
};

type RunningAnalysis = {
  id: string;
  configuration: AIConfiguration;
  input: string;
  sourceAnswerId?: string;
  sourceAnswerIds: string[];
  refinementAmbiguities?: RefinementAmbiguitySource[];
  refinementRules?: ConfirmedRefinementRules;
};

type ResolvedAnalysisInput = {
  input: string;
  sourceAnswerId?: string;
  sourceAnswerIds?: string[];
  inputSnapshot?: Prisma.InputJsonValue;
  refinementAmbiguities?: RefinementAmbiguitySource[];
  refinementRules?: ConfirmedRefinementRules;
};

type RefinementAmbiguitySource = RefinementQuestionAmbiguity & { id: string };

type ConfirmedRefinementRules = {
  requiresOrderAuthentication: boolean;
};

const DEFAULT_NON_FUNCTIONAL_REQUIREMENT_CATEGORY = "Geral";

export class AIService implements AnalyzeSystemDescriptionUseCase, GenerateRequirementsUseCase, RefineRequirementsUseCase, DetectAmbiguitiesUseCase, GenerateRefinementQuestionsUseCase {
  private readonly db: PrismaClient;
  private readonly providerFactory: AIProviderFactory;

  constructor({ db = prisma, providerFactory = getAIProvider }: AIServiceOptions = {}) {
    this.db = db;
    this.providerFactory = providerFactory;
  }

  async analyzeSystemDescription(input: AnalyzeSystemDescriptionInput): Promise<InitialRequirementAnalysisResponse> {
    const runningAnalysis = await this.createRunningAnalysis(input, {
      analysisType: "REQUIREMENT_EXTRACTION",
      inputResolutionStage: "input-resolution",
      operation: "analyze-system-description",
      text: ANALYZE_SYSTEM_PROMPT,
      version: ANALYZE_SYSTEM_PROMPT_VERSION,
    }, () => ({ input: input.input }));

    try {
      const provider = this.providerFactory();
      const generated = await measureAIStage({ analysisId: runningAnalysis.id, operation: "analyze-system-description" }, "ai-provider-call", () => provider.generateStructuredResponse({
        model: runningAnalysis.configuration.gemini.model ?? "",
        systemInstruction: ANALYZE_SYSTEM_PROMPT,
        userInput: runningAnalysis.input,
        responseJsonSchema: toProviderJsonSchema(initialRequirementAnalysisSchema),
        temperature: 0.2,
        timeoutMs: 30_000,
        metadata: {
          operation: "analyze-system-description",
          promptVersion: ANALYZE_SYSTEM_PROMPT_VERSION,
        },
      }));
      const result = await measureAIStage({ analysisId: runningAnalysis.id, operation: "analyze-system-description" }, "zod-validation", () => initialRequirementAnalysisSchema.safeParse(generated.output));

      if (!result.success) throw aiInvalidResponseError();

      await measureAIStage({ analysisId: runningAnalysis.id, operation: "analyze-system-description" }, "analysis-completion-persistence", () => this.db.$transaction(async (db) => {
        await db.aIAnalysis.update({
          where: { id: runningAnalysis.id },
          data: {
            status: "SUCCEEDED",
            provider: provider.name,
            model: generated.model,
            structuredOutput: result.data as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        await logActivity(db, {
          projectId: input.projectId,
          actorId: input.userId,
          action: "ANALYSIS_COMPLETED",
          entityType: "ANALYSIS",
          entityId: runningAnalysis.id,
          summary: "Análise inicial de descrição concluída pela IA.",
          metadata: { promptVersion: ANALYZE_SYSTEM_PROMPT_VERSION, provider: provider.name },
        });
      }));

      return { analysisId: runningAnalysis.id, result: result.data };
    } catch (error) {
      throw await this.failAnalysis(runningAnalysis.id, "analyze-system-description", error);
    }
  }

  async generateRequirements(input: GenerateRequirementsInput): Promise<RequirementsGenerationResponse> {
    const runningAnalysis = await this.createRunningAnalysis(input, {
      analysisType: "REQUIREMENT_EXTRACTION",
      inputResolutionStage: "elicitation-answer-fetch",
      operation: "generate-requirements",
      text: GENERATE_REQUIREMENTS_PROMPT,
      version: GENERATE_REQUIREMENTS_PROMPT_VERSION,
    }, (db, session) => this.resolveInitialElicitationAnswer(db, session, "gerar requisitos"));

    try {
      const provider = this.providerFactory();
      const generated = await measureAIStage({ analysisId: runningAnalysis.id, operation: "generate-requirements" }, "ai-provider-call", () => provider.generateStructuredResponse<RequirementsGenerationAIResult>({
        model: runningAnalysis.configuration.gemini.model ?? "",
        systemInstruction: GENERATE_REQUIREMENTS_PROMPT,
        userInput: runningAnalysis.input,
        responseJsonSchema: toProviderJsonSchema(requirementsGenerationSchema),
        temperature: 0.2,
        timeoutMs: 30_000,
        metadata: {
          operation: "generate-requirements",
          promptVersion: GENERATE_REQUIREMENTS_PROMPT_VERSION,
        },
      }));
      const result = await measureAIStage({ analysisId: runningAnalysis.id, operation: "generate-requirements" }, "zod-validation", () => requirementsGenerationSchema.safeParse(generated.output));

      if (!result.success) throw aiInvalidResponseError();

      const persistedResult = await this.persistGeneratedRequirements({
        analysisId: runningAnalysis.id,
        input,
        sourceAnswerIds: runningAnalysis.sourceAnswerIds,
        provider: provider.name,
        model: generated.model,
        result: result.data,
        operation: "generate-requirements",
        promptVersion: GENERATE_REQUIREMENTS_PROMPT_VERSION,
        activitySummary: "Geração de requisitos concluída pela IA.",
      });

      return { analysisId: runningAnalysis.id, result: persistedResult };
    } catch (error) {
      throw await this.failAnalysis(runningAnalysis.id, "generate-requirements", error);
    }
  }

  async refineRequirements(input: RefineRequirementsInput): Promise<RequirementsGenerationResponse> {
    const runningAnalysis = await this.createRunningAnalysis(input, {
      analysisType: "REFINEMENT",
      inputResolutionStage: "requirements-refinement-input-resolution",
      operation: "refine-requirements",
      text: REFINE_REQUIREMENTS_PROMPT,
      version: REFINE_REQUIREMENTS_PROMPT_VERSION,
    }, (db, session) => this.resolveRequirementsRefinementInput(db, session));

    try {
      const provider = this.providerFactory();
      const generated = await measureAIStage({ analysisId: runningAnalysis.id, operation: "refine-requirements" }, "ai-provider-call", () => provider.generateStructuredResponse<RequirementsGenerationAIResult>({
        model: runningAnalysis.configuration.gemini.model ?? "",
        systemInstruction: REFINE_REQUIREMENTS_PROMPT,
        userInput: runningAnalysis.input,
        responseJsonSchema: toProviderJsonSchema(requirementsGenerationSchema),
        temperature: 0.2,
        timeoutMs: 30_000,
        metadata: {
          operation: "refine-requirements",
          promptVersion: REFINE_REQUIREMENTS_PROMPT_VERSION,
        },
      }));
      const result = await measureAIStage({ analysisId: runningAnalysis.id, operation: "refine-requirements" }, "zod-validation", () => requirementsGenerationSchema.safeParse(generated.output));

      if (!result.success) throw aiInvalidResponseError();

      const persistedResult = await this.persistGeneratedRequirements({
        analysisId: runningAnalysis.id,
        input,
        sourceAnswerIds: runningAnalysis.sourceAnswerIds,
        provider: provider.name,
        model: generated.model,
        result: ensureConfirmedRefinementRules(result.data, runningAnalysis.refinementRules),
        operation: "refine-requirements",
        promptVersion: REFINE_REQUIREMENTS_PROMPT_VERSION,
        activitySummary: "Refinamento de requisitos concluído pela IA.",
      });

      return { analysisId: runningAnalysis.id, result: persistedResult };
    } catch (error) {
      throw await this.failAnalysis(runningAnalysis.id, "refine-requirements", error);
    }
  }

  async detectAmbiguities(input: DetectAmbiguitiesInput): Promise<AmbiguityDetectionResponse> {
    const runningAnalysis = await this.createRunningAnalysis(input, {
      analysisType: "AMBIGUITY_DETECTION",
      inputResolutionStage: "elicitation-answer-fetch",
      operation: "detect-ambiguities",
      text: DETECT_AMBIGUITIES_PROMPT,
      version: DETECT_AMBIGUITIES_PROMPT_VERSION,
    }, (db, session) => this.resolveInitialElicitationAnswer(db, session, "detectar ambiguidades"));

    try {
      const provider = this.providerFactory();
      const generated = await measureAIStage({ analysisId: runningAnalysis.id, operation: "detect-ambiguities" }, "ai-provider-call", () => provider.generateStructuredResponse<AmbiguityDetectionResult>({
        model: runningAnalysis.configuration.gemini.model ?? "",
        systemInstruction: DETECT_AMBIGUITIES_PROMPT,
        userInput: runningAnalysis.input,
        responseJsonSchema: toProviderJsonSchema(ambiguityDetectionSchema),
        temperature: 0.2,
        timeoutMs: 30_000,
        metadata: {
          operation: "detect-ambiguities",
          promptVersion: DETECT_AMBIGUITIES_PROMPT_VERSION,
        },
      }));
      const result = await measureAIStage({ analysisId: runningAnalysis.id, operation: "detect-ambiguities" }, "zod-validation", () => ambiguityDetectionSchema.safeParse(generated.output));

      if (!result.success) throw aiInvalidResponseError();

      const persistedResult = await this.persistDetectedAmbiguities({
        analysisId: runningAnalysis.id,
        input,
        provider: provider.name,
        model: generated.model,
        result: result.data,
      });

      return { analysisId: runningAnalysis.id, result: persistedResult };
    } catch (error) {
      throw await this.failAnalysis(runningAnalysis.id, "detect-ambiguities", error);
    }
  }

  async generateRefinementQuestions(input: GenerateRefinementQuestionsInput): Promise<RefinementQuestionsResponse> {
    const runningAnalysis = await this.createRunningAnalysis(input, {
      analysisType: "QUESTION_GENERATION",
      inputResolutionStage: "refinement-input-resolution",
      operation: "generate-refinement-questions",
      text: GENERATE_REFINEMENT_QUESTIONS_PROMPT,
      version: GENERATE_REFINEMENT_QUESTIONS_PROMPT_VERSION,
    }, (db, session) => this.resolveRefinementQuestionsInput(db, session));

    try {
      if (!runningAnalysis.refinementAmbiguities || runningAnalysis.refinementAmbiguities.length === 0) {
        const result = await this.persistGeneratedRefinementQuestions({
          analysisId: runningAnalysis.id,
          input,
          provider: "not-invoked",
          model: "not-invoked",
          ambiguities: [],
          result: { questions: [] },
        });
        return { analysisId: runningAnalysis.id, result };
      }

      const provider = this.providerFactory();
      const generated = await measureAIStage({ analysisId: runningAnalysis.id, operation: "generate-refinement-questions" }, "ai-provider-call", () => provider.generateStructuredResponse<RefinementQuestionAIResult>({
        model: runningAnalysis.configuration.gemini.model ?? "",
        systemInstruction: GENERATE_REFINEMENT_QUESTIONS_PROMPT,
        userInput: runningAnalysis.input,
        responseJsonSchema: toProviderJsonSchema(refinementQuestionsSchema),
        temperature: 0.2,
        timeoutMs: 30_000,
        metadata: {
          operation: "generate-refinement-questions",
          promptVersion: GENERATE_REFINEMENT_QUESTIONS_PROMPT_VERSION,
        },
      }));
      const parsedResult = await measureAIStage({ analysisId: runningAnalysis.id, operation: "generate-refinement-questions" }, "zod-validation", () => refinementQuestionsSchema.safeParse(generated.output));

      if (!parsedResult.success) throw aiInvalidResponseError();

      const result = deduplicateRefinementQuestions(parsedResult.data.questions);
      validateRefinementQuestionAmbiguityIds(result, runningAnalysis.refinementAmbiguities);
      const persistedResult = await this.persistGeneratedRefinementQuestions({
        analysisId: runningAnalysis.id,
        input,
        provider: provider.name,
        model: generated.model,
        ambiguities: runningAnalysis.refinementAmbiguities,
        result: { questions: result },
      });

      return { analysisId: runningAnalysis.id, result: persistedResult };
    } catch (error) {
      throw await this.failAnalysis(runningAnalysis.id, "generate-refinement-questions", error);
    }
  }

  private async createRunningAnalysis(
    input: AIRequestContext,
    prompt: PromptDefinition,
    resolveInput: (db: Prisma.TransactionClient, session: { id: string; projectId: string }) => Promise<ResolvedAnalysisInput> | ResolvedAnalysisInput,
  ): Promise<RunningAnalysis> {
    const configuration = getAIConfiguration();
    const { analysis, resolvedInput } = await this.db.$transaction(async (db) => {
      const preconditionsStartedAt = Date.now();
      let preconditionsErrorName: string | undefined;
      let preconditionsSucceeded = false;
      let session!: { id: string; projectId: string };
      try {
      await requireOwnedProject(db, input.projectId, input.userId);
      session = await requireOwnedSession(db, input.sessionId, input.userId);

      if (session.projectId !== input.projectId) {
        throw invalidInput("A sessão informada não pertence ao projeto selecionado.");
      }

      preconditionsSucceeded = true;
      } catch (error) {
        preconditionsErrorName = error instanceof Error ? error.name : "UnknownError";
        throw error;
      } finally {
        logAIEvent("ai-stage-completed", {
          durationMs: Date.now() - preconditionsStartedAt,
          errorName: preconditionsErrorName,
          operation: prompt.operation,
          outcome: preconditionsSucceeded ? "succeeded" : "failed",
          stage: "preconditions",
        });
      }

      const resolvedInput = await measureAIStage({ operation: prompt.operation }, prompt.inputResolutionStage, () => resolveInput(db, session));

      const analysisPersistenceStartedAt = Date.now();
      const created = await db.aIAnalysis.create({
        data: {
          projectId: input.projectId,
          requestedById: input.userId,
          type: prompt.analysisType,
          status: "RUNNING",
          provider: configuration.provider || "gemini",
          model: configuration.gemini.model ?? "not-configured",
          promptVersion: prompt.version,
          promptText: prompt.text,
          inputSnapshot: resolvedInput.inputSnapshot ?? {
            input: resolvedInput.input,
            sessionId: input.sessionId,
            sourceAnswerId: resolvedInput.sourceAnswerId ?? null,
          } as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
      });

      await db.aIAnalysisSession.create({ data: { analysisId: created.id, sessionId: input.sessionId } });
      logAIEvent("ai-stage-completed", {
        analysisId: created.id,
        durationMs: Date.now() - analysisPersistenceStartedAt,
        operation: prompt.operation,
        outcome: "succeeded",
        stage: "analysis-initial-persistence",
      });
      return { analysis: created, resolvedInput };
    });

    return {
      id: analysis.id,
      configuration,
      input: resolvedInput.input,
      sourceAnswerId: resolvedInput.sourceAnswerId,
      sourceAnswerIds: resolvedInput.sourceAnswerIds ?? (resolvedInput.sourceAnswerId ? [resolvedInput.sourceAnswerId] : []),
      refinementAmbiguities: resolvedInput.refinementAmbiguities,
      refinementRules: resolvedInput.refinementRules,
    };
  }

  private async resolveInitialElicitationAnswer(
    db: Prisma.TransactionClient,
    session: { id: string; projectId: string },
    action: string,
  ): Promise<ResolvedAnalysisInput> {
    const question = await db.elicitationQuestion.findFirst({
      where: { sessionId: session.id, position: 1 },
      select: {
        answers: {
          orderBy: { version: "desc" },
          take: 1,
          select: { id: true, content: true },
        },
      },
    });
    const answer = question?.answers[0];

    if (!answer || answer.content.trim().length < 20) {
      throw invalidInput(`Registre uma resposta de elicitação com pelo menos 20 caracteres antes de ${action}.`);
    }

    return { input: answer.content.trim(), sourceAnswerId: answer.id };
  }

  private async resolveRefinementQuestionsInput(
    db: Prisma.TransactionClient,
    session: { id: string; projectId: string },
  ): Promise<ResolvedAnalysisInput> {
    const elicitationAnswer = await this.resolveInitialElicitationAnswer(db, session, "gerar perguntas de refinamento");
    const latestAmbiguityAnalysis = await db.aIAnalysis.findFirst({
      where: {
        projectId: session.projectId,
        type: "AMBIGUITY_DETECTION",
        status: "SUCCEEDED",
        sessions: { some: { sessionId: session.id } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const ambiguities = latestAmbiguityAnalysis ? await db.ambiguity.findMany({
      where: {
        projectId: session.projectId,
        status: "OPEN",
        generatedByAnalysisId: latestAmbiguityAnalysis.id,
      },
      select: {
        id: true,
        description: true,
        severity: true,
        generatedByAnalysis: { select: { structuredOutput: true } },
      },
      orderBy: { createdAt: "asc" },
    }) : [];
    const refinementAmbiguities = ambiguities.map((ambiguity) => ({
      id: ambiguity.id,
      description: ambiguity.description,
      severity: toDetectedAmbiguitySeverity(ambiguity.severity),
      context: getAmbiguityContext(ambiguity.description, ambiguity.severity, ambiguity.generatedByAnalysis?.structuredOutput),
    }));
    const inputSnapshot = {
      elicitationAnswer: elicitationAnswer.input,
      sessionId: session.id,
      sourceAnswerId: elicitationAnswer.sourceAnswerId ?? null,
      ambiguities: refinementAmbiguities,
    } as Prisma.InputJsonValue;

    return {
      input: JSON.stringify({ elicitationAnswer: elicitationAnswer.input, ambiguities: refinementAmbiguities }),
      sourceAnswerId: elicitationAnswer.sourceAnswerId,
      inputSnapshot,
      refinementAmbiguities,
    };
  }

  private async resolveRequirementsRefinementInput(
    db: Prisma.TransactionClient,
    session: { id: string; projectId: string },
  ): Promise<ResolvedAnalysisInput> {
    const initialElicitationAnswer = await this.resolveInitialElicitationAnswer(db, session, "refinar requisitos");
    const [latestQuestionAnalysis, latestAmbiguityAnalysis] = await Promise.all([
      db.aIAnalysis.findFirst({
        where: {
          projectId: session.projectId,
          type: "QUESTION_GENERATION",
          status: "SUCCEEDED",
          sessions: { some: { sessionId: session.id } },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      }),
      db.aIAnalysis.findFirst({
        where: {
          projectId: session.projectId,
          type: "AMBIGUITY_DETECTION",
          status: "SUCCEEDED",
          sessions: { some: { sessionId: session.id } },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      }),
    ]);

    if (!latestQuestionAnalysis || !latestAmbiguityAnalysis) {
      throw invalidInput("Detecte ambiguidades e gere perguntas de refinamento antes de refinar os requisitos.");
    }

    const [latestAmbiguities, generatedQuestions, previousUserStory] = await Promise.all([
      db.ambiguity.findMany({
        where: { projectId: session.projectId, generatedByAnalysisId: latestAmbiguityAnalysis.id },
        select: { id: true },
      }),
      db.elicitationQuestion.findMany({
        where: {
          sessionId: session.id,
          source: "AI",
          generatedByAnalysisId: latestQuestionAnalysis.id,
        },
        select: {
          id: true,
          content: true,
          generatedByAnalysis: { select: { structuredOutput: true } },
          answers: {
            orderBy: { version: "desc" },
            take: 1,
            select: { id: true, content: true },
          },
        },
        orderBy: { position: "asc" },
      }),
      db.userStory.findFirst({
        where: {
          projectId: session.projectId,
          generatedByAnalysis: {
            is: {
              type: { in: ["REQUIREMENT_EXTRACTION", "REFINEMENT"] },
              status: "SUCCEEDED",
              sessions: { some: { sessionId: session.id } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        select: {
          generatedByAnalysisId: true,
          actor: true,
          objective: true,
          benefit: true,
          description: true,
          acceptanceCriteria: {
            orderBy: { position: "asc" },
            select: { description: true },
          },
        },
      }),
    ]);

    if (!previousUserStory?.generatedByAnalysisId) {
      throw invalidInput("Gere requisitos antes de solicitar o refinamento.");
    }

    const latestAmbiguityIds = new Set(latestAmbiguities.map((ambiguity) => ambiguity.id));
    const refinementQuestions = generatedQuestions.filter((question) => {
      const ambiguityId = getRefinementQuestionAmbiguityId(question.generatedByAnalysis?.structuredOutput, question.id);
      return ambiguityId !== null && latestAmbiguityIds.has(ambiguityId);
    });

    if (refinementQuestions.length === 0) {
      throw invalidInput("Não há perguntas de refinamento relevantes para a análise atual.");
    }

    if (refinementQuestions.some((question) => !question.answers[0])) {
      throw invalidInput("Responda todas as perguntas de refinamento atuais antes de refinar os requisitos.");
    }

    const previousRequirements = await db.requirement.findMany({
      where: {
        projectId: session.projectId,
        analysisSources: { some: { analysisId: previousUserStory.generatedByAnalysisId } },
      },
      select: { type: true, description: true },
      orderBy: { code: "asc" },
    });

    const refinementAnswers = refinementQuestions.map((question) => ({
      questionId: question.id,
      question: question.content,
      answerId: question.answers[0]!.id,
      answer: question.answers[0]!.content,
    }));
    const refinementRules = {
      requiresOrderAuthentication: refinementAnswers.some((answer) => confirmsOrderAuthentication(answer.question, answer.answer)),
    };
    const previousRequirementsSnapshot = {
      analysisId: previousUserStory.generatedByAnalysisId,
      userStory: previousUserStory.description ?? `Como ${previousUserStory.actor}, quero ${previousUserStory.objective}, para ${previousUserStory.benefit}.`,
      functionalRequirements: previousRequirements
        .filter((requirement) => requirement.type === "FUNCTIONAL")
        .map((requirement) => requirement.description),
      nonFunctionalRequirements: previousRequirements
        .filter((requirement) => requirement.type === "NON_FUNCTIONAL")
        .map((requirement) => requirement.description),
      acceptanceCriteria: previousUserStory.acceptanceCriteria.map((criterion) => criterion.description),
    };
    const inputSnapshot = {
      sessionId: session.id,
      initialElicitationAnswer: {
        answerId: initialElicitationAnswer.sourceAnswerId ?? null,
        content: initialElicitationAnswer.input,
      },
      refinementQuestionAnalysisId: latestQuestionAnalysis.id,
      refinementAnswers,
      previousRequirements: previousRequirementsSnapshot,
    } as Prisma.InputJsonValue;

    return {
      input: JSON.stringify({
        initialElicitationAnswer: initialElicitationAnswer.input,
        refinementAnswers,
        previousRequirements: previousRequirementsSnapshot,
      }),
      sourceAnswerId: initialElicitationAnswer.sourceAnswerId,
      sourceAnswerIds: Array.from(new Set([
        ...(initialElicitationAnswer.sourceAnswerId ? [initialElicitationAnswer.sourceAnswerId] : []),
        ...refinementAnswers.map((answer) => answer.answerId),
      ])),
      inputSnapshot,
      refinementRules,
    };
  }

  private async persistDetectedAmbiguities({
    analysisId,
    input,
    provider,
    model,
    result,
  }: {
    analysisId: string;
    input: DetectAmbiguitiesInput;
    provider: string;
    model: string;
    result: AmbiguityDetectionResult;
  }): Promise<AmbiguityDetectionResult> {
    const persistedResult = { ambiguities: deduplicateAmbiguities(result.ambiguities) };

    return this.db.$transaction(async (db) => {
      const timing = { analysisId, operation: "detect-ambiguities" };
      const ambiguitiesPersistenceStartedAt = Date.now();
      if (persistedResult.ambiguities.length > 0) {
        await db.ambiguity.createMany({
          data: persistedResult.ambiguities.map((ambiguity) => ({
            projectId: input.projectId,
            generatedByAnalysisId: analysisId,
            description: ambiguity.description,
            severity: toStoredAmbiguitySeverity(ambiguity.severity),
          })),
        });
      }
      logAIEvent("ai-stage-completed", {
        ...timing,
        durationMs: Date.now() - ambiguitiesPersistenceStartedAt,
        outcome: "succeeded",
        stage: "ambiguities-persistence",
      });

      const analysisCompletionPersistenceStartedAt = Date.now();
      await db.aIAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "SUCCEEDED",
          provider,
          model,
          structuredOutput: persistedResult as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      await logActivity(db, {
        projectId: input.projectId,
        actorId: input.userId,
        action: "ANALYSIS_COMPLETED",
        entityType: "ANALYSIS",
        entityId: analysisId,
        summary: "Detecção de ambiguidades concluída pela IA.",
        metadata: { promptVersion: DETECT_AMBIGUITIES_PROMPT_VERSION, provider },
      });
      logAIEvent("ai-stage-completed", {
        ...timing,
        durationMs: Date.now() - analysisCompletionPersistenceStartedAt,
        outcome: "succeeded",
        stage: "analysis-completion-persistence",
      });

      return persistedResult;
    });
  }

  private async persistGeneratedRefinementQuestions({
    analysisId,
    input,
    provider,
    model,
    ambiguities,
    result,
  }: {
    analysisId: string;
    input: GenerateRefinementQuestionsInput;
    provider: string;
    model: string;
    ambiguities: RefinementAmbiguitySource[];
    result: RefinementQuestionAIResult;
  }): Promise<RefinementQuestionsResult> {
    return this.db.$transaction(async (db) => {
      const timing = { analysisId, operation: "generate-refinement-questions" };
      const ambiguityById = new Map(ambiguities.map((ambiguity) => [ambiguity.id, ambiguity]));
      const questionsPersistenceStartedAt = Date.now();
      const firstPosition = result.questions.length > 0
        ? await nextPosition(db, "question", input.sessionId)
        : 0;
      const persistedQuestions: PersistedRefinementQuestion[] = [];

      for (const [index, generatedQuestion] of result.questions.entries()) {
        const ambiguity = ambiguityById.get(generatedQuestion.ambiguityId);
        if (!ambiguity) throw aiInvalidResponseError();

        const question = await db.elicitationQuestion.create({
          data: {
            sessionId: input.sessionId,
            position: firstPosition + index,
            content: generatedQuestion.question,
            guidance: generatedQuestion.reason,
            source: "AI",
            generatedByAnalysisId: analysisId,
            askedAt: new Date(),
          },
        });
        const persistedQuestion: PersistedRefinementQuestion = {
          questionId: question.id,
          ambiguityId: ambiguity.id,
          question: question.content,
          reason: question.guidance ?? generatedQuestion.reason,
          ambiguity: {
            description: ambiguity.description,
            severity: ambiguity.severity,
            context: ambiguity.context,
          },
        };
        persistedQuestions.push(persistedQuestion);
        await logActivity(db, {
          projectId: input.projectId,
          actorId: input.userId,
          action: "QUESTION_ADDED",
          entityType: "QUESTION",
          entityId: question.id,
          summary: `Pergunta de refinamento ${question.position} gerada pela IA.`,
          metadata: { ambiguityId: ambiguity.id, analysisId },
        });
      }
      logAIEvent("ai-stage-completed", {
        ...timing,
        durationMs: Date.now() - questionsPersistenceStartedAt,
        outcome: "succeeded",
        stage: "refinement-questions-persistence",
      });

      const persistedResult: RefinementQuestionsResult = { questions: persistedQuestions };
      const analysisCompletionPersistenceStartedAt = Date.now();
      await db.aIAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "SUCCEEDED",
          provider,
          model,
          structuredOutput: persistedResult as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      await logActivity(db, {
        projectId: input.projectId,
        actorId: input.userId,
        action: "ANALYSIS_COMPLETED",
        entityType: "ANALYSIS",
        entityId: analysisId,
        summary: "Perguntas de refinamento geradas pela IA.",
        metadata: { promptVersion: GENERATE_REFINEMENT_QUESTIONS_PROMPT_VERSION, provider },
      });
      logAIEvent("ai-stage-completed", {
        ...timing,
        durationMs: Date.now() - analysisCompletionPersistenceStartedAt,
        outcome: "succeeded",
        stage: "analysis-completion-persistence",
      });

      return persistedResult;
    });
  }

  private async persistGeneratedRequirements({
    analysisId,
    input,
    sourceAnswerIds,
    provider,
    model,
    result,
    operation,
    promptVersion,
    activitySummary,
  }: {
    analysisId: string;
    input: AIRequestContext;
    sourceAnswerIds: string[];
    provider: string;
    model: string;
    result: RequirementsGenerationAIResult;
    operation: "generate-requirements" | "refine-requirements";
    promptVersion: string;
    activitySummary: string;
  }): Promise<RequirementsGenerationResult> {
    return this.db.$transaction(async (db) => {
      const timing = { analysisId, operation };
      const codeAllocationStartedAt = Date.now();
      const [functionalCodes, nonFunctionalCodes, userStoryCode] = await Promise.all([
        nextCodes(db, "requirement", input.projectId, "RF", result.functionalRequirements.length),
        nextCodes(db, "requirement", input.projectId, "RNF", result.nonFunctionalRequirements.length),
        nextCodes(db, "userStory", input.projectId, "US", 1),
      ]);
      logAIEvent("ai-stage-completed", {
        ...timing,
        durationMs: Date.now() - codeAllocationStartedAt,
        outcome: "succeeded",
        stage: "code-allocation",
      });
      const persistedFunctionalRequirements = result.functionalRequirements.map((description, index) => ({
        code: functionalCodes[index]!,
        title: description,
        description,
      }));
      const persistedNonFunctionalRequirements = result.nonFunctionalRequirements.map((description, index) => ({
        code: nonFunctionalCodes[index]!,
        category: DEFAULT_NON_FUNCTIONAL_REQUIREMENT_CATEGORY,
        description,
      }));
      const userStoryResult = normalizeGeneratedUserStory(result.userStory);
      const persistedAcceptanceCriteria = result.acceptanceCriteria.map((description) => ({ description }));
      const requirementsPersistenceStartedAt = Date.now();
      const persistedRequirements = await Promise.all([
        ...persistedFunctionalRequirements.map((requirement) =>
          db.requirement.create({
            data: {
              projectId: input.projectId,
              createdById: input.userId,
              code: requirement.code,
              title: requirement.title,
              description: requirement.description,
              type: "FUNCTIONAL",
              analysisSources: { create: { analysisId } },
              ...(sourceAnswerIds.length > 0 ? { answerSources: { create: sourceAnswerIds.map((answerId) => ({ answerId })) } } : {}),
            },
          }),
        ),
        ...persistedNonFunctionalRequirements.map((requirement) =>
          db.requirement.create({
            data: {
              projectId: input.projectId,
              createdById: input.userId,
              code: requirement.code,
              title: requirement.category,
              description: requirement.description,
              type: "NON_FUNCTIONAL",
              analysisSources: { create: { analysisId } },
              ...(sourceAnswerIds.length > 0 ? { answerSources: { create: sourceAnswerIds.map((answerId) => ({ answerId })) } } : {}),
            },
          }),
        ),
      ]);
      logAIEvent("ai-stage-completed", {
        ...timing,
        durationMs: Date.now() - requirementsPersistenceStartedAt,
        outcome: "succeeded",
        stage: "requirements-persistence",
      });
      const userStoryPersistenceStartedAt = Date.now();
      const userStory = await db.userStory.create({
        data: {
          projectId: input.projectId,
          createdById: input.userId,
          generatedByAnalysisId: analysisId,
          code: userStoryCode[0]!,
          title: result.userStory,
          actor: userStoryResult.actor,
          objective: userStoryResult.action,
          benefit: userStoryResult.benefit,
          description: result.userStory,
        },
      });
      logAIEvent("ai-stage-completed", {
        ...timing,
        durationMs: Date.now() - userStoryPersistenceStartedAt,
        outcome: "succeeded",
        stage: "user-story-persistence",
      });
      const acceptanceCriteriaPersistenceStartedAt = Date.now();
      await db.acceptanceCriterion.createMany({
        data: persistedAcceptanceCriteria.map((criterion, index) => ({
          userStoryId: userStory.id,
          position: index + 1,
          description: criterion.description,
        })),
      });
      logAIEvent("ai-stage-completed", {
        ...timing,
        durationMs: Date.now() - acceptanceCriteriaPersistenceStartedAt,
        outcome: "succeeded",
        stage: "acceptance-criteria-persistence",
      });
      const requirementUserStoryLinkStartedAt = Date.now();
      await db.requirementUserStory.createMany({
        data: persistedRequirements.map((requirement) => ({ requirementId: requirement.id, userStoryId: userStory.id })),
      });
      logAIEvent("ai-stage-completed", {
        ...timing,
        durationMs: Date.now() - requirementUserStoryLinkStartedAt,
        outcome: "succeeded",
        stage: "requirement-user-story-link-persistence",
      });

      const persistedResult: RequirementsGenerationResult = {
        userStory: userStoryResult,
        functionalRequirements: persistedFunctionalRequirements,
        nonFunctionalRequirements: persistedNonFunctionalRequirements,
        acceptanceCriteria: persistedAcceptanceCriteria,
      };
      const analysisCompletionPersistenceStartedAt = Date.now();
      await db.aIAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "SUCCEEDED",
          provider,
          model,
          structuredOutput: persistedResult as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      await logActivity(db, {
        projectId: input.projectId,
        actorId: input.userId,
        action: "ANALYSIS_COMPLETED",
        entityType: "ANALYSIS",
        entityId: analysisId,
        summary: activitySummary,
        metadata: { promptVersion, provider },
      });
      logAIEvent("ai-stage-completed", {
        ...timing,
        durationMs: Date.now() - analysisCompletionPersistenceStartedAt,
        outcome: "succeeded",
        stage: "analysis-completion-persistence",
      });

      return persistedResult;
    });
  }

  private async failAnalysis(analysisId: string, operation: string, error: unknown) {
    const aiError = error instanceof AIProviderError ? error : new AIProviderError("AI_PROVIDER_UNAVAILABLE");
    const failurePersistenceStartedAt = Date.now();
    await this.db.aIAnalysis.update({
      where: { id: analysisId },
      data: {
        status: aiError.code === "AI_INVALID_RESPONSE" ? "INVALID_RESPONSE" : "FAILED",
        errorCode: aiError.code,
        completedAt: new Date(),
      },
    });
    logAIEvent("ai-stage-completed", {
      analysisId,
      durationMs: Date.now() - failurePersistenceStartedAt,
      operation,
      outcome: "succeeded",
      stage: "analysis-failure-persistence",
    });
    return aiError;
  }
}

function normalizeGeneratedUserStory(userStory: string): InitialAnalysisUserStory {
  const text = userStory.trim();
  const match = /^como\s+(.+?),\s+quero\s+(.+?),\s+para\s+(.+?)[.!]?$/i.exec(text);

  if (!match) {
    return {
      actor: "usuário",
      action: text,
      benefit: "atender à necessidade descrita",
    };
  }

  return {
    actor: match[1]!.trim(),
    action: match[2]!.trim(),
    benefit: match[3]!.trim(),
  };
}

function deduplicateAmbiguities(ambiguities: DetectedAmbiguity[]) {
  const descriptions = new Set<string>();

  return ambiguities.filter((ambiguity) => {
    const normalizedDescription = ambiguity.description.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
    if (descriptions.has(normalizedDescription)) return false;
    descriptions.add(normalizedDescription);
    return true;
  });
}

function toStoredAmbiguitySeverity(severity: DetectedAmbiguity["severity"]): "LOW" | "MEDIUM" | "HIGH" {
  return severity.toUpperCase() as "LOW" | "MEDIUM" | "HIGH";
}

function toDetectedAmbiguitySeverity(severity: "LOW" | "MEDIUM" | "HIGH"): DetectedAmbiguitySeverity {
  return severity.toLocaleLowerCase("en-US") as DetectedAmbiguitySeverity;
}

function getAmbiguityContext(description: string, severity: "LOW" | "MEDIUM" | "HIGH", structuredOutput: Prisma.JsonValue | null | undefined): string | null {
  const parsedOutput = ambiguityDetectionSchema.safeParse(structuredOutput);
  if (!parsedOutput.success) return null;

  return parsedOutput.data.ambiguities.find((ambiguity) => (
    ambiguity.description === description && ambiguity.severity === toDetectedAmbiguitySeverity(severity)
  ))?.context ?? null;
}

function deduplicateRefinementQuestions(questions: RefinementQuestionAIResult["questions"]) {
  const ambiguityIds = new Set<string>();

  return questions.filter((question) => {
    if (ambiguityIds.has(question.ambiguityId)) return false;
    ambiguityIds.add(question.ambiguityId);
    return true;
  });
}

function validateRefinementQuestionAmbiguityIds(
  questions: RefinementQuestionAIResult["questions"],
  ambiguities: RefinementAmbiguitySource[],
) {
  const eligibleAmbiguityIds = new Set(ambiguities.map((ambiguity) => ambiguity.id));
  if (questions.some((question) => !eligibleAmbiguityIds.has(question.ambiguityId))) throw aiInvalidResponseError();
}

function getRefinementQuestionAmbiguityId(value: Prisma.JsonValue | null | undefined, questionId: string): string | null {
  if (!value || typeof value !== "object" || !("questions" in value) || !Array.isArray(value.questions)) return null;
  const question = value.questions.find((item): item is Prisma.JsonObject => (
    item !== null && typeof item === "object" && !Array.isArray(item) && item.questionId === questionId
  ));
  return question && typeof question.ambiguityId === "string" ? question.ambiguityId : null;
}

function confirmsOrderAuthentication(question: string, answer: string) {
  const normalizedQuestion = question.toLocaleLowerCase("pt-BR");
  const normalizedAnswer = answer.toLocaleLowerCase("pt-BR");
  const questionDefinesOrderAuthentication = containsAll(normalizedQuestion, ["autentic", "pedido"])
    && (normalizedQuestion.includes("finaliz") || normalizedQuestion.includes("conclu"));
  const answerExplicitlyConfirmsOrderAuthentication = containsAll(normalizedAnswer, ["autentic", "pedido"])
    && (normalizedAnswer.includes("finaliz") || normalizedAnswer.includes("conclu"));

  return questionDefinesOrderAuthentication
    && (answerExplicitlyConfirmsOrderAuthentication || isAffirmativeAnswer(normalizedAnswer));
}

function ensureConfirmedRefinementRules(
  result: RequirementsGenerationAIResult,
  rules: ConfirmedRefinementRules | undefined,
): RequirementsGenerationAIResult {
  if (!rules?.requiresOrderAuthentication) return result;

  const functionalRequirements = [...result.functionalRequirements];
  const acceptanceCriteria = [...result.acceptanceCriteria];
  const hasAuthenticationRequirement = functionalRequirements.some((requirement) => containsAll(requirement, ["autentic", "finaliz", "pedido"]));
  const hasOrderCompletionRequirement = functionalRequirements.some((requirement) => (
    containsAll(requirement, ["finaliz", "pedido"])
    && (requirement.toLocaleLowerCase("pt-BR").includes("permit") || requirement.toLocaleLowerCase("pt-BR").includes("cliente autenticado"))
  ));
  const hasAuthenticationCriterion = acceptanceCriteria.some((criterion) => containsAll(criterion, ["autentic", "finaliz", "pedido"]));

  if (!hasAuthenticationRequirement) {
    functionalRequirements.push("O sistema deve exigir que o cliente esteja autenticado para finalizar um pedido.");
  }
  if (!hasOrderCompletionRequirement) {
    functionalRequirements.push("O sistema deve permitir que o cliente autenticado finalize o pedido com os itens selecionados no carrinho.");
  }
  if (!hasAuthenticationCriterion) {
    acceptanceCriteria.push("Quando um cliente não autenticado tentar finalizar um pedido, o sistema deve exigir sua autenticação antes da conclusão.");
  }

  return { ...result, functionalRequirements, acceptanceCriteria };
}

function containsAll(value: string, terms: string[]) {
  const normalizedValue = value.toLocaleLowerCase("pt-BR");
  return terms.every((term) => normalizedValue.includes(term));
}

function isAffirmativeAnswer(normalizedAnswer: string) {
  if (/\bn[aã]o\b/u.test(normalizedAnswer)) return false;

  return /^(sim|s|afirmativo|confirmado|correto|positivo)\b/u.test(normalizedAnswer)
    || normalizedAnswer.includes("deve")
    || normalizedAnswer.includes("obrigat");
}

async function nextCodes(
  db: Prisma.TransactionClient,
  model: "requirement" | "userStory",
  projectId: string,
  prefix: "RF" | "RNF" | "US",
  amount: number,
) {
  if (amount === 0) return [];

  const existing = model === "requirement"
    ? await db.requirement.findMany({ where: { projectId }, select: { code: true } })
    : await db.userStory.findMany({ where: { projectId }, select: { code: true } });
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const largestSequence = existing.reduce((largest, item) => {
    const sequence = pattern.exec(item.code)?.[1];
    return sequence ? Math.max(largest, Number.parseInt(sequence, 10)) : largest;
  }, 0);

  return Array.from({ length: amount }, (_, index) => `${prefix}-${String(largestSequence + index + 1).padStart(3, "0")}`);
}

export const aiService = new AIService();
