import { ProjectDetailsContent } from "@/components/projects/project-details-content";

interface ProjectDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailsPage({ params }: ProjectDetailsPageProps) {
  const { id } = await params;
  return <ProjectDetailsContent projectId={id} />;
}
