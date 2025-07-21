// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import {
  DiagnosticTarget,
  EncodeData,
  NoTarget,
  Program,
  Scalar,
} from "@typespec/compiler";
import { reportDiagnostic } from "../lib.js";
import { getFullyQualifiedTypeName } from "../util/name.js";

import { HttpOperationParameter } from "@typespec/http";
import { UnreachableError } from "../util/error.js";
import { EXTERNALS, useEmitContext } from "../components/JsServerOutput.jsx";
import { HELPERS } from "../../generated-defs/helpers.jsx";

/**
 * A specification of a TypeSpec scalar type.
 */
export interface ScalarInfo {
  /**
   * The TypeScript type that represents the scalar, or a function if the scalar requires a representation
   * that is not built-in.
   */
  type: ay.Children;

  // TODO: need this functionality implemented for more robust differentiation.
  // /**
  //  * A key that uniquely identifies the representation of the scalar.
  //  *
  //  * This is used to determine whether the representations of different scalars are unique or the same.
  //  */
  // typeKey?: symbol;

  // /**
  //  * Tests if a given value is an instance of this scalar's representation type.
  //  *
  //  * @param props
  //  * @returns
  //  */
  // isInstance?: (props: { expr: ay.Children }) => ay.Children;

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
const DURATION_NUMBER_ENCODING: ScalarEncoding = {
  encode({ expr }) {
    return ay.code`${HELPERS.datetime.Duration}.totalSeconds(${expr})`;
  },
  decode({ expr }) {
    return ay.code`${HELPERS.datetime.Duration}.fromTotalSeconds(${expr})`;
  },
};

/**
 * Resolves the encoding of Duration values to a BigInt number of seconds.
 */
const DURATION_BIGINT_ENCODING: ScalarEncoding = {
  encode({ expr }) {
    return ay.code`${HELPERS.datetime.Duration}.totalSecondsBigInt(${expr})`;
  },
  decode({ expr }) {
    // TODO: lossy
    return ay.code`${HELPERS.datetime.Duration}.fromTotalSeconds(globalThis.Number(${expr}))`;
  },
};

/**
 * Resolves the encoding of Duration values to a BigDecimal number of seconds.
 */
const DURATION_BIGDECIMAL_ENCODING: ScalarEncoding = {
  encode: ({ expr }) => (
    <ts.NewExpression
      target={EXTERNALS["decimal.js"].Decimal}
      args={[
        ay.code`${HELPERS.datetime.Duration}.totalSecondsBigInt(${expr}).toString()`,
      ]}
    />
  ),
  decode: ({ expr }) =>
    // TODO: lossy
    ay.code`${HELPERS.datetime.Duration}.fromTotalSeconds((${expr}).toNumber())`,
};

type DatetimeMode = "native" | "polyfill" | "custom";

function useDatetimeMode<M extends Record<DatetimeMode, unknown>>(
  mapping: M
): M[DatetimeMode] {
  const { options } = useEmitContext();

  const mode = (
    {
      temporal: "native",
      "temporal-polyfill": "polyfill",
      "date-duration": "custom",
    } as const
  )[options.datetime ?? "temporal-polyfill"];

  return mapping[mode];
}

const DURATION_CUSTOM: ScalarInfo = {
  type: HELPERS.datetime.Duration,
  encodings: {
    "TypeSpec.string": {
      default: {
        via: "iso8601",
      },
      iso8601: {
        encode: ({ expr }) =>
          ay.code`${HELPERS.datetime.Duration}.toISO8601(${expr})`,
        decode: ({ expr }) =>
          ay.code`${HELPERS.datetime.Duration}.parseISO8601(${expr})`,
      },
    },
    ...Object.fromEntries(
      ["int32", "uint32", "float32", "float64"].map((n) => [
        `TypeSpec.${n}`,
        {
          default: { via: "seconds" },
          seconds: DURATION_NUMBER_ENCODING,
        },
      ])
    ),
    ...Object.fromEntries(
      ["int64", "uint64"].map((n) => [
        `TypeSpec.${n}`,
        {
          default: { via: "seconds" },
          seconds: DURATION_BIGINT_ENCODING,
        },
      ])
    ),
    "TypeSpec.float": {
      default: { via: "seconds" },
      seconds: DURATION_BIGDECIMAL_ENCODING,
    },
  },
  defaultEncodings: {
    byMimeType: {
      "application/json": ["TypeSpec.string", "iso8601"],
    },
  },
  isJsonCompatible: false,
};

const DURATION: () => ScalarInfo = () =>
  useDatetimeMode({
    custom: DURATION_CUSTOM,
    native: DURATION_TEMPORAL(false),
    polyfill: DURATION_TEMPORAL(true),
  });

const DURATION_TEMPORAL = (isPolyfill: boolean): ScalarInfo => {
  const TemporalHelper = isPolyfill
    ? HELPERS.temporal.polyfill
    : HELPERS.temporal.native;

  return {
    type: isPolyfill
      ? EXTERNALS["temporal-polyfill"].Temporal.static.Duration
      : "globalThis.Temporal.Duration",

    isJsonCompatible: false,

    encodings: {
      "TypeSpec.string": {
        default: { via: "iso8601" },
        iso8601: {
          encode: ({ expr }) => ay.code`(${expr}).toString()`,
          decode: ({ expr }) =>
            isPolyfill
              ? ay.code`${EXTERNALS["temporal-polyfill"].Temporal.static.Duration.static.from}(${expr})`
              : ay.code`globalThis.Temporal.Duration.from(${expr})`,
        },
      },
      ...Object.fromEntries(
        ["int32", "uint32", "float32", "float64"].map((n) => [
          `TypeSpec.${n}`,
          {
            default: { via: "seconds" },
            seconds: {
              encode: ({ expr }) =>
                ay.code`${TemporalHelper.durationTotalSeconds}(${expr})`,
              decode: ({ expr }) =>
                isPolyfill
                  ? ay.code`${EXTERNALS["temporal-polyfill"].Temporal.static.Duration.static.from}({ seconds: ${expr} })`
                  : ay.code`globalThis.Temporal.Duration.from({ seconds: ${expr} })`,
            },
          },
        ])
      ),
      ...Object.fromEntries(
        ["int64", "uint64", "integer"].map((n) => [
          `TypeSpec.${n}`,
          {
            default: { via: "seconds" },
            seconds: {
              encode: ({ expr }) =>
                ay.code`${TemporalHelper.durationTotalSecondsBigInt}(${expr})`,
              decode: ({ expr }) =>
                isPolyfill
                  ? ay.code`${EXTERNALS["temporal-polyfill"].Temporal.static.Duration.static.from}({ seconds: globalThis.Number(${expr}) })`
                  : ay.code`globalThis.Temporal.Duration.from({ seconds: globalThis.Number(${expr}) })`,
            },
          },
        ])
      ),
      // "TypeSpec.float": {
      //   default: { via: "seconds" },
      //   seconds: {
      //     encodeTemplate: (_, module) => {
      //       module.imports.push({
      //         from: isPolyfill ? temporalPolyfillHelpers : temporalNativeHelpers,
      //         binder: [`durationTotalSecondsBigInt`],
      //       });

      //       return `new Decimal(durationTotalSecondsBigInt({}).toString())`;
      //     },
      //     decodeTemplate: `${temporalRef}.Duration.from({ seconds: ({}).toNumber() })`,
      //   },
      // },
    },
    defaultEncodings: {
      byMimeType: {
        "application/json": ["TypeSpec.string", "iso8601"],
      },
    },
  };
};

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

const BIGDECIMAL = (): ScalarInfo => ({
  type: EXTERNALS["decimal.js"].Decimal,
  encodings: {
    "TypeSpec.string": {
      default: {
        encode: ({ expr }) => ay.code`(${expr}).toString()`,
        decode: ({ expr }) => (
          <ts.NewExpression
            target={EXTERNALS["decimal.js"].Decimal}
            args={[expr]}
          />
        ),
      },
    },
  },
  isJsonCompatible: false,
});

const BIGINT: ScalarInfo = {
  type: "bigint",
  encodings: {
    "TypeSpec.string": {
      default: {
        encode: ({ expr }) => ay.code`globalThis.String(${expr})`,
        decode: ({ expr }) => ay.code`globalThis.BigInt(${expr})`,
      },
    },
  },
  defaultEncodings: {
    byMimeType: { "application/json": ["TypeSpec.string", "default"] },
  },
  isJsonCompatible: false,
};

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
const SCALARS = new Map<string, ScalarInfo | (() => ScalarInfo)>([
  [
    "TypeSpec.bytes",
    {
      type: "Uint8Array",
      encodings: {
        "TypeSpec.string": {
          base64: {
            encode: ({ expr }) =>
              ay.code`((${expr}) instanceof globalThis.Buffer ? ${expr} : globalThis.Buffer.from(${expr})).toString('base64')`,
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
  ["TypeSpec.uint64", BIGINT],
  ["TypeSpec.uint32", NUMBER],
  ["TypeSpec.uint16", NUMBER],
  ["TypeSpec.uint8", NUMBER],
  ["TypeSpec.int64", BIGINT],
  ["TypeSpec.int32", NUMBER],
  ["TypeSpec.int16", NUMBER],
  ["TypeSpec.int8", NUMBER],
  ["TypeSpec.safeint", NUMBER],

  ["TypeSpec.numeric", BIGDECIMAL],
  ["TypeSpec.float", BIGDECIMAL],
  ["TypeSpec.decimal", BIGDECIMAL],
  ["TypeSpec.decimal128", BIGDECIMAL],

  ["TypeSpec.integer", BIGINT],
  ["TypeSpec.plainDate", dateTime("plainDate")],
  ["TypeSpec.plainTime", dateTime("plainTime")],
  ["TypeSpec.utcDateTime", dateTime("utcDateTime")],
  ["TypeSpec.offsetDateTime", dateTime("offsetDateTime")],
  [
    "TypeSpec.unixTimestamp32",
    {
      type: "number",
      encodings: {
        "TypeSpec.string": {
          default: {
            encode: ({ expr }) => ay.code`globalThis.String(${expr})`,
            decode: ({ expr }) => ay.code`globalThis.Number(${expr})`,
          },
        },
        "TypeSpec.int32": {
          default: { via: "unixTimestamp" },
          unixTimestamp: {
            encode: ({ expr }) => expr,
            decode: ({ expr }) => expr,
          },
        },
        "TypeSpec.int64": {
          default: { via: "unixTimestamp" },
          unixTimestamp: {
            encode: ({ expr }) => ay.code`globalThis.BigInt(${expr})`,
            decode: ({ expr }) => ay.code`globalThis.Number(${expr})`,
          },
        },
      },
      isJsonCompatible: true,
    },
  ],
  ["TypeSpec.duration", DURATION],
]);

/**
 * Datetime types that support dynamic construction.
 */
type DateTimeType =
  | "plainDate"
  | "plainTime"
  | "utcDateTime"
  | "offsetDateTime";

/**
 * Gets the DateTime Scalar specification for a given date time type.
 */
function dateTime(t: DateTimeType): () => ScalarInfo {
  return () =>
    useDatetimeMode({
      custom: CUSTOM_DATETIME,
      native: TEMPORAL_DATETIME(t, false),
      polyfill: TEMPORAL_DATETIME(t, true),
    });
}

const DATETIME_DEFAULT_ENCODINGS = {
  byMimeType: {
    "application/json": ["TypeSpec.string", "rfc3339"] as [string, string],
  },
  http: {
    header: ["TypeSpec.string", "rfc7231"] as [string, string],
    query: ["TypeSpec.string", "rfc3339"] as [string, string],
    cookie: ["TypeSpec.string", "rfc7231"] as [string, string],
    path: ["TypeSpec.string", "rfc3339"] as [string, string],
  },
};

/**
 * Encoding and decoding for legacy JS Date.
 */
const LEGACY_DATETIME_ENCODER: ScalarInfo["encodings"] = {
  "TypeSpec.string": {
    default: {
      via: "iso8601",
    },
    iso8601: {
      encode: ({ expr }) => ay.code`(${expr}).toISOString()`,
      decode: ({ expr }) => ay.code`new globalThis.Date(${expr})`,
    },
    rfc3339: {
      via: "iso8601",
    },
    rfc7231: {
      encode: ({ expr }) => ay.code`(${expr}).toUTCString()`,
      decode: ({ expr }) => ay.code`new globalThis.Date(${expr})`,
    },
    "http-date": {
      via: "rfc7231",
    },
  },
  "TypeSpec.int32": {
    default: { via: "unixTimestamp" },
    unixTimestamp: {
      encode: ({ expr }) =>
        ay.code`globalThis.Math.floor((${expr}).getTime() / 1000)`,
      decode: ({ expr }) => ay.code`new globalThis.Date((${expr}) * 1000)`,
    },
  },
  "TypeSpec.int64": {
    default: { via: "unixTimestamp" },
    unixTimestamp: {
      // TODO: lossy
      encode: ({ expr }) =>
        ay.code`globalThis.BigInt((${expr}).getTime()) / 1000n`,
      decode: ({ expr }) =>
        ay.code`new globalThis.Date(globalThis.Number(${expr}) * 1000)`,
    },
  },
};

const CUSTOM_DATETIME: ScalarInfo = {
  type: "Date",
  isJsonCompatible: true,
  encodings: LEGACY_DATETIME_ENCODER,
  defaultEncodings: DATETIME_DEFAULT_ENCODINGS,
};

const TEMPORAL_DATETIME = (
  t: DateTimeType,
  isPolyfill: boolean
): ScalarInfo => {
  let type: ay.Children;

  switch (t) {
    case "plainDate":
      type = isPolyfill
        ? EXTERNALS["temporal-polyfill"].Temporal.static.PlainDate
        : "globalThis.Temporal.PlainDate";
      break;
    case "plainTime":
      type = isPolyfill
        ? EXTERNALS["temporal-polyfill"].Temporal.static.PlainTime
        : "globalThis.Temporal.PlainTime";
      break;
    case "utcDateTime":
      type = isPolyfill
        ? EXTERNALS["temporal-polyfill"].Temporal.static.Instant
        : "globalThis.Temporal.Instant";
      break;
    case "offsetDateTime":
      type = isPolyfill
        ? EXTERNALS["temporal-polyfill"].Temporal.static.ZonedDateTime
        : "globalThis.Temporal.ZonedDateTime";
      break;
    default:
      void (t satisfies never);
      throw new UnreachableError(`Unknown datetime type: ${t}`);
  }

  return {
    type,
    isJsonCompatible: false,
    encodings: TEMPORAL_ENCODERS(isPolyfill)[t],
    defaultEncodings: DATETIME_DEFAULT_ENCODINGS,
  };
};

const TEMPORAL_ENCODERS = (
  isPolyfill: boolean
): Record<DateTimeType, ScalarInfo["encodings"]> => {
  const TemporalHelper = isPolyfill
    ? HELPERS.temporal.polyfill
    : HELPERS.temporal.native;

  return {
    plainDate: {
      "TypeSpec.string": {
        default: { via: "iso8601" },
        rfc3339: { via: "iso8601" },
        iso8601: {
          encode: ({ expr }) => ay.code`(${expr}).toString()`,
          decode: ({ expr }) =>
            isPolyfill ? (
              <ts.FunctionCallExpression
                target={
                  EXTERNALS["temporal-polyfill"].Temporal.static.PlainDate
                    .static.from
                }
                args={[expr]}
              />
            ) : (
              ay.code`globalThis.Temporal.PlainDate.from(${expr})`
            ),
        },
      },
    },
    plainTime: {
      "TypeSpec.string": {
        default: { via: "iso8601" },
        rfc3339: { via: "iso8601" },
        iso8601: {
          encode: ({ expr }) => ay.code`(${expr}).toString()`,
          decode: ({ expr }) =>
            isPolyfill ? (
              <ts.FunctionCallExpression
                target={
                  EXTERNALS["temporal-polyfill"].Temporal.static.PlainTime
                    .static.from
                }
                args={[expr]}
              />
            ) : (
              ay.code`globalThis.Temporal.PlainTime.from(${expr})`
            ),
        },
      },
    },
    // Temporal.Instant
    utcDateTime: {
      "TypeSpec.string": {
        default: { via: "iso8601" },
        rfc3339: { via: "iso8601" },
        iso8601: {
          encode: ({ expr }) => ay.code`(${expr}).toString()`,
          decode: ({ expr }) =>
            isPolyfill ? (
              <ts.FunctionCallExpression
                target={
                  EXTERNALS["temporal-polyfill"].Temporal.static.Instant.static
                    .from
                }
                args={[expr]}
              />
            ) : (
              ay.code`globalThis.Temporal.Instant.from(${expr})`
            ),
        },
        "http-date": { via: "rfc7231" },
        rfc7231: {
          encode: ({ expr }) => (
            <ts.FunctionCallExpression
              target={TemporalHelper.formatHttpDate}
              args={[expr]}
            />
          ),
          decode: ({ expr }) => (
            <ts.FunctionCallExpression
              target={TemporalHelper.parseHttpDate}
              args={[expr]}
            />
          ),
        },
      },
      "TypeSpec.int32": {
        default: { via: "unixTimestamp" },
        unixTimestamp: {
          encode: ({ expr }) =>
            ay.code`globalThis.Math.floor((${expr}).epochMilliseconds / 1000)`,
          decode: ({ expr }) =>
            isPolyfill ? (
              <ts.FunctionCallExpression
                target={
                  EXTERNALS["temporal-polyfill"].Temporal.static.Instant.static
                    .fromEpochMilliseconds
                }
                args={[ay.code`(${expr}) * 1000`]}
              />
            ) : (
              ay.code`globalThis.Temporal.Instant.fromEpochMilliseconds(${expr} * 1000)`
            ),
        },
      },
      "TypeSpec.int64": {
        default: { via: "unixTimestamp" },
        unixTimestamp: {
          encode: ({ expr }) =>
            ay.code`(${expr}).epochNanoseconds / 1_000_000_000n`,
          decode: ({ expr }) =>
            isPolyfill ? (
              <ts.FunctionCallExpression
                target={
                  EXTERNALS["temporal-polyfill"].Temporal.static.Instant.static
                    .fromEpochNanoseconds
                }
                args={[ay.code`(${expr}) * 1_000_000_000n`]}
              />
            ) : (
              ay.code`globalThis.Temporal.Instant.fromEpochNanoseconds(${expr} * 1_000_000_000n)`
            ),
        },
      },
    },
    // Temporal.ZonedDateTime
    offsetDateTime: {
      "TypeSpec.string": {
        default: { via: "iso8601" },
        rfc3339: { via: "iso8601" },
        iso8601: {
          encode: ({ expr }) => ay.code`(${expr}).toString()`,
          decode: ({ expr }) =>
            isPolyfill ? (
              <ts.FunctionCallExpression
                target={
                  EXTERNALS["temporal-polyfill"].Temporal.static.ZonedDateTime
                    .static.from
                }
                args={[expr]}
              />
            ) : (
              ay.code`globalThis.Temporal.ZonedDateTime.from(${expr})`
            ),
        },
        "http-date": { via: "rfc7231" },
        rfc7231: {
          encode: ({ expr }) => (
            <ts.FunctionCallExpression
              target={TemporalHelper.formatHttpDate}
              args={[ay.code`(${expr}).toInstant()`]}
            />
          ),
          decode: ({ expr }) =>
            ay.code`${(
              <ts.FunctionCallExpression
                target={TemporalHelper.parseHttpDate}
                args={[expr]}
              />
            )}.toZonedDateTimeISO("UTC")`,
        },
      },
    },
  };
};

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

  for (const [scalarName, _scalarInfo] of SCALARS) {
    const [scalar, diagnostics] = program.resolveTypeReference(scalarName);

    if (diagnostics.length > 0 || !scalar || scalar.kind !== "Scalar") {
      throw new UnreachableError(
        `Failed to resolve built-in scalar '${scalarName}'`
      );
    }

    const scalarInfo =
      typeof _scalarInfo === "function" ? _scalarInfo() : _scalarInfo;

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
