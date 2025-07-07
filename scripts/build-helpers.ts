// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/* eslint no-console: "off" */

import fs from "node:fs/promises";
import path from "node:path";

const GENERATED_DEFS = path.resolve("generated-defs");
const HELPER_SRC_PATH = path.resolve("src", "helpers");

interface HelperNode {
  name: string;
  content: string;
  externalDependencies: string[];
}

interface DirectoryNode {
  directories: Map<string, DirectoryNode>;
  files: HelperNode[];
}

async function readHelperTree(dir: string): Promise<DirectoryNode> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  const directories = new Map<string, DirectoryNode>();
  const files: HelperNode[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      directories.set(entry.name, await readHelperTree(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      const content = await fs.readFile(fullPath, "utf-8");

      files.push({
        name: entry.name,
        content,
        externalDependencies:
          extractModuleSpecifiers(content).filter(isExternal),
      });
    }
  }

  return {
    directories,
    files,
  };
}

export function extractModuleSpecifiers(content: string): string[] {
  const specifiers: string[] = [];

  // Match patterns like:
  //   import ... from 'module'
  //   import 'module'
  //   export ... from 'module'
  //   export * from 'module'
  const regex = /\b(?:import|export)\s+(?:[^'"]*?from\s+)?["']([^"']+)["']/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

function isExternal(m: string): boolean {
  return !m.startsWith(".") && !m.startsWith("node:");
}

async function buildPackageJsonTs() {
  console.log("Building package.json.ts");
  const packageJson = await fs.readFile(path.resolve("package.json"), "utf-8");

  const parsed = JSON.parse(packageJson);

  const mergedDependencies: Record<string, string> = {
    ...parsed.devDependencies,
    ...parsed.dependencies,
  };

  const fileText = [
    "// Copyright (c) Microsoft Corporation",
    "// Licensed under the MIT license.",
    "",
    "// prettier-ignore",
    "",
    `export const hsjsDependencies = {`,
    ...Object.entries(mergedDependencies).map(([name, version]) => {
      return `  ${JSON.stringify(name)}: ${JSON.stringify(version)},`;
    }),
    "} as const;",
    "",
  ].join("\n");

  await fs.writeFile(
    path.resolve(GENERATED_DEFS, "package.json.ts"),
    fileText,
    "utf-8"
  );
}

function* indent(lines: Iterable<string>, level = 1): Iterable<string> {
  const indentation = " ".repeat(level * 2);
  for (const line of lines) {
    yield indentation + line;
  }
}

function makeHelperPath(referencePath: string[], name: string): string {
  const helperPath =
    "_helpers" +
    (referencePath.length > 0 ? "." + referencePath.join(".") : "");

  return `${helperPath}.${path.basename(name, ".ts")}`;
}

function* writeHelperModuleTree(
  tree: DirectoryNode,
  referencePath: string[] = []
): Iterable<string> {
  for (const [name, subdir] of tree.directories) {
    yield `<ay.SourceDirectory path="${name}">`;
    yield* indent(writeHelperModuleTree(subdir, [...referencePath, name]));
    yield `</ay.SourceDirectory>`;
  }

  for (const file of tree.files) {
    yield `<HelperModule helper={${makeHelperPath(referencePath, file.name)}} />`;
  }
}

function* writeHelperDeclarationTree(
  tree: DirectoryNode,
  referencePath: string[] = []
): Iterable<string> {
  for (const [name, subdir] of tree.directories) {
    yield `"${name}": {`;
    yield* indent(writeHelperDeclarationTree(subdir, [...referencePath, name]));
    yield `},`;
  }

  for (const file of tree.files) {
    yield `"${path.basename(file.name, ".ts")}": {`;
    yield `  name: ${JSON.stringify(file.name)},`;
    yield `  code: ${JSON.stringify(file.content)},`;

    if (file.externalDependencies.length > 0) {
      yield `  externalDependencies: [`;
      yield* indent(
        file.externalDependencies.map((dep) => JSON.stringify(dep))
      );
      yield `  ],`;
    }
    yield `},`;
  }
}

function* writeHelperAccessorTree(
  tree: DirectoryNode,
  referencePath: string[] = []
): Iterable<string> {
  for (const [name, subdir] of tree.directories) {
    yield `"${name}": {`;
    yield* indent(writeHelperAccessorTree(subdir, [...referencePath, name]));
    yield `},`;
  }

  for (const file of tree.files) {
    yield `"${path.basename(file.name, ".ts")}": new Proxy(Object.create(null), {`;
    yield "  get: (_target: any, prop: string) => {";
    yield `    if (typeof prop === "string")`;
    yield `      return <Helper helper={${makeHelperPath(referencePath, file.name)}} name={prop} />;`;
    yield "";
    yield "    return undefined;";
    yield "  },";
    yield `}),`;
  }
}

async function main() {
  console.log("Building JS server generator helpers.");

  try {
    await fs.mkdir(GENERATED_DEFS);
  } catch {}

  console.log("Building package.json.ts...");

  await buildPackageJsonTs();

  console.log("Building helper declarations...");

  const helperTree = await readHelperTree(HELPER_SRC_PATH);

  const helperFileText = [
    "// Copyright (c) Microsoft Corporation",
    "// Licensed under the MIT license.",
    "",
    "// prettier-ignore",
    "",
    `import * as ay from "@alloy-js/core";`,
    // `import * as ts from "@alloy-js/typescript";`,
    "",
    `import { Helper, HelperModule } from "../src/components/helpers.js";`,
    "",
    "const _helpers = {",
    ...indent(writeHelperDeclarationTree(helperTree)),
    "} as const;",
    "",
    `export const HELPERS = {`,
    ...indent(writeHelperAccessorTree(helperTree)),
    `} as const;`,
    "",
    `export function HelperTree() {`,
    `  return (`,
    `    <ay.SourceDirectory path="helpers">`,
    ...indent(writeHelperModuleTree(helperTree), 3),
    `    </ay.SourceDirectory>`,
    `  );`,
    `}`,
    "",
  ].join("\n");

  await fs.writeFile(
    path.resolve(GENERATED_DEFS, "helpers.tsx"),
    helperFileText,
    "utf-8"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
