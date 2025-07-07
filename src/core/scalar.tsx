// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import * as ay from "@alloy-js/core";

import {
  DiagnosticTarget,
  EncodeData,
  NoTarget,
  Program,
  Scalar,
} from "@typespec/compiler";
import { reportDiagnostic } from "../lib.js";
import { parseCase } from "../util/case.js";
import { getFullyQualifiedTypeName } from "../util/name.js";

import { HttpOperationParameter } from "@typespec/http";
import { UnreachableError } from "../util/error.js";
import { useEmitContext } from "../components/JsServerOutput.jsx";

/**
 * A specification of a TypeSpec scalar type.
 */
export interface ScalarInfo {
  /**
   * The TypeScript type that represents the scalar, or a function if the scalar requires a representation
   * that is not built-in.
   */
  type: ay.Children;

  /**
   * A map of supported encodings for the scalar.
   */
  encodings?: {
    [target: string]: {
      /**
       * The default encoding for the target.
       */
      default?: ScalarEncoding;

      /**
       * The encoding for the scalar when encoded using a particular method.
       */
      [encoding: string]: ScalarEncoding | undefined;
    };
  };

  /**
   * A map of default encodings for the scalar.
   */
  defaultEncodings?: {
    /**
     * The default encoding pair to use for a given MIME type.
     */
    byMimeType?: { [contentType: string]: [string, string] };
    /**
     * The default encoding pair to use in the context of HTTP metadata.
     */
    http?: {
      [K in HttpOperationParameter["type"]]?: [string, string];
    };
  };

  /**
   * Whether or not this scalar can serve as a JSON-compatible type.
   *
   * If JSON serialization reaches a non-compatible scalar and no more encodings are available, it is treated as
   * an unknown type.
   */
  isJsonCompatible: boolean;
}

/**
 * A definition of a scalar encoding.
 */
export type ScalarEncoding = ScalarEncodingComponents | ScalarEncodingVia;

/**
 * A definition of a scalar encoding with templates.
 */
export interface ScalarEncodingComponents {
  /**
   * The component to use to encode the scalar.
   */
  encode(props: { expr: ay.Children }): ay.Children;

  /**
   * The component to use to decode the scalar.
   */
  decode(props: { expr: ay.Children }): ay.Children;
}

export interface ScalarEncodingVia extends Partial<ScalarEncodingComponents> {
  /**
   * If set, the name of the encoding to use as a base for this encoding.
   *
   * This can be used to define an encoding that is a modification of another encoding, such as a URL-encoded version
   * of a base64-encoded value, which depends on the base64 encoding.
   */
  via: string;
}

/**
 * Resolves the encoding of Duration values to a number of seconds.
 */
// const DURATION_NUMBER_ENCODING: ScalarEncoding = {

//   return {
//     encode({ expr }) {
//       const dependencies = useDependencies();
//       return <"Duration.totalSeconds({})",
//     decode({ expr }): "Duration.fromTotalSeconds({})",
//   };
// };

// /**
//  * Resolves the encoding of Duration values to a BigInt number of seconds.
//  */
// const DURATION_BIGINT_ENCODING: Dependent<ScalarEncoding> = (_, module) => {
//   module.imports.push({ from: dateTimeModule, binder: ["Duration"] });

//   return {
//     encodeTemplate: "Duration.totalSecondsBigInt({})",
//     decodeTemplate: "Duration.fromTotalSeconds(globalThis.Number({}))",
//   };
// };

/**
 * Resolves the encoding of Duration values to a BigDecimal number of seconds.
 */
// const DURATION_BIGDECIMAL_ENCODING: Dependent<ScalarEncoding> = (_, module) => {
//   module.imports.push(
//     { from: dateTimeModule, binder: ["Duration"] },
//     { from: "decimal.js", binder: ["Decimal"] }
//   );

//   return {
//     encodeTemplate: "new Decimal(Duration.totalSeconds({}).toString())",
//     decodeTemplate: "Duration.fromSeconds(({}).toNumber())",
//   };
// };

// const DURATION: Dependent<ScalarInfo> = (ctx, module) => {
//   const mode = ctx.options.datetime ?? "temporal-polyfill";

//   if (mode === "temporal-polyfill") {
//     module.imports.push({ from: "temporal-polyfill", binder: ["Temporal"] });
//   }

//   const isTemporal = mode === "temporal" || mode === "temporal-polyfill";
//   const temporalRef =
//     mode === "temporal-polyfill" ? "Temporal" : "globalThis.Temporal";

