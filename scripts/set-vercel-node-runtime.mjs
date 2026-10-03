import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const functionsDirectory = path.resolve(".vercel", "output", "functions");
const runtime = "nodejs24.x";

let updatedFunctions = 0;
let entries;

try {
  entries = await readdir(functionsDirectory, { withFileTypes: true });
} catch (error) {
  if (error.code === "ENOENT") {
    console.log("[vercel] Build Node local detectado; no se actualizaron funciones Vercel.");
    process.exit(0);
  }
  throw error;
}

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const configPath = path.join(functionsDirectory, entry.name, ".vc-config.json");

  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }

  if (config.runtime === "edge" || config.runtime === runtime) continue;

  config.runtime = runtime;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  updatedFunctions += 1;
}

if (updatedFunctions === 0) {
  console.log("[vercel] No se actualizaron runtimes Node.");
} else {
  console.log(`[vercel] Runtime Node 24 aplicado a ${updatedFunctions} función(es).`);
}
