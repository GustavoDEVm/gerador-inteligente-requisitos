"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { apiFetch } from "@/lib/api-client";
import type { RefinementQuestionsResponse, RequirementsGenerationResponse } from "@/types/ai";

type AmbiguityRefreshState = "idle" | "waiting" | "running" | "failed";

export function AIAnalysisPanel({
  projectId,
  sessionId,
  hasSufficientElicitationAnswer,
  isElicitationAnswerSaving,
  hasOutdatedAmbiguityResult,
  ambiguityRefreshState,
  ambiguityRefreshError,
  hasAmbiguityResult,
  hasRefinementQuestions,
  hasCompleteRefinementAnswers,
  hasGeneratedResult,
  onDetectAmbiguities,
  onRefinementQuestionsGenerated,
  onGenerated,
  onRequirementsRefined,
}: {
  projectId: string;
  sessionId: string;
  hasSufficientElicitationAnswer: boolean;
  isElicitationAnswerSaving: boolean;
  hasOutdatedAmbiguityResult: boolean;
  ambiguityRefreshState: AmbiguityRefreshState;
  ambiguityRefreshError: string | null;
  hasAmbiguityResult: boolean;
  hasRefinementQuestions: boolean;
  hasCompleteRefinementAnswers: boolean;
  hasGeneratedResult: boolean;
  onDetectAmbiguities: () => Promise<void>;
  onRefinementQuestionsGenerated: (result: RefinementQuestionsResponse) => void;
  onGenerated: (result: RequirementsGenerationResponse) => void;
  onRequirementsRefined: (result: RequirementsGenerationResponse) => void;
}) {
  const [operation, setOperation] = useState<"ambiguities" | "refinement-questions" | "requirements" | "requirements-refinement" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processing = operation !== null;
  const detectingAmbiguities = operation === "ambiguities" || ambiguityRefreshState === "running";
  const analysisOperationInProgress = processing || ambiguityRefreshState === "running";

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
      await onDetectAmbiguities();
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
      {(error ?? ambiguityRefreshError) && <p className="mt-3 text-sm text-red-700" role="alert">{error ?? ambiguityRefreshError}</p>}
      <div className="mt-4 grid gap-2">
        <Button variant="secondary" className="w-full" disabled={!hasSufficientElicitationAnswer || isElicitationAnswerSaving || analysisOperationInProgress} onClick={detectAmbiguities}>
          <Icon name="alert-triangle" className="size-4" />
          {detectingAmbiguities ? "Detectando ambiguidades…" : "Detectar ambiguidades"}
        </Button>
        <Button variant="secondary" className="w-full" disabled={!hasSufficientElicitationAnswer || hasOutdatedAmbiguityResult || isElicitationAnswerSaving || analysisOperationInProgress} onClick={generateRefinementQuestions}>
          <Icon name="message-square" className="size-4" />
          {operation === "refinement-questions" ? "Gerando perguntas…" : "Gerar perguntas de refinamento"}
        </Button>
        <Button className="w-full" disabled={!hasSufficientElicitationAnswer || isElicitationAnswerSaving || analysisOperationInProgress} onClick={generateRequirements}>
          <Icon name="sparkles" className="size-4" />
          {operation === "requirements" ? "Analisando sua elicitação…" : "Gerar requisitos com IA"}
        </Button>
        <Button variant="secondary" className="w-full" disabled={!hasCompleteRefinementAnswers || hasOutdatedAmbiguityResult || isElicitationAnswerSaving || analysisOperationInProgress} onClick={refineRequirements}>
          <Icon name="sparkles" className="size-4" />
          {operation === "requirements-refinement" ? "Refinando requisitos…" : "Refinar requisitos com IA"}
        </Button>
      </div>
      {hasRefinementQuestions && !hasCompleteRefinementAnswers && (
        <p className="mt-3 text-xs leading-5 text-violet-800/75">Responda todas as perguntas de refinamento atuais para liberar uma nova versão dos requisitos.</p>
      )}
      {hasOutdatedAmbiguityResult && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800" role="status">
          {"A descri\u00e7\u00e3o inicial foi alterada. Detecte novamente as ambiguidades antes de gerar perguntas ou refinar requisitos."}
        </p>
      )}
      {ambiguityRefreshState === "waiting" && (
        <p className="mt-3 text-xs leading-5 text-violet-800/75" role="status">
          {"Atualiza\u00e7\u00e3o autom\u00e1tica aguardando uma pausa na digita\u00e7\u00e3o."}
        </p>
      )}
      <p className="mt-4 text-xs leading-5 text-violet-800/75" aria-live="polite">
        {detectingAmbiguities
          ? "A detecção está em andamento. O resultado aparecerá abaixo da sessão quando estiver pronto."
          : operation === "refinement-questions"
            ? "As ambiguidades abertas desta sessão estão sendo transformadas em perguntas de esclarecimento."
          : operation === "requirements"
            ? "A geração está em andamento. Os resultados aparecerão abaixo da sessão quando estiverem prontos."
            : operation === "requirements-refinement"
              ? "As respostas de refinamento estão sendo aplicadas em uma nova versão dos requisitos."
            : hasOutdatedAmbiguityResult
              ? "A an\u00e1lise anterior est\u00e1 desatualizada em rela\u00e7\u00e3o \u00e0 descri\u00e7\u00e3o atual."
              : hasAmbiguityResult || hasRefinementQuestions || hasGeneratedResult
              ? "Os resultados mais recentes estão disponíveis abaixo da sessão. Você pode executar uma nova análise quando necessário."
              : "Os resultados serão exibidos em uma área dedicada abaixo da sessão após a análise."}
      </p>
    </Card>
  );
}
