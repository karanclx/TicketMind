export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly details?: unknown

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR", details?: unknown) {
    super(message)
    this.name = "AppError"
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 404, "NOT_FOUND", details)
    this.name = "NotFoundError"
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details)
    this.name = "ValidationError"
  }
}
