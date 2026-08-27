import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2, Edit2, type LucideIcon } from "lucide-react";

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive" | "warning";
  /** Ícone customizado. Se omitido, usa Trash2 (destructive) ou AlertTriangle (demais). */
  icon?: LucideIcon;
  onConfirm: () => void;
  onCancel: () => void;
}

// ─── Componente ────────────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isDestructive = variant === "destructive";
  const isWarning     = variant === "warning";

  // Ícone: prop explícita > padrão por variante
  const Icon: LucideIcon = icon ?? (isDestructive ? Trash2 : AlertTriangle);

  const iconBg = isDestructive
    ? "bg-destructive/15 text-destructive"
    : isWarning
    ? "bg-amber-500/15 text-amber-400"
    : "bg-primary/15 text-primary";

  const confirmBg = isDestructive
    ? "bg-destructive hover:bg-destructive/90 shadow-lg shadow-destructive/20"
    : isWarning
    ? "bg-amber-500 hover:bg-amber-500/90 shadow-lg shadow-amber-500/20"
    : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20";

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent
        className="
          bg-card border border-white/10 rounded-2xl shadow-2xl
          w-full max-w-sm p-0 gap-0
          data-[state=open]:animate-in data-[state=closed]:animate-out
          data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
          data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
        "
      >
        {/* Ícone */}
        <div className="flex justify-center pt-7 pb-2">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${iconBg}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>

        <AlertDialogHeader className="px-6 pb-2 text-center sm:text-center">
          <AlertDialogTitle className="text-base font-bold text-white leading-snug">
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        <AlertDialogFooter className="flex flex-row gap-3 px-6 pb-6 pt-2 sm:flex-row sm:space-x-0">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${confirmBg}`}
          >
            {confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}