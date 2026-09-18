import type { Response } from "express";
import {clientErrorDetails, logInternalError, requestIdFrom} from "./safe-error";

export const successResponse = (
  res: Response,
  data: unknown,
  meta: Record<string, unknown> | null = null,
  status = 200,
) => {
  return res.status(status).json({
    data,
    meta,
    errors: null,
  });
};

/**
 * Envelope de erro. O 5.º argumento é a *causa* (Error real) - usada no log.
 * Em produção, 5xx nunca serializam essa causa para o cliente; vão `{ requestId }`.
 */
export const errorResponse = (
  res: Response,
  status: number,
  code: string,
  message: string,
  cause: unknown = null,
) => {
  const requestId = requestIdFrom(res);

  if (status >= 500) {
    logInternalError(requestId, cause ?? new Error(`${code}: ${message}`));
  }

  return res.status(status).json({
    data: null,
    meta: null,
    errors: [
      {
        code,
        message,
        details: clientErrorDetails(status, cause, process.env.NODE_ENV, requestId),
      },
    ],
  });
};
