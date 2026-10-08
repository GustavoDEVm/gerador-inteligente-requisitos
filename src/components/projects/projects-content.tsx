"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { formatUpdatedAt, presentProjectStatus } from "@/lib/presentation";
import type { ProjectListItem } from "@/types/api";

export function ProjectsContent() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<ProjectListItem[]>("/api/projects")
      .then((items) => { if (active) setProjects(items); })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar os projetos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        const matchesQuery = `${project.name} ${project.description}`.toLowerCase().includes(query.toLowerCase());
        return matchesQuery && (status === "Todos" || presentProjectStatus(project.status) === status);
      }),
    [projects, query, status],
  );

  return (
    <>
      <div className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_12rem]">
        <div className="relative"><Icon name="search" className="pointer-events-none absolute left-3 top-3 size-5 text-slate-400" /><Input aria-label="Buscar projetos" className="pl-10" placeholder="Buscar por nome ou descrição" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <Select aria-label="Filtrar projetos por status" value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos</option><option>Em andamento</option><option>Em revisão</option><option>Concluído</option></Select>
      </div>
      {loading ? (
        <Card className="p-5 text-sm text-slate-500">Carregando projetos…</Card>
      ) : error ? (
        <EmptyState title="Não foi possível carregar os projetos" description={error} icon="search" />
      ) : filteredProjects.length === 0 ? (
        <EmptyState title="Nenhum projeto encontrado" description="Tente ajustar a busca ou os filtros para encontrar um projeto." icon="search" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredProjects.map((project) => (
            <Card key={project.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-slate-950">{project.name}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{project.description}</p></div><StatusBadge status={presentProjectStatus(project.status)} /></div>
              <div className="mt-5"><Progress label="Progresso da elicitação" value={project.status === "COMPLETED" ? 100 : Math.min(90, project._count.sessions * 25)} /></div>
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm"><div><dt className="text-slate-500">Requisitos</dt><dd className="mt-1 font-semibold text-slate-800">{project._count.requirements}</dd></div><div><dt className="text-slate-500">Sessões</dt><dd className="mt-1 font-semibold text-slate-800">{project._count.sessions}</dd></div></dl>
              <div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Atualizado em {formatUpdatedAt(project.updatedAt)}</span><Button href={`/projetos/${project.id}`} variant="secondary">Ver projeto <Icon name="arrow-right" className="size-4" /></Button></div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