//   if (!isTemporal) return DURATION_CUSTOM;

//   const isPolyfill = mode === "temporal-polyfill";

//   return {
//     type: "Temporal.Duration",
//     isJsonCompatible: false,
//     encodings: {
//       "TypeSpec.string": {
//         default: { via: "iso8601" },
//         iso8601: {
//           encodeTemplate: `({}).toString()`,
//           decodeTemplate: `${temporalRef}.Duration.from({})`,
//         },
//       },
//       ...Object.fromEntries(
//         ["int32", "uint32", "float32", "float64"].map((n) => [
//           `TypeSpec.${n}`,
//           {
//             default: { via: "seconds" },
//             seconds: {
//               encodeTemplate: (_, module) => {
//                 module.imports.push({
//                   from: isPolyfill
//                     ? temporalPolyfillHelpers
//                     : temporalNativeHelpers,
//                   binder: [`durationTotalSeconds`],
//                 });

//                 return `durationTotalSeconds({})`;
//               },
//               decodeTemplate: `${temporalRef}.Duration.from({ seconds: {} })`,
//             },
//           },
//         ])
//       ),
//       ...Object.fromEntries(
//         ["int64", "uint64", "integer"].map((n) => [
//           `TypeSpec.${n}`,
//           {
//             default: { via: "seconds" },
//             seconds: {
//               encodeTemplate: (_, module) => {
//                 module.imports.push({
//                   from: isPolyfill
//                     ? temporalPolyfillHelpers
//                     : temporalNativeHelpers,
//                   binder: [`durationTotalSecondsBigInt`],
//                 });

//                 return `durationTotalSecondsBigInt({})`;
//               },
//               decodeTemplate: `${temporalRef}.Duration.from({ seconds: globalThis.Number({}) })`,
//             },
//           },
//         ])
//       ),
//       "TypeSpec.float": {
//         default: { via: "seconds" },
//         seconds: {
//           encodeTemplate: (_, module) => {
//             module.imports.push({
//               from: isPolyfill
//                 ? temporalPolyfillHelpers
//                 : temporalNativeHelpers,
//               binder: [`durationTotalSecondsBigInt`],
//             });

//             return `new Decimal(durationTotalSecondsBigInt({}).toString())`;
//           },
//           decodeTemplate: `${temporalRef}.Duration.from({ seconds: ({}).toNumber() })`,
//         },
//       },
//     },
//     defaultEncodings: {
//       byMimeType: {
//         "application/json": ["TypeSpec.string", "iso8601"],
//       },
//     },
//   };
// };

// const DURATION_CUSTOM: ScalarInfo = {
//   type: function importDuration(_, module) {
//     module.imports.push({ from: dateTimeModule, binder: ["Duration"] });

//     return "Duration";
//   },
//   encodings: {
//     "TypeSpec.string": {
//       default: {
//         via: "iso8601",
//       },
//       iso8601: function importDurationForEncode(_, module) {
//         module.imports.push({ from: dateTimeModule, binder: ["Duration"] });
//         return {
//           encodeTemplate: "Duration.toISO8601({})",
//           decodeTemplate: "Duration.parseISO8601({})",
//         };
//       },
//     },
//     ...Object.fromEntries(
//       ["int32", "uint32", "float32", "float64"].map((n) => [
//         `TypeSpec.${n}`,
//         {
//           default: { via: "seconds" },
//           seconds: DURATION_NUMBER_ENCODING,
//         },
//       ])
//     ),
//     ...Object.fromEntries(
//       ["int64", "uint64"].map((n) => [
//         `TypeSpec.${n}`,
//         {
//           default: { via: "seconds" },
//           seconds: DURATION_BIGINT_ENCODING,
//         },
//       ])
//     ),
//     "TypeSpec.float": {
//       default: { via: "seconds" },
//       seconds: DURATION_BIGDECIMAL_ENCODING,
//     },
//   },
//   defaultEncodings: {
//     byMimeType: {
//       "application/json": ["TypeSpec.string", "iso8601"],
//     },
//   },
//   isJsonCompatible: false,
// };

const NUMBER: ScalarInfo = {
  type: "number",
  encodings: {
    "TypeSpec.string": {
      default: {
        encode: ({ expr }) => ay.code`globalThis.String(${expr})`,
        decode: ({ expr }) => ay.code`globalThis.Number(${expr})`,
      },
    },
  },
  isJsonCompatible: true,
};

// const BIGDECIMAL: ScalarInfo = {
//   type(_, module) {
//     module.imports.push({ from: "decimal.js", binder: ["Decimal"] });

