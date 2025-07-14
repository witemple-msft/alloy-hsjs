import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import * as ef from "@typespec/emitter-framework";

import { EmitContext } from "@typespec/compiler";
import { JsServerEmitterOptions } from "../lib.js";
import { Services } from "./service/Services.jsx";
import { WithRepr } from "../plugins/repr.jsx";
import { DEFAULT_REPR_PROVIDER } from "./data-types/Reference.jsx";
import { hsjsDependencies } from "../../generated-defs/package.json.js";

export interface JsServerOutputProps {
  /**
   * The emitter context that contains the program and options.
   */
  context: EmitContext<JsServerEmitterOptions>;
}

const EMIT_CONTEXT = ay.createContext<EmitContext<JsServerEmitterOptions>>();

export function useEmitContext(): EmitContext<JsServerEmitterOptions> {
  const ctx = ay.useContext(EMIT_CONTEXT);
  if (!ctx) {
    throw new Error("useEmitContext must be used within a JsServerOutput");
  }
  return ctx;
}

export const EXTERNALS = {
  "node:http": ts.createPackage({
    name: "node:http",
    version: "0.0.0",
    builtin: true,
    descriptor: {
      ".": {
        default: "http",
        named: [
          {
            name: "IncomingMessage",
            instanceMembers: ["headers", "method", "url"],
          },
          {
            name: "ServerResponse",
            instanceMembers: [
              "statusCode",
              "statusMessage",
              "writeHead",
              "end",
            ],
          },
        ],
      },
    },
  }),
  "temporal-polyfill": ts.createPackage({
    name: "temporal-polyfill",
    version: hsjsDependencies["temporal-polyfill"],
    descriptor: {
      ".": {
        default: "temporal",
        named: [
          {
            name: "Temporal",
            staticMembers: [
              "Instant",
              "Duration",
              "PlainDateTime",
              "PlainDate",
              "PlainTime",
              "ZonedDateTime",
            ],
          },
          {
            name: "Instant",
            instanceMembers: [
              "epochNanoseconds",
              "toString",
              "toZonedDateTime",
            ],
            staticMembers: [
              "from",
              "fromEpochNanoseconds",
              "fromEpochMilliseconds",
            ],
          },
          {
            name: "Duration",
            instanceMembers: ["toString"],
            staticMembers: ["from"],
          },
          {
            name: "PlainDate",
            staticMembers: ["from"],
            instanceMembers: ["toString", "add", "subtract"],
          },
          {
            name: "PlainTime",
            staticMembers: ["from"],
          },
          {
            name: "ZonedDateTime",
            staticMembers: ["from"],
          },
        ],
      },
    },
  }),
  "decimal.js": ts.createPackage({
    name: "decimal.js",
    version: hsjsDependencies["decimal.js"],
    descriptor: {
      ".": {
        default: "decimal",
        named: [
          {
            name: "Decimal",
          },
        ],
      },
    },
  }),
};

export function JsServerOutput(props: JsServerOutputProps) {
  return (
    <ef.Output
      program={props.context.program}
      externals={[ts.node.fs, ...Object.values(EXTERNALS)]}
    >
      <WithRepr provider={DEFAULT_REPR_PROVIDER}>
        <EMIT_CONTEXT.Provider value={props.context}>
          <Services />
        </EMIT_CONTEXT.Provider>
      </WithRepr>
    </ef.Output>
  );
}
