import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export function Input({ className, error, id, label, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <label className="block space-y-1.5" htmlFor={inputId}>
      {label && <span className="text-sm font-semibold text-slate-700">{label}</span>}
      <input
        id={inputId}
        className={cn(
          "min-h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100",
          error ? "border-red-500" : "border-slate-300",
          className,
        )}
        {...props}
      />
      {error && <span className="text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}
