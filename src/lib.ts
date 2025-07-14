import { createTypeSpecLibrary, JSONSchemaType } from "@typespec/compiler";

// TODO: port all options and diagnostics from the old emitter.

export interface JsServerEmitterOptions {
  "package-name"?: string;
  express?: boolean;

  /**
   * The type of datetime models to use for TypeSpecs DateTime and Duration types.
   *
   * Options:
   * - `temporal-polyfill`: (Default) Uses the Temporal API from the `temporal-polyfill` package.
   * - `temporal`: Uses the native Temporal API, requires that your target environment supports it. This will become the default setting in the future.
   * - `date-duration`: Uses the built-in `Date` and a custom `Duration` type. Not recommended.
   */
  datetime?: "temporal-polyfill" | "temporal" | "date-duration";
}

const EmitterOptionsSchema: JSONSchemaType<JsServerEmitterOptions> = {
  type: "object",
  additionalProperties: true,
  properties: {
    "package-name": {
      type: "string",
      nullable: true,
      default: "test-package",
      description: "Name of the package as it will be in package.json",
    },
    express: {
      type: "boolean",
      nullable: true,
      default: false,
      description: "Enable Express.js compatibility mode.",
    },
    datetime: {
      type: "string",
      enum: ["temporal-polyfill", "temporal", "date-duration"],
      default: "temporal-polyfill",
      nullable: true,
      description:
        "The type of datetime models to use for TypeSpec's DateTime and Duration types.",
    },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@typespec/http-server-js",
  emitter: {
    options: EmitterOptionsSchema,
  },
  diagnostics: {},
});

export const { reportDiagnostic, createDiagnostic, createStateSymbol } = $lib;
