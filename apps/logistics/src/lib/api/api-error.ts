export type ApiErrorKind =
  | "bad-request"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "rate-limited"
  | "server"
  | "network"
  | "configuration"
  | "unexpected";

export class ApiError extends Error {
  public readonly kind: ApiErrorKind;
  public readonly status?: number;
  public readonly code?: string;

  constructor(
    kind: ApiErrorKind,
    message: string,
    status?: number,
    code?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export function isSessionInvalidError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.kind === "unauthorized" || error.code === "ACCOUNT_INACTIVE")
  );
}
