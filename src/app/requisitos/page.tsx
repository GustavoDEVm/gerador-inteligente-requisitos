import { PageHeader } from "@/components/layout/page-header";
import { RequirementsWorkspace } from "@/components/requirements/requirements-workspace";

export default function RequirementsPage() {
  return <div className="space-y-6"><PageHeader eyebrow="Artefatos identificados" title="Requisitos" description="Visualize e acompanhe os requisitos levantados nas sessões de elicitação." /><RequirementsWorkspace /></div>;
}
