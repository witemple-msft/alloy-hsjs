// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import alloyPlugin from "@alloy-js/rollup-plugin";
import { defineConfig, mergeConfig } from "vitest/config";
import { defaultTypeSpecVitestConfig } from "../typespec/vitest.workspace.js";

export default mergeConfig(
  defaultTypeSpecVitestConfig,
  defineConfig({
    test: {
      include: ["test/**/*.test.ts"],
      exclude: ["test/e2e/**/*"],
      passWithNoTests: true,
    },
    esbuild: {
      jsx: "preserve",
      sourcemap: "both",
    },
    plugins: [alloyPlugin()],
  })
);
