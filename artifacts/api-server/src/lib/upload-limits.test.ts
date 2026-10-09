/**
 * Limites do upload de OFX (ISMF-8): app mínimo com o mesmo multer e o
 * errorHandler de produção.
 */
import assert from "node:assert/strict";
import type http from "node:http";
import type {AddressInfo} from "node:net";
import {after, before, describe, it} from "node:test";
import express from "express";
import {OFX_MAX_BYTES, pareceOfx, uploadExtratoOfx} from "./upload-limits.js";
import {errorHandler} from "../middlewares/error-handler.js";

const OFX_SGML = "OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102\r\n\r\n<OFX>\r\n<SIGNONMSGSRSV1>";
const OFX_XML = '<?xml version="1.0"?>\n<?OFX OFXHEADER="200" VERSION="211"?>\n<OFX>';

function ofxDeTamanho(bytes: number): Buffer {
    const buf = Buffer.alloc(bytes, "A");
    buf.write(OFX_SGML, 0, "latin1");
    return buf;
}

let server: http.Server;
let base: string;

async function enviar(arquivos: {nome: string; conteudo: Buffer; tipo?: string}[]) {
    const fd = new FormData();
    fd.append("conta_id", "1");
    for (const a of arquivos) {
        fd.append("arquivo", new Blob([new Uint8Array(a.conteudo)], {type: a.tipo ?? "application/octet-stream"}), a.nome);
    }
    const res = await fetch(`${base}/upload`, {method: "POST", body: fd});
    const body = (await res.json()) as {errors?: {code: string}[]; tamanho?: number};
    return {status: res.status, code: body.errors?.[0]?.code, tamanho: body.tamanho};
}

describe("pareceOfx", () => {
    it("aceita cabeçalho SGML, XML e BOM", () => {
        assert.equal(pareceOfx(Buffer.from(OFX_SGML)), true);
        assert.equal(pareceOfx(Buffer.from(OFX_XML)), true);
        assert.equal(pareceOfx(Buffer.from("﻿" + OFX_SGML)), true);
    });
    it("recusa binário renomeado e texto qualquer", () => {
        const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
        assert.equal(pareceOfx(exe), false);
        assert.equal(pareceOfx(Buffer.from("data;valor\n01/01;10")), false);
    });
});

describe("uploadExtratoOfx", () => {
    before(async () => {
        const app = express();
        app.post("/upload", uploadExtratoOfx.single("arquivo"), (req, res) => {
            if (!req.file || !pareceOfx(req.file.buffer)) {
                res.status(400).json({errors: [{code: "VALIDATION_ERROR"}]});
                return;
            }
            res.json({tamanho: req.file.size});
        });
        app.use(errorHandler);
        server = app.listen(0, "127.0.0.1");
        await new Promise<void>((r) => server.once("listening", () => r()));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    after(() => server.close());

    it("OFX válido de 2 MB passa", async () => {
        const r = await enviar([{nome: "extrato.ofx", conteudo: ofxDeTamanho(2 * 1024 * 1024)}]);
        assert.equal(r.status, 200);
        assert.equal(r.tamanho, 2 * 1024 * 1024);
    });

    it("acima de 10 MB -> 413 LIMIT_FILE_SIZE", async () => {
        const r = await enviar([{nome: "grande.ofx", conteudo: ofxDeTamanho(OFX_MAX_BYTES + 1)}]);
        assert.equal(r.status, 413);
        assert.equal(r.code, "LIMIT_FILE_SIZE");
    });

    it("extensão errada -> 400", async () => {
        const r = await enviar([{nome: "virus.exe", conteudo: Buffer.from(OFX_SGML)}]);
        assert.equal(r.status, 400);
        assert.equal(r.code, "LIMIT_UNEXPECTED_FILE");
    });

    it("mimetype incompatível -> 400", async () => {
        const r = await enviar([
            {nome: "extrato.ofx", conteudo: Buffer.from(OFX_SGML), tipo: "application/x-msdownload"},
        ]);
        assert.equal(r.status, 400);
    });

    it(".exe renomeado para .ofx -> 400 (conteúdo)", async () => {
        const exe = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(1024)]);
        const r = await enviar([{nome: "extrato.ofx", conteudo: exe}]);
        assert.equal(r.status, 400);
        assert.equal(r.code, "VALIDATION_ERROR");
    });

    it("mais de um arquivo -> 400", async () => {
        const um = {nome: "a.ofx", conteudo: Buffer.from(OFX_SGML)};
        const r = await enviar([um, {...um, nome: "b.ofx"}]);
        assert.equal(r.status, 400);
    });
});
