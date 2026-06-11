/**
 * CSV bank statement parser for Brazilian formats.
 *
 * Handles:
 *  - Separators `,` and `;` (auto-detected)
 *  - Date formats DD/MM/YYYY, DD/MM/YY and YYYY-MM-DD
 *  - Brazilian currency notation: 1.500,50 → 1500.50
 *  - Parentheses negatives: (1.500,00) → -1500.00
 *  - Single signed value column OR split Débito / Crédito columns
 *  - Quoted CSV fields
 *  - Informational header rows before the actual column header
 *
 * Returns the same OFXParseResult contract as ofx-parser.ts so the
 * reconciliation route treats both formats identically.
 *
 * Zero external dependencies.
 */

import type {OFXParseResult, OFXTransaction} from "./ofx-parser";

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Counts `;` vs `,` in the first few lines to pick the field delimiter. */
function detectSeparator(sample: string[]): "," | ";" {
    const joined = sample.join("\n");
    const semis = (joined.match(/;/g) ?? []).length;
    const commas = (joined.match(/,/g) ?? []).length;
    return semis >= commas ? ";" : ",";
}

/** Splits a single CSV line respecting double-quoted fields. */
function splitLine(line: string, sep: string): string[] {
    const fields: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
        if (ch === '"') {
            inQ = !inQ;
        } else if (ch === sep && !inQ) {
            fields.push(cur.trim());
            cur = "";
        } else {
            cur += ch;
        }
    }
    fields.push(cur.trim());
    return fields;
}

/**
 * Converts a Brazilian monetary string to a signed float.
 *
 * Examples that are handled:
 *   "1.500,50"  → 1500.50  (BR thousand-sep + decimal-comma)
 *   "1500,50"   → 1500.50  (decimal-comma only)
 *   "-150.00"   → -150.00  (plain negative)
 *   "(1.500,00)" → -1500.00 (parentheses notation)
 *   "1,500.50"  → 1500.50  (US thousand-sep + decimal-dot)
 */
function parseBRCurrency(raw: string): number {
    const s = raw.trim().replace(/\s/g, "");
    if (!s || s === "-" || s === "+") return NaN;

    const parens = s.startsWith("(") && s.endsWith(")");
    const str = parens ? s.slice(1, -1) : s;

    let normalized: string;
    const hasComma = str.includes(",");
    const hasDot = str.includes(".");

    if (hasComma && hasDot) {
        // Whichever separator comes last is the decimal separator.
        normalized = str.lastIndexOf(",") > str.lastIndexOf(".")
            ? str.replace(/\./g, "").replace(",", ".")  // BR: 1.500,50
            : str.replace(/,/g, "");                     // US: 1,500.50
    } else if (hasComma) {
        normalized = str.replace(",", ".");              // 1500,50
    } else {
        normalized = str;                                // 1500.50 or 1500
    }

    const val = parseFloat(normalized);
    return parens ? -Math.abs(val) : val;
}

/**
 * Normalises DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD, and YYYY/MM/DD to ISO YYYY-MM-DD.
 * Throws if the date is unrecognisable.
 */
function parseCSVDate(raw: string): string {
    const s = raw.trim();

    const m1 = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;

    const m2 = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
    if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;

    const m3 = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})$/);
    if (m3) {
        const yr = parseInt(m3[3], 10);
        const cent = yr > 50 ? "19" : "20";
        return `${cent}${m3[3].padStart(2, "0")}-${m3[2].padStart(2, "0")}-${m3[1].padStart(2, "0")}`;
    }

    throw new Error(`Data CSV inválida: "${raw}"`);
}

// Column keyword lists (checked after NFD normalisation, so accents are stripped).
const DATE_KEYS = ["data", "date", "dt", "vencimento"];
const DESC_KEYS = ["descri", "histor", "memo", "lancamento", "lancto", "detalhes", "complement"];
const VALUE_KEYS = ["valor", "amount", "value", "montante"];
const DEBIT_KEYS = ["debito", "saida", "saída", "debit", "despesa"];
const CREDIT_KEYS = ["credito", "entrada", "credit", "receita"];

function nfNorm(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchesCol(header: string, keywords: string[]): boolean {
    const h = nfNorm(header);
    return keywords.some(k => h.includes(nfNorm(k)));
}

interface ColMap {
    dateIdx: number;
    descIdx: number;
    valueIdx: number | null;
    debitIdx: number | null;
    creditIdx: number | null;
}

/**
 * Scans the header fields and maps each column to its semantic role.
 * Debit/Credit keywords are checked before the generic Value keyword so that
 * a column labelled "Crédito" is not misidentified as the generic value.
 */
function detectColumns(headers: string[]): ColMap {
    let dateIdx = -1, descIdx = -1, valueIdx = -1, debitIdx = -1, creditIdx = -1;

    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (dateIdx === -1 && matchesCol(h, DATE_KEYS)) {
            dateIdx = i;
            continue;
        }
        if (debitIdx === -1 && matchesCol(h, DEBIT_KEYS)) {
            debitIdx = i;
            continue;
        }
        if (creditIdx === -1 && matchesCol(h, CREDIT_KEYS)) {
            creditIdx = i;
            continue;
        }
        if (descIdx === -1 && matchesCol(h, DESC_KEYS)) {
            descIdx = i;
            continue;
        }
        if (valueIdx === -1 && matchesCol(h, VALUE_KEYS)) {
            valueIdx = i;
            continue;
        }
    }

    if (dateIdx === -1) {
        throw new Error("Cabeçalho CSV: coluna de data não encontrada.");
    }
    if (valueIdx === -1 && debitIdx === -1 && creditIdx === -1) {
        throw new Error("Cabeçalho CSV: coluna de valor não encontrada.");
    }

    return {
        dateIdx,
        descIdx,
        valueIdx: valueIdx === -1 ? null : valueIdx,
        debitIdx: debitIdx === -1 ? null : debitIdx,
        creditIdx: creditIdx === -1 ? null : creditIdx,
    };
}

