import { parseTree, getNodePath } from "jsonc-parser";

export interface ValidationError {
  path: string;
  message: string;
}

export function buildLineMap(raw: string): Map<string, number> {
  const lineMap = new Map<string, number>();
  const tree = parseTree(raw);
  if (!tree) return lineMap;

  function walk(node: ReturnType<typeof parseTree>): void {
    if (!node) return;
    const path = getNodePath(node);
    const jsonPath = path
      .map((seg) => (typeof seg === "number" ? `[${seg}]` : seg))
      .join(".")
      .replace(/\.\[/g, "[");

    const line = raw.substring(0, node.offset).split("\n").length;
    if (jsonPath) lineMap.set(jsonPath, line);

    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  if (tree.children) {
    for (const child of tree.children) {
      walk(child);
    }
  }

  return lineMap;
}

function findLineForPath(
  lineMap: Map<string, number>,
  errorPath: string,
): number | undefined {
  if (lineMap.has(errorPath)) return lineMap.get(errorPath);
  const parts = errorPath.split(".");
  while (parts.length > 0) {
    parts.pop();
    const parent = parts.join(".");
    if (lineMap.has(parent)) return lineMap.get(parent);
  }
  return undefined;
}

export function formatValidationErrors(
  filePath: string,
  errors: ValidationError[],
  lineMap?: Map<string, number>,
): string {
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

  const maxPath = Math.max(...errors.map((e) => e.path.length));
  const lines = errors.map((e) => {
    const paddedPath = e.path.padEnd(maxPath);
    const lineNum = lineMap ? findLineForPath(lineMap, e.path) : undefined;
    const linePrefix = lineNum !== undefined ? yellow(`L${lineNum} `) : "";
    return `  ${linePrefix}${red(paddedPath)}  ${dim(e.message)}`;
  });

  return `${bold(red("Error:"))} Invalid config ${bold(filePath)}\n\n${lines.join("\n")}`;
}
