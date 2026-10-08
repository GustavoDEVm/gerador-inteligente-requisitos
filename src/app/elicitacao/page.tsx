import { ElicitationSession } from "@/components/elicitation/elicitation-session";
import { PageHeader } from "@/components/layout/page-header";

interface ElicitationPageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function ElicitationPage({ searchParams }: ElicitationPageProps) {
  const { projectId } = await searchParams;
  return <div className="space-y-6"><PageHeader eyebrow="Projeto / Elicitação" title="Sessão de elicitação" description="Colete informações de forma estruturada para apoiar a identificação futura de requisitos." /><ElicitationSession initialProjectId={projectId} /></div>;
}
