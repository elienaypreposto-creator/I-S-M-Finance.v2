import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { AppError } from "../utils/app-error";
import {clientErrorDetails, logInternalError, requestIdFrom} from "../utils/safe-error";
import { OFX_MAX_MB } from "../lib/upload-limits";

/** Mensagens amigáveis por código de erro do multer (limits/fileFilter). */
const MULTER_ERROR_MESSAGES: Partial<Record<MulterError["code"], string>> = {
  LIMIT_FILE_SIZE: `Arquivo excede o tamanho máximo permitido (${OFX_MAX_MB} MB).`,
  LIMIT_UNEXPECTED_FILE: "Arquivo não suportado ou campo de upload inesperado.",
  LIMIT_FILE_COUNT: "Envie apenas um arquivo por vez.",
  LIMIT_PART_COUNT: "Requisição de upload com partes demais.",
  LIMIT_FIELD_COUNT: "Requisição de upload com campos demais.",
  LIMIT_FIELD_VALUE: "Campo do formulário excede o tamanho permitido.",
  LIMIT_FIELD_KEY: "Nome de campo do formulário longo demais.",
};

/** Erro lançado por body-parser (express.json/urlencoded) ao estourar `limit`. */
function isPayloadTooLargeError(err: unknown): err is Error & { type: string; status: number } {
  return (
    err instanceof Error &&
    (err as { type?: unknown }).type === "entity.too.large" &&
    (err as { status?: unknown }).status === 413
  );
}

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = requestIdFrom(req);

  if (isPayloadTooLargeError(err)) {
    return res.status(413).json({
      data: null,
      meta: null,
      errors: [
        {
          code: "PAYLOAD_TOO_LARGE",
          message: "Corpo da requisição excede o tamanho máximo permitido (100kb).",
          details: null,
        },
      ],
    });
  }

  if (err instanceof MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({
      data: null,
      meta: null,
      errors: [
        {
          code: err.code,
          message: MULTER_ERROR_MESSAGES[err.code] ?? "Falha no upload do arquivo.",
          details: null,
        },
      ],
    });
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logInternalError(requestId, err, err.details);
    }
    return res.status(err.statusCode).json({
      data: null,
      meta: null,
      errors: [
        {
          code: err.code,
          message: err.message,
          details: clientErrorDetails(err.statusCode, err.details ?? err, process.env.NODE_ENV, requestId),
        },
      ],
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      data: null,
      meta: null,
      errors: [
        {
          code: "VALIDATION_ERROR",
          message: "Payload inválido.",
          details: err.issues,
        },
      ],
    });
  }

  logInternalError(requestId, err);
  return res.status(500).json({
    data: null,
    meta: null,
    errors: [
      {
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor.",
        details: clientErrorDetails(500, err, process.env.NODE_ENV, requestId),
      },
    ],
  });
};
