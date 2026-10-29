import ts from "typescript";
import { cp, mkdir, readdir, rm, readFile, writeFile } from "node:fs/promises";
const root = ".next/standalone";
// Next may trace local .env files. A portable build artifact must contain no secrets.
for (const name of await readdir(root))
  if (name.startsWith(".env")) await rm(`${root}/${name}`, { force: true });
await mkdir(`${root}/.next/static`, { recursive: true });
await cp(".next/static", `${root}/.next/static`, { recursive: true });
await cp("public", `${root}/public`, { recursive: true });

const validation = ts.transpileModule(
  await readFile("src/lib/environment.ts", "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
await writeFile(`${root}/environment.mjs`, validation);
await cp("scripts/runtime-entry.mjs", `${root}/runtime-entry.mjs`);
