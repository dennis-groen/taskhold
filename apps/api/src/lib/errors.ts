/** What went wrong, in terms the HTTP layer can turn into a status code */
export type ErrorKind =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_many_requests"
  | "unavailable";

/** Body of every error response */
export type ApiErrorBody = { error: { code: string; message: string } };

/**
 * A failure the client can act on. Services throw these without knowing about HTTP;
 * `code` is stable for clients to branch on, `message` is written for people.
 */
export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly code: string;

  constructor(kind: ErrorKind, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.code = code;
  }
}
