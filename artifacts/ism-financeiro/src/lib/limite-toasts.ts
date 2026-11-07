/** Quantos avisos (toasts) ficam na tela ao mesmo tempo. */
export const TOAST_LIMIT = 3;

type ToastMinimo = {open?: boolean; action?: unknown};

/**
 * Lista de avisos depois de entrar um novo (o mais recente vem primeiro).
 * - Avisos já fechados saem na hora: não ocupam vaga de quem está na tela.
 * - Passou do limite: sai primeiro o aviso mais antigo SEM ação; um aviso com
 *   ação (ex.: "Desfazer") só sai se todos os anteriores tiverem ação.
 * O aviso novo sempre aparece.
 */
export function limitarToasts<T extends ToastMinimo>(lista: readonly T[], limite = TOAST_LIMIT): T[] {
    const abertos = lista.filter((t) => t.open !== false);
    while (abertos.length > limite) {
        let i = abertos.length - 1;
        while (i > 0 && abertos[i].action) i--;
        // i === 0 com ação: todos têm ação, sai o mais antigo. O novo (posição 0) nunca sai.
        abertos.splice(i === 0 ? abertos.length - 1 : i, 1);
    }
    return abertos;
}
