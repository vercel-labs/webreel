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
 *
 * Output is run through the repo's own prettier config before writing: the
 * committed file is formatted by the pre-commit hook, so the generator must
 * reproduce that formatting itself or the CI drift gate would fail on every
 * run (prettier collapses short arrays onto one line; a plain
 * JSON.stringify(obj, null, 2) does not).
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { format, resolveConfig } from "prettier";
import { generateSchema } from "../src/lib/config/schema-generator.js";

async function main(): Promise<void> {
  const schema = generateSchema();
  const outPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../apps/docs/public/schema/v1.json",
  );
  const json = JSON.stringify(schema, null, 2) + "\n";
  const prettierConfig = (await resolveConfig(outPath)) ?? {};
  const formatted = await format(json, {
    ...prettierConfig,
    parser: "json",
    filepath: outPath,
  });
  writeFileSync(outPath, formatted, "utf-8");
  console.log(`Wrote ${outPath}`);
}

await main();
