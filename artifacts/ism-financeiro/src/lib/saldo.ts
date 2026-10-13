export function classeSaldo(valor: number): string {
    if (valor > 0) return "text-emerald-400";
    if (valor < 0) return "text-red-400";
    return "text-muted-foreground";
}
