import { z } from "zod";

import type { AmbiguityDetectionResult, InitialRequirementAnalysis, RefinementQuestionAIResult, RequirementsGenerationAIResult } from "@/types/ai";

const resultText = (label: string, max: number) => z.string().trim().min(1, `${label} é obrigatório.`).max(max, `${label} é muito longo.`);
const resultList = (label: string) => z.array(resultText(label, 500)).max(12, `${label} possui itens demais.`);

export const initialRequirementAnalysisSchema: z.ZodType<InitialRequirementAnalysis> = z
  .object({
    summary: resultText("O resumo", 1_500),
    userStory: z.object({
      actor: resultText("O ator", 200),
      action: resultText("A ação", 500),
      benefit: resultText("O benefício", 500),
    }),
    observations: resultList("A observação"),
    ambiguities: resultList("A ambiguidade"),
    suggestions: resultList("A sugestão"),
  })
  .strict();

export const requirementsGenerationSchema: z.ZodType<RequirementsGenerationAIResult> = z
  .object({
    userStory: resultText("A User Story", 1_500),
    functionalRequirements: z
      .array(resultText("O requisito funcional", 2_000))
      .min(1, "A geração deve conter ao menos um requisito funcional.")
      .max(20, "A geração possui requisitos funcionais demais."),
    nonFunctionalRequirements: z
      .array(resultText("O requisito não funcional", 2_000))
      .max(10, "A geração possui requisitos não funcionais demais."),
    acceptanceCriteria: z
      .array(resultText("O critério de aceitação", 2_000))
      .min(1, "A geração deve conter ao menos um critério de aceitação.")
      .max(20, "A geração possui critérios de aceitação demais."),
  })
  .strict();

export const ambiguityDetectionSchema: z.ZodType<AmbiguityDetectionResult> = z
  .object({
    ambiguities: z
      .array(z.object({
        description: resultText("A descrição da ambiguidade", 1_500),
        severity: z.enum(["low", "medium", "high"]),
        context: resultText("O contexto da ambiguidade", 1_000),
      }).strict())
      .max(12, "A análise possui ambiguidades demais."),
  })
  .strict();

export const refinementQuestionsSchema: z.ZodType<RefinementQuestionAIResult> = z
  .object({
    questions: z
      .array(z.object({
        ambiguityId: z.uuid("O identificador da ambiguidade deve ser um UUID v\u00e1lido."),
        question: resultText("A pergunta de refinamento", 1_500),
        reason: resultText("O motivo do esclarecimento", 1_000),
      }).strict())
      .max(50, "A gera\u00e7\u00e3o possui perguntas demais."),
  })
  .strict();

export function toProviderJsonSchema(schema: z.ZodType) {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-07" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}
