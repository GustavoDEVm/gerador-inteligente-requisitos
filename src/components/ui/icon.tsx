import type { SVGProps } from "react";

export type IconName =
  | "alert-triangle"
  | "arrow-left"
  | "arrow-right"
  | "bell"
  | "book"
  | "check-circle"
  | "chevron-right"
  | "clipboard"
  | "close"
  | "file-text"
  | "folder"
  | "home"
  | "menu"
  | "message-square"
  | "plus"
  | "search"
  | "settings"
  | "sparkles"
  | "users";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  const commonProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...commonProps} {...props}>
      {name === "alert-triangle" && <path d="M10.3 3.2 1.9 17.3A2 2 0 0 0 3.6 20h16.8a2 2 0 0 0 1.7-2.7L13.7 3.2a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01" />}
      {name === "home" && <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Zm6 11v-7h6v7" />}
      {name === "folder" && <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />}
      {name === "message-square" && <path d="M21 11.5a8 8 0 0 1-8.5 8 9 9 0 0 1-3.8-.9L3 20l1.5-4.4A8 8 0 1 1 21 11.5Z" />}
      {name === "file-text" && <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h6" />}
      {name === "book" && <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />}
      {name === "settings" && <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-13v2m0 15v2m9.5-9.5h-2m-15 0h-2m16.3-6.3-1.4 1.4M6.6 17.4l-1.4 1.4m13.6 0-1.4-1.4M6.6 6.6 5.2 5.2" />}
      {name === "plus" && <path d="M12 5v14m-7-7h14" />}
      {name === "search" && <path d="m21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />}
      {name === "bell" && <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 13h4" />}
      {name === "users" && <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m17-6a4 4 0 0 0-3-3.9M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 0a3 3 0 1 0-2.8-4" />}
      {name === "clipboard" && <path d="M9 5h6m-5-3h4a1 1 0 0 1 1 1v2H9V3a1 1 0 0 1 1-1Zm7 2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m2 8h4m-4 4h4" />}
      {name === "sparkles" && <path d="m12 3-1.3 4.7L6 9l4.7 1.3L12 15l1.3-4.7L18 9l-4.7-1.3L12 3Zm7 11-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7L19 14ZM5 15l-.7 2.3L2 18l2.3.7L5 21l.7-2.3L8 18l-2.3-.7L5 15Z" />}
      {name === "check-circle" && <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3" />}
      {name === "arrow-left" && <path d="M19 12H5m6 6-6-6 6-6" />}
      {name === "arrow-right" && <path d="M5 12h14m-6-6 6 6-6 6" />}
      {name === "chevron-right" && <path d="m9 18 6-6-6-6" />}
      {name === "menu" && <path d="M4 6h16M4 12h16M4 18h16" />}
      {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
    </svg>
  );
}
