import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type {
  GeneratedFunctionalRequirement,
  GeneratedNonFunctionalRequirement,
  RequirementsGenerationResponse,
} from "@/types/ai";

type GeneratedRequirementsResultsProps = {
  result: RequirementsGenerationResponse;
  variant?: "generated" | "refined";
};

export function GeneratedRequirementsResults({ result, variant = "generated" }: GeneratedRequirementsResultsProps) {
  const { acceptanceCriteria, functionalRequirements, nonFunctionalRequirements, userStory } = result.result;
  const refined = variant === "refined";
  const titleId = refined ? "refined-requirements-title" : "generated-requirements-title";

  return (
    <section aria-live="polite" aria-labelledby={titleId} className="space-y-6">
      <Card className="overflow-hidden border-violet-200">
        <div className="border-b border-violet-100 bg-violet-50 px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <Icon name="sparkles" className="size-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-700">{refined ? "Nova versão refinada" : "Análise concluída"}</p>
                <h2 id={titleId} className="mt-1 text-xl font-bold text-slate-950">
                  {refined ? "Requisitos refinados pela IA" : "Requisitos gerados pela IA"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {refined
                    ? "Esta é uma nova versão baseada nas respostas de refinamento. Os requisitos anteriores foram preservados no histórico."
                    : "Revise os itens abaixo antes de organizá-los no projeto."}
                </p>
              </div>
            </div>
            <Badge tone="green">Resultado disponível</Badge>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-7 lg:grid-cols-4">
          <ResultCount label="User Story" value={1} tone="violet" />
          <ResultCount label="Requisitos funcionais" value={functionalRequirements.length} tone="blue" />
          <ResultCount label="Requisitos não funcionais" value={nonFunctionalRequirements.length} tone="green" />
          <ResultCount label="Critérios de aceitação" value={acceptanceCriteria.length} tone="amber" />
        </div>
      </Card>

      <Card className="border-violet-200 p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge tone="violet">User Story</Badge>
            <h3 className="mt-3 text-lg font-bold text-slate-950">Necessidade do usuário</h3>
          </div>
          <Icon name="message-square" className="size-6 text-violet-600" />
        </div>
        <p className="mt-5 rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-sm leading-7 text-slate-800">
          Como <strong>{userStory.actor}</strong>, quero <strong>{userStory.action}</strong>, para <strong>{userStory.benefit}</strong>.
        </p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <StoryDetail label="Ator" value={userStory.actor} />
          <StoryDetail label="Objetivo" value={userStory.action} />
          <StoryDetail label="Benefício" value={userStory.benefit} />
        </dl>
      </Card>

      <RequirementsSection
        title="Requisitos funcionais"
        description="Funcionalidades que o sistema deve oferecer."
        items={functionalRequirements}
        tone="blue"
        emptyMessage="Nenhum requisito funcional foi identificado nesta análise."
      />

      <RequirementsSection
        title="Requisitos não funcionais"
        description="Qualidades e restrições esperadas para a solução."
        items={nonFunctionalRequirements}
        tone="green"
        emptyMessage="Nenhum requisito não funcional foi identificado nesta análise."
      />

      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="amber">Critérios de aceitação</Badge>
              <span className="text-sm font-medium text-slate-500">{formatCount(acceptanceCriteria.length, "critério", "critérios")}</span>
            </div>
            <h3 className="mt-3 text-lg font-bold text-slate-950">Como validar a entrega</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">Condições observáveis para confirmar o comportamento esperado.</p>
          </div>
          <Icon name="check-circle" className="size-6 text-amber-600" />
        </div>
        {acceptanceCriteria.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {acceptanceCriteria.map((criterion, index) => (
              <li key={`${criterion.description}-${index}`} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <Icon name="check-circle" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                <p className="text-sm leading-6 text-slate-700">{criterion.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-sm text-slate-500">Nenhum critério de aceitação foi gerado nesta análise.</p>
        )}
      </Card>
    </section>
  );
}

function ResultCount({ label, tone, value }: { label: string; tone: "violet" | "blue" | "green" | "amber"; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <Badge tone={tone}>{value}</Badge>
      <p className="mt-2 text-sm font-medium leading-5 text-slate-700">{label}</p>
    </div>
  );
}

function StoryDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm leading-6 text-slate-800">{value}</dd>
    </div>
  );
}

function RequirementsSection({
  title,
  description,
  items,
  tone,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: GeneratedFunctionalRequirement[] | GeneratedNonFunctionalRequirement[];
  tone: "blue" | "green";
  emptyMessage: string;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{title}</Badge>
            <span className="text-sm font-medium text-slate-500">{formatCount(items.length, "item", "itens")}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      {items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <RequirementCard key={item.code} item={item} tone={tone} />
          ))}
        </div>
      ) : (
        <Card className="p-5 text-sm text-slate-500">{emptyMessage}</Card>
      )}
    </section>
  );
}

function RequirementCard({
  item,
  tone,
}: {
  item: GeneratedFunctionalRequirement | GeneratedNonFunctionalRequirement;
  tone: "blue" | "green";
}) {
  const category = "category" in item ? item.category : null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{item.code}</Badge>
        {category ? <Badge tone="slate">{category}</Badge> : null}
      </div>
      <h4 className="mt-4 text-base font-bold leading-6 text-slate-950">{"title" in item ? item.title : item.description}</h4>
      <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
    </Card>
  );
}

function formatCount(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}
