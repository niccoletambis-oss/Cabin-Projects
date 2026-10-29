// Server-only configuration. This module never serializes environment values.
export type Environment = Readonly<Record<string, string | undefined>>;
export function appEnvironment(env: Environment = process.env) {
  return (
    env.APP_ENV ??
    (env.NODE_ENV === "production"
      ? "production"
      : env.NODE_ENV === "test"
        ? "test"
        : "development")
  );
}
export function production(env: Environment = process.env) {
  return appEnvironment(env) === "production";
}
const integer = (value: string | undefined, fallback: number) =>
  value === undefined ? fallback : Number(value);
export function environmentProblems(env: Environment) {
  const errors: string[] = [];
  const add = (key: string, ok: boolean) => {
    if (!ok) errors.push(key);
  };
  const mode = appEnvironment(env);
  add("APP_ENV", ["development", "test", "production"].includes(mode));
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    add(
      "DATABASE_URL",
      ["postgres:", "postgresql:"].includes(url.protocol) &&
        !!url.hostname &&
        url.pathname.length > 1,
    );
    if (mode === "production")
      add(
        "DATABASE_URL credentials",
        !!url.username &&
          !!url.password &&
          decodeURIComponent(url.password) !== "cabin_dev",
      );
  } catch {
    errors.push("DATABASE_URL");
  }
  if (env.APP_URL && env.APP_ORIGIN)
    add(
      "APP_URL / APP_ORIGIN",
      env.APP_URL.replace(/\/$/, "") === env.APP_ORIGIN.replace(/\/$/, ""),
    );
  if (mode === "production") {
    try {
      const url = new URL(env.APP_URL ?? "");
      add(
        "APP_URL",
        url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          url.pathname === "/" &&
          !url.search &&
          !url.hash &&
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      );
    } catch {
      errors.push("APP_URL");
    }
    add("DATABASE_SSL", env.DATABASE_SSL === "verify-full");
    add(
      "SECURITY_HASH_KEY",
      /^[a-fA-F0-9]{64}$/.test(env.SECURITY_HASH_KEY ?? ""),
    );
    add("FILE_STORAGE_PROVIDER", env.FILE_STORAGE_PROVIDER === "s3");
    add(
      "FILE_STORAGE_BUCKET",
      !!env.FILE_STORAGE_BUCKET &&
        /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.FILE_STORAGE_BUCKET),
    );
    add("FILE_STORAGE_REGION", !!env.FILE_STORAGE_REGION);
    add(
      "FILE_STORAGE authentication",
      !!(env.FILE_STORAGE_ACCESS_KEY && env.FILE_STORAGE_SECRET_KEY) ||
        env.FILE_STORAGE_USE_IDENTITY === "true",
    );
    add("EMAIL_PROVIDER", env.EMAIL_PROVIDER === "smtp");
    add("SMTP_HOST", !!env.SMTP_HOST);
    add("SMTP_FROM", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SMTP_FROM ?? ""));
    add("SMTP_PORT", [465, 587].includes(Number(env.SMTP_PORT)));
    add(
      "SMTP authentication",
      !!(env.SMTP_USER && env.SMTP_PASSWORD) ||
        env.SMTP_USE_IDENTITY === "true",
    );
    add("TRUST_PROXY", env.TRUST_PROXY === "true");
    add(
      "TRUSTED_CLIENT_IP_HEADER",
      /^x-[a-z0-9-]+$/.test(env.TRUSTED_CLIENT_IP_HEADER ?? "") &&
        env.TRUSTED_CLIENT_IP_HEADER !== "x-forwarded-for",
    );
    add("development reset logging disabled", env.DEV_RESET_LOG !== "true");
  }
  if (env.FILE_STORAGE_ENDPOINT) {
    try {
      const url = new URL(env.FILE_STORAGE_ENDPOINT);
      add(
        "FILE_STORAGE_ENDPOINT",
        !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          (url.protocol === "https:" ||
            (mode !== "production" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
              url.protocol === "http:")),
      );
    } catch {
      errors.push("FILE_STORAGE_ENDPOINT");
    }
  }
  add(
    "FILE_STORAGE_PROVIDER",
    !env.FILE_STORAGE_PROVIDER ||
      ["database", "s3"].includes(env.FILE_STORAGE_PROVIDER),
  );
  add(
    "EMAIL_PROVIDER",
    !env.EMAIL_PROVIDER || ["none", "smtp"].includes(env.EMAIL_PROVIDER),
  );
  add(
    "FILE_STORAGE credentials pair",
    !!env.FILE_STORAGE_ACCESS_KEY === !!env.FILE_STORAGE_SECRET_KEY,
  );
  add("SMTP credentials pair", !!env.SMTP_USER === !!env.SMTP_PASSWORD);
  add(
    "RATE_LIMIT_BACKEND",
    !env.RATE_LIMIT_BACKEND || env.RATE_LIMIT_BACKEND === "postgres",
  );
  add("MFA_MODE", !env.MFA_MODE || env.MFA_MODE === "disabled");
  for (const [key, fallback, max] of [
    ["DATABASE_POOL_MAX", 10, 50],
    ["DATABASE_CONNECT_TIMEOUT_MS", 5000, 30000],
    ["SESSION_HOURS", 8, 24],
    ["RATE_LIMIT_LOGIN_IP", mode === "production" ? 30 : 300, 10000],
    ["RATE_LIMIT_LOGIN_ACCOUNT", 10, 1000],
    ["RATE_LIMIT_RESET_IP", 10, 1000],
    ["RATE_LIMIT_RESET_ACCOUNT", 5, 1000],
    ["RATE_LIMIT_RESET_SUBMIT", 15, 1000],
    ["RATE_LIMIT_UPLOAD", 60, 10000],
    ["RATE_LIMIT_MUTATION", 120, 10000],
  ] as const) {
    const n = integer(env[key], fallback);
    add(key, Number.isInteger(n) && n > 0 && n <= max);
  }
  if (env.MONITORING_PROVIDER && env.MONITORING_PROVIDER !== "none") {
    add("MONITORING_PROVIDER", env.MONITORING_PROVIDER === "webhook");
    try {
      const url = new URL(env.MONITORING_WEBHOOK_URL ?? "");
      add(
        "MONITORING_WEBHOOK_URL",
        url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.search,
      );
    } catch {
      errors.push("MONITORING_WEBHOOK_URL");
    }
  }
  return [...new Set(errors)];
}
export function validateEnvironment(env: Environment = process.env) {
  const errors = environmentProblems(env);
  if (errors.length)
    throw new Error(
      `Invalid server configuration: ${errors.join(", ")}. No secret values are shown.`,
    );
  return { mode: appEnvironment(env), production: production(env) };
}
export function assertDevelopmentSeed(env: Environment = process.env) {
  if (production(env) || env.NODE_ENV === "production")
    throw new Error(
      "Development seed is disabled in production. No sample records or credentials were created.",
    );
}
export function configuredAppUrl(env: Environment = process.env) {
  const value = env.APP_URL ?? env.APP_ORIGIN;
  return value ? new URL(value).origin : "http://127.0.0.1:3000";
}
export function sessionHours(env: Environment = process.env) {
  return Number(env.SESSION_HOURS ?? 8);
}
