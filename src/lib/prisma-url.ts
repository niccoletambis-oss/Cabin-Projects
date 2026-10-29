import { production, type Environment } from "./environment";
export function prismaDatabaseUrl(env: Environment = process.env) {
  const value = env.DIRECT_DATABASE_URL ?? env.DATABASE_URL;
  if (!value) return undefined;
  if (!production(env)) return value;
  if (env.DATABASE_SSL !== "verify-full")
    throw new Error("Production database SSL verification is required.");
  const url = new URL(value); // Prisma schema engine uses require + strict, unlike libpq's verify-full.
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("sslaccept", "strict");
  if (env.DATABASE_SSL_CA_FILE)
    url.searchParams.set("sslcert", env.DATABASE_SSL_CA_FILE);
  return url.toString();
}
