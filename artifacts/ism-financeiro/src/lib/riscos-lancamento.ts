/**
 * Nível de risco do lançamento (CP) no formulário.
 *
 * O que fica gravado é `riscos` (lista de textos). Antes só as tags marcadas
 * iam para lá: com o nível sugerido pelo atraso ("Nível 1 - Alerta", "Sugestão
 * Ativa") e nenhuma tag marcada, o formulário mostrava o nível e o lançamento
 * era salvo com `riscos` vazio. Agora, sem tag marcada, o nível escolhido ou
 * sugerido é gravado pelo próprio rótulo; com tags, as tags (que já dizem o
 * nível). Ao reabrir, o nível volta pelo rótulo ou pelas tags gravadas.
 */

export type NiveisRisco = Record<number, {label: string; tags: string[]}>;

/** Nível sugerido pelos dias de atraso do vencimento (0 = sem sugestão). */
export function nivelSugeridoPorVencimento(vencimentoIso: string | null | undefined, hojeIso: string): number {
    const v = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(vencimentoIso ?? ""));
    const h = /^(\d{4})-(\d{2})-(\d{2})/.exec(hojeIso);
    if (!v || !h) return 0;
    const dia = (m: RegExpExecArray) => Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const atraso = Math.round((dia(h) - dia(v)) / 86_400_000);
    if (atraso >= 1 && atraso <= 15) return 1;
    if (atraso >= 16 && atraso <= 30) return 2;
    if (atraso >= 31 && atraso <= 60) return 3;
    if (atraso > 60) return 4;
    return 0;
}

const ehRotuloDeNivel = (risco: string, niveis: NiveisRisco) =>
    Object.values(niveis).some((n) => n.label === risco);

/** Nível que os riscos gravados indicam: rótulo do nível ou o maior nível das tags (0 = nenhum). */
export function nivelDosRiscos(riscos: readonly string[] | null | undefined, niveis: NiveisRisco): number {
    if (!riscos || riscos.length === 0) return 0;
    let maior = 0;
    for (const [nivelTexto, n] of Object.entries(niveis)) {
        const nivel = Number(nivelTexto);
        if (riscos.includes(n.label) || n.tags.some((t) => riscos.includes(t))) {
            maior = Math.max(maior, nivel);
        }
    }
    return maior;
}

/** `riscos` a gravar: as tags marcadas; sem tag, o rótulo do nível visível (0 = nada). */
export function riscosParaSalvar(marcados: readonly string[] | null | undefined, nivel: number, niveis: NiveisRisco): string[] {
    const tags = (marcados ?? []).filter((r) => !ehRotuloDeNivel(r, niveis));
    if (tags.length > 0) return tags;
    const rotulo = niveis[nivel]?.label;
    return nivel > 0 && rotulo ? [rotulo] : [];
}
