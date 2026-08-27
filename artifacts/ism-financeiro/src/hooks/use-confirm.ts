import { useState, useCallback, useRef } from "react";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "destructive" aplica cor vermelha no botão de confirmar */
  variant?: "default" | "destructive";
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────


export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    title: "",
    description: undefined,
    confirmLabel: "Confirmar",
    cancelLabel: "Cancelar",
    variant: "default",
  });

  // Ref para guardar o resolve da Promise pendente
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    setState({
      open: true,
      confirmLabel: "Confirmar",
      cancelLabel: "Cancelar",
      variant: "default",
      ...options,
    });

    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  return {
    confirm,

    ConfirmDialogProps: {
      open: state.open,
      title: state.title,
      description: state.description,
      confirmLabel: state.confirmLabel ?? "Confirmar",
      cancelLabel: state.cancelLabel ?? "Cancelar",
      variant: state.variant ?? "default",
      onConfirm: handleConfirm,
      onCancel: handleCancel,
    },
  };
}