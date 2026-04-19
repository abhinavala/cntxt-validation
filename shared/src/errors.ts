/**
 * Structured error types for the Warden system.
 */

export enum ErrorCode {
  NO_ACTIVE_RUN = "NO_ACTIVE_RUN",
  NO_CREDENTIAL = "NO_CREDENTIAL",
  SCOPE_EXCEEDS_CEILING = "SCOPE_EXCEEDS_CEILING",
  INVALID_TTL = "INVALID_TTL",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export class WardenError extends Error {
  public readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "WardenError";
    this.code = code;
  }
}

export type { ErrorCode as ErrorCodeType };
