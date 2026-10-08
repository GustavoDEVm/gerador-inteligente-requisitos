import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { AmbiguityDetectionResponse, DetectedAmbiguitySeverity } from "@/types/ai";

type AmbiguityDetectionResultsProps = {
  result: AmbiguityDetectionResponse;
};

const severityPresentation: Record<DetectedAmbiguitySeverity, { label: string; tone: "blue" | "amber" | "red" }> = {
  low: { label: "Baixa", tone: "blue" },
  medium: { label: "Média", tone: "amber" },
  high: { label: "Alta", tone: "red" },
};

export function AmbiguityDetectionResults({ result }: AmbiguityDetectionResultsProps) {
  const { ambiguities } = result.result;

  return (
    <section aria-live="polite" aria-labelledby="ambiguity-results-title" className="space-y-6">
      <Card className="overflow-hidden border-amber-200">
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Icon name="alert-triangle" className="size-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Análise concluída</p>
                <h2 id="ambiguity-results-title" className="mt-1 text-xl font-bold text-slate-950">Ambiguidades identificadas</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Pontos que merecem esclarecimento antes da consolidação dos requisitos.</p>
              </div>
            </div>
            <Badge tone={ambiguities.length > 0 ? "amber" : "green"}>{formatCount(ambiguities.length)}</Badge>
          </div>
        </div>

        {ambiguities.length === 0 ? (
          <div className="flex gap-3 p-5 sm:p-7">
            <Icon name="check-circle" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="font-bold text-slate-900">Nenhuma ambiguidade relevante identificada</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">A resposta analisada possui contexto suficiente para a interpretação atual dos requisitos.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:p-7 lg:grid-cols-2">
            {ambiguities.map((ambiguity, index) => {
              const severity = severityPresentation[ambiguity.severity];
              return (
                <Card key={`${ambiguity.description}-${index}`} className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Badge tone={severity.tone}>{severity.label}</Badge>
                    <Icon name="alert-triangle" className="size-5 shrink-0 text-slate-400" />
                  </div>
                  <p className="mt-4 text-sm font-semibold leading-6 text-slate-900">{ambiguity.description}</p>
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Contexto da resposta</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{ambiguity.context}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}

function formatCount(count: number) {
  return `${count} ${count === 1 ? "item" : "itens"}`;
}