//     return "Decimal";
//   },
//   encodings: {
//     "TypeSpec.string": {
//       default: {
//         encodeTemplate: "({}).toString()",
//         decodeTemplate: "new Decimal({})",
//       },
//     },
//   },
//   isJsonCompatible: false,
// };

// const BIGINT: ScalarInfo = {
//   type: "bigint",
//   encodings: {
//     "TypeSpec.string": {
//       default: {
//         encodeTemplate: "globalThis.String({})",
//         decodeTemplate: "globalThis.BigInt({})",
//       },
//     },
//   },
//   defaultEncodings: {
//     byMimeType: { "application/json": ["TypeSpec.string", "default"] },
//   },
//   isJsonCompatible: false,
// };

/**
 * Declarative scalar table.
 *
 * This table defines how TypeSpec scalars are represented in JS/TS.
 *
 * The entries are the fully-qualified names of scalars, and the values are objects that describe how the scalar
 * is represented.
 *
 * Each representation has a `type`, indicating the TypeScript type that represents the scalar at runtime.
 *
 * The `encodings` object describes how the scalar can be encoded/decoded to/from other types. Encodings
 * are named, and each encoding has an `encodeTemplate` and `decodeTemplate` that describe how to encode and decode
 * the scalar to/from the target type using the encoding. Encodings can also optionally have a `via` field that
 * indicates that the encoding is a modification of the data yielded by another encoding.
 *
 * The `defaultEncodings` object describes the default encodings to use for the scalar in various contexts. The
 * `byMimeType` object maps MIME types to encoding pairs, and the `http` object maps HTTP metadata contexts to
 * encoding pairs.
 */
const SCALARS = new Map<string, ScalarInfo>([
  [
    "TypeSpec.bytes",
    {
      type: "Uint8Array",
      encodings: {
        "TypeSpec.string": {
          base64: {
            encode: ({ expr }) =>
              ay.code`(${expr} instanceof globalThis.Buffer ? ${expr} : globalThis.Buffer.from(${expr})).toString('base64')`,
            decode: ({ expr }) =>
              ay.code`globalThis.Buffer.from(${expr}, 'base64')`,
          },
          base64url: {
            via: "base64",
            encode: ({ expr }) =>
              ay.code`globalThis.encodeURIComponent(${expr})`,
            decode: ({ expr }) =>
              ay.code`globalThis.decodeURIComponent(${expr})`,
          },
        },
      },
      defaultEncodings: {
        byMimeType: { "application/json": ["TypeSpec.string", "base64"] },
      },
      isJsonCompatible: false,
    },
  ],
  [
    "TypeSpec.boolean",
    {
      type: "boolean",
      encodings: {
        "TypeSpec.string": {
          default: {
            encode: ({ expr }) => ay.code`globalThis.String(${expr})`,
            decode: ({ expr }) =>
              ay.code`(${expr} === "false" ? false : globalThis.Boolean(${expr}))`,
          },
        },
      },
      isJsonCompatible: true,
    },
  ],
  [
    "TypeSpec.string",
    {
      type: "string",
      // This little no-op encoding makes it so that we can attempt to encode string to itself infallibly and it will
      // do nothing. We therefore don't need to redundantly describe HTTP encodings for query, header, etc. because
      // they rely on the ["TypeSpec.string", "default"] encoding in the absence of a more specific encoding.
      encodings: {
        "TypeSpec.string": {
          default: { encode: ({ expr }) => expr, decode: ({ expr }) => expr },
        },
      },
      isJsonCompatible: true,
    },
  ],

  ["TypeSpec.float32", NUMBER],
  ["TypeSpec.float64", NUMBER],
  // ["TypeSpec.uint64", BIGINT],
  ["TypeSpec.uint32", NUMBER],
  ["TypeSpec.uint16", NUMBER],
  ["TypeSpec.uint8", NUMBER],
  // ["TypeSpec.int64", BIGINT],
  ["TypeSpec.int32", NUMBER],
  ["TypeSpec.int16", NUMBER],
  ["TypeSpec.int8", NUMBER],
  ["TypeSpec.safeint", NUMBER],

  // ["TypeSpec.numeric", BIGDECIMAL],
  // ["TypeSpec.float", BIGDECIMAL],
  // ["TypeSpec.decimal", BIGDECIMAL],
  // ["TypeSpec.decimal128", BIGDECIMAL],

  // ["TypeSpec.integer", BIGINT],
  // ["TypeSpec.plainDate", dateTime("plainDate")],
  // ["TypeSpec.plainTime", dateTime("plainTime")],
  // ["TypeSpec.utcDateTime", dateTime("utcDateTime")],
  // ["TypeSpec.offsetDateTime", dateTime("offsetDateTime")],
  // [
  //   "TypeSpec.unixTimestamp32",
  //   {
  //     type: "number",
  //     encodings: {
  //       "TypeSpec.string": {
  //         default: {
  //           encodeTemplate: "globalThis.String({})",
  //           decodeTemplate: "globalThis.Number({})",
  //         },
  //       },
  //       "TypeSpec.int32": {
  //         default: { via: "unixTimestamp" },
  //         unixTimestamp: {
  //           encodeTemplate: "{}",
  //           decodeTemplate: "{}",
  //         },
  //       },
  //       "TypeSpec.int64": {
  //         default: { via: "unixTimestamp" },
  //         unixTimestamp: {
  //           encodeTemplate: "globalThis.BigInt({})",
  //           decodeTemplate: "globalThis.Number({})",
  //         },
  //       },
  //     },
  //     isJsonCompatible: true,
  //   },
  // ],
  // ["TypeSpec.duration", DURATION],
]);

