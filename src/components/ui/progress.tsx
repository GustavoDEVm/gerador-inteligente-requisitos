interface ProgressProps {
  label?: string;
  value: number;
}

export function Progress({ label, value }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(value, 100));
  return (
    <div className="space-y-1.5">
      {label && <div className="flex justify-between text-xs font-medium text-slate-500"><span>{label}</span><span>{safeValue}%</span></div>}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue}>
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
