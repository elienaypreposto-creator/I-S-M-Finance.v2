import { cn } from "@/lib/utils";

type StatusType = 
  | "pendente" 
  | "pago" 
  | "recebido" 
  | "atrasado" 
  | "cancelado";

interface StatusBadgeProps {
  status: StatusType | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const getStatusStyles = (s: string) => {
    switch (s.toLowerCase()) {
      case "pago":
      case "recebido":
      case "conciliado":
      case "ativo":
        return "bg-success/15 text-success border-success/30";
      case "atrasado":
      case "inativo":
        return "bg-destructive/15 text-destructive border-destructive/30";
      case "pendente":
        return "bg-warning/15 text-warning border-warning/30";
      case "cancelado":
      case "ignorado":
        return "bg-muted text-muted-foreground border-border";
      case "vinculado":
        return "bg-primary/15 text-primary border-primary/30";
      default:
        return "bg-card text-foreground border-border";
    }
  };

  const getStatusLabel = (s: string) => {
    return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
  };

  return (
    <span 
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border shadow-sm",
        getStatusStyles(status),
        className
      )}
    >
      {getStatusLabel(status)}
    </span>
  );
}
