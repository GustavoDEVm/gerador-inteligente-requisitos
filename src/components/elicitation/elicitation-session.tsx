"use client";

import { useEffect, useState } from "react";

import { AIAnalysisPanel } from "@/components/ai/ai-analysis-panel";
import { AmbiguityDetectionResults } from "@/components/ai/ambiguity-detection-results";
import { GeneratedRequirementsResults } from "@/components/ai/generated-requirements-results";
import { RefinementQuestionsResults, type RefinementQuestionDisplay } from "@/components/ai/refinement-questions-results";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import type { ProjectListItem } from "@/types/api";
import type { AmbiguityDetectionResponse, PersistedRefinementQuestion, RefinementQuestionsResponse, RequirementsGenerationResponse } from "@/types/ai";

type SessionItem = {
  id: string;
  sequence: number;
  title: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
};

type QuestionItem = {
  id: string;
  position: number;
  content: string;
  guidance: string | null;
  source: "MANUAL" | "TEMPLATE" | "AI";
  generatedByAnalysis: { id: string; structuredOutput: unknown } | null;
  answers: { id: string; version: number; content: string }[];
};

type StartedElicitation = { session: SessionItem };

type PersistedSessionAnalysis = {
  id: string;
  type: "REQUIREMENT_EXTRACTION" | "AMBIGUITY_DETECTION" | "QUESTION_GENERATION" | "REFINEMENT";
  status: "SUCCEEDED";
  structuredOutput: unknown;
  createdAt: string;
};

type SessionDetails = {
  analyses: { analysis: PersistedSessionAnalysis }[];
};

