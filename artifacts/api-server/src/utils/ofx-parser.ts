/**
 * Minimal OFX/SGML bank statement parser.
 *
 * Supports both legacy SGML-OFX (no closing tags, used by most Brazilian banks)
 * and modern XML-OFX formats.
 *
 * Zero external dependencies - uses only Node.js built-ins.
 */

import {centsToDecimalString, toCents} from "./money.js";

export interface OFXTransaction {
    /** Unique identifier provided by the bank (FITID), or stable surrogate. */
    fitid: string;
    /** "credito" for incoming cash, "debito" for outgoing. */
    tipo: "credito" | "debito";
    /** ISO date YYYY-MM-DD. */
    data: string;
    /** Absolute monetary value, 2 decimal places (string, e.g. "150.00"). */
    valor: string;
    descricao: string;
    /** Ordinal within (data, tipo, valor) group - for hash_linha (DEF-02). */
    ordinal_no_grupo: number;
    /**
     * Saldo posicional após esta linha, se o arquivo trouxer (comum em CSV
     * de banco brasileiro). OFX/STMTTRN não tem saldo por transação - sempre
     * null neste parser. Fallback: digitação manual via
     * PATCH /conciliacoes/linhas/:linha_id/saldo (Card 41, DEF-04).
     */
    saldo_pos_linha: string | null;
}

export interface OFXParseResult {
    periodo_inicio: string;
    periodo_fim: string;
    /** Metadado informativo do arquivo (DTSTART/DTEND), se presente. */
    periodo_arquivo_inicio: string | null;
    periodo_arquivo_fim: string | null;
    /** Saldo informado pelo banco (LEDGERBAL / BALAMT), se presente (DEF-03). */
    saldo_final_banco: string | null;
    saldo_banco_data: string | null;
    transacoes: OFXTransaction[];
}

function extractTag(block: string, tag: string): string | null {
    const xml = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
    if (xml) return xml[1].trim();
    const sgml = block.match(new RegExp(`<${tag}>([^\n<]*)`, "i"));
    if (sgml) return sgml[1].trim();
    return null;
}

function parseDate(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length < 8) throw new Error(`Data OFX inválida: "${raw}"`);
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

const CREDIT_TYPES = new Set(["CREDIT", "INT", "DIV", "DEP", "DIRECTDEP"]);

function resolveMovimento(trnType: string, amountCentsSigned: number): "credito" | "debito" {
    const t = trnType.toUpperCase();
    if (CREDIT_TYPES.has(t)) return "credito";
    if (["DEBIT", "ATM", "POS", "PAYMENT", "DIRECTDEBIT", "FEE", "SRVCHG", "CHECK"].includes(t)) {
        return "debito";
    }
    return amountCentsSigned >= 0 ? "credito" : "debito";
}

function parseLedgerBal(content: string): { saldo: string | null; data: string | null } {
    const ledgerBlock =
        content.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|(?=<AVAILBAL>|<BANKTRANLIST>|<STMTTRN>))/i)?.[1] ??
        content;
    const balAmt = extractTag(ledgerBlock, "BALAMT") ?? extractTag(content, "BALAMT");
    const dtAsOf = extractTag(ledgerBlock, "DTASOF") ?? extractTag(content, "DTASOF");
    if (balAmt == null || balAmt === "") {
        return {saldo: null, data: null};
    }
    const cents = toCents(balAmt.replace(",", "."));
    return {
        saldo: centsToDecimalString(cents),
        data: dtAsOf ? parseDate(dtAsOf) : null,
    };
}

/**
 * Parses an OFX bank statement buffer and returns structured transactions.
 */
export function parseOFX(buffer: Buffer): OFXParseResult {
    let content = buffer.toString("utf-8");
    if (content.includes("\uFFFD")) {
        content = buffer.toString("latin1");
    }
    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const dtStart = extractTag(content, "DTSTART");
    const dtEnd = extractTag(content, "DTEND");
    const {saldo: saldo_final_banco, data: saldo_banco_data} = parseLedgerBal(content);

    const stmtRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi;
    const transacoes: OFXTransaction[] = [];
    const grupos = new Map<string, number>();
    let match: RegExpExecArray | null;

    while ((match = stmtRegex.exec(content)) !== null) {
        const block = match[1];

        const trnType = extractTag(block, "TRNTYPE") ?? "OTHER";
        const dtRaw = extractTag(block, "DTPOSTED") ?? extractTag(block, "DTUSER") ?? "";
        const amtRaw = extractTag(block, "TRNAMT") ?? "0";
        const fitidRaw = extractTag(block, "FITID");
        const memo = (extractTag(block, "MEMO") ?? extractTag(block, "NAME") ?? "").slice(0, 250);

        const amountCentsSigned = toCents(amtRaw.replace(",", "."));
        const data = parseDate(dtRaw);
        const tipo = resolveMovimento(trnType, amountCentsSigned);
        const valor = centsToDecimalString(Math.abs(amountCentsSigned));

        const groupKey = `${data}|${tipo}|${valor}`;
        const ordinal = grupos.get(groupKey) ?? 0;
        grupos.set(groupKey, ordinal + 1);

        const fitid =
            fitidRaw?.trim() || `${data}_${tipo}_${valor}_${ordinal}`;

        transacoes.push({
            fitid,
            tipo,
            data,
            valor,
            descricao: memo,
            ordinal_no_grupo: ordinal,
            saldo_pos_linha: null,
        });
    }

    if (transacoes.length === 0) {
        throw new Error(
            "Nenhuma transação <STMTTRN> encontrada. Verifique se o arquivo é um extrato OFX válido.",
        );
    }

    const datas = transacoes.map((t) => t.data).sort();
    const periodo_inicio = datas[0]!;
    const periodo_fim = datas[datas.length - 1]!;

    return {
        periodo_inicio,
        periodo_fim,
        periodo_arquivo_inicio: dtStart ? parseDate(dtStart) : null,
        periodo_arquivo_fim: dtEnd ? parseDate(dtEnd) : null,
        saldo_final_banco,
        saldo_banco_data,
        transacoes,
    };
}