// /**
//  * Datetime types that support dynamic construction.
//  */
// type DateTimeType =
//   | "plainDate"
//   | "plainTime"
//   | "utcDateTime"
//   | "offsetDateTime";

// /**
//  * Gets the DateTime Scalar specification for a given date time type.
//  */
// function dateTime(t: DateTimeType): Dependent<ScalarInfo> {
//   return (ctx, module): ScalarInfo => {
//     const mode = ctx.options.datetime ?? "temporal-polyfill";

//     if (mode === "temporal-polyfill") {
//       module.imports.push({ from: "temporal-polyfill", binder: ["Temporal"] });
//     }

//     const isTemporal = mode === "temporal" || mode === "temporal-polyfill";
//     const temporalRef =
//       mode === "temporal-polyfill" ? "Temporal" : "globalThis.Temporal";

//     let type: string;

//     switch (t) {
//       case "plainDate":
//         type = isTemporal ? "Temporal.PlainDate" : "Date";
//         break;
//       case "plainTime":
//         type = isTemporal ? "Temporal.PlainTime" : "Date";
//         break;
//       case "utcDateTime":
//         type = isTemporal ? "Temporal.Instant" : "Date";
//         break;
//       case "offsetDateTime":
//         type = isTemporal ? "Temporal.ZonedDateTime" : "Date";
//         break;
//       default:
//         void (t satisfies never);
//         throw new UnreachableError(`Unknown datetime type: ${t}`);
//     }

//     return {
//       type,
//       isJsonCompatible: false,
//       encodings: isTemporal
//         ? TEMPORAL_ENCODERS(temporalRef, mode === "temporal-polyfill")[t]
//         : LEGACY_DATETIME_ENCODER,
//       defaultEncodings: {
//         byMimeType: {
//           "application/json": ["TypeSpec.string", "rfc3339"],
//         },
//         http: {
//           header: ["TypeSpec.string", "rfc7231"],
//           query: ["TypeSpec.string", "rfc3339"],
//           cookie: ["TypeSpec.string", "rfc7231"],
//           path: ["TypeSpec.string", "rfc3339"],
//         },
//       },
//     };
//   };
// }

// const TEMPORAL_ENCODERS = (
//   temporal: string,
//   isPolyfill: boolean
// ): Record<DateTimeType, ScalarInfo["encodings"]> => {
//   return {
//     plainDate: {
//       "TypeSpec.string": {
//         default: { via: "iso8601" },
//         rfc3339: { via: "iso8601" },
//         iso8601: {
//           encodeTemplate: "({}).toString()",
//           decodeTemplate: `${temporal}.PlainDate.from({})`,
//         },
//       },
//     },
//     plainTime: {
//       "TypeSpec.string": {
//         default: { via: "iso8601" },
//         rfc3339: { via: "iso8601" },
//         iso8601: {
//           encodeTemplate: "({}).toString()",
//           decodeTemplate: `${temporal}.PlainTime.from({})`,
//         },
//       },
//     },
//     // Temporal.Instant
//     utcDateTime: {
//       "TypeSpec.string": {
//         default: { via: "iso8601" },
//         rfc3339: { via: "iso8601" },
//         iso8601: {
//           encodeTemplate: "({}).toString()",
//           decodeTemplate: `${temporal}.Instant.from({})`,
//         },
//         "http-date": { via: "rfc7231" },
//         rfc7231: {
//           encodeTemplate: (ctx, module) => {
//             module.imports.push({
//               from: isPolyfill
//                 ? temporalPolyfillHelpers
//                 : temporalNativeHelpers,
//               binder: [`formatHttpDate`],
//             });

