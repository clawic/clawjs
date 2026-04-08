import type { ReactNode } from "react";

export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 text-text-muted">
      <div className="text-sm font-semibold text-text">{title}</div>
      {description ? <div className="text-xs mt-1 max-w-sm">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorMsg({ message }: { message: string }) {
  return (
    <div className="text-xs text-red bg-red-bg border border-red/30 rounded-sm px-2 py-1.5">
      {message}
    </div>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return <div className="text-xs text-text-muted p-3">{label}</div>;
}