/** Returns true when a split line contains both a date and a value header keyword. */
function looksLikeHeader(fields: string[]): boolean {
    const hasDate = fields.some(f => matchesCol(f, DATE_KEYS));
    const hasValue = fields.some(f =>
        matchesCol(f, VALUE_KEYS) || matchesCol(f, DEBIT_KEYS) || matchesCol(f, CREDIT_KEYS),
    );
    return hasDate && hasValue;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a Brazilian CSV bank statement buffer and returns structured transactions.
 *
 * Throws an `Error` with a descriptive message when:
 *  - the file is empty or has fewer than 2 lines
 *  - no recognisable column header is found in the first 20 non-empty lines
 *  - no valid transactions are found after the header
 *
 * Callers should map these errors to a 422 response.
 */
export function parseCSV(buffer: Buffer): OFXParseResult {
    let content = buffer.toString("utf-8");
    if (content.includes("\uFFFD")) content = buffer.toString("latin1");
    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const nonEmpty = content.split("\n").filter(l => l.trim().length > 0);
    if (nonEmpty.length < 2) {
        throw new Error("Arquivo CSV vazio ou sem dados suficientes.");
    }

    const sep = detectSeparator(nonEmpty.slice(0, 10));

    // Scan up to the first 20 non-empty lines to find the column header row.
    let headerIdx = -1;
    let cols: ColMap | null = null;

    for (let i = 0; i < Math.min(nonEmpty.length, 20); i++) {
        const fields = splitLine(nonEmpty[i], sep);
        if (!looksLikeHeader(fields)) continue;
        try {
            cols = detectColumns(fields);
            headerIdx = i;
            break;
        } catch {
            // This line looked like a header but column detection failed; keep scanning.
        }
    }

    if (!cols || headerIdx === -1) {
        throw new Error(
            "Cabeçalho CSV não reconhecido. O arquivo deve conter colunas identificáveis de Data, Descrição e Valor.",
        );
    }

    const transacoes: OFXTransaction[] = [];
    const maxIdx = Math.max(
        cols.dateIdx,
        cols.descIdx,
        cols.valueIdx ?? 0,
        cols.debitIdx ?? 0,
        cols.creditIdx ?? 0,
    );

    for (const line of nonEmpty.slice(headerIdx + 1)) {
        const fields = splitLine(line, sep);
        // Skip lines that are too short to contain all required columns (e.g., totals footer).
        if (fields.length <= maxIdx) continue;

        const rawDate = fields[cols.dateIdx] ?? "";
        if (!rawDate.trim()) continue;

        let data: string;
        try {
            data = parseCSVDate(rawDate);
        } catch {
            continue; // tolerate summary / totals rows that have non-date text in the date column
        }

        const descricao = (cols.descIdx >= 0 ? fields[cols.descIdx] ?? "" : "").trim().slice(0, 250);

        let tipo: "credito" | "debito";
        let valor: string;

        if (cols.valueIdx !== null) {
            // Single signed-value column (most Brazilian banks).
            const amount = parseBRCurrency(fields[cols.valueIdx] ?? "");
            if (isNaN(amount)) continue;
            tipo = amount >= 0 ? "credito" : "debito";
            valor = Math.abs(amount).toFixed(2);
        } else {
            // Split Débito / Crédito columns (e.g., Sicoob, some Caixa layouts).
            const debitAmt = cols.debitIdx !== null ? parseBRCurrency(fields[cols.debitIdx] ?? "") : NaN;
            const creditAmt = cols.creditIdx !== null ? parseBRCurrency(fields[cols.creditIdx] ?? "") : NaN;
            const hasDebit = !isNaN(debitAmt) && debitAmt !== 0;
            const hasCredit = !isNaN(creditAmt) && creditAmt !== 0;

            if (!hasDebit && !hasCredit) continue; // empty row (e.g., saldo inicial)

            if (hasCredit) {
                tipo = "credito";
                valor = Math.abs(creditAmt).toFixed(2);
            } else {
                tipo = "debito";
                valor = Math.abs(debitAmt).toFixed(2);
            }
        }

        // Deterministic surrogate ID: no FITID in CSV files.
        const slug = descricao.replace(/\s+/g, "_").slice(0, 20);
        const fitid = `${data}_${tipo}_${valor}_${slug}_${transacoes.length}`;

        transacoes.push({fitid, tipo, data, valor, descricao});
    }

    if (transacoes.length === 0) {
        throw new Error("Nenhuma transação encontrada no arquivo CSV.");
    }

    const datas = transacoes.map(t => t.data).sort();
    return {
        periodo_inicio: datas[0],
        periodo_fim: datas[datas.length - 1],
        transacoes,
    };
}