//             return `formatHttpDate({})`;
//           },
//           decodeTemplate: (ctx, module) => {
//             module.imports.push({
//               from: isPolyfill
//                 ? temporalPolyfillHelpers
//                 : temporalNativeHelpers,
//               binder: [`parseHttpDate`],
//             });

//             return `parseHttpDate({})`;
//           },
//         },
//       },
//       "TypeSpec.int32": {
//         default: { via: "unixTimestamp" },
//         unixTimestamp: {
//           encodeTemplate:
//             "globalThis.Math.floor(({}).epochMilliseconds / 1000)",
//           decodeTemplate: `${temporal}.Instant.fromEpochMilliseconds({} * 1000)`,
//         },
//       },
//       "TypeSpec.int64": {
//         default: { via: "unixTimestamp" },
//         unixTimestamp: {
//           encodeTemplate: "({}).epochNanoseconds / 1_000_000_000n",
//           decodeTemplate: `${temporal}.Instant.fromEpochNanoseconds({} * 1_000_000_000n)`,
//         },
//       },
//     },
//     // Temporal.ZonedDateTime
//     offsetDateTime: {
//       "TypeSpec.string": {
//         default: { via: "iso8601" },
//         rfc3339: { via: "iso8601" },
//         iso8601: {
//           encodeTemplate: "({}).toString()",
//           decodeTemplate: `${temporal}.ZonedDateTime.from({})`,
//         },
//         "http-date": { via: "rfc7231" },
//         rfc7231: {
//           encodeTemplate: (ctx, module) => {
//             module.imports.push({
//               from: isPolyfill
//                 ? temporalPolyfillHelpers
//                 : temporalNativeHelpers,
//               binder: [`formatHttpDate`],
//             });

//             return `formatHttpDate(({}).toInstant())`;
//           },
//           decodeTemplate: (ctx, module) => {
//             module.imports.push({
//               from: isPolyfill
//                 ? temporalPolyfillHelpers
//                 : temporalNativeHelpers,
//               binder: [`parseHttpDate`],
//             });

//             // HTTP dates are always GMT a.k.a. UTC
//             return `parseHttpDate({}).toZonedDateTimeISO("UTC")`;
//           },
//         },
//       },
//     },
//   };
// };

// /**
//  * Encoding and decoding for legacy JS Date.
//  */
// const LEGACY_DATETIME_ENCODER: ScalarInfo["encodings"] = {
//   "TypeSpec.string": {
//     default: {
//       via: "iso8601",
//     },
//     iso8601: {
//       encodeTemplate: "({}).toISOString()",
//       decodeTemplate: "new globalThis.Date({})",
//     },
//     rfc3339: {
//       via: "iso8601",
//     },
//     rfc7231: {
//       encodeTemplate: "({}).toUTCString()",
//       decodeTemplate: "new globalThis.Date({})",
//     },
//     "http-date": {
//       via: "rfc7231",
//     },
//   },
//   "TypeSpec.int32": {
//     default: { via: "unixTimestamp" },
//     unixTimestamp: {
//       encodeTemplate: "globalThis.Math.floor(({}).getTime() / 1000)",
//       decodeTemplate: `new globalThis.Date({} * 1000)`,
//     },
//   },
//   "TypeSpec.int64": {
//     default: { via: "unixTimestamp" },
//     unixTimestamp: {
//       encodeTemplate: "globalThis.BigInt(({}).getTime()) / 1000n",
//       decodeTemplate: `new globalThis.Date(globalThis.Number({}) * 1000)`,
//     },
//   },
// };

// /**
//  * Emits a declaration for a scalar type.
//  *
//  * This is rare in TypeScript, as the scalar will ordinarily be used inline, but may be desirable in some cases.
//  *
//  * @param ctx - The emitter context.
//  * @param module - The module that the scalar is being emitted in.
//  * @param scalar - The scalar to emit.
//  * @returns a string that declares an alias to the scalar type in TypeScript.
//  */
// export function* emitScalar(
//   ctx: JsContext,
//   scalar: Scalar,
//   module: Module
// ): Iterable<string> {
//   const jsScalar = getJsScalar(ctx, module, scalar, scalar);

//   const name = parseCase(scalar.name).pascalCase;

