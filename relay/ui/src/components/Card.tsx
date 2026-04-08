import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  danger,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded border bg-bg p-4 mb-4 ${
        danger ? "border-red/40" : "border-border"
      }`}
    >
      {title ? (
        <div className="mb-3">
          <div className="text-sm font-semibold">{title}</div>
          {subtitle ? (
            <div className="text-xs text-text-muted mt-0.5">{subtitle}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
