import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
const scrypt = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export { can, authorize } from "./permissions";
export type { Actor, Permission } from "./permissions";
export async function hashPassword(password: string) {
  if (password.length < 15 || password.length > 128)
    throw new Error("Password must contain 15–128 characters");
  if (
    /^(.)\1+$/.test(password) ||
    ["123456789012345", "passwordpassword", "qwertyqwertyqwerty"].includes(
      password.toLowerCase(),
    )
  )
    throw new Error("Password must be unique and difficult to guess");
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt);
  return `scrypt-v1:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string | null) {
  const [version, salt, hex] = (stored ?? "").split(":");
  const key = await scrypt(password, salt ?? "cabin-dummy-password-salt");
  const expected = Buffer.from(hex ?? "00".repeat(64), "hex");
  return (
    version === "scrypt-v1" &&
    !!stored &&
    key.length === expected.length &&
    timingSafeEqual(key, expected)
  );
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
