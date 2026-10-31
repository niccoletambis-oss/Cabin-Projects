import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BROAD_WINDOWS_PRINCIPALS = [
  /\\Everyone:/i,
  /\\Users:/i,
  /Authenticated Users:/i,
  /INTERACTIVE:/i,
];

export async function assertPrivatePasswordFile(file: string) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Password file must be a regular file.");

  if (process.platform !== "win32") {
    if (info.mode & 0o077)
      throw new Error("Password file must be private (0600).");
    return;
  }

  let stdout = "";
  try {
    ({ stdout } = await execFileAsync("icacls.exe", [file], {
      windowsHide: true,
      encoding: "utf8",
    }));
  } catch {
    throw new Error("Password file ACL could not be verified on Windows.");
  }

  if (BROAD_WINDOWS_PRINCIPALS.some((pattern) => pattern.test(stdout)))
    throw new Error(
      "Password file ACL is too broad. Restrict it to your account, SYSTEM, and Administrators.",
    );
}
