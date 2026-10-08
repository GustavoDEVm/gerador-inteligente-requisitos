import { PageHeader } from "@/components/layout/page-header";
import { ProjectsContent } from "@/components/projects/projects-content";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Organização" title="Projetos" description="Centralize o contexto de cada sistema antes de iniciar a elicitação de requisitos." actions={<Button href="/projetos/novo"><Icon name="plus" className="size-4" />Novo projeto</Button>} />
      <ProjectsContent />
    </div>
  );
}
