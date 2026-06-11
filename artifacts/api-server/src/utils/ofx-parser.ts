/**
 * Minimal OFX/SGML bank statement parser.
 *
 * Supports both legacy SGML-OFX (no closing tags, used by most Brazilian banks)
 * and modern XML-OFX formats.  Only parses the fields required for reconciliation:
 * FITID, DTPOSTED, TRNAMT, TRNTYPE, MEMO/NAME.
 *
 * Zero external dependencies — uses only Node.js built-ins.
 */

export interface OFXTransaction {
    /** Unique identifier provided by the bank (FITID). */
    fitid: string;
    /** "credito" for incoming cash, "debito" for outgoing. */
    tipo: "credito" | "debito";
    /** ISO date YYYY-MM-DD. */
    data: string;
    /** Absolute monetary value, 2 decimal places (string, e.g. "150.00"). */
    valor: string;
    descricao: string;
}

export interface OFXParseResult {
    periodo_inicio: string;
    periodo_fim: string;
    transacoes: OFXTransaction[];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Reads a tag value from an OFX block.
 * Handles both XML (<TAG>value</TAG>) and SGML (<TAG>value\n) formats.
 */
function extractTag(block: string, tag: string): string | null {
    // XML format — value ends at closing tag
    const xml = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
    if (xml) return xml[1].trim();
    // SGML format — value ends at next line-break or next tag
    const sgml = block.match(new RegExp(`<${tag}>([^\n<]*)`, "i"));
    if (sgml) return sgml[1].trim();
    return null;
}

/**
 * Converts OFX date strings (YYYYMMDD, YYYYMMDDHHMMSS, YYYYMMDDHHMMSS[-TZ])
 * to ISO date YYYY-MM-DD.
 */
function parseDate(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length < 8) throw new Error(`Data OFX inválida: "${raw}"`);
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * Maps an OFX TRNTYPE to our internal movement type.
 * Falls back to the sign of the amount for ambiguous types (XFER, OTHER, etc.).
 */
const CREDIT_TYPES = new Set([
    "CREDIT", "INT", "DIV", "DEP", "DIRECTDEP",
]);

function resolveMovimento(trnType: string, amount: number): "credito" | "debito" {
    const t = trnType.toUpperCase();
    if (CREDIT_TYPES.has(t)) return "credito";
    if (["DEBIT", "ATM", "POS", "PAYMENT", "DIRECTDEBIT", "FEE", "SRVCHG", "CHECK"].includes(t))
        return "debito";
    return amount >= 0 ? "credito" : "debito";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses an OFX bank statement buffer and returns structured transactions.
 *
 * Throws an `Error` with a descriptive message if the file is malformed or
 * contains no transactions — callers should map this to a 422 response.
 */
export function parseOFX(buffer: Buffer): OFXParseResult {
    // Brazilian banks often use ISO-8859-1 (Latin-1); try UTF-8 first.
    let content = buffer.toString("utf-8");
    if (content.includes("\uFFFD")) {
        content = buffer.toString("latin1");
    }
    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const dtStart = extractTag(content, "DTSTART");
    const dtEnd = extractTag(content, "DTEND");

    // XML-OFX:  blocks are terminated by </STMTTRN> (consumed by the non-capturing group).
    // SGML-OFX: blocks have NO closing tag (Itaú, Bradesco, etc.).  A lookahead stops the
    //           lazy quantifier at the next <STMTTRN> opening or at </BANKTRANLIST>.
    const stmtRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi;
    const transacoes: OFXTransaction[] = [];
    let match: RegExpExecArray | null;

    while ((match = stmtRegex.exec(content)) !== null) {
        const block = match[1];

        const trnType = extractTag(block, "TRNTYPE") ?? "OTHER";
        const dtRaw = extractTag(block, "DTPOSTED") ?? extractTag(block, "DTUSER") ?? "";
        const amtRaw = extractTag(block, "TRNAMT") ?? "0";
        const fitidRaw = extractTag(block, "FITID");
        const memo = (extractTag(block, "MEMO") ?? extractTag(block, "NAME") ?? "").slice(0, 250);

        const amount = parseFloat(amtRaw.replace(",", "."));
        if (isNaN(amount)) continue; // skip malformed rows silently

        const data = parseDate(dtRaw);
        const tipo = resolveMovimento(trnType, amount);
        const valor = Math.abs(amount).toFixed(2);
        // Use FITID or generate a stable surrogate from transaction data
        const fitid = fitidRaw?.trim() || `${data}_${tipo}_${valor}_${transacoes.length}`;

        transacoes.push({fitid, tipo, data, valor, descricao: memo});
    }

    if (transacoes.length === 0) {
        throw new Error(
            "Nenhuma transação <STMTTRN> encontrada. Verifique se o arquivo é um extrato OFX válido.",
        );
    }

    const datas = transacoes.map((t) => t.data).sort();
    const periodo_inicio = dtStart ? parseDate(dtStart) : datas[0];
    const periodo_fim = dtEnd ? parseDate(dtEnd) : datas[datas.length - 1];

    return {periodo_inicio, periodo_fim, transacoes};
}
