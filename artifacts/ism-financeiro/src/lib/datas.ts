// Datas civis (colunas `date`, "YYYY-MM-DD") não têm fuso. `new Date("2026-10-22")`
// lê como meia-noite UTC e, formatada no fuso do Brasil, vira 21/10. Por isso a data
// civil é tratada como texto ou montada no fuso local; timestamps (com hora) seguem
// no fuso local do navegador.

const DATA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;

const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", {day: "2-digit", month: "2-digit", year: "numeric"});

/** "YYYY-MM-DD" → Date à meia-noite local. Devolve null se não for data civil válida. */
export function parseDataCivil(valor: string | null | undefined): Date | null {
    const m = DATA_CIVIL.exec(String(valor ?? "").trim());
    if (!m) return null;
    const [, a, me, d] = m;
    const data = new Date(Number(a), Number(me) - 1, Number(d));
    if (data.getFullYear() !== Number(a) || data.getMonth() !== Number(me) - 1 || data.getDate() !== Number(d)) {
        return null;
    }
    return data;
}

/** Date → "YYYY-MM-DD" no fuso local (sem passar por UTC). */
export function dataCivilIso(data: Date): string {
    const a = data.getFullYear();
    const m = String(data.getMonth() + 1).padStart(2, "0");
    const d = String(data.getDate()).padStart(2, "0");
    return `${a}-${m}-${d}`;
}

/** Hoje no fuso local, "YYYY-MM-DD". Substitui `new Date().toISOString().slice(0, 10)` (UTC). */
export function hojeIsoLocal(): string {
    return dataCivilIso(new Date());
}

/**
 * dd/mm/aaaa. Data civil sai como está; timestamp (com hora) é exibido no fuso local.
 * Valor vazio devolve `vazio`; texto que não é data volta como veio.
 */
export function formatarData(valor: unknown, vazio = "-"): string {
    if (valor === null || valor === undefined || valor === "") return vazio;
    if (valor instanceof Date) {
        return Number.isNaN(valor.getTime()) ? vazio : FORMATO_DATA.format(valor);
    }
    const texto = String(valor).trim();
    const civil = DATA_CIVIL.exec(texto);
    if (civil) return `${civil[3]}/${civil[2]}/${civil[1]}`;
    const data = new Date(texto);
    if (Number.isNaN(data.getTime())) return texto;
    return FORMATO_DATA.format(data);
}