//   yield* emitDocumentation(ctx, scalar);

//   yield `export type ${name} = ${jsScalar.type};`;
// }

// /**
//  * Helper function template that makes any type T computable sensitive to the JsContext and module it is referenced from.
//  */
// interface Contextualized<T> {
//   (ctx: JsContext, module: Module): T;
// }

/**
 * The store of scalars for a given program.
 */
type ScalarStore = Map<Scalar, JsScalar>;

/**
 * The store of all scalars known to the emitter in all active Programs.
 */
const __JS_SCALARS_MAP = new WeakMap<Program, ScalarStore>();

/**
 * Gets the scalar store for a given program.
 */
function useScalarStore(): ScalarStore {
  const { program } = useEmitContext();
  let scalars = __JS_SCALARS_MAP.get(program);

  if (scalars === undefined) {
    scalars = createScalarStore(program);
    __JS_SCALARS_MAP.set(program, scalars);
  }

  return scalars;
}

/**
 * Initializes a scalar store for a given program.
 */
function createScalarStore(program: Program): ScalarStore {
  const m = new Map<Scalar, JsScalar>();

  for (const [scalarName, scalarInfo] of SCALARS) {
    const [scalar, diagnostics] = program.resolveTypeReference(scalarName);

    if (diagnostics.length > 0 || !scalar || scalar.kind !== "Scalar") {
      throw new UnreachableError(
        `Failed to resolve built-in scalar '${scalarName}'`
      );
    }

    m.set(scalar, createJsScalar(program, scalar, scalarInfo, m));
  }

  return m;
}

/**
 * Binds a ScalarInfo specification to a JsScalar.
 *
 * @param program - The program that contains the scalar.
 * @param scalar - The scalar to bind.
 * @param _scalarInfo - The scalar information spec to bind.
 * @param store - The scalar store to use for the scalar.
 * @returns a function that takes a JsContext and Module and returns a JsScalar.
 */
function createJsScalar(
  program: Program,
  scalar: Scalar,
  scalarInfo: ScalarInfo,
  store: ScalarStore
): JsScalar {
  const _http: { [K in HttpOperationParameter["type"]]?: Encoder } = {};

  const self: JsScalar = {
    type: scalarInfo.type,

    scalar,

    getEncoding(
      encodeDataOrString: EncodeData | string,
      target?: Scalar
    ): Encoder | undefined {
      let encoding: string = "default";

      if (typeof encodeDataOrString === "string") {
        encoding = encodeDataOrString;
        target = target!;
      } else {
        encoding = encodeDataOrString.encoding ?? "default";
        target = encodeDataOrString.type;
      }

      const encodingTable =
        scalarInfo.encodings?.[getFullyQualifiedTypeName(target)];
      let encodingSpec =
        encodingTable?.[encoding] ?? encodingTable?.[encoding.toLowerCase()];

      if (encodingSpec === undefined) {
        return undefined;
      }

      let _target: JsScalar | undefined = undefined;
      let _decode: ScalarEncoding["decode"] = undefined;
      let _encode: ScalarEncoding["encode"] = undefined;

      return {
        get target() {
          return (_target ??= store.get(target)!);
        },

        decode({ expr }) {
          _decode ??=
            encodingSpec.decode ?? (({ expr }: { expr: ay.Children }) => expr);
          // typeof encodingSpec.decodeTemplate === "function"
          //   ? encodingSpec.decodeTemplate(ctx, module)
          //   : (encodingSpec.decodeTemplate ?? "{}");

          let subject = _decode({ expr });

          // If we have a via, decode it last

          if (isVia(encodingSpec)) {
            const via = self.getEncoding(encodingSpec.via, target);

            if (via === undefined) {
              return subject;
            }

            subject = via.decode({ expr: subject });
          }

          return subject;
        },

        encode({ expr }) {
          _encode ??=
            encodingSpec.encode ?? (({ expr }: { expr: ay.Children }) => expr);
          // typeof encodingSpec.encodeTemplate === "function"
          //   ? encodingSpec.encodeTemplate(ctx, module)
          //   : (encodingSpec.encodeTemplate ?? "{}");

          let subject = expr;

          // If we have a via, encode to it first

          if (isVia(encodingSpec)) {
            const via = self.getEncoding(encodingSpec.via, target);

            if (via === undefined) {
              return subject;
            }

            subject = via.encode({ expr: subject });
          }

          subject = _encode({ expr: subject });

          return subject;
        },
      };
    },

    getDefaultMimeEncoding(target: string): Encoder | undefined {
      const encoding = scalarInfo.defaultEncodings?.byMimeType?.[target];

      if (encoding === undefined) {
        return undefined;
      }

      const [encodingType, encodingName] = encoding;

      const [encodingScalar, diagnostics] =
        program.resolveTypeReference(encodingType);

      if (
        diagnostics.length > 0 ||
        !encodingScalar ||
        encodingScalar.kind !== "Scalar"
      ) {
        throw new UnreachableError(
          `Failed to resolve built-in scalar '${encodingType}'`
        );
      }

      return self.getEncoding(encodingName, encodingScalar);
    },

    http: {
      get header(): Encoder {
        return (_http.header ??= getHttpEncoder(self, "header"));
      },
      get query(): Encoder {
        return (_http.query ??= getHttpEncoder(self, "query"));
      },
      get cookie(): Encoder {
        return (_http.cookie ??= getHttpEncoder(self, "cookie"));
      },
      get path(): Encoder {
        return (_http.path ??= getHttpEncoder(self, "path"));
      },
    },

    isJsonCompatible: scalarInfo.isJsonCompatible,
  };

  return self;
  /**
   * Helper to get the HTTP encoders for the scalar.
   */
  function getHttpEncoder(
    self: JsScalar,
    form: HttpOperationParameter["type"]
  ) {
    const [target, encoding] = scalarInfo.defaultEncodings?.http?.[form] ?? [
      "TypeSpec.string",
      "default",
    ];

    const [targetScalar, diagnostics] = program.resolveTypeReference(target);

    if (
      diagnostics.length > 0 ||
      !targetScalar ||
      targetScalar.kind !== "Scalar"
    ) {
      throw new UnreachableError(
        `Failed to resolve built-in scalar '${target}'`
      );
    }

    let encoder = self.getEncoding(encoding, targetScalar);

    if (encoder === undefined && scalarInfo.defaultEncodings?.http?.[form]) {
      throw new UnreachableError(
        `Default HTTP ${form} encoding specified but failed to resolve.`
      );
    }

    encoder ??= getDefaultHttpStringEncoder(program, form);

    return encoder;
  }
}

