import { PageHeader } from "@/components/layout/page-header";
import { NewProjectForm } from "@/components/projects/new-project-form";

export default function NewProjectPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Projetos / Novo" title="Criar projeto" description="Registre o contexto inicial para orientar as futuras sessões de elicitação." />
      <NewProjectForm />
    </div>
  );
}
