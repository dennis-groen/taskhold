import { AppError } from "../../lib/errors.ts";

export const tooManyStreams = () =>
  new AppError(
    "too_many_requests",
    "TOO_MANY_STREAMS",
    "Too many live update connections are open. Close another tab or device and try again.",
  );
