import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";

interface EmptyStateProps {
  action?: ReactNode;
  description: string;
  icon?: IconName;
  title: string;
}

export function EmptyState({ action, description, icon = "folder", title }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <Icon name={icon} className="mx-auto size-8 text-slate-400" />
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
