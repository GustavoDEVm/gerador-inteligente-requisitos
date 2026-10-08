import { Badge } from "@/components/ui/badge";
import type { DisplayStatus } from "@/lib/presentation";

interface StatusBadgeProps {
  status: DisplayStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const tone =
    status === "Concluído" || status === "Revisado"
      ? "green"
      : status === "Em andamento" || status === "Em revisão"
        ? "blue"
        : status === "Arquivado" || status === "Rejeitado" || status === "Obsoleto"
          ? "slate"
          : "amber";

  return <Badge tone={tone}>{status}</Badge>;
}
