import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type DrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

/*
 * Right-slide drawer portaled to document.body. Handles Escape + overlay
 * click to close. Consumers control open state externally.
 */
export function Drawer({ open, title, onClose, children, footer }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/30 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-[420px] max-w-full h-full bg-bg border-l border-border flex flex-col animate-in slide-in-from-right"
        style={{ boxShadow: "var(--shadow-drawer)" }}
      >
        <div className="h-11 px-4 flex items-center justify-between border-b border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wide">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-bg-hover"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-[13px]">{children}</div>
        {footer ? (
          <div className="border-t border-border p-3 flex justify-end gap-2">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
