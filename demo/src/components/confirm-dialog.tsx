"use client";

import { useState, useCallback, useRef } from "react";

interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
}

const initialState: ConfirmDialogState = {
  open: false,
  title: "",
  description: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  destructive: false,
};

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmDialogState>(initialState);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (opts: {
      title: string;
      description?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      destructive?: boolean;
    }): Promise<boolean> => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        setState({
          open: true,
          title: opts.title,
          description: opts.description || "",
          confirmLabel: opts.confirmLabel || "Confirm",
          cancelLabel: opts.cancelLabel || "Cancel",
          destructive: opts.destructive ?? false,
        });
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState(initialState);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState(initialState);
  }, []);

  return { state, confirm, handleConfirm, handleCancel };
}

export function ConfirmDialog({
  state,
  onConfirm,
  onCancel,
}: {
  state: ConfirmDialogState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!state.open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
        <div
          className="bg-card rounded-xl border border-border shadow-[0_8px_40px_rgba(0,0,0,0.06)] max-w-[360px] w-full px-7 py-6"
          style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-[16px] font-semibold text-foreground mb-2 tracking-tight">
            {state.title}
          </h3>
          {state.description && (
            <p className="text-[13px] text-tertiary-foreground mb-6 leading-relaxed">
              {state.description}
            </p>
          )}
          <div className="flex justify-end gap-2.5">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors"
            >
              {state.cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 rounded-xl text-sm border border-transparent bg-foreground text-background hover:bg-foreground-intense transition-colors"
            >
              {state.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
