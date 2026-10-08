import { PageHeader } from "@/components/layout/page-header";
import { UserStoriesContent } from "@/components/user-stories/user-stories-content";

export default function UserStoriesPage() {
  return (
    <div className="space-y-6"><PageHeader eyebrow="Organização do backlog" title="User Stories" description="Estruture necessidades do usuário em histórias compreensíveis e revisáveis." /><UserStoriesContent /></div>
  );
}
