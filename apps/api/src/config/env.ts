import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // Public origin the browser uses; in dev that's the Vite server, which proxies /api
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "Use at least 32 characters (pnpm exec auth secret)"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  // IPs or CIDR ranges of reverse proxies in front of the API, comma-separated. Empty when the
  // API is reached directly. Decides which X-Forwarded-For hop is the real client.
  TRUSTED_PROXIES: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // json for log collectors; pretty is readable in a terminal. Defaults to pretty in development.
  LOG_FORMAT: z.enum(["json", "pretty"]).optional(),
  // Share of successful, fast requests to log (0 to 1). Errors and slow requests are always kept.
  LOG_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
});

const parsed = envSchema.safeParse(process.env);

// Fail at startup with every problem listed, instead of at the first request that needs a value
if (!parsed.success) {
  throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
}

export const env = {
  ...parsed.data,
  LOG_FORMAT:
    parsed.data.LOG_FORMAT ?? (parsed.data.NODE_ENV === "development" ? "pretty" : "json"),
};