/**
 * Returns `true` if the encoding is provided `via` another encoding. False otherwise.
 */
function isVia(encoding: ScalarEncoding): encoding is ScalarEncodingVia {
  return "via" in encoding;
}

/** Map to ensure we don't report the same unrecognized scalar many times. */
const REPORTED_UNRECOGNIZED_SCALARS = new WeakMap<Program, Set<Scalar>>();

/**
 * Reports a scalar as unrecognized, so that the spec author knows it is treated as `unknown`.
 *
 * @param ctx - The emitter context.
 * @param scalar - The scalar that was not recognized.
 * @param target - The diagnostic target to report the error on.
 */
export function reportUnrecognizedScalar(
  program: Program,
  scalar: Scalar,
  target: DiagnosticTarget | typeof NoTarget
) {
  let reported = REPORTED_UNRECOGNIZED_SCALARS.get(program);

  if (reported === undefined) {
    reported = new Set();
    REPORTED_UNRECOGNIZED_SCALARS.set(program, reported);
  }

  if (reported.has(scalar)) {
    return;
  }

  reportDiagnostic(program, {
    code: "unrecognized-scalar",
    target: target,
    format: {
      scalar: getFullyQualifiedTypeName(scalar),
    },
  });

  reported.add(scalar);
}

/**
 * Gets the default string encoder for HTTP metadata.
 */
function getDefaultHttpStringEncoder(
  program: Program,
  form: HttpOperationParameter["type"]
): Encoder {
  const string = program.checker.getStdType("string");

  const scalar = useJsScalar(string, NoTarget);

  return {
    target: scalar,
    encode: HTTP_ENCODE_STRING,
    decode: HTTP_DECODE_STRING,
  };
}

// Encoders for HTTP metadata.
const HTTP_ENCODE_STRING: Encoder["encode"] = ({ expr }) =>
  ay.code`JSON.stringify(${expr})`;
const HTTP_DECODE_STRING: Encoder["decode"] = ({ expr }) =>
  ay.code`JSON.parse(${expr})`;

/**
 * An encoder that encodes a scalar type to the `target` scalar type.
 *
 * The type that this encoder encodes _from_ is the type of the scalar that it is bound to. It _MUST_ be used only with expressions
 * of the type that represents the source scalar.
 */
export interface Encoder {
  /**
   * The target scalar type that this encoder encodes to.
   */
  readonly target: JsScalar;

