import { readFileSync } from "node:fs";
import { production, type Environment } from "./environment";
export function databaseOptions(
  env: Environment = process.env,
  url = env.DATABASE_URL,
) {
  const parsed = url ? new URL(url) : undefined;
  const verify = env.DATABASE_SSL === "verify-full" || production(env);
  if (production(env) && env.DATABASE_SSL !== "verify-full")
    throw new Error("Production database SSL verification is required.");
  // URL sslmode/sslcert options must not override the verified TLS configuration.
  if (parsed && verify)
    for (const key of [
      "sslmode",
      "sslcert",
      "sslkey",
      "sslrootcert",
      "sslaccept",
      "uselibpqcompat",
    ])
      parsed.searchParams.delete(key);
  return {
    connectionString: parsed?.toString(),
    max: Number(env.DATABASE_POOL_MAX ?? 10),
    connectionTimeoutMillis: Number(env.DATABASE_CONNECT_TIMEOUT_MS ?? 5000),
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    application_name: "cabin-operations",
    ...(verify
      ? {
          ssl: {
            rejectUnauthorized: true,
            ...(env.DATABASE_SSL_CA_FILE
              ? { ca: readFileSync(env.DATABASE_SSL_CA_FILE, "utf8") }
              : {}),
          },
        }
      : {}),
  };
}
