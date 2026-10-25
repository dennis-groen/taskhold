/** True when a Postgres unique constraint rejected the write (Drizzle wraps the pg error in `cause`) */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const pgError: unknown = err instanceof Error && err.cause ? err.cause : err;
  return (
    typeof pgError === "object" &&
    pgError !== null &&
    "code" in pgError &&
    pgError.code === "23505" &&
    "constraint" in pgError &&
    pgError.constraint === constraint
  );
}
