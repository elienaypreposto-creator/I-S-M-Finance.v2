#!/usr/bin/env node
// Gera artifacts/ism-financeiro/src/lib/bancos-bcb.ts a partir da lista oficial
// de participantes do STR do Banco Central (código COMPE + nome reduzido).
// NÃO roda no build: execute à mão quando quiser atualizar a lista e revise o diff.
//
//   node scripts/gerar-bancos-bcb.mjs                 (baixa o CSV do BCB)
//   node scripts/gerar-bancos-bcb.mjs ParticipantesSTR.csv   (usa um CSV local)
//
// Fonte: https://www.bcb.gov.br/content/estabilidadefinanceira/str1/ParticipantesSTR.csv
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const URL_BCB = "https://www.bcb.gov.br/content/estabilidadefinanceira/str1/ParticipantesSTR.csv";
const SAIDA = resolve(dirname(fileURLToPath(import.meta.url)), "../artifacts/ism-financeiro/src/lib/bancos-bcb.ts");

// Siglas com mais de 3 letras que devem continuar em caixa alta.
const SIGLAS = new Set([
    "BNDES", "ICBC", "HSBC", "BBVA", "MUFG", "AMRO", "DTVM", "CCTVM", "CTVM", "SCFI", "SCMEPP", "CECM", "ICAP",
]);
// Palavras curtas que não são siglas (o resto com até 3 letras fica em caixa alta).
const PALAVRAS_CURTAS = new Set(["LUZ", "VIA", "LAR", "SER", "MAX", "PAY", "GET", "ALL", "IN", "OUT", "WE", "RED", "BIT", "NU"]);
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "la", "del"]);
const EXPANSOES = new Map([
    ["BCO", "Banco"], ["BCO.", "Banco"], ["EST.", "Estado"], ["FINANC.", "Financiamentos"], ["COR.", "Corretora"],
    ["DES.", "Desenvolvimento"],
    ["CIA", "Cia."],
]);
const SUFIXOS_SOCIETARIOS = new Set(["S.A.", "S.A", "S/A", "SA", "LTDA.", "LTDA"]);

function lerCsv(texto) {
    const linhas = [];
    let campo = "";
    let linha = [];
    let aspas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (aspas) {
            if (c === '"' && texto[i + 1] === '"') {
                campo += '"';
                i++;
            } else if (c === '"') aspas = false;
            else campo += c;
        } else if (c === '"') aspas = true;
        else if (c === ",") {
            linha.push(campo);
            campo = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && texto[i + 1] === "\n") i++;
            linha.push(campo);
            if (linha.some((v) => v.trim())) linhas.push(linha);
            linha = [];
            campo = "";
        } else campo += c;
    }
    if (campo || linha.length) {
        linha.push(campo);
        linhas.push(linha);
    }
    return linhas;
}

function formatarPalavra(palavra, primeira) {
    // Mantém palavras que já vêm com caixa mista na fonte (ex.: "Kirton").
    if (/\p{Ll}/u.test(palavra) && /\p{Lu}/u.test(palavra)) return palavra;
    const min = palavra.toLocaleLowerCase("pt-BR");
    if (!primeira && MINUSCULAS.has(min)) return min;
    if (SIGLAS.has(palavra) || (palavra.length <= 3 && !PALAVRAS_CURTAS.has(palavra)) || (/\d/.test(palavra) && palavra.length <= 4)) {
        return palavra.toLocaleUpperCase("pt-BR");
    }
    return min.charAt(0).toLocaleUpperCase("pt-BR") + min.slice(1);
}

function nomeLegivel(nomeReduzido) {
    let nome = nomeReduzido.replace(/\s+/g, " ").trim();
    let emLiquidacao = false;
    nome = nome.replace(/\s*-?\s*EM LIQUIDAÇÃO EXTRAJUDICIAL\s*$/i, () => {
        emLiquidacao = true;
        return "";
    });
    nome = nome.replace(/S\.A\.(?=\S)/g, "S.A. ").replace(/ S A$/, "");
    const tokens = nome.split(" ")
        .filter((t) => !SUFIXOS_SOCIETARIOS.has(t.toUpperCase()))
        .map((t) => EXPANSOES.get(t.toUpperCase()) ?? t);
    nome = tokens.join(" ").replace(/[\s,-]+$/, "").replace(/(\p{L}{4,})\.$/u, "$1").replace(/\s+-\s+-\s+/g, " - ").trim();
    let primeira = true;
    nome = nome.replace(/[\p{L}\p{N}]+/gu, (palavra) => {
        const r = formatarPalavra(palavra, primeira);
        primeira = false;
        return r;
    });
    return emLiquidacao ? `${nome} (em liquidação)` : nome;
}

async function obterCsv() {
    const arquivo = process.argv[2];
    if (arquivo) return readFileSync(arquivo, "utf8");
    const resp = await fetch(URL_BCB);
    if (!resp.ok) throw new Error(`Falha ao baixar ${URL_BCB}: HTTP ${resp.status}`);
    return await resp.text();
}

const linhas = lerCsv((await obterCsv()).replace(/^﻿/, ""));
const cabecalho = linhas.shift();
const iCodigo = cabecalho.findIndex((c) => /^N.mero_C.digo$/.test(c));
const iNome = cabecalho.indexOf("Nome_Reduzido");
if (iCodigo < 0 || iNome < 0) throw new Error(`Cabeçalho inesperado: ${cabecalho.join(",")}`);

const porCodigo = new Map();
for (const l of linhas) {
    const codigo = (l[iCodigo] ?? "").trim();
    // Descarta quem não tem código COMPE (n/a, "0" das câmaras da B3 etc.).
    if (!/^\d{1,3}$/.test(codigo) || Number(codigo) === 0) continue;
    const cod = codigo.padStart(3, "0");
    if (!porCodigo.has(cod)) porCodigo.set(cod, nomeLegivel(l[iNome] ?? ""));
}

const bancos = [...porCodigo.entries()].sort(([a], [b]) => a.localeCompare(b));
const agora = new Date();
const hoje = [agora.getFullYear(), agora.getMonth() + 1, agora.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
const corpo = bancos.map(([c, n]) => `    ["${c}", ${JSON.stringify(n)}],`).join("\n");
writeFileSync(
    SAIDA,
    `// Arquivo gerado por scripts/gerar-bancos-bcb.mjs - não edite à mão.
// Fonte: Banco Central do Brasil, participantes do STR (ParticipantesSTR.csv), baixado em ${hoje}.
// ${bancos.length} instituições com código COMPE: [código, nome reduzido legível].
export const BANCOS_BCB: ReadonlyArray<readonly [codigo: string, nome: string]> = [
${corpo}
];
`,
);
console.log(`${bancos.length} bancos gravados em ${SAIDA}`);
