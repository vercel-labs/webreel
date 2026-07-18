/**
 * Writes apps/docs/public/schema/v1.json from the single field registry in
 * src/lib/config/schema-def.ts (via src/lib/config/schema-generator.ts). Run
 * via `pnpm --filter webreel schema:generate` (executed with jiti so it can
 * import the TypeScript sources directly without a build step).
 *
 * CI runs this and fails the build if the committed schema drifts from what
 * the registry produces (see .github/workflows/ci.yml), so the hand-rolled
 * validator in lib/config/validate.ts and the JSON Schema served to editors
 * can never silently diverge on which keys exist.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { generateSchema } from "../src/lib/config/schema-generator.js";

function main(): void {
  const schema = generateSchema();
  const json = JSON.stringify(schema, null, 2) + "\n";
  const outPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../apps/docs/public/schema/v1.json",
  );
  writeFileSync(outPath, json, "utf-8");
  console.log(`Wrote ${outPath}`);
}

main();
