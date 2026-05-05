import type { Response } from "express";

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

export const errorResponse = (
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown = null,
) => {
  return res.status(status).json({
    data: null,
    meta: null,
    errors: [
      {
        code,
        message,
        details,
      },
    ],
  });
};

