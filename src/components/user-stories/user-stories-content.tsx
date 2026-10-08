"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api-client";
import { presentPriority, presentReviewStatus } from "@/lib/presentation";
import type { ApiPriority, ApiReviewStatus, ProjectListItem } from "@/types/api";

type UserStoryItem = {
  id: string;
  code: string;
  title: string;
  actor: string;
  objective: string;
  benefit: string;
  description: string | null;
  priority: ApiPriority;
  status: ApiReviewStatus;
  acceptanceCriteria: { id: string; position: number; description: string }[];
};

export function UserStoriesContent() {
  const [stories, setStories] = useState<UserStoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const projects = await apiFetch<ProjectListItem[]>("/api/projects");
        const items = (await Promise.all(projects.map((project) => apiFetch<UserStoryItem[]>(`/api/projects/${project.id}/user-stories`)))).flat();
        if (active) setStories(items);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar as User Stories.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  if (loading) return <Card className="p-5 text-sm text-slate-500">Carregando User Stories…</Card>;
  if (error) return <EmptyState title="Não foi possível carregar as User Stories" description={error} icon="file-text" />;
  if (stories.length === 0) return <EmptyState title="Nenhuma User Story encontrada" description="Registre uma User Story em um projeto para organizá-la aqui." icon="file-text" />;

  return <div className="grid gap-5 xl:grid-cols-2">{stories.map((story) => <Card key={story.id} className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">{story.code}</p><h2 className="mt-2 text-lg font-bold text-slate-950">{story.title}</h2></div><StatusBadge status={presentReviewStatus(story.status)} /></div><blockquote className="mt-5 rounded-lg border-l-4 border-blue-600 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">Como <strong>{story.actor}</strong>, quero <strong>{story.objective}</strong>, para <strong>{story.benefit}</strong>.</blockquote>{story.description && <p className="mt-4 text-sm leading-6 text-slate-600">{story.description}</p>}<div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3"><div><p className="text-xs text-slate-500">Ator</p><p className="mt-1 font-medium text-slate-800">{story.actor}</p></div><div><p className="text-xs text-slate-500">Prioridade</p><p className="mt-1"><Badge tone={story.priority === "HIGH" ? "red" : story.priority === "MEDIUM" ? "amber" : "slate"}>{presentPriority(story.priority)}</Badge></p></div><div><p className="text-xs text-slate-500">Status</p><p className="mt-1 font-medium text-slate-800">{presentReviewStatus(story.status)}</p></div></div><div className="mt-5"><h3 className="text-sm font-bold text-slate-800">Critérios de aceitação</h3><ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">{story.acceptanceCriteria.map((criterion) => <li key={criterion.id} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-600" />{criterion.description}</li>)}{story.acceptanceCriteria.length === 0 && <li>Nenhum critério registrado.</li>}</ul></div></Card>)}</div>;
}
