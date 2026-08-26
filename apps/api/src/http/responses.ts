import type { Response } from "express";

export function sendSuccess<T>(res: Response, body: T, statusCode = 200) {
  return res.status(statusCode).json(body);
}
