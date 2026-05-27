import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/app-error";

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      data: null,
      meta: null,
      errors: [
        {
          code: err.code,
          message: err.message,
          details: err.details ?? null,
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

  console.error("Unhandled error:", err);
  return res.status(500).json({
    data: null,
    meta: null,
    errors: [
      {
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor.",
        details: null,
      },
    ],
  });
};

