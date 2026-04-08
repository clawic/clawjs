import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "primary" | "danger" | "ghost";
type Size = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const VARIANTS: Record<Variant, string> = {
  default: "bg-bg-panel text-text border border-border hover:bg-bg-hover",
  primary: "bg-text text-bg hover:opacity-90",
  danger: "bg-red text-white hover:opacity-90",
  ghost: "text-text hover:bg-bg-hover",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2 text-[12px]",
  md: "h-8 px-3 text-[12px]",
};

export function Button({
  variant = "default",
  size = "md",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}
