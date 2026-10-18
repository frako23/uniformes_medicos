import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");
const PROTECTED = ["server/clients", "server/financing", "server/congresses", "server/reference"];
const ALLOWED_PREFIXES = ["pages/admin/", "pages/api/admin/", "components/admin/"].map((prefix) => prefix.split("/").join(sep));
const PROTECTED_DIRS = ["clients", "financing", "congresses", "reference"].map((dir) => join(ROOT, "server", dir));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("fronteras de privacidad (FR-002, SC-010)", () => {
  it("solo el panel importa los módulos de clientes, pagos, congresos y valores de referencia", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      if (!/\.(ts|tsx|astro)$/.test(file)) continue;
      const path = relative(ROOT, file);
      // Los módulos protegidos pueden importarse entre sí.
      if (PROTECTED_DIRS.some((dir) => file.startsWith(dir + sep))) continue;
      if (ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) continue;
        const target = join(file, "..", specifier);
        if (PROTECTED_DIRS.some((dir) => target === dir || target.startsWith(dir + sep))) offenders.push(`${path} → ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("detecta el patrón: los directorios protegidos existen", () => {
    for (const dir of PROTECTED) expect(statSync(join(ROOT, dir)).isDirectory()).toBe(true);
  });
});
