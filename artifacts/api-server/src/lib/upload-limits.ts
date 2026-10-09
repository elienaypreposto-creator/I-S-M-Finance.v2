/**
 * Limites de upload (ISMF-8). Reintroduz o que o commit aa0493e removeu.
 *
 * Extrato OFX (`/conciliacoes/pre-analise` e `/conciliacoes/importar`):
 * - até 10 MB, 1 arquivo, poucos campos pequenos (conta_id, apenas_novas);
 * - extensão .ofx e mimetype compatível, rejeitados ANTES de bufferizar;
 * - conteúdo conferido depois (`pareceOfx`) — extensão é só a primeira linha.
 *
 * Memória: o arquivo vai inteiro para a RAM (memoryStorage); sem teto, um
 * upload de centenas de MB derruba o processo de todas as empresas.
 *
 * O nginx (repo e borda) precisa deixar passar um pouco mais que isso
 * (`client_max_body_size 11m`) para o 413 amigável vir da API.
 */
import multer from "multer";

export const OFX_MAX_BYTES = 10 * 1024 * 1024;
export const OFX_MAX_MB = OFX_MAX_BYTES / (1024 * 1024);

/** Mimetypes que navegadores/bancos usam para OFX (é inconsistente). */
const OFX_MIMETYPES = new Set([
    "",
    "application/octet-stream",
    "application/x-ofx",
    "application/ofx",
    "application/vnd.intu.qfx",
    "application/x-qfx",
    "text/plain",
    "text/xml",
    "application/xml",
    "text/x-ofx",
    "text/sgml",
]);

const extensao = (nome: string) => (nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "");

export const uploadExtratoOfx = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: OFX_MAX_BYTES,
        files: 1,
        fields: 10,
        fieldSize: 64 * 1024,
        fieldNameSize: 100,
        parts: 12,
        headerPairs: 100,
    },
    fileFilter: (_req, file, cb) => {
        if (extensao(file.originalname) !== "ofx" || !OFX_MIMETYPES.has(file.mimetype.toLowerCase())) {
            cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
            return;
        }
        cb(null, true);
    },
});

/**
 * Conteúdo tem cara de OFX: cabeçalho SGML (`OFXHEADER:`), XML (`<?OFX`) ou
 * a tag `<OFX>` no início, e nada de byte nulo (binário renomeado).
 */
export function pareceOfx(buf: Buffer): boolean {
    const inicio = buf.subarray(0, 4096);
    if (inicio.includes(0)) return false;
    const texto = inicio.toString("latin1").replace(/^﻿|^\xEF\xBB\xBF/, "");
    return /OFXHEADER\s*:|<\?OFX|<OFX>/i.test(texto);
}
