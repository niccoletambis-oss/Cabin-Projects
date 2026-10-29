import "dotenv/config";
import { validateEnvironment, production } from "../src/lib/environment";
validateEnvironment();
if (!production())
  throw new Error("Production seed requires APP_ENV=production.");
console.info(
  "Production seed is intentionally empty. Use db:deploy and admin:bootstrap. No demo records or passwords were created.",
);
