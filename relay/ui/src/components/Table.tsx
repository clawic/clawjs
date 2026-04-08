import type { ReactNode } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="border border-border rounded overflow-hidden bg-bg">
      <table className="w-full text-[12px] border-collapse">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-bg-panel text-text-muted uppercase text-[11px] tracking-wide">
      {children}
    </thead>
  );
}

export function TH({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left font-medium px-3 h-8 border-b border-border ${className}`}
    >
      {children}
    </th>
  );
}

export function TR({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-border last:border-b-0 ${
        onClick ? "cursor-pointer hover:bg-bg-hover" : ""
      } ${className}`}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-3 h-9 align-middle ${className}`}>
      {children}
    </td>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11px]">{children}</span>;
}
