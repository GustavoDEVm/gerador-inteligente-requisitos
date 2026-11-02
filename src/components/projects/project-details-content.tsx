"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api-client";
import { presentProjectStatus, presentReviewStatus } from "@/lib/presentation";
import type { ApiProjectStatus, ApiReviewStatus } from "@/types/api";

type ProjectDetail = {
  id: string;
  name: string;
  description: string;
  objective: string;
  context: string;
  status: ApiProjectStatus;
  stakeholders: { id: string; name: string; role: string | null }[];
  sessions: { id: string; sequence: number; title: string | null; status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED"; createdAt: string; _count: { questions: number } }[];
  requirements: { id: string; code: string; title: string; status: ApiReviewStatus }[];
  _count: { requirements: number; sessions: number };
};

export function ProjectDetailsContent({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<ProjectDetail>(`/api/projects/${projectId}`)
      .then((item) => { if (active) setProject(item); })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar o projeto."); });
    return () => { active = false; };
  }, [projectId]);

  if (error) return <Card className="p-6 text-sm text-red-600">{error}</Card>;
  if (!project) return <Card className="p-6 text-sm text-slate-500">Carregando projeto…</Card>;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Projetos / Detalhes" title={project.name} description={project.description} actions={<div className="flex flex-wrap gap-2"><Button href={`/elicitacao?projectId=${project.id}`} variant="secondary"><Icon name="message-square" className="size-4" />Abrir elicitação</Button><Button href={`/elicitacao?projectId=${project.id}&newSession=true`}><Icon name="plus" className="size-4" />Nova sessão de elicitação</Button></div>} />
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">Visão do projeto</h2><StatusBadge status={presentProjectStatus(project.status)} /></div><dl className="mt-5 grid gap-5 sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Objetivo</dt><dd className="mt-2 text-sm leading-6 text-slate-700">{project.objective}</dd></div><div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Contexto</dt><dd className="mt-2 text-sm leading-6 text-slate-700">{project.context}</dd></div><div className="sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Stakeholders</dt><dd className="mt-2 flex flex-wrap gap-2">{project.stakeholders.length > 0 ? project.stakeholders.map((stakeholder) => <Badge key={stakeholder.id} tone="slate">{stakeholder.name}{stakeholder.role ? ` · ${stakeholder.role}` : ""}</Badge>) : <span className="text-sm text-slate-500">Nenhum stakeholder registrado.</span>}</dd></div></dl></Card>
          <Card className="p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-950">Requisitos recentes</h2><p className="mt-1 text-sm text-slate-500">Artefatos persistidos vinculados ao projeto.</p></div><Button href="/requisitos" variant="ghost">Ver todos <Icon name="arrow-right" className="size-4" /></Button></div><div className="mt-5 divide-y divide-slate-100">{project.requirements.slice(0, 3).map((requirement) => <div key={requirement.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"><div><p className="text-sm font-bold text-slate-900">{requirement.code} · {requirement.title}</p></div><StatusBadge status={presentReviewStatus(requirement.status)} /></div>)}{project.requirements.length === 0 && <p className="text-sm text-slate-500">Nenhum requisito registrado.</p>}</div></Card>
        </div>
        <aside className="space-y-4"><Card className="p-5"><h2 className="font-bold text-slate-900">Resumo do projeto</h2><div className="mt-4"><StatusBadge status={presentProjectStatus(project.status)} /></div><dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm"><div className="flex justify-between"><dt className="text-slate-500">Requisitos</dt><dd className="font-bold">{project._count.requirements}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Sessões</dt><dd className="font-bold">{project._count.sessions}</dd></div></dl></Card><Card className="p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-slate-900">Sessões de elicitação</h2><Button href={`/elicitacao?projectId=${project.id}&newSession=true`} variant="ghost">Nova</Button></div><div className="mt-4 space-y-3">{project.sessions.map((session) => <div key={session.id} className="rounded-lg border border-slate-200 p-3"><p className="text-sm font-bold text-slate-900">Sessão {session.sequence}{session.title ? ` · ${session.title}` : ""}</p><p className="mt-1 text-xs text-slate-500">{sessionStatusLabel(session.status)} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(session.createdAt))}</p><Button className="mt-3 w-full" href={`/elicitacao?projectId=${project.id}&sessionId=${session.id}`} variant="secondary">Abrir sessão <Icon name="arrow-right" className="size-4" /></Button></div>)}{project.sessions.length === 0 && <p className="text-sm leading-6 text-slate-500">Nenhuma sessão criada. Inicie a primeira coleta para este projeto.</p>}</div></Card><Card className="border-violet-100 bg-violet-50 p-5"><Icon name="sparkles" className="size-5 text-violet-700" /><h2 className="mt-3 font-bold text-violet-950">Fluxo assistido por IA</h2><p className="mt-2 text-sm leading-6 text-violet-800">Inicie uma sessão para registrar o contexto. Depois, gere requisitos, identifique ambiguidades, responda às perguntas de refinamento e crie uma nova versão, preservando o histórico.</p></Card></aside>
      </section>
    </div>
  );
}

function sessionStatusLabel(status: ProjectDetail["sessions"][number]["status"]) {
  return {
    DRAFT: "Rascunho",
    ACTIVE: "Ativa",
    COMPLETED: "Concluída",
    CANCELLED: "Cancelada",
  }[status];
}