export function ElicitationSession({ initialProjectId }: { initialProjectId?: string }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectId, setProjectId] = useState("");
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sessionTitle, setSessionTitle] = useState("");
  const [initialDescription, setInitialDescription] = useState("");
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ambiguityResult, setAmbiguityResult] = useState<AmbiguityDetectionResponse | null>(null);
  const [refinementResult, setRefinementResult] = useState<RefinementQuestionsResponse | null>(null);
  const [refinementAnalysisId, setRefinementAnalysisId] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<RequirementsGenerationResponse | null>(null);
  const [refinedResult, setRefinedResult] = useState<RequirementsGenerationResponse | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const loadedProjects = await apiFetch<ProjectListItem[]>("/api/projects");
        if (!active) return;
        setProjects(loadedProjects);
        setProjectId(loadedProjects.some((project) => project.id === initialProjectId) ? initialProjectId ?? "" : loadedProjects[0]?.id ?? "");
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar o contexto da elicitação.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void bootstrap();
    return () => { active = false; };
  }, [initialProjectId]);

  useEffect(() => {
    if (!projectId) return;

    let active = true;
    apiFetch<SessionItem[]>(`/api/projects/${projectId}/sessions`)
      .then((items) => {
        if (!active) return;
        setSessions(items);
        setSessionId(items.find((item) => item.status === "ACTIVE")?.id ?? items[0]?.id ?? "");
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar as sessões.");
      });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    if (!sessionId) return;

    let active = true;
    async function loadSession() {
      try {
        const [items, session] = await Promise.all([
          apiFetch<QuestionItem[]>(`/api/sessions/${sessionId}/questions`),
          apiFetch<SessionDetails>(`/api/sessions/${sessionId}`),
        ]);
        if (!active) return;
        const elicitationQuestions = items.filter((item) => item.source !== "AI");
        const savedAnswers = Object.fromEntries(
          elicitationQuestions.flatMap((item) => {
            const latestAnswer = item.answers.at(-1)?.content;
            return latestAnswer ? [[item.id, latestAnswer]] : [];
          }),
        );
        const rehydratedResults = rehydratePersistedAnalysisResults(session.analyses.map((item) => item.analysis));
        setQuestions(items);
        setRefinementAnalysisId(latestRefinementAnalysisIdFromItems(items));
        setAnswers(savedAnswers);
        setAmbiguityResult(rehydratedResults.ambiguityResult);
        setRefinementResult(rehydratedResults.refinementResult);
        setGeneratedResult(rehydratedResults.generatedResult);
        setRefinedResult(rehydratedResults.refinedResult);
        setCurrentIndex(0);
        setAnswer(savedAnswers[elicitationQuestions[0]?.id ?? ""] ?? "");
        setFinished(false);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar as perguntas.");
      }
    }

    void loadSession();
    return () => { active = false; };
  }, [sessionId]);

  const elicitationQuestions = questions.filter((item) => item.source !== "AI");
  const refinementQuestions = refinementQuestionsFromItems(questions, refinementAnalysisId);
  const hasCompleteRefinementAnswers = refinementQuestions.length > 0 && refinementQuestions.every((question) => question.answers.length > 0);
  const question = elicitationQuestions[currentIndex];
  const project = projects.find((item) => item.id === projectId);
  const progress = elicitationQuestions.length > 0 ? Math.round(((currentIndex + 1) / elicitationQuestions.length) * 100) : 0;
  const initialQuestion = elicitationQuestions.find((item) => item.position === 1);
  const initialAnswer = initialQuestion ? answers[initialQuestion.id] ?? initialQuestion.answers.at(-1)?.content ?? "" : "";
  const hasSufficientElicitationAnswer = initialAnswer.trim().length >= 20;

  async function startElicitation() {
    if (!projectId || !initialDescription.trim() || starting) return;

    setStarting(true);
    setError(null);
    try {
      const started = await apiFetch<StartedElicitation>(`/api/projects/${projectId}/elicitation/start`, {
        method: "POST",
        body: JSON.stringify({ title: sessionTitle.trim() || undefined, description: initialDescription.trim() }),
      });
      setSessions((current) => [...current, started.session].sort((first, second) => first.sequence - second.sequence));
      setSessionId(started.session.id);
      setAmbiguityResult(null);
      setRefinementResult(null);
      setRefinementAnalysisId(null);
      setGeneratedResult(null);
      setRefinedResult(null);
      setSessionTitle("");
      setInitialDescription("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível iniciar a sessão de elicitação.");
    } finally {
      setStarting(false);
    }
  }

  async function advance() {
    if (!question || !answer.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const latestSavedAnswer = question.answers.at(-1)?.content;
      if (answer.trim() !== latestSavedAnswer) {
        await apiFetch(`/api/questions/${question.id}/answers`, { method: "POST", body: JSON.stringify({ content: answer.trim() }) });
        setAnswers((current) => ({ ...current, [question.id]: answer.trim() }));
      }
      if (currentIndex === elicitationQuestions.length - 1) {
        await apiFetch(`/api/sessions/${sessionId}`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED" }) });
        setFinished(true);
        return;
      }
      const nextQuestion = elicitationQuestions[currentIndex + 1];
      setCurrentIndex((index) => index + 1);
      setAnswer(answers[nextQuestion.id] ?? nextQuestion.answers.at(-1)?.content ?? "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível registrar a resposta.");
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (currentIndex === 0) return;
    const previousQuestion = elicitationQuestions[currentIndex - 1];
    setCurrentIndex((index) => index - 1);
    setAnswer(answers[previousQuestion.id] ?? previousQuestion.answers.at(-1)?.content ?? "");
  }

  function selectProject(nextProjectId: string) {
    setProjectId(nextProjectId);
    setAmbiguityResult(null);
    setRefinementResult(null);
    setRefinementAnalysisId(null);
    setGeneratedResult(null);
    setRefinedResult(null);
    setSessions([]);
    setSessionId("");
    setQuestions([]);
    setError(null);
  }

  function selectSession(nextSessionId: string) {
    setSessionId(nextSessionId);
    setAmbiguityResult(null);
    setRefinementResult(null);
    setRefinementAnalysisId(null);
    setGeneratedResult(null);
    setRefinedResult(null);
    setQuestions([]);
    setCurrentIndex(0);
    setAnswer("");
    setError(null);
  }

  if (loading) return <Card className="p-6 text-sm text-slate-500">Carregando contexto de elicitação…</Card>;
  if (error && projects.length === 0) return <Card className="p-6 text-sm text-red-600">{error}</Card>;
  if (!project) return <EmptyProjectState />;

  const contextSelector = (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Select label="Projeto" value={projectId} onChange={(event) => selectProject(event.target.value)}>
        {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>
      <Select label="Sessão" value={sessionId} onChange={(event) => selectSession(event.target.value)} disabled={sessions.length === 0}>
        {sessions.length === 0 ? <option value="">Nova sessão</option> : sessions.map((item) => <option key={item.id} value={item.id}>Sessão #{item.sequence}{item.title ? ` · ${item.title}` : ""}</option>)}
      </Select>
    </div>
  );

  if (!sessionId || !question) {
    return (
      <div className="space-y-6">
        {contextSelector}
        <InitialElicitationForm
          projectName={project.name}
          hasExistingSession={sessions.length > 0}
          title={sessionTitle}
          description={initialDescription}
          processing={starting}
          error={error}
          onTitleChange={setSessionTitle}
          onDescriptionChange={setInitialDescription}
          onStart={startElicitation}
        />
      </div>
    );
  }

  return (
    <>
      {contextSelector}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2"><Badge tone="blue">Sessão em andamento</Badge><span className="text-xs text-slate-500">{project.name}</span></div>
                <h2 className="mt-3 text-xl font-bold text-slate-950">Compreendendo o contexto do sistema</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Responda com o máximo de detalhes possível. As informações serão organizadas para análise posterior.</p>
              </div>
              <div className="min-w-32"><Progress label={`Pergunta ${currentIndex + 1} de ${elicitationQuestions.length}`} value={progress} /></div>
            </div>
          </Card>
          <Card className="p-5 sm:p-7">
            <div className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Icon name="message-square" className="size-5" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Pergunta de elicitação</p>
                <h3 className="mt-2 text-lg font-bold leading-7 text-slate-950">{question.content}</h3>
                {question.guidance && <p className="mt-2 text-sm leading-6 text-slate-500">{question.guidance}</p>}
              </div>
            </div>
            <div className="mt-7 space-y-3">
              <Textarea aria-label="Sua resposta" placeholder="Descreva sua resposta aqui..." value={answer} onChange={(event) => setAnswer(event.target.value)} />
              <p className="mt-2 text-xs text-slate-500">A resposta será associada automaticamente à sua conta e cada novo envio preservará uma versão no histórico.</p>
            </div>
            {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
            <div className="mt-6 flex flex-col-reverse justify-between gap-3 sm:flex-row">
              <Button variant="secondary" disabled={currentIndex === 0 || saving} onClick={goBack}><Icon name="arrow-left" className="size-4" />Voltar</Button>
              <Button disabled={!answer.trim() || saving} onClick={advance}>{saving ? "Registrando…" : currentIndex === elicitationQuestions.length - 1 ? "Finalizar sessão" : "Avançar"}<Icon name="arrow-right" className="size-4" /></Button>
            </div>
          </Card>
        </div>
        <aside className="space-y-4">
          <AIAnalysisPanel
            projectId={projectId}
            sessionId={sessionId}
            hasSufficientElicitationAnswer={hasSufficientElicitationAnswer}
            hasAmbiguityResult={ambiguityResult !== null}
            hasRefinementQuestions={refinementResult !== null || refinementQuestions.length > 0}
            hasCompleteRefinementAnswers={hasCompleteRefinementAnswers}
            hasGeneratedResult={generatedResult !== null}
            onAmbiguitiesDetected={setAmbiguityResult}
            onRefinementQuestionsGenerated={(result) => {
              setRefinementResult(result);
              setRefinementAnalysisId(result.analysisId);
              setQuestions((current) => [
                ...current,
                ...result.result.questions.map((item, index) => ({
                  id: item.questionId,
                  position: Math.max(0, ...current.map((question) => question.position)) + index + 1,
                  content: item.question,
                  guidance: item.reason,
                  source: "AI" as const,
                  generatedByAnalysis: { id: result.analysisId, structuredOutput: result.result },
                  answers: [],
                })),
              ]);
            }}
            onGenerated={setGeneratedResult}
            onRequirementsRefined={setRefinedResult}
          />
          <Card className="p-5">
            <h2 className="font-bold text-slate-900">Histórico da sessão</h2>
            <div className="mt-4 space-y-4">
              {elicitationQuestions.slice(0, currentIndex).map((item) => (
                <div key={item.id} className="border-l-2 border-emerald-400 pl-3">
                  <p className="text-xs font-semibold text-slate-500">Pergunta {item.position}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-700">{item.content}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700"><Avatar className="size-5 text-[9px]" name="Você" />Resposta registrada</div>
                </div>
              ))}
              {currentIndex === 0 && <p className="text-sm leading-6 text-slate-500">A descrição inicial já está registrada. As próximas perguntas aparecerão aqui, preservando o contexto da coleta.</p>}
            </div>
          </Card>
        </aside>
      </div>
      {ambiguityResult ? <AmbiguityDetectionResults result={ambiguityResult} /> : null}
      <RefinementQuestionsResults
        questions={refinementQuestions}
        generated={refinementResult !== null || refinementQuestions.length > 0}
        hasAmbiguities={(ambiguityResult?.result.ambiguities.length ?? 0) > 0}
        onAnswerSaved={(questionId, savedAnswer) => {
          setQuestions((current) => current.map((item) => (
            item.id === questionId ? { ...item, answers: [...item.answers, savedAnswer] } : item
          )));
        }}
      />
      {generatedResult ? <GeneratedRequirementsResults result={generatedResult} /> : null}
      {refinedResult ? <GeneratedRequirementsResults result={refinedResult} variant="refined" /> : null}
      <Dialog open={finished} onClose={() => setFinished(false)} title="Coleta finalizada">
        <p className="text-sm leading-6 text-slate-600">As respostas foram registradas e preservadas como versões no histórico da sessão. Use a geração de requisitos por IA quando desejar analisar a descrição.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setFinished(false)}>Continuar revisando</Button><Button href="/requisitos">Ver requisitos</Button></div>
      </Dialog>
    </>
  );
}

export function refinementQuestionsFromItems(
  items: QuestionItem[],
  currentAnalysisId: string | null = null,
): RefinementQuestionDisplay[] {
  const mappedQuestions = items.flatMap((item) => {
    if (item.source !== "AI") return [];
    const mappedQuestion = getPersistedRefinementQuestion(item.generatedByAnalysis?.structuredOutput, item.id);
    if (!mappedQuestion || !item.generatedByAnalysis) return [];

    return [{
      analysisId: item.generatedByAnalysis.id,
      question: {
        ...mappedQuestion,
        question: item.content,
        reason: item.guidance ?? mappedQuestion.reason,
        answers: item.answers,
      },
    }];
  });

  // listQuestions ordena por posição, e cada geração adiciona seu grupo ao fim da sessão.
  const selectedAnalysisId = currentAnalysisId ?? mappedQuestions.at(-1)?.analysisId;
  return mappedQuestions
    .filter((item) => item.analysisId === selectedAnalysisId)
    .map((item) => item.question);
}

function latestRefinementAnalysisIdFromItems(items: QuestionItem[]): string | null {
  const mappedQuestions = refinementQuestionsFromItems(items);
  const lastQuestionId = mappedQuestions.at(-1)?.questionId;
  if (!lastQuestionId) return null;

  const question = items.find((item) => item.id === lastQuestionId);
  return question?.generatedByAnalysis?.id ?? null;
}

function rehydratePersistedAnalysisResults(analyses: PersistedSessionAnalysis[]) {
  let ambiguityResult: AmbiguityDetectionResponse | null = null;
  let refinementResult: RefinementQuestionsResponse | null = null;
  let generatedResult: RequirementsGenerationResponse | null = null;
  let refinedResult: RequirementsGenerationResponse | null = null;

  for (const analysis of [...analyses].sort((first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime())) {
    if (analysis.type === "AMBIGUITY_DETECTION" && isAmbiguityDetectionResult(analysis.structuredOutput)) {
      ambiguityResult = { analysisId: analysis.id, result: analysis.structuredOutput };
    }
    if (analysis.type === "QUESTION_GENERATION" && isRefinementQuestionsResult(analysis.structuredOutput)) {
      refinementResult = { analysisId: analysis.id, result: analysis.structuredOutput };
    }
    if (analysis.type === "REQUIREMENT_EXTRACTION" && isRequirementsGenerationResult(analysis.structuredOutput)) {
      generatedResult = { analysisId: analysis.id, result: analysis.structuredOutput };
    }
    if (analysis.type === "REFINEMENT" && isRequirementsGenerationResult(analysis.structuredOutput)) {
      refinedResult = { analysisId: analysis.id, result: analysis.structuredOutput };
    }
  }

  return { ambiguityResult, refinementResult, generatedResult, refinedResult };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRequirementsGenerationResult(value: unknown): value is RequirementsGenerationResponse["result"] {
  if (!isRecord(value) || !isRecord(value.userStory)) return false;
  const userStory = value.userStory;
  if (![userStory.actor, userStory.action, userStory.benefit].every((field) => typeof field === "string")) return false;
  if (!Array.isArray(value.functionalRequirements) || !Array.isArray(value.nonFunctionalRequirements) || !Array.isArray(value.acceptanceCriteria)) return false;

  return value.functionalRequirements.every((item) => (
    isRecord(item) && typeof item.code === "string" && typeof item.title === "string" && typeof item.description === "string"
  )) && value.nonFunctionalRequirements.every((item) => (
    isRecord(item) && typeof item.code === "string" && typeof item.category === "string" && typeof item.description === "string"
  )) && value.acceptanceCriteria.every((item) => isRecord(item) && typeof item.description === "string");
}

function isAmbiguityDetectionResult(value: unknown): value is AmbiguityDetectionResponse["result"] {
  return isRecord(value)
    && Array.isArray(value.ambiguities)
    && value.ambiguities.every((item) => (
      isRecord(item)
      && typeof item.description === "string"
      && ["low", "medium", "high"].includes(String(item.severity))
      && typeof item.context === "string"
    ));
}

function isRefinementQuestionsResult(value: unknown): value is RefinementQuestionsResponse["result"] {
  return isRecord(value)
    && Array.isArray(value.questions)
    && value.questions.every((item) => (
      isRecord(item)
      && typeof item.questionId === "string"
      && typeof item.ambiguityId === "string"
      && typeof item.question === "string"
      && typeof item.reason === "string"
      && isRecord(item.ambiguity)
      && typeof item.ambiguity.description === "string"
      && ["low", "medium", "high"].includes(String(item.ambiguity.severity))
      && (item.ambiguity.context === null || typeof item.ambiguity.context === "string")
    ));
}

function getPersistedRefinementQuestion(value: unknown, questionId: string): PersistedRefinementQuestion | null {
  if (!value || typeof value !== "object" || !("questions" in value) || !Array.isArray(value.questions)) return null;
  const question = value.questions.find((item): item is Record<string, unknown> => (
    Boolean(item) && typeof item === "object" && (item as Record<string, unknown>).questionId === questionId
  ));
  if (!question || typeof question.ambiguityId !== "string" || typeof question.question !== "string" || typeof question.reason !== "string") return null;
  if (!question.ambiguity || typeof question.ambiguity !== "object") return null;
  const ambiguity = question.ambiguity as Record<string, unknown>;
  if (
    typeof ambiguity.description !== "string"
    || !["low", "medium", "high"].includes(String(ambiguity.severity))
    || (ambiguity.context !== null && typeof ambiguity.context !== "string")
  ) return null;

  return {
    questionId,
    ambiguityId: question.ambiguityId,
    question: question.question,
    reason: question.reason,
    ambiguity: {
      description: ambiguity.description,
      severity: ambiguity.severity as "low" | "medium" | "high",
      context: ambiguity.context as string | null,
    },
  };
}

function InitialElicitationForm({
  projectName,
  hasExistingSession,
  title,
  description,
  processing,
  error,
  onTitleChange,
  onDescriptionChange,
  onStart,
}: {
  projectName: string;
  hasExistingSession: boolean;
  title: string;
  description: string;
  processing: boolean;
  error: string | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStart: () => void;
}) {
  return (
    <Card className="mx-auto max-w-3xl p-5 sm:p-7">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Icon name="message-square" className="size-5" /></span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-700">{hasExistingSession ? "Nova sessão" : "Iniciar elicitação"}</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">Comece a coleta de informações</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Projeto selecionado: <strong>{projectName}</strong>. A descrição será registrada como o contexto e a primeira resposta imutável da sessão.</p>
        </div>
      </div>
      {hasExistingSession && <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800">A sessão selecionada ainda não possui perguntas. Esta ação criará uma nova sessão com a descrição inicial preservada.</p>}
      <div className="mt-6 grid gap-5">
        <Input label="Título da sessão (opcional)" placeholder="Ex.: Levantamento inicial da biblioteca" value={title} onChange={(event) => onTitleChange(event.target.value)} disabled={processing} />
        <Textarea
          aria-label="Descrição inicial do sistema"
          className="min-h-40"
          disabled={processing}
          label="Descrição inicial do sistema ou necessidade"
          placeholder="Ex.: Quero um sistema para uma biblioteca onde alunos possam consultar livros disponíveis e reservar livros."
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">Informe pelo menos 20 caracteres. A IA não será chamada nesta etapa.</p>
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      <Button className="mt-6" disabled={!description.trim() || processing} onClick={onStart}><Icon name="arrow-right" className="size-4" />{processing ? "Iniciando sessão…" : "Iniciar elicitação"}</Button>
    </Card>
  );
}

function EmptyProjectState() {
  return (
    <Card className="p-6 text-center">
      <Icon name="folder" className="mx-auto size-7 text-slate-400" />
      <h2 className="mt-3 font-bold text-slate-900">Nenhum projeto disponível</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Crie um projeto antes de iniciar uma sessão de elicitação.</p>
      <Button className="mt-5" href="/projetos/novo">Criar projeto</Button>
    </Card>
  );
}
