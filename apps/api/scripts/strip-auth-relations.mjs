import { readFileSync, writeFileSync } from "node:fs";

// Better Auth's CLI writes relations into the generated auth schema. The app keeps every
// relation in src/db/relations.ts instead, so this strips them back out. It understands
// both shapes the CLI has produced: legacy `relations(...)` and Drizzle v1
// `defineRelationsPart(...)`. Anything else fails loudly rather than guessing.

const path = process.argv[2];
if (!path) throw new Error("Pass the generated auth schema path");

const RELATION_HELPERS = ["relations", "defineRelationsPart"];

let output = readFileSync(path, "utf8");

// 1. The drizzle-orm import must hold relation helpers only.
const importPattern = /^import\s*\{([^}]*)\}\s*from\s*"drizzle-orm";\n/m;
const importMatch = output.match(importPattern);
if (!importMatch) {
  throw new Error("No generated drizzle-orm relations import; inspect the Better Auth CLI output");
}
const imported = importMatch[1]
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
if (!imported.every((name) => RELATION_HELPERS.includes(name))) {
  throw new Error(
    `Unexpected generated drizzle-orm imports (${imported.join(", ")}); update the auth schema cleanup`,
  );
}
output = output.replace(importPattern, "");

// 2. Remove every `export const <x>Relations = <helper>(...);` statement.
const declarationPattern = new RegExp(
  `^export const \\w+Relations = (?:${RELATION_HELPERS.join("|")})\\(`,
  "gm",
);
const edits = [];
for (const match of output.matchAll(declarationPattern)) {
  const start = match.index;
  let depth = 0;
  let end = -1;
  for (let i = start + match[0].length - 1; i < output.length; i++) {
    if (output[i] === "(") depth++;
    else if (output[i] === ")" && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end === -1 || output[end] !== ";") {
    throw new Error("Unbalanced generated relations declaration; update the auth schema cleanup");
  }
  edits.push({ start, end: end + 1 });
}
if (edits.length === 0) {
  throw new Error("No generated relations found; inspect the Better Auth CLI output");
}
for (const { start, end } of edits.toReversed()) {
  output = output.slice(0, start) + output.slice(end);
}

if (new RegExp(`\\b(?:${RELATION_HELPERS.join("|")})\\s*\\(`).test(output)) {
  throw new Error("Relations remain in the generated auth schema");
}

writeFileSync(path, `${output.trimEnd()}\n`);
