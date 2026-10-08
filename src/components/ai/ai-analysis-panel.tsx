"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { apiFetch } from "@/lib/api-client";
import type { AmbiguityDetectionResponse, RefinementQuestionsResponse, RequirementsGenerationResponse } from "@/types/ai";

export function AIAnalysisPanel({
  projectId,
  sessionId,
  hasSufficientElicitationAnswer,
  hasAmbiguityResult,
  hasRefinementQuestions,
  hasCompleteRefinementAnswers,
  hasGeneratedResult,
  onAmbiguitiesDetected,
  onRefinementQuestionsGenerated,
  onGenerated,
  onRequirementsRefined,
}: {
  projectId: string;
  sessionId: string;
  hasSufficientElicitationAnswer: boolean;
  hasAmbiguityResult: boolean;
  hasRefinementQuestions: boolean;
  hasCompleteRefinementAnswers: boolean;
  hasGeneratedResult: boolean;
  onAmbiguitiesDetected: (result: AmbiguityDetectionResponse) => void;
  onRefinementQuestionsGenerated: (result: RefinementQuestionsResponse) => void;
  onGenerated: (result: RequirementsGenerationResponse) => void;
  onRequirementsRefined: (result: RequirementsGenerationResponse) => void;
}) {
  const [operation, setOperation] = useState<"ambiguities" | "refinement-questions" | "requirements" | "requirements-refinement" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processing = operation !== null;

  async function generateRequirements() {
    if (!hasSufficientElicitationAnswer || processing) return;

    setOperation("requirements");
    setError(null);
    try {
      const result = await apiFetch<RequirementsGenerationResponse>("/api/ai/generate-requirements", {
        method: "POST",
        body: JSON.stringify({ projectId, sessionId }),
      });
      onGenerated(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível gerar os requisitos com IA.");
    } finally {
      setOperation(null);
    }
  }

  async function detectAmbiguities() {
    if (!hasSufficientElicitationAnswer || processing) return;

    setOperation("ambiguities");
    setError(null);
    try {
      const result = await apiFetch<AmbiguityDetectionResponse>("/api/ai/detect-ambiguities", {
        method: "POST",
        body: JSON.stringify({ projectId, sessionId }),
      });
      onAmbiguitiesDetected(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível detectar ambiguidades com IA.");
    } finally {
      setOperation(null);
    }
  }

  async function generateRefinementQuestions() {
    if (!hasSufficientElicitationAnswer || processing) return;

    setOperation("refinement-questions");
    setError(null);
    try {
      const result = await apiFetch<RefinementQuestionsResponse>("/api/ai/generate-refinement-questions", {
        method: "POST",
        body: JSON.stringify({ projectId, sessionId }),
      });
      onRefinementQuestionsGenerated(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "N\u00e3o foi poss\u00edvel gerar perguntas de refinamento com IA.");
    } finally {
      setOperation(null);
    }
  }

  async function refineRequirements() {
    if (!hasCompleteRefinementAnswers || processing) return;

    setOperation("requirements-refinement");
    setError(null);
    try {
      const result = await apiFetch<RequirementsGenerationResponse>("/api/ai/refine-requirements", {
        method: "POST",
        body: JSON.stringify({ projectId, sessionId }),
      });
      onRequirementsRefined(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível refinar os requisitos com IA.");
    } finally {
      setOperation(null);
    }
  }

  return (
    <Card className="border-violet-200 bg-violet-50 p-5">
      <div className="flex items-center gap-2 text-violet-800">
        <Icon name="sparkles" className="size-5" />
        <h2 className="font-bold">Análises por IA</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-violet-800/80">
        As ações utilizam exclusivamente a resposta persistida da elicitação para detectar pontos em aberto ou organizar os requisitos.
      </p>
      {!hasSufficientElicitationAnswer && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800" role="alert">
          Registre uma resposta de elicitação com pelo menos 20 caracteres antes de gerar requisitos.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-4 grid gap-2">
        <Button variant="secondary" className="w-full" disabled={!hasSufficientElicitationAnswer || processing} onClick={detectAmbiguities}>
          <Icon name="alert-triangle" className="size-4" />
          {operation === "ambiguities" ? "Detectando ambiguidades…" : "Detectar ambiguidades"}
        </Button>
        <Button variant="secondary" className="w-full" disabled={!hasSufficientElicitationAnswer || processing} onClick={generateRefinementQuestions}>
          <Icon name="message-square" className="size-4" />
          {operation === "refinement-questions" ? "Gerando perguntas…" : "Gerar perguntas de refinamento"}
        </Button>
        <Button className="w-full" disabled={!hasSufficientElicitationAnswer || processing} onClick={generateRequirements}>
          <Icon name="sparkles" className="size-4" />
          {operation === "requirements" ? "Analisando sua elicitação…" : "Gerar requisitos com IA"}
        </Button>
        <Button variant="secondary" className="w-full" disabled={!hasCompleteRefinementAnswers || processing} onClick={refineRequirements}>
          <Icon name="sparkles" className="size-4" />
          {operation === "requirements-refinement" ? "Refinando requisitos…" : "Refinar requisitos com IA"}
        </Button>
      </div>
      {hasRefinementQuestions && !hasCompleteRefinementAnswers && (
        <p className="mt-3 text-xs leading-5 text-violet-800/75">Responda todas as perguntas de refinamento atuais para liberar uma nova versão dos requisitos.</p>
      )}
      <p className="mt-4 text-xs leading-5 text-violet-800/75" aria-live="polite">
        {operation === "ambiguities"
          ? "A detecção está em andamento. O resultado aparecerá abaixo da sessão quando estiver pronto."
          : operation === "refinement-questions"
            ? "As ambiguidades abertas desta sessão estão sendo transformadas em perguntas de esclarecimento."
          : operation === "requirements"
            ? "A geração está em andamento. Os resultados aparecerão abaixo da sessão quando estiverem prontos."
            : operation === "requirements-refinement"
              ? "As respostas de refinamento estão sendo aplicadas em uma nova versão dos requisitos."
            : hasAmbiguityResult || hasRefinementQuestions || hasGeneratedResult
              ? "Os resultados mais recentes estão disponíveis abaixo da sessão. Você pode executar uma nova análise quando necessário."
              : "Os resultados serão exibidos em uma área dedicada abaixo da sessão após a análise."}
      </p>
    </Card>
  );
}
