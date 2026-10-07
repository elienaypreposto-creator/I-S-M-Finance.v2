/**
 * Em produção o processo não fica no ar sem a marca que o volume LUKS abriu.
 * Quem decide a marca é o deploy (`scripts/lgpd-volume-luks.sh`), não um valor escrito à mão.
 */

export function assertDiscoCifrado(
    env: NodeJS.ProcessEnv,
    sair: (code: number) => never = process.exit,
): void {
    if (env.NODE_ENV === "production" && env.ISM_DISCO_CIFRADO !== "1") {
        console.error(
            "[boot][lgpd] ISM_DISCO_CIFRADO diferente de 1. O volume do Postgres não está aberto em LUKS. Arranque recusado.",
        );
        sair(1);
    }
}
