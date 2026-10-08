import { z } from "zod";

const uuid = z.uuid("Informe um UUID válido.");
const text = (label: string, max = 10_000) => z.string().trim().min(1, `${label} é obrigatório.`).max(max, `${label} é muito longo.`);
const optionalText = (max = 10_000) => z.string().trim().min(1, "Informe um valor não vazio.").max(max, "O valor é muito longo.").optional();
const positiveInt = z.number().int().min(1, "Informe um número inteiro maior que zero.");

export const projectStatuses = ["ACTIVE", "IN_REVIEW", "COMPLETED", "ARCHIVED"] as const;
export const sessionStatuses = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export const questionSources = ["MANUAL", "TEMPLATE"] as const;
export const requirementTypes = ["FUNCTIONAL", "NON_FUNCTIONAL"] as const;
export const priorities = ["HIGH", "MEDIUM", "LOW"] as const;
export const reviewStatuses = ["PENDING", "IN_REVIEW", "REVIEWED", "REJECTED", "OBSOLETE"] as const;
export const ambiguitySeverities = ["LOW", "MEDIUM", "HIGH"] as const;
export const ambiguityStatuses = ["OPEN", "RESOLVED", "DISMISSED"] as const;
export const suggestionStatuses = ["PENDING", "ACCEPTED", "DISMISSED"] as const;

function hasUpdateValue(value: Record<string, unknown>) {
  return Object.values(value).some((item) => item !== undefined);
}

export const createUserSchema = z.object({
  name: text("O nome", 160),
  email: z.email("Informe um e-mail válido.").transform((value) => value.trim().toLowerCase()),
});

const passwordSchema = z
  .string()
  .min(12, "A senha deve ter pelo menos 12 caracteres.")
  .max(128, "A senha deve ter no máximo 128 caracteres.")
  .regex(/[a-zA-Z]/, "A senha deve conter ao menos uma letra.")
  .regex(/\d/, "A senha deve conter ao menos um número.");

export const registerSchema = createUserSchema.extend({ password: passwordSchema });
export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido.").transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1, "Informe a senha.").max(128, "A senha é muito longa."),
});

export const createProjectSchema = z.object({
  name: text("O nome", 160),
  description: text("A descrição"),
  objective: text("O objetivo"),
  context: text("O contexto"),
  status: z.enum(projectStatuses).optional(),
});

export const listProjectsQuerySchema = z.object({
  status: z.enum(projectStatuses).optional(),
  includeArchived: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

export const updateProjectSchema = z
  .object({
    name: text("O nome", 160).optional(),
    description: optionalText(),
    objective: optionalText(),
    context: optionalText(),
    status: z.enum(projectStatuses).optional(),
  })
  .refine(hasUpdateValue, "Informe ao menos um campo para atualizar.");

export const archiveProjectSchema = z.object({});

export const createStakeholderSchema = z.object({ name: text("O nome", 160), role: optionalText(160) });
export const updateStakeholderSchema = z
  .object({ name: text("O nome", 160).optional(), role: optionalText(160).nullable() })
  .refine(hasUpdateValue, "Informe ao menos um campo para atualizar.");

export const createSessionSchema = z.object({
  title: optionalText(160),
  context: text("O contexto"),
  status: z.enum(sessionStatuses).optional(),
  sequence: positiveInt.optional(),
});

export const updateSessionSchema = z
  .object({ title: optionalText(160).nullable(), context: optionalText(), status: z.enum(sessionStatuses).optional() })
  .refine(hasUpdateValue, "Informe ao menos um campo para atualizar.");

export const createQuestionSchema = z.object({
  content: text("O conteúdo da pergunta"),
  guidance: optionalText(),
  source: z.enum(questionSources).optional(),
  position: positiveInt.optional(),
});

export const createAnswerSchema = z.object({ content: text("O conteúdo da resposta") });

const systemDescriptionSchema = text("A descrição", 8_000).min(20, "A descrição deve ter pelo menos 20 caracteres.");
const aiGenerationContextSchema = z.object({ projectId: uuid, sessionId: uuid });

export const analyzeSystemSchema = aiGenerationContextSchema.extend({ input: systemDescriptionSchema });
export const generateRequirementsSchema = aiGenerationContextSchema.strict();
export const refineRequirementsSchema = aiGenerationContextSchema.strict();
export const detectAmbiguitiesSchema = aiGenerationContextSchema.strict();
export const generateRefinementQuestionsSchema = aiGenerationContextSchema.strict();

export const startElicitationSchema = z.object({
  title: optionalText(160),
  description: systemDescriptionSchema,
});

export const createRequirementSchema = z.object({
  code: text("O código", 32).regex(/^[A-Za-z]+-\d+$/, "Use um código no formato RF-001 ou RNF-001."),
  title: text("O título", 200),
  description: text("A descrição"),
  type: z.enum(requirementTypes),
  priority: z.enum(priorities).optional(),
  status: z.enum(reviewStatuses).optional(),
  answerIds: z.array(uuid).max(100).optional(),
});

export const updateRequirementSchema = z
  .object({
    title: text("O título", 200).optional(),
    description: optionalText(),
    type: z.enum(requirementTypes).optional(),
    priority: z.enum(priorities).optional(),
    status: z.enum(reviewStatuses).optional(),
  })
  .refine(hasUpdateValue, "Informe ao menos um campo para atualizar.");

export const createUserStorySchema = z.object({
  code: text("O código", 32).regex(/^US-\d+$/, "Use um código no formato US-001."),
  title: text("O título", 200),
  actor: text("O ator", 160),
  objective: text("O objetivo"),
  benefit: text("O benefício"),
  description: optionalText(),
  priority: z.enum(priorities).optional(),
  status: z.enum(reviewStatuses).optional(),
  requirementIds: z.array(uuid).max(100).optional(),
});

export const updateUserStorySchema = z
  .object({
    title: text("O título", 200).optional(),
    actor: text("O ator", 160).optional(),
    objective: optionalText(),
    benefit: optionalText(),
    description: optionalText().nullable(),
    priority: z.enum(priorities).optional(),
    status: z.enum(reviewStatuses).optional(),
  })
  .refine(hasUpdateValue, "Informe ao menos um campo para atualizar.");

export const linkRequirementSchema = z.object({ requirementId: uuid });
export const createCriterionSchema = z.object({ description: text("A descrição"), position: positiveInt.optional() });
export const updateCriterionSchema = z.object({ description: text("A descrição") });

export const createAmbiguitySchema = z.object({
  description: text("A descrição"),
  severity: z.enum(ambiguitySeverities).optional(),
});

export const updateAmbiguitySchema = z
  .object({
    status: z.enum(ambiguityStatuses).optional(),
    resolution: optionalText().nullable(),
  })
  .refine(hasUpdateValue, "Informe ao menos um campo para atualizar.");

export const createSuggestionSchema = z.object({ description: text("A descrição") });
export const updateSuggestionSchema = z
  .object({ status: z.enum(suggestionStatuses).optional() })
  .refine(hasUpdateValue, "Informe ao menos um campo para atualizar.");
