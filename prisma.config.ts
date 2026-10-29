import { prismaDatabaseUrl } from "./src/lib/prisma-url";
import "dotenv/config";
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: {
    url: prismaDatabaseUrl()!,
  },
});