  /**
   * Produces an expression that encodes the `subject` expression of the source type into the target.
   *
   * @param subject - An expression of the type that represents the source scalar.
   */
  encode(props: { expr: ay.Children }): ay.Children;

  /**
   * Produces an expression that decodes the `subject` expression from the target into the source type.
   *
   * @param subject - An expression of the type that represents the target scalar.
   */
  decode(props: { expr: ay.Children }): ay.Children;
}

/**
 * A representation of a TypeSpec scalar in TypeScript.
 */
export interface JsScalar {
  /**
   * The TypeScript type that represents the scalar.
   */
  readonly type: ay.Children;

  /**
   * The TypeSpec scalar that it represents, or "unknown" if the Scalar is not recognized.
   */
  readonly scalar: Scalar | "unknown";

  /**
   * Get an encoder that encodes this scalar type to a different scalar type using a given encoding.
   *
   * @param encoding - the encoding to use (e.g. "base64", "base64url", etc.)
   * @param target - the target scalar type to encode to
   * @returns an encoder that encodes this scalar type to the target scalar type using the given encoding, or undefined
   * if the encoding is not supported.
   */
  getEncoding(encoding: string, target: Scalar): Encoder | undefined;
  getEncoding(encoding: EncodeData): Encoder | undefined;

  /**
   * Get the default encoder for a given media type.
   *
   * @param mimeType - the media type to get the default encoder for (e.g. "application/json", "text/plain", etc.)
   * @returns an encoder that encodes this scalar type to the target scalar type using the given encoding, or undefined
   * if no default encoder is defined for the given media type.
   */
  getDefaultMimeEncoding(mimeType: string): Encoder | undefined;

  /**
   * Whether this scalar can be used directly in JSON serialization.
   *
   * If true, this scalar will be represented faithfully if it is passed to JSON.stringify or JSON.parse.
   */
  isJsonCompatible: boolean;

  /**
   * A map of encoders when this type is used in HTTP metadata.
   */
  readonly http: {
    readonly [K in HttpOperationParameter["type"]]: Encoder;
  };
}

/**
 * A dummy encoder that just converts the value to a string and does not decode it.
 *
 * This is used for "unknown" scalars.
 */
const DEFAULT_STRING_ENCODER_RAW: Omit<Encoder, "target"> = {
  encode(subject) {
    return `String(${subject})`;
  },
  decode(subject) {
    return `${subject}`;
  },
};

/**
 * A JsScalar value that represents an unknown scalar.
 */
export const JS_SCALAR_UNKNOWN: JsScalar = {
  type: "unknown",
  scalar: "unknown",
  getEncoding: () => undefined,
  getDefaultMimeEncoding: () => undefined,
  http: {
    get header() {
      return {
        target: JS_SCALAR_UNKNOWN,
        ...DEFAULT_STRING_ENCODER_RAW,
      };
    },
    get query() {
      return {
        target: JS_SCALAR_UNKNOWN,
        ...DEFAULT_STRING_ENCODER_RAW,
      };
    },
    get cookie() {
      return {
        target: JS_SCALAR_UNKNOWN,
        ...DEFAULT_STRING_ENCODER_RAW,
      };
    },
    get path() {
      return {
        target: JS_SCALAR_UNKNOWN,
        ...DEFAULT_STRING_ENCODER_RAW,
      };
    },
  },
  isJsonCompatible: true,
};

/**
 * Gets a TypeScript type that can represent a given TypeSpec scalar.
 *
 * Scalar recognition is recursive. If a scalar is not recognized, we will treat it as its parent scalar and try again.
 *
 * If no scalar in the chain is recognized, it will be treated as `unknown` and a warning will be issued.
 *
 * @param program - The program that contains the scalar
 * @param scalar - The scalar to get the TypeScript type for
 * @param diagnosticTarget - Where to report a diagnostic if the scalar is not recognized.
 * @returns a string containing a TypeScript type that can represent the scalar
 */
export function useJsScalar(
  scalar: Scalar,
  diagnosticTarget: DiagnosticTarget | typeof NoTarget
): JsScalar {
  const { program } = useEmitContext();
  const scalars = useScalarStore();

  let _scalar: Scalar | undefined = scalar;

  while (_scalar !== undefined) {
    const jsScalar = scalars.get(_scalar);

    if (jsScalar !== undefined) {
      return jsScalar;
    }

    _scalar = _scalar.baseScalar;
  }

  reportUnrecognizedScalar(program, scalar, diagnosticTarget);

  return JS_SCALAR_UNKNOWN;
}
