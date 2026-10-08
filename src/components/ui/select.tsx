import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ children, className, id, label, ...props }: SelectProps) {
  const selectId = id ?? props.name;
  return (
    <label className="block space-y-1.5" htmlFor={selectId}>
      {label && <span className="text-sm font-semibold text-slate-700">{label}</span>}
      <select
        id={selectId}
        className={cn("min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100", className)}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
