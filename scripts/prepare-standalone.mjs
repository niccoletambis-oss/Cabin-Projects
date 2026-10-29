import { cp, mkdir, readdir, rm } from "node:fs/promises";
const root = ".next/standalone";
// Next may trace local .env files. A portable build artifact must contain no secrets.
for (const name of await readdir(root))
  if (name.startsWith(".env")) await rm(`${root}/${name}`, { force: true });
await mkdir(`${root}/.next/static`, { recursive: true });
await cp(".next/static", `${root}/.next/static`, { recursive: true });
await cp("public", `${root}/public`, { recursive: true });
