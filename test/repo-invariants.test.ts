// Repository invariants that oxlint and TypeScript can't express on their own:
// keeps cross-package wiring, .oxlintrc.json regexes, table exports and feature layout in sync.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

type RestrictedImportPattern = {
  regex?: string;
  allowTypeImports?: boolean;
};

type OxlintOverride = {
  files?: string[];
  rules?: Record<string, unknown>;
};

type OxlintConfig = {
  overrides?: OxlintOverride[];
};

function readText(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

/** Strips `//` line comments from JSONC while keeping string literals intact */
function parseJsonc(source: string): unknown {
  const withoutComments = source.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (match) =>
    match.startsWith("//") ? "" : match,
  );
  return JSON.parse(withoutComments);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function restrictedImportPatterns(override: OxlintOverride): RestrictedImportPattern[] {
  const rule = override.rules?.["no-restricted-imports"];
  if (!Array.isArray(rule) || !isRecord(rule[1]) || !Array.isArray(rule[1].patterns)) return [];
  return rule[1].patterns.filter(isRecord).map((pattern) => ({
    regex: typeof pattern.regex === "string" ? pattern.regex : undefined,
    allowTypeImports:
      typeof pattern.allowTypeImports === "boolean" ? pattern.allowTypeImports : undefined,
  }));
}

function listFiles(relDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(ROOT, full).replaceAll("\\", "/"));
    }
  };
  walk(path.join(ROOT, relDir));
  return out.toSorted();
}

function collectRegexStrings(
  value: unknown,
  trail: string[] = [],
): { where: string; pattern: string }[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectRegexStrings(item, [...trail, `[${index}]`]));
  }
  if (isRecord(value)) {
    const out: { where: string; pattern: string }[] = [];
    for (const [key, nested] of Object.entries(value)) {
      if (key === "regex" && typeof nested === "string") {
        out.push({ where: trail.join("."), pattern: nested });
      } else {
        out.push(...collectRegexStrings(nested, [...trail, key]));
      }
    }
    return out;
  }
  return [];
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- .oxlintrc.json schema
const oxlint = parseJsonc(readText(".oxlintrc.json")) as OxlintConfig;

describe("repository invariants", () => {
  it("keeps every regex in .oxlintrc.json valid for oxlint's Rust regex engine", () => {
    const regexes = collectRegexStrings(oxlint);
    expect(regexes.length).toBeGreaterThan(0);

    for (const { where, pattern } of regexes) {
      expect(() => new RegExp(pattern), `${where}: invalid regex ${pattern}`).not.toThrow();
      // Rust's `regex` crate (used by oxlint) does not support look-around or backreferences, and
      // oxlint silently ignores patterns it cannot compile
      expect(
        pattern,
        `${where}: look-around is unsupported in oxlint regexes (${pattern})`,
      ).not.toMatch(/\(\?[=!<]/);
      expect(
        pattern,
        `${where}: numeric backreferences are unsupported in oxlint regexes (${pattern})`,
      ).not.toMatch(/(^|[^\\])\\[1-9]/);
    }
  });

  it("lists every shared @taskhold/api export (except ./client) in .oxlintrc.json's types-only override", () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- package.json exports map
    const pkg = JSON.parse(readText("apps/api/package.json")) as {
      exports: Record<string, string>;
    };
    const sharedFiles = Object.entries(pkg.exports)
      .filter(([key]) => key !== "./client")
      .map(([, target]) => `apps/api/${target.replace(/^\.\//, "")}`)
      .toSorted();

    const typesOnlyOverride = oxlint.overrides?.find((override) =>
      restrictedImportPatterns(override).some(
        (pattern) => pattern.regex === ".*" && pattern.allowTypeImports === true,
      ),
    );

    expect(typesOnlyOverride?.files?.toSorted()).toEqual(sharedFiles);
  });

  it("re-exports every API feature's *.table.ts from apps/api/src/db/schema.ts", () => {
    const tableFiles = listFiles("apps/api/src/features").filter((file) =>
      file.endsWith(".table.ts"),
    );
    const schemaSource = readText("apps/api/src/db/schema.ts");
    const exportedPaths = [...schemaSource.matchAll(/export \* from "([^"]+)";/g)]
      .map((match) => path.posix.normalize(path.posix.join("apps/api/src/db", match[1] ?? "")))
      .toSorted();

    expect(exportedPaths).toEqual(tableFiles);
  });

  it("mounts every API feature's *.routes.ts in apps/api/src/app.ts", () => {
    const routeFiles = listFiles("apps/api/src/features").filter((file) =>
      file.endsWith(".routes.ts"),
    );
    const appSource = readText("apps/api/src/app.ts");
    const importedRoutes = [...appSource.matchAll(/from "(\.\/features\/[^"]+\.routes\.ts)";/g)]
      .map((match) => path.posix.normalize(path.posix.join("apps/api/src", match[1] ?? "")))
      .toSorted();

    expect(importedRoutes).toEqual(routeFiles);
  });

  it("covers every AREA from offline-changes.ts in .oxlintrc.json's area-components override", () => {
    const offlineChanges = readText("apps/web/src/lib/offline-changes.ts");
    const match = offlineChanges.match(/export const AREAS = \[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const areas = [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(areas.length).toBeGreaterThan(0);

    const expectedGlobs = areas
      .map((area) => `apps/web/src/features/${area}/components/*.tsx`)
      .toSorted();

    const areaOverride = oxlint.overrides?.find((override) =>
      restrictedImportPatterns(override).some((pattern) => pattern.regex?.includes("\\.api")),
    );

    expect(areaOverride?.files?.toSorted()).toEqual(expectedGlobs);
  });

  it("keeps web features flat: .ts at feature root, .tsx directly in components/, no other subfolders", () => {
    const featuresRoot = path.join(ROOT, "apps/web/src/features");
    const violations: string[] = [];

    for (const feature of readdirSync(featuresRoot, { withFileTypes: true })) {
      if (!feature.isDirectory()) {
        violations.push(`apps/web/src/features/${feature.name}: expected a feature folder`);
        continue;
      }
      const featureDir = path.join(featuresRoot, feature.name);
      for (const entry of readdirSync(featureDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name !== "components") {
            violations.push(
              `apps/web/src/features/${feature.name}/${entry.name}: only components/ may nest inside a feature`,
            );
            continue;
          }
          const componentsDir = path.join(featureDir, "components");
          for (const item of readdirSync(componentsDir, { withFileTypes: true })) {
            if (item.isDirectory()) {
              violations.push(
                `apps/web/src/features/${feature.name}/components/${item.name}: do not nest folders inside components/`,
              );
            } else if (!item.name.endsWith(".tsx")) {
              violations.push(
                `apps/web/src/features/${feature.name}/components/${item.name}: only .tsx files belong in components/`,
              );
            }
          }
        } else if (!entry.name.endsWith(".ts")) {
          violations.push(
            `apps/web/src/features/${feature.name}/${entry.name}: only .ts files sit at a feature's root`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps offline change max age in sync between API client-today.ts and web offline-cache.ts", () => {
    const apiSource = readText("apps/api/src/features/chores/client-today.ts");
    const webSource = readText("apps/web/src/lib/offline-cache.ts");

    const apiDays = Number(apiSource.match(/const DAYS_A_CHANGE_CAN_WAIT = (\d+);/)?.[1]);
    const webDays = Number(
      webSource.match(/const MAX_AGE = Temporal\.Duration\.from\(\{\s*days:\s*(\d+)\s*\}\);/)?.[1],
    );

    expect(apiDays).toBeGreaterThan(0);
    expect(apiDays).toBe(webDays);
  });
});
