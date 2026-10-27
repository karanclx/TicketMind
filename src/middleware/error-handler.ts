import type { NextFunction, Request, Response } from "express"

import { ZodError } from "zod"

import { logger } from "../config/logger.js"
import { AppError } from "../lib/errors.js"

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: error.issues })
    return
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details
    })
    return
  }

  logger.error({ error }, "Unhandled server error")

  res.status(500).json({
    error: "Internal Server Error",
    code: "INTERNAL_ERROR"
  })
}
