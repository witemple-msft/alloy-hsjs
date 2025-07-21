// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import { describe, test, expect, beforeEach } from "vitest";
import { MediaTypeConstraintRegistry } from "../../src/util/media-type.js";

describe("MediaTypeConstraintRegistry", () => {
  const registry: MediaTypeConstraintRegistry<string> =
    new MediaTypeConstraintRegistry<string>("Default");

  registry.register("application/*", "AnyApplication");
  registry.register("*/json", "AnyJson");
  registry.register("application/json", "JsonHandler");
  registry.register("application/merge-patch+json", "MergePatchHandler");
  registry.register("text/html;charset=utf-8", "HtmlUtf8");
  registry.register("text/html", "HtmlGeneric");

  test("matches exact media type", () => {
    expect(registry.resolve("application/json")).toBe("JsonHandler");
    expect(registry.resolve("application/merge-patch+json")).toBe(
      "MergePatchHandler"
    );
  });

  test("matches subtype + suffix with inferred match to */json", () => {
    expect(registry.resolve("text/json")).toBe("AnyJson");
    expect(registry.resolve("application/vnd.api+json")).toBe("JsonHandler");
  });

  test("matches application/json even if suffix is in actual", () => {
    expect(registry.resolve("application/merge-patch+json")).toBe(
      "MergePatchHandler"
    );
    // If MergePatchHandler wasn't registered, fallback to JsonHandler
    const r = new MediaTypeConstraintRegistry<string>("Default");
    r.register("application/json", "JsonHandler");
    expect(r.resolve("application/merge-patch+json")).toBe("JsonHandler");
  });

  test("wildcard */json takes precedence over *", () => {
    expect(registry.resolve("text/json")).toBe("AnyJson");
  });

  test("wildcard application/* matches fallback", () => {
    expect(registry.resolve("application/xml")).toBe("AnyApplication");
  });

  test("* wildcard fallback match", () => {
    expect(registry.resolve("image/png")).toBe("Default");
  });

  test("exact match beats wildcard", () => {
    expect(registry.resolve("text/html")).toBe("HtmlGeneric");
  });

  test("parameterized match beats generic", () => {
    expect(registry.resolve("text/html;charset=utf-8")).toBe("HtmlUtf8");
  });

  test("parameter mismatch avoids match", () => {
    expect(registry.resolve("text/html;charset=iso-8859-1")).toBe(
      "HtmlGeneric"
    );
  });

  test("most specific constraint is chosen", () => {
    registry.register("application/json;charset=utf-8", "JsonUtf8");
    expect(registry.resolve("application/json;charset=utf-8")).toBe("JsonUtf8");
    expect(registry.resolve("application/json;charset=ascii")).toBe(
      "JsonHandler"
    ); // fallback
  });

  test("registered constraint must not match more specific input if it lacks required suffix", () => {
    // e.g., application/json+merge-patch does NOT match application/merge-patch+json
    const r = new MediaTypeConstraintRegistry<string>("Default");
    r.register("application/json+merge-patch", "Bogus"); // won't match anything real
    expect(r.resolve("application/merge-patch+json")).toBe("Default");
  });

  test("parameter matching is case-insensitive", () => {
    expect(registry.resolve("text/html;Charset=utf-8")).toBe("HtmlUtf8");
  });

  test("unmatched media type returns undefined if no match", () => {
    const r = new MediaTypeConstraintRegistry<string>("Default");
    expect(r.resolve("image/png")).toBe("Default");
  });
});

test("'*/*' matches input constraint '*'", () => {
  const r = new MediaTypeConstraintRegistry<string>("Default");
  r.register("*/*", "AnyAny");

  expect(r.resolve("*")).toBe("AnyAny");
});
