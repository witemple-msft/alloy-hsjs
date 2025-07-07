import { createTypeSpecLibrary, JSONSchemaType } from "@typespec/compiler";

export interface JsServerEmitterOptions {
  "package-name"?: string;
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

export const { reportDiagnostic, createDiagnostic } = $lib;
