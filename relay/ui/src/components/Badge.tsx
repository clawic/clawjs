import type { ReactNode } from "react";

type Variant = "success" | "error" | "warn" | "info" | "neutral";

const STYLES: Record<Variant, string> = {
  success: "bg-green-bg text-green",
  error: "bg-red-bg text-red",
  warn: "bg-yellow-bg text-yellow",
  info: "bg-blue-bg text-text",
  neutral: "bg-bg-hover text-text-muted",
};

export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-[11px] font-medium ${STYLES[variant]}`}
    >
      {children}
    </span>
  );
}
