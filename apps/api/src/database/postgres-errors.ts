interface PostgresLikeError {
  code?: unknown;
}

export function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as PostgresLikeError).code === "23505"
  );
}
