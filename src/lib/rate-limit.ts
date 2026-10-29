import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { db } from "./db";
import { production } from "./environment";
export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super("Too many requests. Please wait and try again.");
  }
}
export interface RateStore {
  increment(keyHash: string, expiresAt: Date): Promise<number>;
}
export const postgresRateStore: RateStore = {
  async increment(keyHash, expiresAt) {
    const bucket = await db.rateLimitBucket.upsert({
      where: { keyHash },
      create: { keyHash, expiresAt, count: 1 },
      update: { count: { increment: 1 } },
    });
    return bucket.count;
  },
};
const developmentKey = Symbol.for("cabin.development.security-key");
export function securityKey() {
  if (process.env.SECURITY_HASH_KEY) {
    if (!/^[a-f0-9]{64}$/i.test(process.env.SECURITY_HASH_KEY))
      throw new Error("Invalid SECURITY_HASH_KEY");
    return Buffer.from(process.env.SECURITY_HASH_KEY, "hex");
  }
  if (production()) throw new Error("SECURITY_HASH_KEY is required");
  const globalKeys = globalThis as unknown as Record<symbol, Buffer>;
  return (
    globalKeys[developmentKey] ?? (globalKeys[developmentKey] = randomBytes(32))
  );
}
export function subjectHash(subject: string) {
  return createHmac("sha256", securityKey()).update(subject).digest("hex");
}
export function clientIdentity(request: Request) {
  if (process.env.TRUST_PROXY === "true") {
    const header = process.env.TRUSTED_CLIENT_IP_HEADER;
    const value = header ? request.headers.get(header) : null;
    if (value && isIP(value)) return value;
  }
  return "shared-untrusted-client";
}
export async function enforceRate(
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
  store: RateStore = postgresRateStore,
  now = Date.now(),
) {
  const window = Math.floor(now / windowMs);
  const keyHash = subjectHash(`${scope}:${subject}:${window}`);
  const expiresAt = new Date((window + 1) * windowMs);
  const count = await store.increment(keyHash, expiresAt);
  if (count > limit)
    throw new RateLimitError(
      Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
    );
  return { keyHash, remaining: Math.max(0, limit - count), expiresAt };
}
export function rateLimitValue(name: string, fallback: number) {
  return Number(process.env[name] ?? fallback);
}
export async function enforceLoginAccount(email: string) {
  return enforceRate(
    "login-account",
    email.trim().toLowerCase(),
    rateLimitValue("RATE_LIMIT_LOGIN_ACCOUNT", 10),
    15 * 60 * 1000,
  );
}
export async function enforceUpload(userId: string) {
  return enforceRate(
    "upload",
    userId,
    rateLimitValue("RATE_LIMIT_UPLOAD", 60),
    5 * 60 * 1000,
  );
}
