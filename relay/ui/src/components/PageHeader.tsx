import type { ReactNode } from "react";

export function PageHeader({
  title,
  children,
}: {
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="h-12 px-4 flex items-center gap-3 border-b border-border bg-bg shrink-0">
      <h1 className="text-sm font-semibold">{title}</h1>
      <div className="flex-1" />
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 min-h-0 overflow-y-auto p-4">{children}</div>;
}
