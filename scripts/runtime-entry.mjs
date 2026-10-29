// Copied beside the standalone server; environment.mjs is compiled from the shared validator.
import { validateEnvironment } from "./environment.mjs";
process.env.NODE_ENV = "production";
try {
  validateEnvironment();
  await import("./server.js");
} catch (error) {
  console.error(
    error instanceof Error &&
      error.message.startsWith("Invalid server configuration:")
      ? error.message
      : "Application startup failed. Check private runtime configuration.",
  );
  process.exitCode = 1;
}
