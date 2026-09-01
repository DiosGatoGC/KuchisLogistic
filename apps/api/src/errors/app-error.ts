export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export function unauthorized(
  code = "AUTH_REQUIRED",
  message = "Se requiere autenticación."
) {
  return new AppError(401, code, message);
}

export function forbidden(
  code = "CAPABILITY_REQUIRED",
  message = "No tienes permiso para realizar esta acción."
) {
  return new AppError(403, code, message);
}
