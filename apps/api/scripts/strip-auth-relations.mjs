import { readFileSync, writeFileSync } from "node:fs";

import ts from "typescript";

const path = process.argv[2];
if (!path) throw new Error("Pass the generated auth schema path");

const sourceText = readFileSync(path, "utf8");
const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
const edits = [];
let foundRelationsImport = false;
let removedRelations = 0;

for (const statement of source.statements) {
  if (
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "drizzle-orm"
  ) {
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      const relationImports = bindings.elements.filter(
        (element) => (element.propertyName ?? element.name).text === "relations",
      );
      if (relationImports.length > 0) {
        if (relationImports.length !== bindings.elements.length || statement.importClause?.name) {
          throw new Error(
            "Unexpected generated drizzle-orm imports; update the auth schema cleanup",
          );
        }
        foundRelationsImport = true;
        edits.push({ start: statement.getFullStart(), end: statement.end });
      }
    }
  }

  if (ts.isVariableStatement(statement)) {
    const isLegacyRelations = statement.declarationList.declarations.some((declaration) => {
      if (!ts.isIdentifier(declaration.name) || !ts.isCallExpression(declaration.initializer)) {
        return false;
      }
      return (
        declaration.name.text.endsWith("Relations") &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === "relations"
      );
    });
    if (isLegacyRelations) {
      if (
        !statement.declarationList.declarations.every(
          (declaration) =>
            ts.isIdentifier(declaration.name) &&
            declaration.name.text.endsWith("Relations") &&
            ts.isCallExpression(declaration.initializer) &&
            ts.isIdentifier(declaration.initializer.expression) &&
            declaration.initializer.expression.text === "relations",
        )
      ) {
        throw new Error(
          "Unexpected mixed generated relation declarations; update the auth schema cleanup",
        );
      }
      removedRelations += statement.declarationList.declarations.length;
      edits.push({ start: statement.getFullStart(), end: statement.end });
    }
  }
}

if (!foundRelationsImport || removedRelations === 0) {
  throw new Error("No generated legacy relations found; inspect the Better Auth CLI output");
}

let output = sourceText;
for (const { start, end } of edits.toSorted((a, b) => b.start - a.start)) {
  output = output.slice(0, start) + output.slice(end);
}

if (/\brelations\s*\(/.test(output)) {
  throw new Error("Legacy relations remain in the generated auth schema");
}

writeFileSync(path, output);
