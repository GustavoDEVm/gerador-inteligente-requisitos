"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api-client";
import { formatUpdatedAt, presentProjectStatus } from "@/lib/presentation";
import type { ProjectListItem } from "@/types/api";

type ActivityItem = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
};

type ProjectActivity = ActivityItem & {
  projectName: string;
};

function activityIcon(action: string): IconName {
  if (action.startsWith("PROJECT")) return "folder";
  if (action.startsWith("SESSION") || action === "QUESTION_ADDED" || action === "ANSWER_RECORDED") return "message-square";
  if (action === "ANALYSIS_COMPLETED") return "sparkles";
  return "file-text";
}

export function DashboardContent() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activitiesUnavailable, setActivitiesUnavailable] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const loadedProjects = await apiFetch<ProjectListItem[]>("/api/projects");
        const activityResults = await Promise.allSettled(
          loadedProjects.map(async (project) => {
            const items = await apiFetch<ActivityItem[]>(`/api/projects/${project.id}/activities`);
            return items.map((activity) => ({ ...activity, projectName: project.name }));
          }),
        );

        if (!active) return;

        setProjects(loadedProjects);
        setActivities(
          activityResults
            .filter((result): result is PromiseFulfilledResult<ProjectActivity[]> => result.status === "fulfilled")
            .flatMap((result) => result.value)
            .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
            .slice(0, 3),
        );
        setActivitiesUnavailable(activityResults.some((result) => result.status === "rejected"));
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar os dados do painel.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const unavailable = loading || error !== null;
    const description = (availableDescription: string) => unavailable ? loading ? "carregando dados" : "dados indisponíveis" : availableDescription;

    return [
      { label: "Projetos", value: unavailable ? "—" : projects.length, description: description("projetos não arquivados"), icon: "folder" as const, tone: "bg-blue-50 text-blue-700" },
      { label: "Requisitos", value: unavailable ? "—" : projects.reduce((total, project) => total + project._count.requirements, 0), description: description("requisitos registrados"), icon: "file-text" as const, tone: "bg-violet-50 text-violet-700" },
      { label: "Sessões", value: unavailable ? "—" : projects.reduce((total, project) => total + project._count.sessions, 0), description: description("sessões de elicitação registradas"), icon: "message-square" as const, tone: "bg-emerald-50 text-emerald-700" },
      { label: "Projetos em revisão", value: unavailable ? "—" : projects.filter((project) => project.status === "IN_REVIEW").length, description: description("com status Em revisão"), icon: "clipboard" as const, tone: "bg-amber-50 text-amber-700" },
    ];
  }, [error, loading, projects]);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores gerais">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-5">
            <div className="flex items-start justify-between">
              <div><p className="text-sm font-medium text-slate-500">{stat.label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{stat.value}</p></div>
              <span className={`flex size-10 items-center justify-center rounded-lg ${stat.tone}`}><Icon name={stat.icon} className="size-5" /></span>
            </div>
            <p className="mt-3 text-xs text-slate-500">{stat.description}</p>
          </Card>
        ))}
      </section>

      {loading ? (
        <Card className="p-5 text-sm text-slate-500">Carregando dados do painel…</Card>
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Não foi possível carregar o painel" description={error} />
      ) : (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-950">Projetos recentes</h2><p className="mt-1 text-sm text-slate-500">Projetos registrados mais recentemente.</p></div><Button href="/projetos" variant="ghost">Ver todos <Icon name="arrow-right" className="size-4" /></Button></div>
            <div className="mt-5 divide-y divide-slate-100">
              {projects.length === 0 ? <p className="py-4 text-sm text-slate-500">Nenhum projeto registrado.</p> : projects.slice(0, 3).map((project) => (
                <div key={project.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 className="font-semibold text-slate-900">{project.name}</h3><p className="mt-1 text-sm text-slate-500">{project.description}</p></div><StatusBadge status={presentProjectStatus(project.status)} /></div>
                  <div className="mt-3 flex justify-between text-xs text-slate-500"><span>{project._count.requirements} requisitos · {project._count.sessions} sessões</span><span>Atualizado em {formatUpdatedAt(project.updatedAt)}</span></div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-950">Atividade recente</h2>
            <div className="mt-5 space-y-5">
              {activities.length > 0 ? activities.map((activity) => (
                <div key={activity.id} className="flex gap-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Icon name={activityIcon(activity.action)} className="size-4" /></span><div><p className="text-sm font-semibold text-slate-800">{activity.summary}</p><p className="mt-0.5 text-xs text-slate-500">{activity.projectName}</p><p className="mt-1 text-xs text-slate-400">{formatUpdatedAt(activity.createdAt)}</p></div></div>
              )) : <p className="text-sm text-slate-500">{activitiesUnavailable ? "Não foi possível carregar todas as atividades agora." : "Nenhuma atividade registrada."}</p>}
              {activitiesUnavailable && activities.length > 0 && <p className="text-xs text-slate-500">Algumas atividades podem não estar disponíveis no momento.</p>}
            </div>
          </Card>
        </section>
      )}
    </>
  );
}
