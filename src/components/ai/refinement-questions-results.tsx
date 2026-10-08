"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import type { DetectedAmbiguitySeverity, PersistedRefinementQuestion } from "@/types/ai";

export type RefinementQuestionDisplay = PersistedRefinementQuestion & {
  answers: { id: string; version: number; content: string }[];
};

const severityPresentation: Record<DetectedAmbiguitySeverity, { label: string; tone: "blue" | "amber" | "red" }> = {
  low: { label: "Baixa", tone: "blue" },
  medium: { label: "M\u00e9dia", tone: "amber" },
  high: { label: "Alta", tone: "red" },
};

export function RefinementQuestionsResults({
  questions,
  generated,
  hasAmbiguities,
  onAnswerSaved,
}: {
  questions: RefinementQuestionDisplay[];
  generated: boolean;
  hasAmbiguities: boolean;
  onAnswerSaved: (questionId: string, answer: { id: string; version: number; content: string }) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answeredCount = questions.filter((question) => question.answers.length > 0).length;

  async function saveAnswer(question: RefinementQuestionDisplay) {
    const latestAnswer = question.answers.at(-1)?.content ?? "";
    const content = (drafts[question.questionId] ?? latestAnswer).trim();
    if (!content || content === latestAnswer || savingQuestionId) return;

    setSavingQuestionId(question.questionId);
    setError(null);
    try {
      const answer = await apiFetch<{ id: string; version: number; content: string }>(`/api/questions/${question.questionId}/answers`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setDrafts((current) => ({ ...current, [question.questionId]: answer.content }));
      onAnswerSaved(question.questionId, answer);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "N\u00e3o foi poss\u00edvel registrar a resposta de refinamento.");
    } finally {
      setSavingQuestionId(null);
    }
  }

  return (
    <section aria-live="polite" aria-labelledby="refinement-questions-title" className="space-y-6">
      <Card className="overflow-hidden border-violet-200">
        <div className="border-b border-violet-100 bg-violet-50 px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <Icon name="sparkles" className="size-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Elicita\u00e7\u00e3o assistida</p>
                <h2 id="refinement-questions-title" className="mt-1 text-xl font-bold text-slate-950">Refinamento inteligente</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Perguntas associadas aos pontos que precisam de esclarecimento.</p>
              </div>
            </div>
            {questions.length > 0 && <Badge tone={answeredCount === questions.length ? "green" : "violet"}>{answeredCount}/{questions.length} respondidas</Badge>}
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="flex gap-3 p-5 sm:p-7">
            <Icon name={generated ? "check-circle" : "message-square"} className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="font-bold text-slate-900">{generated ? "Nenhuma pergunta de refinamento foi necessária" : hasAmbiguities ? "Ambiguidades aguardam perguntas de refinamento" : "As perguntas de refinamento aparecer\u00e3o aqui"}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {generated
                  ? "N\u00e3o h\u00e1 ambiguidades abertas relevantes para esta sess\u00e3o na an\u00e1lise mais recente."
                  : hasAmbiguities
                    ? "Use a ação de geração para transformar os pontos abertos em perguntas claras, sem registrar uma nova descrição."
                    : "Depois de detectar ambiguidades, use a ação de geração para transformar os pontos abertos em perguntas claras."}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:p-7">
            {questions.map((item) => {
              const latestAnswer = item.answers.at(-1)?.content ?? "";
              const draft = drafts[item.questionId] ?? latestAnswer;
              const answered = item.answers.length > 0;
              const severity = severityPresentation[item.ambiguity.severity];
              const saving = savingQuestionId === item.questionId;

              return (
                <Card key={item.questionId} className="border-slate-200 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ambiguidade relacionada</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">{item.ambiguity.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={severity.tone}>{severity.label}</Badge>
                      <Badge tone={answered ? "green" : "amber"}>{answered ? "Respondida" : "Pendente"}</Badge>
                    </div>
                  </div>
                  <div className="mt-5 rounded-lg bg-violet-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Pergunta</p>
                    <p className="mt-2 font-semibold leading-6 text-slate-950">{item.question}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-600"><strong>Por que esclarecer?</strong> {item.reason}</p>
                  </div>
                  <div className="mt-5 space-y-3">
                    <Textarea
                      aria-label={`Resposta para: ${item.question}`}
                      label="Sua resposta"
                      placeholder="Responda com as informa\u00e7\u00f5es dispon\u00edveis..."
                      value={draft}
                      onChange={(event) => setDrafts((current) => ({ ...current, [item.questionId]: event.target.value }))}
                      disabled={Boolean(savingQuestionId)}
                    />
                    {answered && <p className="text-xs text-slate-500">A vers\u00e3o {item.answers.at(-1)?.version} est\u00e1 registrada. Uma altera\u00e7\u00e3o salvar\u00e1 uma nova vers\u00e3o, sem substituir o hist\u00f3rico.</p>}
                  </div>
                  <div className="mt-5 flex justify-end">
                    <Button disabled={!draft.trim() || draft.trim() === latestAnswer || Boolean(savingQuestionId)} onClick={() => saveAnswer(item)}>
                      {saving ? "Salvando resposta\u2026" : answered ? "Atualizar resposta" : "Salvar resposta"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        {questions.length > 0 && answeredCount === questions.length && (
          <p className="border-t border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800 sm:px-7">Todas as perguntas de refinamento foram respondidas.</p>
        )}
        {error && <p className="border-t border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700 sm:px-7" role="alert">{error}</p>}
      </Card>
    </section>
  );
}
