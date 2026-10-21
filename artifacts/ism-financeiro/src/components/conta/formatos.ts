export function iniciaisDe(nome: string): string {
    return nome
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("");
}

export function formatarQuando(iso: string | null | undefined): string {
    if (!iso) return "-";
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return "-";
    return data.toLocaleString("pt-BR", {dateStyle: "short", timeStyle: "short"}).replace(", ", " às ");
}

export function haQuantoTempo(iso: string | null | undefined): string {
    if (!iso) return "-";
    const diff = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diff) || diff < 0) return "agora";
    if (diff < 60_000) return "agora";
    const min = Math.round(diff / 60_000);
    if (min < 60) return `há ${min} min`;
    const horas = Math.round(min / 60);
    if (horas < 24) return horas === 1 ? "há 1 hora" : `há ${horas} horas`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}
