import { cn } from "@/lib/utils";

interface AvatarProps {
  className?: string;
  name: string;
}

export function Avatar({ className, name }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span className={cn("inline-flex size-9 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800", className)} aria-label={name}>
      {initials}
    </span>
  );
}
